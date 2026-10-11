# Vidyasagar

Phase 1 bookstore application built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase PostgreSQL.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and provide the Supabase project URL and anonymous key.
3. Apply `supabase/migrations/20261011000000_create_books.sql` to the Supabase project.
4. Run `npm run dev`.

Without Supabase credentials, public catalogue pages render their empty state. The initial migration contains draft records for **How Many Planets?** and **How Many Moons for Earth?**. Drafts are not readable through the public row-level security policy or shown in the catalogue.

No author, description, cover, publication date, ISBN, price, or purchase URL is supplied for those records. Add verified information before changing either record to `published`; published rows must have a description.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

The Supabase integration test runs when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and the migration has been applied; otherwise Vitest marks it skipped.