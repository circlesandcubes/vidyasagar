// Phase 3 database rules: addresses, saved books, interests, personalisation,
// newsletter, reviews, settings. Runs the real migrations in PGlite.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createUser, failure, grantRole, newDb } from "./test-db";

let db: PGlite;
let alice: string;
let bob: string;
let admin: string;
let curator: string;
let publishedBook: string;
let draftBook: string;

const q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const address = (extra = "") =>
  `insert into public.addresses (user_id, recipient_name, line1, city, state, postal_code ${extra ? "," + extra.split("=")[0] : ""})
   values (auth.uid(), 'Alice', '1 Road', 'Pune', 'Maharashtra', '411001' ${extra ? "," + extra.split("=")[1] : ""})`;

beforeAll(async () => {
  db = await newDb();
  alice = await createUser(db, "alice@example.test");
  bob = await createUser(db, "bob@example.test");
  admin = await createUser(db, "admin@example.test");
  curator = await createUser(db, "curator@example.test");
  await grantRole(db, admin, "admin");
  await grantRole(db, curator, "curator");
  publishedBook = (await q<{ id: string }>("insert into public.books (title, slug, description, status) values ('P','p','d','published') returning id")).rows[0].id;
  draftBook = (await q<{ id: string }>("insert into public.books (title, slug) values ('D','d') returning id")).rows[0].id;
}, 120_000);
afterAll(async () => { await db.close(); });

describe("addresses", () => {
  it("are private to their owner", async () => {
    await asUser(db, alice, () => q(address()));
    expect((await asUser(db, alice, () => q("select 1 from public.addresses"))).rows).toHaveLength(1);
    expect((await asUser(db, bob, () => q("select 1 from public.addresses"))).rows).toHaveLength(0);
    expect(await asAnon(db, () => failure(q("select 1 from public.addresses")))).not.toBeNull();
    expect((await asUser(db, bob, () => q("delete from public.addresses returning id"))).rows).toHaveLength(0);
  });
  it("cannot be created for someone else", async () => {
    expect(await asUser(db, bob, () => failure(q(address().replace("auth.uid()", `'${alice}'`))))).not.toBeNull();
  });
  it("validate Indian postal codes and allow one default", async () => {
    expect(await asUser(db, alice, () => failure(q(address("postal_code=x").replace("'411001' ,", "").replace("'411001'", "'012345'"))))).not.toBeNull();
    expect(await asUser(db, alice, () => failure(q("insert into public.addresses (user_id, recipient_name, line1, city, state, postal_code) values (auth.uid(),'A','1','C','S','1234')")))).not.toBeNull();
    const first = "insert into public.addresses (user_id, recipient_name, line1, city, state, postal_code, is_default) values (auth.uid(),'A','1','C','S','411001', true)";
    expect(await asUser(db, alice, () => failure(q(first)))).toBeNull();
    expect(await asUser(db, alice, () => failure(q(first)))).not.toBeNull();
  });
});

describe("saved books and interests", () => {
  it("allows saving only published books, privately", async () => {
    expect(await asUser(db, alice, () => failure(q("insert into public.saved_books (user_id, book_id) values (auth.uid(), $1)", [publishedBook])))).toBeNull();
    expect(await asUser(db, alice, () => failure(q("insert into public.saved_books (user_id, book_id) values (auth.uid(), $1)", [draftBook])))).not.toBeNull();
    expect((await asUser(db, bob, () => q("select 1 from public.saved_books"))).rows).toHaveLength(0);
    expect(await asUser(db, bob, () => failure(q("insert into public.saved_books (user_id, book_id) values ($1, $2)", [alice, publishedBook])))).not.toBeNull();
  });
  it("keeps interests private", async () => {
    const skill = (await q<{ id: string }>("select id from public.skills limit 1")).rows[0].id;
    await asUser(db, alice, () => q("insert into public.user_skill_interests (user_id, skill_id) values (auth.uid(), $1)", [skill]));
    expect((await asUser(db, bob, () => q("select 1 from public.user_skill_interests"))).rows).toHaveLength(0);
    expect((await asUser(db, alice, () => q("select 1 from public.user_skill_interests"))).rows).toHaveLength(1);
    const age = (await q<{ id: string }>("select id from public.age_groups limit 1")).rows[0].id;
    expect(await asUser(db, bob, () => failure(q("insert into public.user_age_groups (user_id, age_group_id) values ($1,$2)", [alice, age])))).not.toBeNull();
  });
});

