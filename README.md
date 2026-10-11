# Vidyasagar

A curated children's bookstore and multi-author marketplace — *Every Book. A World of Discovery.*
Part of [Circles & Cubes](https://circlesandcubes.com).

Built with Next.js 15 (App Router), TypeScript (strict), Tailwind CSS, Supabase PostgreSQL and Zod.

## Status

**Phase 1 (foundation and catalogue) is implemented.** Later phases are not built yet.

| Area | State |
| --- | --- |
| Catalogue: books, editions, authors, publishers, collections | Implemented |
| Skills taxonomy (hierarchical, editable) with per-book explanations | Implemented |
| Age groups (configurable, indicative) | Implemented |
| Verified Knowledge Framework (six review types, public panel, methodology pages) | Implemented |
| Purchase-channel model (Direct, Amazon, Flipkart, Bulk) | Schema for all four; **only Amazon and Flipkart links are shown** |
| Search, filters, sorting, pagination | Implemented (in application code, see limitations) |
| SEO: metadata, canonical URLs, sitemap, robots, JSON-LD, breadcrumbs, share links | Implemented |
| Accounts, saved books, submissions, editorial workflow UI | **Not built** (Phases 2–3) |
| Personalisation, cart, checkout, payments, discounts, orders | **Not built** (Phase 4) |
| Outbound-click analytics, bulk enquiries, catalogue downloads | **Not built** (Phase 5) |
| Admin dashboard, audit log, role-based access | **Not built** (Phase 6) |

Until the admin phase exists, catalogue records are managed directly in Supabase (SQL editor or table editor, using the service role / dashboard).

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

- `src/db/migrations.test.ts` runs the real SQL against an in-process Postgres (PGlite), including row-level-security behaviour for the `anon` role. PGlite does not emulate Supabase Auth or PostgREST.
- `src/lib/catalogue/catalogue.integration.test.ts` is a **live** test against a real Supabase project. It runs only when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and the migrations are applied; otherwise Vitest marks it skipped. A skip is not a pass.

## Known limitations

- Search, filtering, sorting and pagination run in application code over the published catalogue. This is fine for hundreds of books; move to database-side queries before the catalogue grows much beyond that.
- Price filters and price sorting are not offered, because no price data exists yet.
- Book covers use a plain `<img>`; switch to `next/image` once the storage host is fixed.
- Detail and listing pages revalidate every 60 seconds, so an unpublished book can remain visible for up to a minute.
- No automated accessibility, performance or responsive-width audit has been run yet.
- Legal pages (privacy, terms, shipping, returns) arrive with the commerce phase.
- Reading guides, report-an-error and the "join as author/publisher" pages are Phase 2.
