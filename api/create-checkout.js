import { randomUUID } from "node:crypto";

const PLANS = Object.freeze({
  single: { name: "PaperPilot — one document", amount: 50, currency: "KES" },
  monthly: { name: "PaperPilot Unlimited — monthly subscription", amount: 1000, currency: "KES" },
});

function normalizeSiteUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch { return null; }
}

function dbConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

async function dbRequest(db, path, options = {}) {
  return fetch(`${db.url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    const { plan, email, phone = "" } = req.body || {};
    const selected = PLANS[plan];
    if (!selected) return res.status(400).json({ error: "Choose a valid plan." });
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (typeof phone !== "string" || phone.length > 30) return res.status(400).json({ error: "Invalid phone number." });

    const publicKey = process.env.INTASEND_PUBLISHABLE_KEY;
    const siteUrl = normalizeSiteUrl(process.env.SITE_URL);
    const db = dbConfig();
    if (!publicKey || !siteUrl || !db) {
      console.error("Checkout config missing: IntaSend, SITE_URL, or Supabase.");
      return res.status(500).json({ error: "Payments are not configured yet. Set the environment variables listed in README." });
    }

    const apiRef = `PP-${randomUUID()}`;
    const insert = await dbRequest(db, "paperpilot_orders", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        api_ref: apiRef, plan, product_name: selected.name, email: email.trim().toLowerCase(),
        phone: phone.trim() || null, amount: selected.amount, currency: selected.currency, status: "PENDING"
      }),
    });
    if (!insert.ok) {
      console.error("Could not create order record.", insert.status);
      return res.status(500).json({ error: "Could not prepare your order. Please try again." });
    }

    const response = await fetch("https://api.intasend.com/api/v1/checkout/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-IntaSend-Public-API-Key": publicKey },
      body: JSON.stringify({
        amount: selected.amount, currency: selected.currency, email: email.trim(), api_ref: apiRef,
        host: siteUrl, redirect_url: `${siteUrl}/payment-success.html?ref=${encodeURIComponent(apiRef)}`
      }),
      signal: AbortSignal.timeout(15000),
    });
    let checkout;
    try { checkout = await response.json(); } catch { checkout = null; }
    if (!response.ok || typeof checkout?.url !== "string" || !checkout.url.startsWith("https://")) {
      await dbRequest(db, `paperpilot_orders?api_ref=eq.${encodeURIComponent(apiRef)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "CHECKOUT_FAILED" }),
      }).catch(() => {});
      console.error("IntaSend checkout creation failed.", { status: response.status });
      return res.status(502).json({ error: "Unable to start checkout. Please try again." });
    }
    return res.status(200).json({ checkoutUrl: checkout.url, reference: apiRef, plan, amount: selected.amount, currency: selected.currency });
  } catch (error) {
    console.error("Checkout error:", error?.message || "Unknown error");
    return res.status(500).json({ error: "Something went wrong while starting payment." });
  }
}