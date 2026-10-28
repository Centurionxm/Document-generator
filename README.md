# PaperPilot — Document Generator

A mobile-friendly document generator for invoices, quotations, receipts and proforma invoices. Users enter business/client details, add line items, upload a logo, preview the result, and download a PDF.

## Pricing
- First 3 PDF generations are free in the current browser prototype.
- KES 50 per document.
- KES 1,000/month access option. **This currently initiates a one-time KES 1,000 payment, not recurring billing.**

## Deploy on Vercel

1. Import `Centurionxm/Document-generator` into Vercel.
2. Create/configure the Supabase project and run `schema.sql` in its SQL Editor.
3. In Safaricom Daraja, create an app and obtain Consumer Key and Consumer Secret. Use sandbox credentials and the sandbox shortcode/passkey while testing.
4. Add these environment variables in Vercel (Production/Preview as appropriate):

   - `SITE_URL`: deployed HTTPS origin, e.g. `https://your-project.vercel.app`
   - `SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role/secret key; server-side only
   - `DARAJA_CONSUMER_KEY`: Daraja app consumer key
   - `DARAJA_CONSUMER_SECRET`: Daraja app consumer secret
   - `DARAJA_SHORTCODE`: the PayBill shortcode configured for your Daraja environment
   - `DARAJA_PASSKEY`: the STK Push passkey issued for that shortcode
   - `DARAJA_ENV`: set to `sandbox` for testing; set to `production` only with live credentials and an approved shortcode
   - `DARAJA_CALLBACK_URL` (optional): public HTTPS callback URL; defaults to `SITE_URL/api/daraja-callback`
   - `DARAJA_TRANSACTION_TYPE` (optional): defaults to `CustomerPayBillOnline`; use the transaction type required by your Safaricom shortcode setup

5. Redeploy after changing environment variables. The callback URL must be publicly reachable over HTTPS.
6. Test STK Push using Daraja sandbox credentials first. Before going live, use your approved production shortcode, passkey, consumer credentials, and live environment.

## Payment flow

- `api/create-checkout.js` creates a pending order with server-controlled prices, obtains a Daraja access token, and initiates an M-Pesa STK Push.
- `api/daraja-callback.js` receives the STK callback, checks the amount against the order, queries Daraja's STK status endpoint, and marks an order `PAID` only when the query confirms success.
- `payment-success.html` is informational and does not grant access. A prompt, callback by itself, or browser redirect is not proof of payment.
- This code records order payment status; paid document entitlements, account access, and subscription expiry enforcement still need to be implemented before paid features can be safely unlocked.
- The monthly option is not recurring billing. It is currently a one-time KES 1,000 STK Push.

## Current implementation and limitations

- The PDF builder runs in the browser using jsPDF and AutoTable.
- The Email button opens the user's email app with a draft; the user must attach the downloaded PDF.
- The current three-free-document counter uses browser storage and can be reset or bypassed by switching devices. It is a prototype limit, not tamper-proof server enforcement.
- Authenticated account access, subscription renewal/expiry, paid entitlement enforcement, and cloud document storage UI are not implemented.

## Security

Never put Daraja consumer secrets, the passkey, or the Supabase service-role key in `index.html` or GitHub. Store them only in Vercel environment variables. The Supabase service-role key bypasses Row Level Security; do not add public RLS policies to the orders or documents tables. Avoid storing sensitive client information unless privacy notice, access controls, retention and deletion workflows are in place.
