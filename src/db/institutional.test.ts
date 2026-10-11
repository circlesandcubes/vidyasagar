// Phase 5 database rules: click redirect lookup, bulk enquiries, quotations.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createUser, failure, grantRole, newDb } from "./test-db";

let db: PGlite;
let alice: string;
let bob: string;
let admin: string;
let curator: string;
let bookId: string;
let editionId: string;
let draftEdition: string;

const q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

async function submit(over: { user?: string | null; items?: unknown[] } = {}) {
  const res = await asService(db, () =>
    q<{ enquiry_id: string; reference: string }>(
      "select * from public.submit_bulk_enquiry($1,'Sunrise School','school','Meera','meera@school.test','9876543210','Pune','Maharashtra',200,null,'We need 200 copies for term two.', $2::jsonb)",
      [over.user ?? null, JSON.stringify(over.items ?? [{ book_id: bookId, quantity: 100 }])],
    ),
  );
  return res.rows[0];
}

beforeAll(async () => {
  db = await newDb();
  alice = await createUser(db, "alice@example.test");
  bob = await createUser(db, "bob@example.test");
  admin = await createUser(db, "admin@example.test");
  curator = await createUser(db, "curator@example.test");
  await grantRole(db, admin, "admin");
  await grantRole(db, curator, "curator");
  bookId = (await q<{ id: string }>("insert into public.books (title, slug, description, status) values ('Moons','moons','d','published') returning id")).rows[0].id;
  editionId = (await q<{ id: string }>("insert into public.book_editions (book_id, format, availability) values ($1,'paperback','available') returning id", [bookId])).rows[0].id;
  const draftBook = (await q<{ id: string }>("insert into public.books (title, slug, description, status) values ('Draft','draft-x','d','draft') returning id")).rows[0].id;
  draftEdition = (await q<{ id: string }>("insert into public.book_editions (book_id, format, availability) values ($1,'paperback','available') returning id", [draftBook])).rows[0].id;
  await q("insert into public.edition_purchase_channels (edition_id, channel, is_enabled, fulfilment, destination_url) values ($1,'amazon',true,'external','https://www.amazon.in/dp/EXAMPLE')", [editionId]);
  await q("insert into public.edition_purchase_channels (edition_id, channel, is_enabled, fulfilment, destination_url) values ($1,'flipkart',false,'external','https://www.flipkart.com/x')", [editionId]);
  await q("insert into public.edition_purchase_channels (edition_id, channel, is_enabled, fulfilment, destination_url) values ($1,'amazon',true,'external','https://www.amazon.in/dp/DRAFT')", [draftEdition]);
});
afterAll(async () => db.close());

describe("purchase click redirect", () => {
  it("returns the approved URL and records exactly one click without personal data", async () => {
    const url = (await asAnon(db, () => q<{ record_purchase_click: string }>("select public.record_purchase_click($1,'amazon','book-page')", [editionId]))).rows[0].record_purchase_click;
    expect(url).toBe("https://www.amazon.in/dp/EXAMPLE");
    const clicks = (await q("select * from public.purchase_clicks")).rows;
    expect(clicks).toHaveLength(1);
    expect(Object.keys(clicks[0]).sort()).toEqual(["channel", "clicked_at", "edition_id", "id", "source"]);
  });
  it("returns null and logs nothing for disabled, draft-book, unknown-channel or unknown-edition links", async () => {
    const before = (await q("select count(*)::int as n from public.purchase_clicks")).rows[0].n;
    for (const [id, channel] of [[editionId, "flipkart"], [draftEdition, "amazon"], [editionId, "evil"], ["00000000-0000-0000-0000-000000000000", "amazon"]]) {
      const r = (await asAnon(db, () => q<{ record_purchase_click: string | null }>("select public.record_purchase_click($1,$2,null)", [id, channel]))).rows[0].record_purchase_click;
      expect(r).toBeNull();
    }
    expect((await q("select count(*)::int as n from public.purchase_clicks")).rows[0].n).toBe(before);
  });
  it("drops a malformed source label and hides click data from the public", async () => {
    await asAnon(db, () => q("select public.record_purchase_click($1,'amazon','<script>')", [editionId]));
    expect((await q("select source from public.purchase_clicks order by clicked_at desc limit 1")).rows[0].source).toBeNull();
    expect(await failure(asAnon(db, () => q("select * from public.purchase_clicks")))).toMatch(/permission denied/);
    expect((await asUser(db, alice, () => q("select * from public.purchase_clicks"))).rows).toHaveLength(0);
    expect((await asUser(db, curator, () => q("select * from public.purchase_clicks"))).rows.length).toBeGreaterThan(0);
  });
});

