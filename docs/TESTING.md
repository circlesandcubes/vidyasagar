# Testing, accessibility and performance

## What runs

| Command | What it covers |
| --- | --- |
| `npm run lint`, `npm run typecheck` | ESLint (Next config), TypeScript strict |
| `npm test` | Vitest: validation, pricing engine, payment signature/normalisation, email, CSV, route handlers (mocked), architecture rules, and **real migrations in PGlite** with RLS/trigger/function tests |
| `npm run build` | Production build |
| `npm run e2e` | Playwright (Chromium) against `next start` **without Supabase**: renders every public page on desktop and mobile widths, runs axe-core (WCAG 2.0/2.1 A/AA), checks horizontal overflow, skip link, security headers, signed-out redirects, webhook/cron refusal. Needs `npm run build` first. Set `PLAYWRIGHT_CHROMIUM_PATH` if the browser is not in Playwright's default location. |

## What this proves — and does not

- Database tests prove constraints, triggers, grants, RLS and SQL functions on real Postgres semantics. They do **not** prove PostgREST, GoTrue, Storage or Vercel behaviour.
- The Playwright specs run with an empty catalogue, so they check page structure and accessibility of **empty states**, not pages full of data, signed-in flows, the Razorpay window, or admin screens. Signed-in end-to-end tests need a Supabase project and test keys and have not been written.
- Live gateway, email and affiliate links have never been exercised.

## Accessibility

Automated: axe-core found no serious or critical WCAG A/AA violations on the 21 public pages tested at desktop and Pixel 7 widths. Lighthouse accessibility scored 100 on the home page. Automated tools find roughly a third of issues. **Not done:** screen-reader walkthroughs (NVDA/VoiceOver/TalkBack), keyboard-only passes of the signed-in and admin flows, zoom/reflow at 400%, reduced-motion review, colour-contrast checks on data-driven states. Forms use labels, `aria-live` flash messages and real tables with captions and header scope; admin and checkout screens have not been audited with assistive technology.

## Performance

One Lighthouse 12.8 run (mobile emulation, local production server, empty catalogue, no CDN, no database latency): performance 96, accessibility 100, best-practices 96, SEO 100; FCP 0.8 s, LCP 2.1 s, TBT 200 ms, CLS 0. This is a lab number for the home page only. It says nothing about pages with real catalogue data and images, Supabase round-trips, or production hosting. Listing pages filter the catalogue in application code (fine for hundreds of books; move to database queries beyond that).

The one console error Lighthouse reported was a missing favicon; a **placeholder** icon was added (`src/app/icon.svg`) — replace it with the real logo.
