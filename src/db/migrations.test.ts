// Runs the real SQL migrations against an in-process Postgres (PGlite) so the
// constraints and row-level-security rules are exercised, not assumed.
// This does NOT replace testing against a live Supabase project (see
// books.integration.test.ts): PGlite emulates the anon/authenticated roles
// but not Supabase Auth or PostgREST.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon as asAnonRole, migrationFiles, newDb } from "./test-db";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const asAnon = <T,>(db: PGlite, fn: () => Promise<T>) => asAnonRole(db, fn);

describe("catalogue migrations", () => {
  let db: PGlite;
  let publishedBookId: string;
  let draftBookId: string;
  let publishedEditionId: string;
  let draftEditionId: string;

  beforeAll(async () => {
    db = await newDb();

    const published = await db.query<{ id: string }>(
      `insert into public.books (title, slug, description, status)
       values ('Published Book', 'published-book', 'A description.', 'published') returning id`,
    );
    publishedBookId = published.rows[0].id;
    const draft = await db.query<{ id: string }>(
      `insert into public.books (title, slug, status) values ('Secret Draft', 'secret-draft', 'draft') returning id`,
    );
    draftBookId = draft.rows[0].id;

    publishedEditionId = (
      await db.query<{ id: string }>(
        `insert into public.book_editions (book_id, format, availability, is_primary)
         values ($1, 'paperback', 'available', true) returning id`,
        [publishedBookId],
      )
    ).rows[0].id;
    draftEditionId = (
      await db.query<{ id: string }>(
        `insert into public.book_editions (book_id, format) values ($1, 'paperback') returning id`,
        [draftBookId],
      )
    ).rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  describe("seed data", () => {
    it("seeds five age groups and a two-level skills taxonomy", async () => {
      const ages = await db.query("select 1 from public.age_groups");
      expect(ages.rows).toHaveLength(5);

      const parents = await db.query("select 1 from public.skills where parent_id is null");
      const children = await db.query("select 1 from public.skills where parent_id is not null");
      expect(parents.rows).toHaveLength(7);
      expect(children.rows).toHaveLength(32);
    });

    it("keeps the two original drafts and publishes no seeded books", async () => {
      const seeded = await db.query<{ slug: string; status: string }>(
        "select slug, status from public.books where slug in ('how-many-planets','how-many-moons-for-earth')",
      );
      expect(seeded.rows).toHaveLength(2);
      expect(seeded.rows.every((r) => r.status === "draft")).toBe(true);
    });
  });

  describe("public visibility (RLS as anon)", () => {
    it("exposes only published books", async () => {
      const slugs = await asAnon(db, async () =>
        (await db.query<{ slug: string }>("select slug from public.books")).rows.map((r) => r.slug),
      );
      expect(slugs).toEqual(["published-book"]);
    });

    it("hides editions of unpublished books", async () => {
      const ids = await asAnon(db, async () =>
        (await db.query<{ id: string }>("select id from public.book_editions")).rows.map((r) => r.id),
      );
      expect(ids).toContain(publishedEditionId);
      expect(ids).not.toContain(draftEditionId);
    });

    it("hides unpublished authors and contributors of unpublished books", async () => {
      const hidden = (
        await db.query<{ id: string }>(
          `insert into public.authors (name, slug, is_published) values ('Hidden Author', 'hidden-author', false) returning id`,
        )
      ).rows[0].id;
      const shown = (
        await db.query<{ id: string }>(
          `insert into public.authors (name, slug, is_published) values ('Shown Author', 'shown-author', true) returning id`,
        )
      ).rows[0].id;
      await db.query(
        `insert into public.book_contributors (book_id, author_id, role) values ($1, $2, 'author'), ($3, $2, 'author')`,
        [publishedBookId, shown, draftBookId],
      );

      const result = await asAnon(db, async () => ({
        authors: (await db.query<{ slug: string }>("select slug from public.authors")).rows.map((r) => r.slug),
        contributors: (await db.query("select 1 from public.book_contributors")).rows.length,
      }));
      expect(result.authors).toEqual(["shown-author"]);
      expect(result.authors).not.toContain("hidden-author");
      expect(hidden).toBeTruthy();
      expect(result.contributors).toBe(1);
    });

    it("shows only curator-approved skill links", async () => {
      const [counting, memory] = (
        await db.query<{ id: string }>(
          "select id from public.skills where slug in ('counting','memory') order by slug",
        )
      ).rows.map((r) => r.id);
      await db.query(
        `insert into public.book_skills (book_id, skill_id, relation, explanation, is_approved)
         values ($1, $2, 'practised', 'Counts planets one by one.', true),
                ($1, $3, 'incidental', 'Repetition may help recall.', false)`,
        [publishedBookId, counting, memory],
      );

      const visible = await asAnon(db, async () =>
        (await db.query<{ skill_id: string }>("select skill_id from public.book_skills")).rows.map((r) => r.skill_id),
      );
      expect(visible).toEqual([counting]);
    });

    it("requires an explanation on every skill association", async () => {
      const skill = (await db.query<{ id: string }>("select id from public.skills where slug = 'empathy'")).rows[0].id;
      await expect(
        db.query(
          `insert into public.book_skills (book_id, skill_id, relation, explanation) values ($1, $2, 'supported', '   ')`,
          [publishedBookId, skill],
        ),
      ).rejects.toThrow();
    });

    it("refuses approved or published books without a description", async () => {
      for (const status of ["approved", "published"]) {
        await expect(
          db.query(`insert into public.books (title, slug, status) values ('No Description', 'no-description', $1)`, [
            status,
          ]),
        ).rejects.toThrow(/approved_books_have_description/);
      }
    });

    it("accepts the extended listing lifecycle values without exposing them", async () => {
      for (const status of [
        "submitted",
        "editorial_review",
        "changes_requested",
        "rejected",
        "withdrawn",
        "archived",
      ]) {
        await db.query(`insert into public.books (title, slug, status) values ($1, $2, $3)`, [
          `Lifecycle ${status}`,
          `lifecycle-${status.replaceAll("_", "-")}`,
          status,
        ]);
      }
      const slugs = await asAnon(db, async () =>
        (await db.query<{ slug: string }>("select slug from public.books")).rows.map((r) => r.slug),
      );
      expect(slugs).toEqual(["published-book"]);
    });
  });

  describe("verification framework", () => {
    const base = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
      review_type: "author_approved",
      reviewer_name: "A. Author",
      scope: "Whole text",
      ...overrides,
    });

    async function insertReview(bookId: string, fields: Record<string, unknown>) {
      const f = base(fields);
      return db.query<{ id: string }>(
        `insert into public.verification_reviews
           (book_id, review_type, reviewer_name, scope, sources, reviewed_on, public_credentials,
            credentials_verified, publication_permission, admin_approved, status)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11) returning id`,
        [
          bookId,
          f.review_type,
          f.reviewer_name,
          f.scope,
          JSON.stringify(f.sources ?? []),
          f.reviewed_on ?? null,
          f.public_credentials ?? null,
          f.credentials_verified ?? false,
          f.publication_permission ?? false,
          f.admin_approved ?? false,
          f.status ?? "draft",
        ],
      );
    }

    it("makes a record public only with permission, admin approval and a published status", async () => {
      await insertReview(publishedBookId, {
        review_type: "publisher_approved",
        reviewer_name: "Example Press",
        reviewed_on: "2026-01-01",
        publication_permission: true,
        admin_approved: true,
        status: "published",
      });
      await insertReview(publishedBookId, { status: "pending_approval", publication_permission: true });
      await insertReview(publishedBookId, { status: "draft" });
      await insertReview(draftBookId, {
        reviewed_on: "2026-01-01",
        publication_permission: true,
        admin_approved: true,
        status: "published",
      });

      const visible = await asAnon(db, async () =>
        (await db.query<{ review_type: string; book_id: string }>("select review_type, book_id from public.verification_reviews")).rows,
      );
      expect(visible).toHaveLength(1);
      expect(visible[0]).toMatchObject({ review_type: "publisher_approved", book_id: publishedBookId });
    });

    it("rejects publishing without permission or admin approval", async () => {
      await expect(
        insertReview(publishedBookId, { reviewed_on: "2026-01-01", admin_approved: true, status: "published" }),
      ).rejects.toThrow(/verification_published_requires_approval/);
      await expect(
        insertReview(publishedBookId, { reviewed_on: "2026-01-01", publication_permission: true, status: "published" }),
      ).rejects.toThrow(/verification_published_requires_approval/);
    });

    it("requires sources for fact-checked records", async () => {
      await expect(insertReview(publishedBookId, { review_type: "fact_checked", sources: [] })).rejects.toThrow(
        /verification_fact_check_requires_sources/,
      );
      await expect(
        insertReview(publishedBookId, {
          review_type: "fact_checked",
          sources: [{ title: "Source", url: "https://example.org" }],
        }),
      ).resolves.toBeTruthy();
    });

    it("does not allow public credentials unless they were verified", async () => {
      await expect(
        insertReview(publishedBookId, { review_type: "expert_reviewed", public_credentials: "Professor of Astronomy" }),
      ).rejects.toThrow(/verification_credentials_require_check/);
    });

    it("requires a named reviewer or approving party, except for story and imagination", async () => {
      await expect(insertReview(publishedBookId, { reviewer_name: null })).rejects.toThrow(
        /verification_requires_named_party/,
      );
      await expect(
        insertReview(publishedBookId, { review_type: "story_and_imagination", reviewer_name: null }),
      ).resolves.toBeTruthy();
    });

    it("keeps private evidence unreadable by public roles", async () => {
      const review = await insertReview(publishedBookId, { reviewer_name: "Evidence Holder" });
      await db.query(
        `insert into public.verification_evidence (review_id, kind, note) values ($1, 'note', 'private')`,
        [review.rows[0].id],
      );

      await expect(asAnon(db, () => db.query("select * from public.verification_evidence"))).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe("purchase channels", () => {
    const insertChannel = (
      edition: string,
      channel: string,
      opts: { url?: string | null; fulfilment: string; enabled?: boolean },
    ) =>
      db.query(
        `insert into public.edition_purchase_channels (edition_id, channel, destination_url, fulfilment, is_enabled)
         values ($1, $2, $3, $4, $5)`,
        [edition, channel, opts.url ?? null, opts.fulfilment, opts.enabled ?? false],
      );

    it("accepts Amazon and Flipkart URLs on their own domains only", async () => {
      await expect(
        insertChannel(publishedEditionId, "amazon", {
          url: "https://www.amazon.in/dp/EXAMPLE",
          fulfilment: "external",
          enabled: true,
        }),
      ).resolves.toBeTruthy();
      await expect(
        insertChannel(publishedEditionId, "flipkart", {
          url: "https://www.amazon.in/dp/EXAMPLE",
          fulfilment: "external",
        }),
      ).rejects.toThrow(/purchase_channel_url_matches_channel/);
      await expect(
        insertChannel(draftEditionId, "amazon", { url: "https://amazon.evil.example/x", fulfilment: "external" }),
      ).rejects.toThrow(/purchase_channel_url_matches_channel/);
      await expect(
        insertChannel(draftEditionId, "amazon", { url: "http://www.amazon.in/dp/X", fulfilment: "external" }),
      ).rejects.toThrow(/purchase_channel_url_matches_channel/);
    });

    it("cannot enable an external channel without a URL", async () => {
      await expect(
        insertChannel(draftEditionId, "flipkart", { url: null, fulfilment: "external", enabled: true }),
      ).rejects.toThrow(/purchase_channel_enabled_external_has_url/);
    });

    it("keeps fulfilment consistent with the channel", async () => {
      await expect(
        insertChannel(draftEditionId, "amazon", { url: "https://www.amazon.in/dp/Y", fulfilment: "vidyasagar" }),
      ).rejects.toThrow(/purchase_channel_fulfilment_matches/);
      await expect(insertChannel(draftEditionId, "direct", { fulfilment: "external" })).rejects.toThrow(
        /purchase_channel_fulfilment_matches/,
      );
    });

    it("does not allow a destination URL on direct or bulk channels", async () => {
      await expect(
        insertChannel(draftEditionId, "direct", { url: "https://example.org", fulfilment: "vidyasagar" }),
      ).rejects.toThrow(/purchase_channel_url_matches_channel/);
    });

    it("shows only enabled channels of published books", async () => {
      await insertChannel(publishedEditionId, "bulk_enquiry", { fulfilment: "vidyasagar", enabled: false });
      await insertChannel(draftEditionId, "direct", { fulfilment: "vidyasagar", enabled: true });

      const visible = await asAnon(db, async () =>
        (await db.query<{ channel: string }>("select channel from public.edition_purchase_channels")).rows.map(
          (r) => r.channel,
        ),
      );
      expect(visible).toEqual(["amazon"]);
    });
  });

  describe("data integrity helpers", () => {
    it("validates ISBN-13 check digits", async () => {
      const valid = await db.query<{ ok: boolean }>("select public.is_valid_isbn13('9780306406157') as ok");
      const invalid = await db.query<{ ok: boolean }>("select public.is_valid_isbn13('9780306406158') as ok");
      const malformed = await db.query<{ ok: boolean }>("select public.is_valid_isbn13('97803064061') as ok");
      expect(valid.rows[0].ok).toBe(true);
      expect(invalid.rows[0].ok).toBe(false);
      expect(malformed.rows[0].ok).toBe(false);
    });

    it("allows only one primary edition per book", async () => {
      await expect(
        db.query(`insert into public.book_editions (book_id, format, is_primary) values ($1, 'hardcover', true)`, [
          publishedBookId,
        ]),
      ).rejects.toThrow();
    });

    it("requires an age range to be complete and ordered", async () => {
      await expect(
        db.query(`update public.books set age_min_months = 36 where id = $1`, [publishedBookId]),
      ).rejects.toThrow(/books_age_range_complete/);
      await expect(
        db.query(`update public.books set age_min_months = 72, age_max_months = 36 where id = $1`, [publishedBookId]),
      ).rejects.toThrow(/books_age_range_ordered/);
    });
  });

  describe("legacy column guard", () => {
    it("refuses to drop legacy columns that still hold data", async () => {
      const legacy = await newDb(1);
      await legacy.query(
        `insert into public.books (title, slug, author, status) values ('Legacy', 'legacy', 'Someone', 'draft')`,
      );
      await legacy.exec(readFileSync(join(MIGRATIONS_DIR, migrationFiles[1]), "utf8"));
      await expect(legacy.exec(readFileSync(join(MIGRATIONS_DIR, migrationFiles[2]), "utf8"))).rejects.toThrow(
        /contain data/,
      );
      await legacy.close();
    }, 120_000);
  });
});