describe("bulk enquiries", () => {
  it("cannot be inserted directly by the public or customers", async () => {
    expect(await failure(asAnon(db, () => q("select * from public.submit_bulk_enquiry(null,'X','school','Y','y@z.test',null,null,null,1,null,'0123456789','[]'::jsonb)")))).toMatch(/permission denied/);
    expect(await failure(asUser(db, alice, () => q("insert into public.bulk_enquiries (organisation_name, organisation_type, contact_name, email, message) values ('Org','school','Name','a@b.test','a long enough message')")))).toMatch(/permission denied/);
  });
  it("stores an enquiry with a reference and items; unpublished books are rejected", async () => {
    const e = await submit({ user: alice });
    expect(e.reference).toMatch(/^BE-\d+$/);
    expect((await q("select * from public.bulk_enquiry_items where enquiry_id=$1", [e.enquiry_id])).rows).toHaveLength(1);
    const draftBook = (await q<{ id: string }>("select id from public.books where slug='draft-x'")).rows[0].id;
    expect(await failure(submit({ items: [{ book_id: draftBook, quantity: 5 }] }))).toBeTruthy();
    expect(await failure(submit({ items: Array.from({ length: 51 }, () => ({ title: "x", quantity: 1 })) }))).toMatch(/Too many items/);
  });
  it("rejects invalid contact details at the database", async () => {
    const bad = (sql: string) => failure(asService(db, () => q(sql)));
    expect(await bad("select * from public.submit_bulk_enquiry(null,'Org','school','Name','not-an-email',null,null,null,1,null,'a long enough message','[]'::jsonb)")).toMatch(/check/i);
    expect(await bad("select * from public.submit_bulk_enquiry(null,'Org','school','Name','a@b.test',null,null,null,0,null,'a long enough message','[]'::jsonb)")).toMatch(/check/i);
    expect(await bad("select * from public.submit_bulk_enquiry(null,'Org','school','Name','a@b.test',null,null,null,1,null,'short','[]'::jsonb)")).toMatch(/check/i);
  });
  it("is visible to admins and the signed-in enquirer only", async () => {
    const e = await submit({ user: alice });
    const count = (user: string) => asUser(db, user, () => q("select 1 from public.bulk_enquiries where id=$1", [e.enquiry_id])).then((r) => r.rows.length);
    expect(await count(admin)).toBe(1);
    expect(await count(alice)).toBe(1);
    expect(await count(bob)).toBe(0);
    expect(await count(curator)).toBe(0);
    expect(await failure(asAnon(db, () => q("select 1 from public.bulk_enquiries")))).toMatch(/permission denied/);
  });
  it("lets admins change only status and assignment", async () => {
    const e = await submit();
    await asUser(db, admin, () => q("update public.bulk_enquiries set status='in_progress', assigned_to=$2 where id=$1", [e.enquiry_id, admin]));
    expect((await q("select status from public.bulk_enquiries where id=$1", [e.enquiry_id])).rows[0].status).toBe("in_progress");
    expect(await failure(asUser(db, admin, () => q("update public.bulk_enquiries set email='x@y.test' where id=$1", [e.enquiry_id])))).toMatch(/permission denied/);
    await asUser(db, alice, () => q("update public.bulk_enquiries set status='closed' where id=$1", [e.enquiry_id])).catch(() => undefined);
    expect((await q("select status from public.bulk_enquiries where id=$1", [e.enquiry_id])).rows[0].status).toBe("in_progress");
  });
  it("keeps internal notes admin-only", async () => {
    const e = await submit({ user: alice });
    await asUser(db, admin, () => q("insert into public.bulk_enquiry_notes (enquiry_id, author_id, body) values ($1,$2,'Called them')", [e.enquiry_id, admin]));
    expect((await asUser(db, alice, () => q("select * from public.bulk_enquiry_notes"))).rows).toHaveLength(0);
    expect(await failure(asUser(db, alice, () => q("insert into public.bulk_enquiry_notes (enquiry_id, author_id, body) values ($1,$2,'x')", [e.enquiry_id, alice])))).toBeTruthy();
    expect(await failure(asUser(db, admin, () => q("insert into public.bulk_enquiry_notes (enquiry_id, author_id, body) values ($1,$2,'x')", [e.enquiry_id, bob])))).toBeTruthy();
  });
});

