// Phase 2 database rules: roles, seller onboarding, lifecycle, RLS, review
// guards, rate limiting. Runs the real migrations in PGlite.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createUser, failure, grantRole, newDb } from "./test-db";

let db: PGlite;
let admin: string;
let curator: string;
let reviewer: string;
let authorUser: string;
let otherAuthor: string;
let plainUser: string;
let authorId: string;

const q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params);

async function newDraft(owner: string, slug: string, extra = ""): Promise<string> {
  return asUser(db, owner, async () => {
    const r = await q<{ id: string }>(
      `insert into public.books (title, slug, description, rights_confirmed ${extra ? "," + extra.split("=")[0] : ""})
       values ('T ${slug}', $1, 'Desc.', true ${extra ? "," + extra.split("=")[1] : ""}) returning id`,
      [slug],
    );
    return r.rows[0].id;
  });
}

async function prepForApproval(bookId: string) {
  await q("insert into public.book_contributors (book_id, author_id, role) values ($1, $2, 'author')", [bookId, authorId]);
  await q("insert into public.book_editions (book_id, format) values ($1, 'paperback')", [bookId]);
}

beforeAll(async () => {
  db = await newDb();
  admin = await createUser(db, "admin@example.test");
  curator = await createUser(db, "curator@example.test");
  reviewer = await createUser(db, "reviewer@example.test");
  authorUser = await createUser(db, "author@example.test");
  otherAuthor = await createUser(db, "author2@example.test");
  plainUser = await createUser(db, "plain@example.test");
  await grantRole(db, admin, "admin");
  await grantRole(db, curator, "curator");
  await grantRole(db, reviewer, "reviewer");
  authorId = (await q<{ id: string }>("insert into public.authors (name, slug) values ('A One', 'a-one') returning id")).rows[0].id;
  await q("insert into public.author_accounts (user_id, author_id) values ($1, $2)", [authorUser, authorId]);
  await grantRole(db, authorUser, "author");
  await grantRole(db, otherAuthor, "author");
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("accounts and roles", () => {
  it("creates a profile and customer role for every new user", async () => {
    const roles = await q("select role from public.user_roles where user_id = $1", [plainUser]);
    expect(roles.rows).toEqual([{ role: "customer" }]);
    const profile = await q("select 1 from public.profiles where id = $1", [plainUser]);
    expect(profile.rows).toHaveLength(1);
  });

  it("does not let a user grant themselves a role", async () => {
    const err = await asUser(db, plainUser, () =>
      failure(q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [plainUser])),
    );
    expect(err).not.toBeNull();
    expect((await q("select 1 from public.user_roles where user_id=$1 and role='admin'", [plainUser])).rows).toHaveLength(0);
  });

  it("lets an admin grant a role but not a curator", async () => {
    expect(await asUser(db, curator, () => failure(q("insert into public.user_roles (user_id, role) values ($1, 'reviewer')", [plainUser])))).not.toBeNull();
    expect(await asUser(db, admin, () => failure(q("insert into public.user_roles (user_id, role) values ($1, 'reviewer')", [plainUser])))).toBeNull();
    await q("delete from public.user_roles where user_id=$1 and role='reviewer'", [plainUser]);
  });

  it("only exposes a user's own roles and profile", async () => {
    const rows = await asUser(db, plainUser, () => q("select user_id from public.user_roles"));
    expect(rows.rows.every((r) => r.user_id === plainUser)).toBe(true);
    const profiles = await asUser(db, plainUser, () => q("select id from public.profiles"));
    expect(profiles.rows).toHaveLength(1);
  });

  it("only allows editing the display name", async () => {
    expect(await asUser(db, plainUser, () => failure(q("update public.profiles set display_name='Pat' where id=$1", [plainUser])))).toBeNull();
    expect(await asUser(db, plainUser, () => failure(q("update public.profiles set id=gen_random_uuid() where id=$1", [plainUser])))).not.toBeNull();
  });

  it("gives anonymous visitors no access to account tables", async () => {
    for (const table of ["profiles", "user_roles", "seller_applications", "rate_limits", "content_error_reports", "editorial_events", "verification_evidence"]) {
      const err = await asAnon(db, () => failure(q(`select * from public.${table}`)));
      expect(err, table).not.toBeNull();
    }
  });
});

describe("seller applications", () => {
  it("lets a user apply once, for themselves only", async () => {
    const insert = (uid: string, as: string) =>
      asUser(db, as, () =>
        failure(q("insert into public.seller_applications (user_id, kind, display_name) values ($1,'publisher','Pub House')", [uid])),
      );
    expect(await insert(otherAuthor, plainUser)).not.toBeNull();
    expect(await insert(plainUser, plainUser)).toBeNull();
    expect(await insert(plainUser, plainUser)).not.toBeNull();
  });

  it("only staff can approve, which creates an unpublished record, link and role", async () => {
    const appId = (await q<{ id: string }>("select id from public.seller_applications where user_id=$1", [plainUser])).rows[0].id;
    expect(await asUser(db, plainUser, () => failure(q("select public.review_seller_application($1, true)", [appId])))).not.toBeNull();
    await asUser(db, curator, () => q("select public.review_seller_application($1, true, 'ok')", [appId]));
    const pub = await q<{ is_published: boolean; id: string }>("select p.id, p.is_published from public.publishers p join public.publisher_accounts a on a.publisher_id=p.id where a.user_id=$1", [plainUser]);
    expect(pub.rows).toHaveLength(1);
    expect(pub.rows[0].is_published).toBe(false);
    expect((await q("select 1 from public.user_roles where user_id=$1 and role='publisher'", [plainUser])).rows).toHaveLength(1);
    expect(await asUser(db, curator, () => failure(q("select public.review_seller_application($1, true)", [appId])))).toMatch(/already reviewed/);
  });

  it("requires a note to reject", async () => {
    const u = await createUser(db, "rej@example.test");
    const app = (await asUser(db, u, () => q<{ id: string }>("insert into public.seller_applications (user_id, kind, display_name) values ($1,'author','Rej') returning id", [u]))).rows[0].id;
    expect(await asUser(db, curator, () => failure(q("select public.review_seller_application($1, false)", [app])))).toMatch(/note is required/);
    expect(await asUser(db, curator, () => failure(q("select public.review_seller_application($1, false, 'Not a match')", [app])))).toBeNull();
  });
});

describe("submission lifecycle", () => {
  it("rejects sellers creating non-draft books or books for other people", async () => {
    expect(await asUser(db, authorUser, () => failure(q("insert into public.books (title, slug, status) values ('x','pub-x','published')")))).not.toBeNull();
    // A forged submitted_by is overwritten by the trigger.
    const id = await asUser(db, authorUser, async () => (await q<{ id: string }>("insert into public.books (title, slug, submitted_by) values ('x','forged', $1) returning id", [otherAuthor])).rows[0].id);
    expect((await q("select submitted_by from public.books where id=$1", [id])).rows[0]).toEqual({ submitted_by: authorUser });
  });

  it("denies plain customers any book insert", async () => {
    const u = await createUser(db, "cust@example.test");
    expect(await asUser(db, u, () => failure(q("insert into public.books (title, slug) values ('x','cust-x')")))).not.toBeNull();
  });

  it("keeps drafts private to owner and staff", async () => {
    const id = await newDraft(authorUser, "private-draft");
    expect((await asAnon(db, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(0);
    expect((await asUser(db, otherAuthor, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(0);
    expect((await asUser(db, authorUser, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(1);
    expect((await asUser(db, curator, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(1);
    expect((await asUser(db, otherAuthor, () => q("update public.books set title='hijack' where id=$1 returning id", [id]))).rows).toHaveLength(0);
  });

  it("requires rights confirmation to submit", async () => {
    const id = await asUser(db, authorUser, async () => (await q<{ id: string }>("insert into public.books (title, slug, description) values ('NR','no-rights','d') returning id")).rows[0].id);
    expect(await asUser(db, authorUser, () => failure(q("update public.books set status='submitted' where id=$1", [id])))).toMatch(/Rights must be confirmed/);
  });

  it("blocks owner changes to staff-only fields and owner self-approval", async () => {
    const id = await newDraft(authorUser, "owner-cols");
    for (const sql of [
      "update public.books set is_featured=true where id=$1",
      "update public.books set slug='changed' where id=$1",
      "update public.books set submitted_by=null where id=$1",
      "update public.books set status='approved' where id=$1",
      "update public.books set status='published' where id=$1",
    ]) {
      expect(await asUser(db, authorUser, () => failure(q(sql, [id]))), sql).not.toBeNull();
    }
    expect(await asUser(db, authorUser, () => failure(q("update public.books set title='Better' where id=$1", [id])))).toBeNull();
  });

  it("walks the full happy path and records history", async () => {
    const id = await newDraft(authorUser, "happy-path");
    await asUser(db, authorUser, () => q("update public.books set status='submitted' where id=$1", [id]));
    // Owner can no longer edit content while submitted.
    expect(await asUser(db, authorUser, () => failure(q("update public.books set title='Late edit' where id=$1", [id])))).toMatch(/cannot be edited/);
    // Owner cannot move it forward.
    expect(await asUser(db, authorUser, () => failure(q("update public.books set status='editorial_review' where id=$1", [id])))).not.toBeNull();
    await asUser(db, curator, () => q("update public.books set status='editorial_review' where id=$1", [id]));
    // Cannot approve without an author credit and an edition.
    expect(await asUser(db, curator, () => failure(q("update public.books set status='approved' where id=$1", [id])))).toMatch(/author credit/);
    await prepForApproval(id);
    await asUser(db, curator, () => q("update public.books set status='approved' where id=$1", [id]));
    await asUser(db, curator, () => q("update public.books set status='published' where id=$1", [id]));
    expect((await asAnon(db, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(1);
    const events = await asUser(db, authorUser, () => q<{ to_status: string }>("select to_status from public.editorial_events where book_id=$1 order by created_at, to_status", [id]));
    expect(events.rows.map((e) => e.to_status)).toEqual(expect.arrayContaining(["submitted", "editorial_review", "approved", "published"]));
    // Owner cannot edit a published listing.
    expect(await asUser(db, authorUser, () => failure(q("update public.books set title='Edit' where id=$1", [id])))).not.toBeNull();
  });

  it("requires a note for changes requested and rejection, and reopens editing", async () => {
    const id = await newDraft(authorUser, "changes");
    await asUser(db, authorUser, () => q("update public.books set status='submitted' where id=$1", [id]));
    await asUser(db, curator, () => q("update public.books set status='editorial_review' where id=$1", [id]));
    expect(await asUser(db, curator, () => failure(q("update public.books set status='changes_requested' where id=$1", [id])))).toMatch(/note is required/);
    await asUser(db, curator, () => q("update public.books set status='changes_requested', status_note='Please cite sources' where id=$1", [id]));
    const ev = await asUser(db, authorUser, () => q<{ note: string }>("select note from public.editorial_events where book_id=$1 and to_status='changes_requested'", [id]));
    expect(ev.rows[0].note).toBe("Please cite sources");
    expect(await asUser(db, authorUser, () => failure(q("update public.books set title='Revised' where id=$1", [id])))).toBeNull();
    await asUser(db, authorUser, () => q("update public.books set status='submitted' where id=$1", [id]));
  });

  it("lets owners withdraw and resubmit but forbids illegal jumps", async () => {
    const id = await newDraft(authorUser, "withdraw");
    await asUser(db, authorUser, () => q("update public.books set status='submitted' where id=$1", [id]));
    await asUser(db, authorUser, () => q("update public.books set status='withdrawn' where id=$1", [id]));
    await asUser(db, authorUser, () => q("update public.books set status='draft' where id=$1", [id]));
    expect(await asUser(db, curator, () => failure(q("update public.books set status='published' where id=$1", [id])))).toMatch(/not allowed/);
  });

  it("prevents a reviewer without assignment from seeing a submitted book", async () => {
    const id = await newDraft(authorUser, "reviewer-vis");
    expect((await asUser(db, reviewer, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(0);
    await q("insert into public.review_assignments (book_id, reviewer_id) values ($1,$2)", [id, reviewer]);
    expect((await asUser(db, reviewer, () => q("select 1 from public.books where id=$1", [id]))).rows).toHaveLength(1);
  });

  it("limits editions to the owner's own publisher and unavailable, non-primary state", async () => {
    const id = await newDraft(authorUser, "editions");
    const ok = await asUser(db, authorUser, () => failure(q("insert into public.book_editions (book_id, format) values ($1,'hardcover')", [id])));
    expect(ok).toBeNull();
    const avail = await asUser(db, authorUser, () => failure(q("insert into public.book_editions (book_id, format, availability) values ($1,'paperback','available')", [id])));
    expect(avail).not.toBeNull();
    const other = (await q<{ id: string }>("insert into public.publishers (name, slug) values ('Other','other-pub') returning id")).rows[0].id;
    const pub = await asUser(db, authorUser, () => failure(q("insert into public.book_editions (book_id, format, publisher_id) values ($1,'paperback',$2)", [id, other])));
    expect(pub).not.toBeNull();
  });

  it("gives sellers no write access to catalogue tables", async () => {
    const id = await newDraft(authorUser, "catalogue-write");
    for (const sql of [
      "insert into public.book_contributors (book_id, author_id, role) values ($1, (select id from public.authors limit 1), 'author')",
      "insert into public.book_skills (book_id, skill_id, explanation, relation) values ($1,(select id from public.skills limit 1),'x','practised')",
      "insert into public.edition_purchase_channels (edition_id, channel) values (gen_random_uuid(),'amazon')",
    ]) {
      expect(await asUser(db, authorUser, () => failure(q(sql, [id]))), sql).not.toBeNull();
    }
    // RLS hides the row from the UPDATE, so it affects nothing rather than erroring.
    const changed = await asUser(db, authorUser, () => q("update public.authors set is_published=true where id=$1 returning id", [authorId]));
    expect(changed.rows).toHaveLength(0);
    expect((await q("select is_published from public.authors where id=$1", [authorId])).rows[0]).toEqual({ is_published: false });
  });
});

describe("verification workflow guards", () => {
  let bookId: string;
  beforeAll(async () => {
    bookId = await newDraft(authorUser, "verify-book");
    await q("insert into public.review_assignments (book_id, reviewer_id) values ($1,$2)", [bookId, reviewer]);
  });

  const draftReview = `insert into public.verification_reviews (book_id, review_type, reviewer_name, scope) values ($1,'expert_reviewed','Dr X','Astronomy facts') returning id`;

  it("lets an assigned reviewer draft a record but not publish or approve it", async () => {
    const id = (await asUser(db, reviewer, () => q<{ id: string }>(draftReview, [bookId]))).rows[0].id;
    for (const sql of [
      "update public.verification_reviews set admin_approved=true where id=$1",
      "update public.verification_reviews set credentials_verified=true where id=$1",
      "update public.verification_reviews set publication_permission=true, admin_approved=true, reviewed_on=current_date, status='published' where id=$1",
    ]) {
      expect(await asUser(db, reviewer, () => failure(q(sql, [id]))), sql).not.toBeNull();
    }
    expect(await asUser(db, reviewer, () => failure(q("update public.verification_reviews set claims_covered='Orbits' where id=$1", [id])))).toBeNull();
  });

  it("refuses unassigned reviewers and sellers", async () => {
    const other = await createUser(db, "rev2@example.test");
    await grantRole(db, other, "reviewer");
    expect(await asUser(db, other, () => failure(q(draftReview, [bookId])))).not.toBeNull();
    expect(await asUser(db, authorUser, () => failure(q(draftReview, [bookId])))).not.toBeNull();
  });

  it("lets only an admin publish, and publication then needs the DB-level conditions", async () => {
    const id = (await asUser(db, reviewer, () => q<{ id: string }>(draftReview, [bookId]))).rows[0].id;
    const publish = "update public.verification_reviews set publication_permission=true, admin_approved=true, reviewed_on=current_date, status='published' where id=$1";
    expect(await asUser(db, curator, () => failure(q(publish, [id])))).not.toBeNull();
    expect(await asUser(db, admin, () => failure(q(publish, [id])))).toBeNull();
    // Reviewer cannot alter a published record.
    const touched = await asUser(db, reviewer, () => q("update public.verification_reviews set scope='changed' where id=$1 returning id", [id]));
    expect(touched.rows).toHaveLength(0);
  });

  it("keeps evidence private from sellers and anon, visible to assigned reviewer", async () => {
    const reviewId = (await q<{ id: string }>(draftReview, [bookId])).rows[0].id;
    await asUser(db, reviewer, () => q("insert into public.verification_evidence (review_id, kind, note) values ($1,'note','Checked degree certificate')", [reviewId]));
    expect((await asUser(db, reviewer, () => q("select 1 from public.verification_evidence"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(db, authorUser, () => q("select 1 from public.verification_evidence"))).rows).toHaveLength(0);
    expect(await asAnon(db, () => failure(q("select 1 from public.verification_evidence")))).not.toBeNull();
  });
});

describe("error reports and corrections", () => {
  it("gives visitors no direct write path to reports", async () => {
    const sql = "insert into public.content_error_reports (category, description) values ('other','This is a long enough description')";
    expect(await asAnon(db, () => failure(q(sql)))).not.toBeNull();
    expect(await asUser(db, plainUser, () => failure(q(sql)))).not.toBeNull();
    expect(await asService(db, () => failure(q(sql)))).toBeNull();
  });

  it("limits report visibility to staff", async () => {
    expect((await asUser(db, plainUser, () => q("select 1 from public.content_error_reports"))).rows).toHaveLength(0);
    expect((await asUser(db, curator, () => q("select 1 from public.content_error_reports"))).rows.length).toBeGreaterThan(0);
  });

  it("validates report content", async () => {
    expect(await asService(db, () => failure(q("insert into public.content_error_reports (category, description) values ('other','short')")))).not.toBeNull();
    expect(await asService(db, () => failure(q("insert into public.content_error_reports (category, description, contact_email) values ('other','Long enough text here','not-an-email')")))).not.toBeNull();
  });

  it("publishes only published corrections of published books", async () => {
    const pubBook = (await q<{ id: string }>("insert into public.books (title, slug, description, status) values ('P','corr-pub','d','published') returning id")).rows[0].id;
    const draft = (await q<{ id: string }>("insert into public.books (title, slug) values ('D','corr-draft') returning id")).rows[0].id;
    await q("insert into public.content_corrections (book_id, summary, is_published) values ($1,'Fixed a fact',true),($1,'Unpublished fix',false),($2,'Hidden book',true)", [pubBook, draft]);
    const rows = await asAnon(db, () => q<{ summary: string }>("select summary from public.content_corrections"));
    expect(rows.rows.map((r) => r.summary)).toEqual(["Fixed a fact"]);
  });
});

describe("staff directory", () => {
  it("returns reviewers to staff only", async () => {
    const asStaff = await asUser(db, curator, () => q<{ email: string }>("select email from public.list_users_with_role('reviewer')"));
    expect(asStaff.rows.map((r) => r.email)).toContain("reviewer@example.test");
    const asSeller = await asUser(db, authorUser, () => q("select * from public.list_users_with_role('reviewer')"));
    expect(asSeller.rows).toHaveLength(0);
    expect(await asAnon(db, () => failure(q("select * from public.list_users_with_role('reviewer')")))).not.toBeNull();
  });
});

describe("rate limiting", () => {
  it("is callable by the service role only", async () => {
    expect(await asAnon(db, () => failure(q("select public.check_rate_limit('k', 1, 60)")))).not.toBeNull();
    expect(await asUser(db, plainUser, () => failure(q("select public.check_rate_limit('k', 1, 60)")))).not.toBeNull();
    const results = await asService(db, async () => [
      (await q<{ check_rate_limit: boolean }>("select public.check_rate_limit('svc', 2, 3600)")).rows[0].check_rate_limit,
      (await q<{ check_rate_limit: boolean }>("select public.check_rate_limit('svc', 2, 3600)")).rows[0].check_rate_limit,
      (await q<{ check_rate_limit: boolean }>("select public.check_rate_limit('svc', 2, 3600)")).rows[0].check_rate_limit,
    ]);
    expect(results).toEqual([true, true, false]);
  });
});
