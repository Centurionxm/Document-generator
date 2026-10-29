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
- WhatsApp sharing uses the device's native file-share sheet when supported. On unsupported browsers, PaperPilot downloads the PDF and opens a WhatsApp message; the user must attach the PDF manually.
- VAT can be set to 16% with one tap, but users must confirm the correct VAT treatment for their supply. Discounts are subtracted before tax is calculated.
- Documents can display a KRA PIN, Paybill/Till details, and a Paid/Unpaid/Overdue stamp. Quotations can be converted to invoices in the current form.
- Business profiles and client shortcuts are saved in browser local storage on that device only. They are not synced to an account or cloud. Avoid shared devices for confidential client information.
- Free PDF generation is available without signup and includes the PaperPilot footer.
- The payment flow records payment orders, but paid-feature enforcement is not implemented. Do not represent a payment as unlocking Pro features until server-side payment verification and entitlements are added.
- Recurring billing and subscription expiry enforcement are not implemented; the KES 1,000 checkout is currently a one-time payment.

## Kenya KRA / eTIMS compliance

PaperPilot currently generates ordinary PDFs in the browser. It does **not** integrate with eTIMS, transmit invoice data to KRA, or generate an eTIMS fiscal invoice. A KRA PIN field or a VAT line does not make a document eTIMS-compliant. Businesses required to issue electronic tax invoices should use a KRA eTIMS solution or a properly integrated approved system. See KRA's current [eTIMS guidance](https://www.kra.go.ke/helping-tax-payers/faqs/learn-about-etims) and [available eTIMS solutions](https://www.kra.go.ke/news-center/public-notices/2080-etims-compliance).

## Security

Never put Daraja consumer secrets, the passkey, or the Supabase service-role key in `index.html` or GitHub. Store them only in Vercel environment variables. The Supabase service-role key bypasses Row Level Security; do not add public RLS policies to the orders or documents tables. Avoid storing sensitive client information unless privacy notice, access controls, retention and deletion workflows are in place.
