# Security notes

## What the code enforces

- **Row-level security is the primary gate.** Every table has RLS on; privileges are revoked and then granted narrowly. Owners edit only whitelisted columns; lifecycle changes go through a state machine in SQL that a test keeps in step with the TypeScript copy.
- **The service-role key** is read in one module and imported only from allow-listed server files (an architecture test fails the build otherwise). It is used for orders, payment webhooks, rate limiting and intake forms — places with no user session.
- **Money is integer paise.** The database re-verifies every price, stock level, coupon and shipping figure when an order is created, so a tampered cart cannot change what is charged. Order lines are immutable snapshots.
- **Payments are idempotent.** Webhook and browser-verify paths share SQL functions keyed by the provider's event id (advisory lock plus a unique constraint). A payment that does not match its order (wrong amount, cancelled order, second payment) is recorded as an exception for staff, never silently applied.
- **Webhook signatures** are verified over the raw body with a constant-time comparison before anything is parsed. Checkout signatures are verified, and the payment is then re-fetched from the gateway.
- **Redirects:** `/go/…` only redirects to a database-approved retailer URL on an allow-listed domain; `next=` login redirects are restricted to local paths.
- **Rate limiting** (salted IP hash; no raw IPs stored) on error reports, enquiries, newsletter, order placement; sign-in flows are limited too but *fail open* if the limiter is down, because Supabase Auth has its own limits.
- **Privacy:** no child names, dates of birth or photos are stored. Click tracking stores edition, store and time only. The audit log stores column names and a few non-personal values — never addresses, emails or free text.
- **Audit log** is append-only (triggers block update, delete and truncate, even for the service role) and readable by administrators only.
- **Headers:** CSP, `frame-ancestors 'none'`, nosniff, referrer policy, HSTS, permissions policy (`src/lib/security-headers.ts`, covered by tests and a browser spec).
- **CSV export** neutralises spreadsheet formulas. User-supplied text is rendered as text, never HTML.

## Known gaps — please read

- **CSP allows `'unsafe-inline'` for scripts** because Next.js injects inline bootstrap scripts. A nonce-based policy (middleware-generated nonce) is the next hardening step.
- **No malware/virus scanning or image upload pipeline exists** because the application has no file-upload feature yet (cover images are linked by URL). If uploads are added, validate type by magic bytes, cap size, strip metadata, and store outside the web root.
- **Live integrations are untested.** No Supabase project, Razorpay account or email provider was available: payment/email adapters are covered by signed-fixture and mocked-HTTP tests only. The deployment checklist test purchase is the real proof.
- **PGlite is not Supabase.** SQL, RLS and triggers are tested in an in-process Postgres with stubbed auth; PostgREST, GoTrue and Storage behaviour is not exercised. A live integration test exists but is skipped without credentials.
- **Dependency audit:** `npm audit` reports a high-severity advisory in `braces` (via Tailwind's build-time file watcher). It is not shipped to browsers or used at request time; upgrading requires Tailwind 4, a breaking change deferred for review.
- No penetration test, no formal threat model review and no third-party security audit have been done.
- No CAPTCHA is used; the honeypot field and rate limits are the only bot defences.
- Tax invoices, GST handling, and data-protection obligations (DPDP Act consent records, retention, deletion on request) need legal review; account deletion is not self-serve yet.
