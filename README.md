# PaperPilot — Document Generator

A mobile-friendly document generator for invoices, quotations, receipts and proforma invoices. Users enter business/client details, add line items, upload a logo, preview the result, and download a PDF.

## Pricing
- First 3 PDF generations are free in the current browser prototype.
- KES 50 per document.
- KES 1,000/month subscription.

## Deploy on Vercel
1. Import `Centurionxm/Document-generator` into Vercel.
2. Add a Supabase project and run `schema.sql` in its SQL Editor.
3. Add these Vercel environment variables:
   - `SITE_URL`: deployed HTTPS origin, e.g. `https://your-project.vercel.app`
   - `INTASEND_PUBLISHABLE_KEY`: IntaSend publishable key used by the server-side checkout function
   - `SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key; never expose this in browser code
4. Configure IntaSend sandbox credentials and test checkout before accepting live payments.

## Current implementation and limitations
- The PDF builder runs in the browser using jsPDF and AutoTable.
- The Email button opens the user's email app with a draft; the user must attach the downloaded PDF.
- The current three-free-document counter uses browser storage and can be reset or bypassed by switching devices. It is a prototype limit, not tamper-proof server enforcement.
- `api/create-checkout.js` creates server-priced IntaSend checkout sessions and writes pending orders to Supabase.
- `payment-success.html` explicitly does not grant access. A redirect is never proof of payment.
- **Payment verification is not complete yet:** there is currently no webhook handler that verifies IntaSend payment status and updates orders. Do not launch paid access until this is implemented and tested against IntaSend's current webhook/API documentation.
- **Subscription and cloud history are not complete yet:** the KES 1,000 checkout is a one-time checkout scaffold, not automatic recurring billing. Authenticated account access, paid entitlement enforcement, subscription expiry/renewal, and cloud document storage UI still need implementation.

## Security
Never put secret keys in `index.html`. The Supabase service-role key bypasses Row Level Security and belongs only in Vercel environment variables. Do not add public RLS policies for these tables. Avoid storing sensitive client information unless privacy notice, access controls, retention and deletion workflow are in place.
