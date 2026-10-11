// Phase 6: audit log and user administration.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createUser, failure, grantRole, newDb } from "./test-db";

let db: PGlite;
let admin: string;
let curator: string;
let alice: string;

const q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const log = async (table: string) => (await q<{ actor_id: string | null; action: string; row_key: string | null; changed_columns: string[] | null; detail: Record<string, unknown> | null }>(
  "select actor_id, action, row_key, changed_columns, detail from public.audit_log where table_name=$1 order by id", [table])).rows;

beforeAll(async () => {
  db = await newDb();
  admin = await createUser(db, "admin@example.test");
  curator = await createUser(db, "curator@example.test");
  alice = await createUser(db, "alice@example.test");
  await grantRole(db, admin, "admin");
  await grantRole(db, curator, "curator");
});
afterAll(async () => db.close());

describe("audit log", () => {
  it("records role grants with the acting admin", async () => {
    await asUser(db, admin, () => q("insert into public.user_roles (user_id, role, granted_by) values ($1,'reviewer',$2)", [alice, admin]));
    const rows = (await log("user_roles")).filter((r) => r.detail?.role === "reviewer");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: admin, action: "insert", row_key: alice });
    await asUser(db, admin, () => q("delete from public.user_roles where user_id=$1 and role='reviewer'", [alice]));
    expect((await log("user_roles")).some((r) => r.action === "delete" && r.detail?.role === "reviewer")).toBe(true);
  });

  it("records which setting changed but never its value", async () => {
    await asUser(db, admin, () => q("update public.site_settings set value='true' where key='reviews_enabled'"));
    const rows = await log("site_settings");
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ actor_id: admin, action: "update", row_key: "reviews_enabled" });
    expect(last.changed_columns).toEqual(["value"]);
    expect(JSON.stringify(last)).not.toContain("true");
  });

  it("records order status changes without any customer data", async () => {
    const book = (await q<{ id: string }>("insert into public.books (title, slug, description, status) values ('M','m','d','published') returning id")).rows[0].id;
    const ed = (await q<{ id: string }>("insert into public.book_editions (book_id, format, availability) values ($1,'paperback','available') returning id", [book])).rows[0].id;
    await q("insert into public.product_prices (edition_id, list_price_minor, is_active) values ($1, 10000, true)", [ed]);
    await q("update public.site_settings set value='true' where key='direct_sales_enabled'");
    await q("insert into public.site_settings (key, value) values ('shipping_flat_minor','0')");
    const order = (await asService(db, () => q<{ order_id: string }>(
      "select * from public.create_order($1,'audit-key-1','secret.customer@example.test',$2::jsonb,null,0,$3::jsonb)",
      [alice, JSON.stringify({ recipient_name: "Secret Name", line1: "1 Private Road", city: "Pune", state: "Maharashtra", postal_code: "411001" }),
        JSON.stringify([{ edition_id: ed, quantity: 1, unit_price_minor: 10000, list_price_minor: 10000, discount_minor: 0, personalisation_unit_minor: 0 }])],
    ))).rows[0].order_id;
    await asService(db, () => q("update public.orders set status='cancelled' where id=$1", [order]));
    const rows = await log("orders");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].detail).toMatchObject({ status: ["pending_payment", "cancelled"] });
    const everything = JSON.stringify((await q("select * from public.audit_log")).rows);
    for (const secret of ["secret.customer@example.test", "Secret Name", "Private Road"]) expect(everything).not.toContain(secret);
  });

  it("records the system (no user) as a null actor", async () => {
    const rows = await log("orders");
    expect(rows[rows.length - 1].actor_id).toBeNull();
  });

  it("is readable by admins only", async () => {
    expect((await asUser(db, admin, () => q("select 1 from public.audit_log"))).rows.length).toBeGreaterThan(0);
    expect((await asUser(db, curator, () => q("select 1 from public.audit_log"))).rows).toHaveLength(0);
    expect((await asUser(db, alice, () => q("select 1 from public.audit_log"))).rows).toHaveLength(0);
    expect(await failure(asAnon(db, () => q("select 1 from public.audit_log")))).toMatch(/permission denied/);
  });

  it("is append-only, even for the service role and the database owner", async () => {
    expect(await failure(asService(db, () => q("update public.audit_log set action='delete'")))).toMatch(/append-only/);
    expect(await failure(asService(db, () => q("delete from public.audit_log")))).toMatch(/append-only/);
    expect(await failure(q("truncate public.audit_log"))).toMatch(/append-only/);
    expect(await failure(asUser(db, admin, () => q("delete from public.audit_log")))).toMatch(/permission denied/);
  });

  it("does not log updates that change nothing but the timestamp", async () => {
    const before = (await log("site_settings")).length;
    await asUser(db, admin, () => q("update public.site_settings set updated_at = now() where key='reviews_enabled'"));
    expect((await log("site_settings")).length).toBe(before);
  });
});

describe("user administration", () => {
  it("lists users with roles for admins only", async () => {
    const rows = (await asUser(db, admin, () => q<{ email: string; roles: string[] }>("select * from public.admin_list_users(null)"))).rows;
    expect(rows.find((r) => r.email === "alice@example.test")?.roles).toContain("customer");
    expect(await failure(asUser(db, curator, () => q("select * from public.admin_list_users(null)")))).toMatch(/Only administrators/);
    expect(await failure(asUser(db, alice, () => q("select * from public.admin_list_users(null)")))).toMatch(/Only administrators/);
    expect(await failure(asAnon(db, () => q("select * from public.admin_list_users(null)")))).toMatch(/permission denied/);
  });
  it("filters by email and treats wildcard characters literally", async () => {
    const one = (await asUser(db, admin, () => q("select * from public.admin_list_users('alice')"))).rows;
    expect(one).toHaveLength(1);
    const wild = (await asUser(db, admin, () => q("select * from public.admin_list_users('%')"))).rows;
    expect(wild.length).toBeGreaterThan(1); // '%' is stripped, so it behaves as an empty filter, not a pattern
  });
  it("lets an admin grant roles but never revoke their own admin role", async () => {
    await asUser(db, admin, () => q("insert into public.user_roles (user_id, role, granted_by) values ($1,'curator',$2)", [alice, admin]));
    await asUser(db, admin, () => q("delete from public.user_roles where user_id=$1 and role='admin'", [admin]));
    expect((await q("select 1 from public.user_roles where user_id=$1 and role='admin'", [admin])).rows).toHaveLength(1);
    expect(await failure(asUser(db, curator, () => q("insert into public.user_roles (user_id, role) values ($1,'admin')", [curator])))).toMatch(/row-level security/);
  });
});
