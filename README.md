# PaperPilot — Document Generator

A mobile-friendly document generator for invoices, quotations, receipts and proforma invoices. Users enter client and business details, add line items, upload a logo, preview the result, and download a PDF.

## Pricing
- First 3 PDF generations are free in the current browser prototype.
- KES 50 per document.
- KES 1,000/month subscription.

## Deploy on Vercel
1. Import `Centurionxm/Document-generator` into Vercel.
2. Add a Supabase project and run `schema.sql` in its SQL Editor.
3. Add these Vercel environment variables:
   - `SITE_URL`: the deployed HTTPS origin, e.g. `https://your-project.vercel.app`
   - `INTASEND_PUBLISHABLE_KEY`: your IntaSend publishable key (server-side environment variable)
   - `SUPABASE_URL`: your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key; never expose this in browser code
4. Set the IntaSend webhook URL to `https://your-project.vercel.app/api/webhook` after deploying the webhook handler. Configure a strong webhook challenge secret in `INTASEND_WEBHOOK_CHALLENGE`.
5. Test using IntaSend sandbox credentials before live payments.

## Important implementation status
- The PDF builder runs in the browser using jsPDF and AutoTable. Email opens the user's email app with a draft; the user must attach the downloaded PDF.
- The current three-free-document counter is local browser storage and can be reset by clearing browser data or switching devices. It is a prototype limit, not tamper-proof entitlement enforcement.
- The checkout API creates server-priced IntaSend checkout sessions and writes pending orders to Supabase. Paid access must only be granted after verifying provider status in a secure webhook.
- Before production launch, complete and test the IntaSend webhook verification, entitlement checks, authenticated document history, and cloud storage. Never trust a browser redirect as proof of payment.
- Subscription renewals, expiry, cancellation and cloud-history UI are not yet implemented. The monthly button starts a KES 1,000 checkout; do not advertise automatic recurring billing until configured with a supported recurring payment flow.

## Security
Never put secret keys in `index.html`. The Supabase service-role key bypasses Row Level Security and belongs only in Vercel environment variables. Avoid storing sensitive client information unless your privacy notice, access controls, retention and deletion workflow are in place.
