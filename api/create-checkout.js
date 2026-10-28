import { randomUUID } from "node:crypto";

const PLANS = Object.freeze({
  single: { name: "PaperPilot — one document", amount: 50, currency: "KES" },
  monthly: { name: "PaperPilot Unlimited — monthly access", amount: 1000, currency: "KES" },
});

function siteOrigin() {
  try {
    const url = new URL(process.env.SITE_URL);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : null;
  } catch { return null; }
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const shortcode = process.env.DARAJA_SHORTCODE;
  const passkey = process.env.DARAJA_PASSKEY;
  const origin = siteOrigin();
  const env = process.env.DARAJA_ENV === "production" ? "production" : "sandbox";
  if (!url || !key || !consumerKey || !consumerSecret || !shortcode || !passkey || !origin) return null;
  return { db: { url, key }, consumerKey, consumerSecret, shortcode, passkey, origin, env };
}

async function dbRequest(db, path, options = {}) {
  return fetch(`${db.url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[\s()+-]/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}

function darajaBase(env) {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function accessToken(cfg) {
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const response = await fetch(`${darajaBase(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error("Daraja OAuth failed.", { status: response.status, error: data.error_description || data.errorMessage || "No access token" });
    throw new Error("M-Pesa payment service could not authenticate. Check Daraja credentials.");
  }
  return data.access_token;
}

function timestamp() {
  const d = new Date();
  return d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let db;
  let apiRef;
  try {
    const { plan, email, phone } = req.body || {};
    const selected = PLANS[plan];
    if (!selected) return res.status(400).json({ error: "Choose a valid plan." });
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid Kenyan M-Pesa number, e.g. 0712345678 or 254712345678." });

    const cfg = config();
    if (!cfg) {
      return res.status(500).json({ error: "Payments are not configured. Add the Daraja and Supabase environment variables listed in README." });
    }
    db = cfg.db;
    apiRef = `PP-${randomUUID()}`;

    const insert = await dbRequest(db, "paperpilot_orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        api_ref: apiRef, plan, product_name: selected.name, email: email.trim().toLowerCase(),
        phone: normalizedPhone, amount: selected.amount, currency: "KES", status: "PENDING",
      }),
    });
    if (!insert.ok) {
      console.error("Could not create order record.", insert.status, (await insert.text()).slice(0, 250));
      return res.status(500).json({ error: "Could not prepare your order. Please try again." });
    }

    const token = await accessToken(cfg);
    const time = timestamp();
    const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${time}`).toString("base64");
    const callbackUrl = process.env.DARAJA_CALLBACK_URL || `${cfg.origin}/api/daraja-callback`;
    const callback = new URL(callbackUrl);
    if (callback.protocol !== "https:" && callback.hostname !== "localhost") {
      throw new Error("The Daraja callback URL must use HTTPS.");
    }

    const response = await fetch(`${darajaBase(cfg.env)}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: cfg.shortcode,
        Password: password,
        Timestamp: time,
        TransactionType: process.env.DARAJA_TRANSACTION_TYPE || "CustomerPayBillOnline",
        Amount: selected.amount,
        PartyA: normalizedPhone,
        PartyB: cfg.shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: callback.toString(),
        AccountReference: apiRef,
        TransactionDesc: plan === "single" ? "PaperPilot document" : "PaperPilot monthly access",
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ResponseCode !== "0" || !data.CheckoutRequestID) {
      await dbRequest(db, `paperpilot_orders?api_ref=eq.${encodeURIComponent(apiRef)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "CHECKOUT_FAILED" }),
      }).catch(() => {});
      console.error("Daraja STK Push failed.", {
        status: response.status,
        responseCode: data.ResponseCode,
        error: data.errorMessage || data.ResponseDescription || "Unknown Daraja response",
      });
      return res.status(502).json({ error: data.errorMessage || data.ResponseDescription || "Could not send the M-Pesa prompt. Check the phone number and try again." });
    }

    const saved = await dbRequest(db, `paperpilot_orders?api_ref=eq.${encodeURIComponent(apiRef)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ provider_tracking_id: data.CheckoutRequestID, provider_invoice_id: data.MerchantRequestID || null }),
    });
    if (!saved.ok) console.error("Could not save Daraja request IDs for order.", apiRef, saved.status);

    return res.status(200).json({
      ok: true, reference: apiRef, checkoutRequestId: data.CheckoutRequestID,
      message: "M-Pesa prompt sent. Check your phone and enter your M-Pesa PIN to complete payment.",
    });
  } catch (error) {
    console.error("Daraja checkout error:", error?.message || "Unknown error");
    if (db && apiRef) {
      await dbRequest(db, `paperpilot_orders?api_ref=eq.${encodeURIComponent(apiRef)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "CHECKOUT_FAILED" }),
      }).catch(() => {});
    }
    return res.status(500).json({ error: error?.message || "Something went wrong while starting M-Pesa payment." });
  }
}
