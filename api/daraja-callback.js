function siteConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const shortcode = process.env.DARAJA_SHORTCODE;
  const passkey = process.env.DARAJA_PASSKEY;
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const env = process.env.DARAJA_ENV === "production" ? "production" : "sandbox";
  return url && key && shortcode && passkey && consumerKey && consumerSecret
    ? { db: { url, key }, shortcode, passkey, consumerKey, consumerSecret, env }
    : null;
}

function base(env) {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function dbRequest(db, path, options = {}) {
  return fetch(`${db.url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

async function token(cfg) {
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const response = await fetch(`${base(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Daraja OAuth failed during callback verification.");
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

async function queryTransaction(cfg, accessToken, checkoutRequestId) {
  const time = timestamp();
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${time}`).toString("base64");
  const response = await fetch(`${base(cfg.env)}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: time,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ResponseCode !== "0") {
    throw new Error("Daraja STK query did not confirm the transaction.");
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  }

  try {
    const cfg = siteConfig();
    if (!cfg) {
      console.error("Daraja callback configuration is missing.");
      return res.status(500).json({ ResultCode: 1, ResultDesc: "Callback configuration error" });
    }

    const callback = req.body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID || callback.ResultCode === undefined) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback payload" });
    }

    const lookup = await dbRequest(cfg.db,
      `paperpilot_orders?provider_tracking_id=eq.${encodeURIComponent(callback.CheckoutRequestID)}&select=id,api_ref,amount,status,provider_tracking_id`);
    if (!lookup.ok) {
      console.error("Could not look up Daraja order.", lookup.status);
      return res.status(500).json({ ResultCode: 1, ResultDesc: "Order lookup failed" });
    }
    const orders = await lookup.json();
    const order = orders[0];
    if (!order) {
      // A callback may arrive before the STK request IDs are saved. Return an error so Safaricom can retry.
      console.error("No order found for Daraja CheckoutRequestID.");
      return res.status(500).json({ ResultCode: 1, ResultDesc: "Order not found yet" });
    }

    if (Number(callback.ResultCode) !== 0) {
      const patch = await dbRequest(cfg.db, `paperpilot_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.PENDING`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "FAILED" }),
      });
      if (!patch.ok) console.error("Could not record failed Daraja payment.", patch.status);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Callback received" });
    }

    const items = callback.CallbackMetadata?.Item || [];
    const meta = Object.fromEntries(items.filter(item => item?.Name).map(item => [item.Name, item.Value]));
    const callbackAmount = Number(meta.Amount);
    if (!Number.isFinite(callbackAmount) || callbackAmount !== Number(order.amount)) {
      console.error("Daraja callback amount did not match order.", { reference: order.api_ref });
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Amount mismatch" });
    }

    // Daraja callbacks are not cryptographically signed; query the transaction before marking it paid.
    const accessToken = await token(cfg);
    const query = await queryTransaction(cfg, accessToken, callback.CheckoutRequestID);
    if (String(query.ResultCode) !== "0") {
      console.error("Daraja query did not confirm payment.", { reference: order.api_ref, resultCode: query.ResultCode });
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Callback received; payment not confirmed" });
    }

    const receipt = typeof meta.MpesaReceiptNumber === "string" ? meta.MpesaReceiptNumber : null;
    const update = await dbRequest(cfg.db,
      `paperpilot_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.PENDING`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "PAID",
          provider_invoice_id: receipt,
          paid_at: new Date().toISOString(),
        }),
      });
    if (!update.ok) {
      console.error("Could not mark Daraja order paid.", update.status);
      return res.status(500).json({ ResultCode: 1, ResultDesc: "Could not update order" });
    }
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Payment callback processed" });
  } catch (error) {
    console.error("Daraja callback verification failed.", error?.message || "Unknown error");
    return res.status(500).json({ ResultCode: 1, ResultDesc: "Callback verification failed" });
  }
}
