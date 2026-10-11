# Vidyasagar

A curated children's bookstore and multi-author marketplace — *Every Book. A World of Discovery.*
Part of [Circles & Cubes](https://circlesandcubes.com).

Built with Next.js 15 (App Router), TypeScript (strict), Tailwind CSS, Supabase PostgreSQL and Zod.

## Status

Phases 1–6 are **implemented in code and covered by automated tests**, but **nothing has been deployed or run against live services**. "Implemented" is not "configured" or "live": see the table, then `docs/DEPLOYMENT.md`.

| Area | Implemented | Tested how | Not verified |
| --- | --- | --- | --- |
| Catalogue, skills, ages, Verified Knowledge, search, SEO (P1) | Yes | Unit + PGlite + browser render | Live Supabase (integration test skipped without credentials) |
| Accounts, roles, seller applications, submission → editorial review → publish workflow (P2) | Yes | PGlite (RLS, state machine, parity with TS) | GoTrue email flows, real sign-in |
| Saved books, interests, recommendations, addresses, personalisation, moderated reviews (P3) | Yes | PGlite + unit | Signed-in browser flows |
| Cart, pricing/discount engine, checkout, orders, refunds, email outbox (P4) | Yes, **off by default** | Pricing engine, SQL order/payment functions, signed-fixture webhook route tests | Real Razorpay (test or live), real email provider, a full browser purchase |
| Retailer links via `/go/…` click tracking, bulk enquiries, quotations, volume price guide, catalogue CSV/print (P5) | Yes | PGlite + route tests + CSV tests | Real Amazon/Flipkart affiliate links (none are shipped) |
| Admin: users/roles, skills, collections, prices, discounts, orders, enquiries, analytics, email log, audit log; security headers; rate limits (P6) | Yes | PGlite (audit, RLS), header tests, Playwright (headers, redirects) | Admin screens in a browser with real data; screen-reader testing; load testing |
| Deployment | Documented, not performed | — | Everything in `docs/DEPLOYMENT.md` |

Direct sales, reviews and the newsletter are **off** until an administrator turns them on; direct sales additionally refuse to turn on until payment keys, shipping, business details, prices and all four policies exist. The software ships **no** legal text, prices, discounts, affiliate links, stock or credentials.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and anon key.
3. Apply the migrations in `supabase/migrations/` **in filename order** (Supabase CLI: `supabase db push`, or run each file in the SQL editor).
4. `npm run dev`

Without Supabase credentials the site builds and renders its empty states.

### Migrations

| File | Purpose |
| --- | --- |
| `20261011000000_create_books.sql` | Original `books` table, seeded with two **draft** records |
| `20261011010000_extend_book_status.sql` | Adds lifecycle statuses (submitted, editorial_review, changes_requested, approved, rejected, withdrawn, archived). Separate file because new enum values cannot be used in the same transaction |
| `20261011020000_catalogue_foundation.sql` | Authors, publishers, editions, contributors, subjects, age groups, skills, collections, verification records, purchase channels, row-level security, and seed taxonomy |

| `20261012010000_accounts_and_workflow.sql` | Profiles, roles, seller accounts, submission and editorial workflow, review assignments, error reports, rate limiting |
| `20261013010000_customer_features.sql` | Site settings, addresses, saved books, interests, personalisation, newsletter, customer reviews |
| `20261014010000_commerce.sql` | Prices, inventory, discounts, coupons, carts, orders, payments, refunds, email outbox, order functions |
| `20261015010000_institutional_and_affiliate.sql` | Click redirect lookup, bulk enquiries, quotations, price tiers, staff analytics |
| `20261016010000_audit_and_admin.sql` | Append-only audit log and triggers, admin user listing |

The third migration **replaces** `books.author`, `isbn`, `price_cents` and `currency` with relational structures (`book_contributors`, `book_editions`). It refuses to run if any of those columns contain data, so nothing is dropped silently. If you have data there, move it first.

It also narrows the `published_books_have_description` rule: a description is required for `approved` and `published` books, not for every non-draft status.

## Data model (Phase 1)

- **books** hold the work: title, description, indicative age range (months), lifecycle status. Only `status = 'published'` is public.
- **book_contributors** link books to **authors** with a role (author, illustrator, editor, translator). Credits are separate from whoever submits a book.
- **book_editions** hold format, language, ISBN-13 (check-digit validated), publisher, availability.
- **skills** form a hierarchy. **book_skills** link a book to a skill with a required `explanation`, a relation (`practised`, `supported`, `incidental`) and an `is_approved` flag. Unapproved links are never public.
- **verification_reviews** hold review records; **verification_evidence** holds private documents and has no public access at all.
- **edition_purchase_channels** hold one row per edition, channel and region, with an exact destination URL for Amazon/Flipkart.

### Verification rules (enforced in the database and re-checked in the UI)

- A record is public only when `status = 'published'`, `publication_permission` is true, `admin_approved` is true, and its book is published.
- Author and publisher approval are a different **level** from independent review (fact-checked, expert-reviewed, educator-reviewed). The book page always says which applies, and states plainly that approval is not independent verification.
- Fact-checked records must cite sources. Credentials are shown only when `credentials_verified` is true.
- Reviewer-supplied source links are rendered only if they are `http(s)`.

### Purchase links

Amazon and Flipkart URLs must be `https` on the retailer's own domain (checked in the database and again in the UI). They are rendered with `rel="sponsored nofollow noopener noreferrer"` and an affiliate disclosure. URLs are never constructed from product identifiers; use the real approved affiliate link.

## Adding a book (until the admin phase)

Insert rows in this order, then set the book to `published` last. All values must come from real, verified information.

1. `authors` (set `is_published = true`) and, if relevant, `publishers`.
2. `books` as `draft`, then `book_contributors`, `book_editions`.
3. `book_skills` (always with an explanation; set `is_approved = true` only after a curator has checked it).
4. `verification_reviews` only if a real review exists, with permission and admin approval recorded.
5. `edition_purchase_channels` with the real destination URL.
6. Set `books.status = 'published'`.

## Checks

```
npm run lint
npm run typecheck
npm test
npm run build
```

- `npm run e2e` runs the Playwright/axe specs (needs a prior `npm run build`); see `docs/TESTING.md`.
- `src/db/migrations.test.ts` runs the real SQL against an in-process Postgres (PGlite), including row-level-security behaviour for the `anon` role. PGlite does not emulate Supabase Auth or PostgREST.
- `src/lib/catalogue/catalogue.integration.test.ts` is a **live** test against a real Supabase project. It runs only when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and the migrations are applied; otherwise Vitest marks it skipped. A skip is not a pass.

## Known limitations

- Nothing has been run against a live Supabase project, Razorpay account, email provider or Vercel deployment. See `docs/DEPLOYMENT.md` (including the test-purchase checklist) and `docs/SECURITY.md`.
- Policy pages (privacy, terms, delivery, returns) show "not published yet" until an administrator enters text written or approved by the business; checkout stays closed until then.
- Tax invoices/GST documents are not generated; prices are tax-inclusive with a per-price rate field only.
- Institutional orders are quoted and arranged offline; accepted quotations are not converted into checkout orders.
- Newsletter sign-up and confirmation exist, but there is no campaign-sending tool.
- No file-upload pipeline; cover images are URLs. The favicon is a placeholder.
- Accessibility and performance have automated and one-off lab results only (`docs/TESTING.md`); no assistive-technology testing or load testing.
- Search, filtering and sorting run in application code over the published catalogue (fine for hundreds of books).
- Detail and listing pages revalidate every 60 seconds, so an unpublished book can remain visible for up to a minute.