describe("personalisation templates", () => {
  let templateId: string;
  beforeAll(async () => {
    templateId = (await q<{ id: string }>("insert into public.personalisation_templates (slug, name) values ('name-on-cover','Name on cover') returning id")).rows[0].id;
    await q("insert into public.personalisation_fields (template_id, key, label, max_length) values ($1,'child_name','Name',20)", [templateId]);
    await q("insert into public.book_personalisation (book_id, template_id, is_enabled) values ($1,$2,true)", [publishedBook, templateId]);
  });
  it("are hidden until active", async () => {
    expect((await asAnon(db, () => q("select 1 from public.personalisation_templates"))).rows).toHaveLength(0);
    expect((await asAnon(db, () => q("select 1 from public.personalisation_fields"))).rows).toHaveLength(0);
    expect((await asAnon(db, () => q("select 1 from public.book_personalisation"))).rows).toHaveLength(0);
    await q("update public.personalisation_templates set is_active = true where id=$1", [templateId]);
    expect((await asAnon(db, () => q("select 1 from public.personalisation_templates"))).rows).toHaveLength(1);
    expect((await asAnon(db, () => q("select 1 from public.book_personalisation"))).rows).toHaveLength(1);
  });
  it("do not leak options for unpublished books or disabled links", async () => {
    await q("insert into public.book_personalisation (book_id, template_id, is_enabled) values ($1,$2,true)", [draftBook, templateId]);
    expect((await asAnon(db, () => q("select 1 from public.book_personalisation"))).rows).toHaveLength(1);
  });
  it("can only be changed by staff", async () => {
    expect(await asUser(db, alice, () => failure(q("insert into public.personalisation_templates (slug, name) values ('x','x')")))).not.toBeNull();
    expect(await asUser(db, curator, () => failure(q("insert into public.personalisation_templates (slug, name) values ('curated','Curated')")))).toBeNull();
  });
  it("enforce field rules", async () => {
    expect(await failure(q("insert into public.personalisation_fields (template_id, key, label, min_length, max_length) values ($1,'k','K',10,5)", [templateId]))).not.toBeNull();
    expect(await failure(q("insert into public.personalisation_fields (template_id, key, label, field_type) values ($1,'pick','Pick','choice')", [templateId]))).not.toBeNull();
    expect(await failure(q("insert into public.personalisation_fields (template_id, key, label) values ($1,'Bad Key','K')", [templateId]))).not.toBeNull();
  });
  it("reject negative price adjustments", async () => {
    expect(await failure(q("insert into public.personalisation_templates (slug, name, price_adjustment_minor) values ('neg','Neg',-1)"))).not.toBeNull();
  });
});

describe("site settings", () => {
  it("ship with optional features off and expose only public keys", async () => {
    const rows = await asAnon(db, () => q<{ key: string; value: unknown }>("select key, value from public.site_settings order by key"));
    expect(rows.rows).toEqual([{ key: "direct_sales_enabled", value: false }, { key: "newsletter_enabled", value: false }, { key: "reviews_enabled", value: false }]);
    await q("insert into public.site_settings (key, value, is_public) values ('secret_thing', '1', false)");
    expect((await asAnon(db, () => q("select 1 from public.site_settings where key='secret_thing'"))).rows).toHaveLength(0);
  });
  it("can only be written by an administrator", async () => {
    expect(await asUser(db, curator, () => failure(q("update public.site_settings set value='true' where key='reviews_enabled'")))).toBeNull(); // 0 rows, no error
    expect((await q("select value from public.site_settings where key='reviews_enabled'")).rows[0]).toEqual({ value: false });
    await asUser(db, admin, () => q("update public.site_settings set value='true' where key='reviews_enabled'"));
    expect((await q("select value from public.site_settings where key='reviews_enabled'")).rows[0]).toEqual({ value: true });
  });
});

describe("customer reviews", () => {
  it("are accepted only while enabled, start pending, and are not visible until published", async () => {
    await q("update public.site_settings set value='false' where key='reviews_enabled'");
    const insert = (uid: string, status = "pending") =>
      asUser(db, uid, () => failure(q("insert into public.book_reviews (book_id, user_id, rating, body, status) values ($1, auth.uid(), 5, 'Lovely book for bedtime.', $2)", [publishedBook, status])));
    expect(await insert(alice)).not.toBeNull();
    await q("update public.site_settings set value='true' where key='reviews_enabled'");
    expect(await insert(alice, "published")).not.toBeNull();
    expect(await insert(alice)).toBeNull();
    expect(await insert(alice)).not.toBeNull(); // one per user per book
    expect((await asAnon(db, () => q("select 1 from public.book_reviews"))).rows).toHaveLength(0);
    expect((await asUser(db, alice, () => q("select 1 from public.book_reviews"))).rows).toHaveLength(1);
  });
  it("can be moderated by staff only, and the author cannot self-publish", async () => {
    const own = await asUser(db, alice, () => q("update public.book_reviews set status='published' returning id"));
    expect(own.rows).toHaveLength(0);
    const id = (await q<{ id: string }>("select id from public.book_reviews")).rows[0].id;
    await asUser(db, curator, () => q("update public.book_reviews set status='published', moderated_by=auth.uid() where id=$1", [id]));
    expect((await asAnon(db, () => q("select 1 from public.book_reviews"))).rows).toHaveLength(1);
    await q("update public.site_settings set value='false' where key='reviews_enabled'");
    expect((await asAnon(db, () => q("select 1 from public.book_reviews"))).rows).toHaveLength(0);
  });
  it("forbids changing review text after submission", async () => {
    const err = await asUser(db, alice, () => failure(q("update public.book_reviews set body='Edited after the fact please' ")));
    expect(err).not.toBeNull();
  });
});

describe("newsletter", () => {
  it("is invisible to clients and writable by the service role only", async () => {
    const sql = "insert into public.newsletter_subscriptions (email, token_hash) values ('a@example.test','h')";
    expect(await asAnon(db, () => failure(q(sql)))).not.toBeNull();
    expect(await asUser(db, alice, () => failure(q(sql)))).not.toBeNull();
    expect(await asService(db, () => failure(q(sql)))).toBeNull();
    expect(await asService(db, () => failure(q("insert into public.newsletter_subscriptions (email, token_hash) values ('A@example.test','h2')")))).not.toBeNull(); // case-insensitive uniqueness
    expect((await asUser(db, alice, () => q("select 1 from public.newsletter_subscriptions"))).rows).toHaveLength(0);
  });
});