describe("price tiers", () => {
  it("ship empty: no institutional discount exists until the business defines one", async () => {
    expect((await q("select 1 from public.bulk_price_tiers")).rows).toHaveLength(0);
  });
  it("shows only public, active tiers to visitors", async () => {
    await asUser(db, admin, () => q("insert into public.bulk_price_tiers (label, min_quantity, discount_bps, is_public) values ('50+ copies', 50, 1000, true), ('Internal', 500, 2000, false)"));
    expect((await asAnon(db, () => q("select label from public.bulk_price_tiers"))).rows).toEqual([{ label: "50+ copies" }]);
    expect(await failure(asUser(db, curator, () => q("insert into public.bulk_price_tiers (label, min_quantity, discount_bps) values ('x', 5, 100)")))).toMatch(/row-level security/);
  });
});

describe("quotations", () => {
  async function draft() {
    const e = await submit({ user: alice });
    const id = (await asUser(db, admin, () => q<{ id: string }>("insert into public.quotations (enquiry_id, created_by, shipping_minor) values ($1,$2,10000) returning id", [e.enquiry_id, admin]))).rows[0].id;
    return { enquiryId: e.enquiry_id, id };
  }
  const totals = async (id: string) => (await q<{ subtotal_minor: number; discount_minor: number; shipping_minor: number; total_minor: number; status: string }>("select * from public.quotations where id=$1", [id])).rows[0];

  it("derives totals from lines so a total can never disagree with them", async () => {
    const { id } = await draft();
    await asUser(db, admin, () => q("insert into public.quotation_lines (quotation_id, edition_id, description, quantity, unit_price_minor, line_total_minor) values ($1,$2,'Moons',100,25000,2500000)", [id, editionId]));
    await asUser(db, admin, () => q("update public.quotations set discount_minor=100000 where id=$1", [id]));
    await asUser(db, admin, () => q("insert into public.quotation_lines (quotation_id, description, quantity, unit_price_minor, line_total_minor) values ($1,'Bookmarks',10,1000,10000)", [id]));
    const t = await totals(id);
    expect(t.subtotal_minor).toBe(2510000);
    expect(t.total_minor).toBe(2510000 - 100000 + 10000);
    await asUser(db, admin, () => q("update public.quotations set shipping_minor=0 where id=$1", [id]));
    expect((await totals(id)).total_minor).toBe(2510000 - 100000);
    expect(await failure(asUser(db, admin, () => q("insert into public.quotation_lines (quotation_id, description, quantity, unit_price_minor, line_total_minor) values ($1,'Bad',2,100,999)", [id])))).toMatch(/check/i);
    expect(await failure(asUser(db, admin, () => q("update public.quotations set total_minor=1 where id=$1", [id])))).toMatch(/permission denied/);
  });
  it("cannot be issued without lines or a future validity date; then freezes", async () => {
    const { id } = await draft();
    expect(await failure(asUser(db, admin, () => q("update public.quotations set status='issued', valid_until = current_date + 30 where id=$1", [id])))).toMatch(/at least one line/);
    await asUser(db, admin, () => q("insert into public.quotation_lines (quotation_id, description, quantity, unit_price_minor, line_total_minor) values ($1,'Moons',10,20000,200000)", [id]));
    expect(await failure(asUser(db, admin, () => q("update public.quotations set status='issued' where id=$1", [id])))).toMatch(/future validity/);
    await asUser(db, admin, () => q("update public.quotations set status='issued', valid_until = current_date + 30 where id=$1", [id]));
    expect((await totals(id)).status).toBe("issued");
    expect(await failure(asUser(db, admin, () => q("update public.quotations set shipping_minor=0 where id=$1", [id])))).toMatch(/cannot be changed/);
    expect(await failure(asUser(db, admin, () => q("insert into public.quotation_lines (quotation_id, description, quantity, unit_price_minor, line_total_minor) values ($1,'Late',1,1,1)", [id])))).toMatch(/cannot be changed/);
    expect(await failure(asUser(db, admin, () => q("delete from public.quotation_lines where quotation_id=$1", [id])))).toMatch(/cannot be changed/);
    await asUser(db, admin, () => q("update public.quotations set status='accepted' where id=$1", [id]));
    expect(await failure(asUser(db, admin, () => q("update public.quotations set status='draft' where id=$1", [id])))).toMatch(/not allowed/);
  });
  it("shows drafts to admins only and issued quotations to the enquirer", async () => {
    const { id } = await draft();
    const visible = (user: string) => asUser(db, user, () => q("select 1 from public.quotations where id=$1", [id])).then((r) => r.rows.length);
    expect(await visible(admin)).toBe(1);
    expect(await visible(alice)).toBe(0);
    await asUser(db, admin, () => q("insert into public.quotation_lines (quotation_id, description, quantity, unit_price_minor, line_total_minor) values ($1,'Moons',1,100,100)", [id]));
    await asUser(db, admin, () => q("update public.quotations set status='issued', valid_until = current_date + 5 where id=$1", [id]));
    expect(await visible(alice)).toBe(1);
    expect(await visible(bob)).toBe(0);
    expect((await asUser(db, alice, () => q("select 1 from public.quotation_lines where quotation_id=$1", [id]))).rows).toHaveLength(1);
    expect((await asUser(db, bob, () => q("select 1 from public.quotation_lines where quotation_id=$1", [id]))).rows).toHaveLength(0);
  });
  it("is closed to curators and customers for writes", async () => {
    const e = await submit({ user: alice });
    for (const user of [curator, alice]) {
      expect(await failure(asUser(db, user, () => q("insert into public.quotations (enquiry_id, created_by) values ($1,$2)", [e.enquiry_id, user])))).toMatch(/row-level security|permission denied/);
    }
  });
});

describe("staff analytics", () => {
  it("aggregates clicks for staff and refuses everyone else", async () => {
    const rows = (await asUser(db, curator, () => q<{ clicks: string; channel: string }>("select * from public.analytics_clicks(30)"))).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).not.toHaveProperty("user_id");
    expect(await failure(asUser(db, alice, () => q("select * from public.analytics_clicks(30)")))).toMatch(/Only staff/);
    expect(await failure(asAnon(db, () => q("select * from public.analytics_clicks(30)")))).toMatch(/permission denied/);
  });
  it("summarises orders for staff only", async () => {
    expect(await failure(asUser(db, curator, () => q("select * from public.analytics_orders(30)")))).toBeNull();
    expect(await failure(asUser(db, bob, () => q("select * from public.analytics_orders(30)")))).toMatch(/Only staff/);
  });
});
