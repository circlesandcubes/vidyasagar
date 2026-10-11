import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BOOK_STATUSES, transitionAllowed } from "@/lib/catalogue/lifecycle";
import { newDb } from "./test-db";

let db: PGlite;
beforeAll(async () => { db = await newDb(); }, 120_000);
afterAll(async () => { await db.close(); });

it("TypeScript lifecycle matrix equals the database function for every pair", async () => {
  for (const from of BOOK_STATUSES) {
    for (const to of BOOK_STATUSES) {
      for (const staff of [false, true]) {
        const r = await db.query<{ ok: boolean }>(
          "select public.book_transition_allowed($1::public.book_status, $2::public.book_status, $3) as ok",
          [from, to, staff],
        );
        expect(r.rows[0].ok, `${from}->${to} staff=${staff}`).toBe(transitionAllowed(from, to, staff));
      }
    }
  }
});

it("TypeScript statuses equal the database enum", async () => {
  const r = await db.query<{ e: string }>("select unnest(enum_range(null::public.book_status))::text as e");
  expect(r.rows.map((x) => x.e).sort()).toEqual([...BOOK_STATUSES].sort());
});
