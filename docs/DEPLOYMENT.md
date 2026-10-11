# Deployment guide

This is the checklist for taking Vidyasagar from code to a live shop. Nothing
here has been performed for you: no Supabase project, Vercel project, Razorpay
account or email provider was available while this was built. Treat every step
as not yet done until you have done it.

## 1. Supabase

1. Create a project (region close to your customers, e.g. Mumbai).
2. Apply every file in `supabase/migrations/` **in filename order** (`supabase db push`, or paste each into the SQL editor). Later files depend on earlier ones.
3. Auth → URL configuration: set the **Site URL** to your production URL and add `https://<domain>/auth/callback` to the redirect allow-list.
4. Auth → Email: configure your own SMTP/provider for confirmation and password-reset emails (the built-in sender is rate limited and not meant for production).
5. Auth → Providers: keep email/password on. Enable "Confirm email".

### First administrator

Nobody is an administrator until you make one. Register normally on the site, confirm the email, then run this once in the SQL editor (replace the address):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com'
on conflict do nothing;
```

After that, grant further roles at **Admin → Users and roles**. Every grant and revoke is written to the audit log.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Needed for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything | Public values |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, emails, sitemap | Your final `https://` origin, no trailing slash |
| `SUPABASE_SERVICE_ROLE_KEY` | Orders, payments, webhooks, rate limiting, intake forms | **Server only.** Never expose |
| `RATE_LIMIT_SALT` | Rate limiting | Any long random string |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payment | Use **test** keys first |
| `EMAIL_FROM`, `RESEND_API_KEY` (`EMAIL_PROVIDER=resend`) | Order and enquiry emails | Optional; without it emails are logged as *skipped* |
| `CRON_SECRET` | `/api/cron/maintenance` | Long random string; Vercel Cron sends it as a Bearer token |

Leaving a group blank keeps that feature **off**; the site never pretends it works.

## 3. Razorpay

1. Create test API keys. In the dashboard, make sure **payment capture is automatic** — orders are marked paid only when a payment is *captured*; an authorised-only payment is not treated as paid.
2. Webhooks → add `https://<domain>/api/webhooks/razorpay` with a secret (this is `RAZORPAY_WEBHOOK_SECRET`) and the events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
3. Run a full test purchase (see section 5) before switching to live keys.
4. Check your own obligations (GST invoicing, refund timelines, settlement) with your accountant. The code stores a tax-rate field per price but does **not** generate tax invoices.

## 4. Turning on online sales

Online sales ship **off**. At **Admin → Commerce**:

1. Fill in business name, support email and the flat delivery charge (and optional free-delivery threshold).
2. Paste your **returns, delivery, privacy and terms** text. These must be written or approved by the business owner or a lawyer — the software does not supply legal wording, and checkout stays closed while any of the four is empty.
3. Add prices and stock at **Admin → Prices and stock** (only published books with an *active* price can be sold).
4. The readiness list must show every required item as Ready. Only then does "Turn online sales on" enable.

## 5. Test purchase checklist (do this with Razorpay test keys)

- [ ] Add a book to the cart, apply a coupon you created, check totals.
- [ ] Register, add an address, place the order, pay with a Razorpay test card.
- [ ] Order shows **Paid**; confirmation email arrives (or is logged *skipped* if no provider).
- [ ] Webhook delivery shows 200 in the Razorpay dashboard. Re-send the same event: still 200, no second change.
- [ ] Close the payment window mid-way: the order stays *Awaiting payment* and can be paid or cancelled.
- [ ] Mark the order shipped with tracking; the customer sees it.
- [ ] Issue a partial refund from the order page; the gateway confirms by webhook and the order shows *Partially refunded*.
- [ ] Wait past the expiry (2 hours) or call the maintenance route: the unpaid order is cancelled and stock restored.

## 6. Scheduled job

`vercel.json` calls `/api/cron/maintenance` every 30 minutes. It cancels unpaid orders older than 2 hours (restoring stock) and retries failed emails. Vercel only runs cron on a production deployment and requires `CRON_SECRET`; Hobby plans limit cron frequency — adjust the schedule to your plan.

## 7. Before launch

- Replace `src/app/icon.svg` (a plain placeholder) with the real logo.
- Review `docs/SECURITY.md` and `docs/TESTING.md`, including what has **not** been verified.
- Configure Supabase backups (point-in-time recovery needs a paid plan).
- Set up uptime and error monitoring; none is included.
- Do not commit to `main` without review; deploy previews are on the feature branch.
