// Phase 4 database rules: prices, order creation, immutability, payments,
// refunds, order operations. Runs the real migrations in PGlite.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createUser, failure, grantRole, newDb } from "./test-db";

let db: PGlite;
let alice: string;
let bob: string;
let admin: string;
let curator: string;
let bookId: string;
let editionId: string;
let editionB: string;
let templateId: string;

const q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const address = { recipient_name: "Alice", line1: "1 Road", city: "Pune", state: "Maharashtra", postal_code: "411001" };

type LineOverrides = Record<string, unknown>;
const line = (over: LineOverrides = {}) => ({ edition_id: editionId, quantity: 1, unit_price_minor: 29900, list_price_minor: 29900, discount_minor: 0, personalisation_unit_minor: 0, ...over });

let keyCounter = 0;
async function place(opts: { user?: string; lines?: unknown[]; coupon?: string | null; shipping?: number; key?: string; addr?: unknown } = {}) {
  const key = opts.key ?? `key-${++keyCounter}-abcdefgh`;
  const res = await asService(db, () =>
    q<{ order_id: string; order_number: string; total_minor: number; created: boolean }>(
      "select * from public.create_order($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)",
      [opts.user ?? alice, key, "a@example.test", JSON.stringify(opts.addr ?? address), opts.coupon ?? null, opts.shipping ?? 5000, JSON.stringify(opts.lines ?? [line()])],
    ),
  );
  return res.rows[0];
}
const tryPlace = (opts: Parameters<typeof place>[0] = {}) => failure(place(opts));

async function stock(edition = editionId) {
  return (await q<{ stock_on_hand: number }>("select stock_on_hand from public.edition_inventory where edition_id=$1", [edition])).rows[0]?.stock_on_hand;
}
async function capture(providerOrderId: string, amount: number, eventId: string, paymentId = `pay_${eventId}`) {
  return (await asService(db, () => q<{ apply_payment_captured: string }>(
    "select public.apply_payment_captured('razorpay', $1, 'payment.captured', $2, $3, $4, '{}'::jsonb)", [eventId, providerOrderId, paymentId, amount],
  ))).rows[0].apply_payment_captured;
}
async function payableOrder(amountOverride?: number) {
  const o = await place();
  const providerOrder = `order_${o.order_number}`;
  await asService(db, () => q("select public.attach_provider_order($1,'razorpay',$2,$3)", [o.order_id, providerOrder, o.total_minor]));
  return { ...o, providerOrder, amount: amountOverride ?? o.total_minor };
}
const orderRow = async (id: string) => (await q<{ status: string; payment_status: string }>("select status, payment_status from public.orders where id=$1", [id])).rows[0];

beforeAll(async () => {
  db = await newDb();
  alice = await createUser(db, "alice@example.test");
  bob = await createUser(db, "bob@example.test");
  admin = await createUser(db, "admin@example.test");
  curator = await createUser(db, "curator@example.test");
  await grantRole(db, admin, "admin");
  await grantRole(db, curator, "curator");
  bookId = (await q<{ id: string }>("insert into public.books (title, slug, description, status) values ('Moons','moons','d','published') returning id")).rows[0].id;
  editionId = (await q<{ id: string }>("insert into public.book_editions (book_id, format, availability, is_primary, isbn13) values ($1,'paperback','available',true,'9780306406157') returning id", [bookId])).rows[0].id;
  editionB = (await q<{ id: string }>("insert into public.book_editions (book_id, format, availability) values ($1,'hardcover','available') returning id", [bookId])).rows[0].id;
  const authorRow = (await q<{ id: string }>("insert into public.authors (name, slug) values ('A','a-x') returning id")).rows[0].id;
  await q("insert into public.book_contributors (book_id, author_id, role) values ($1,$2,'author')", [bookId, authorRow]);
  await q("insert into public.product_prices (edition_id, list_price_minor, is_active) values ($1, 29900, true)", [editionId]);
  await q("insert into public.product_prices (edition_id, list_price_minor, sale_price_minor, is_active) values ($1, 59900, 49900, true)", [editionB]);
  templateId = (await q<{ id: string }>("insert into public.personalisation_templates (slug, name, price_adjustment_minor, is_active) values ('name','Name',15000,true) returning id")).rows[0].id;
  await q("insert into public.personalisation_fields (template_id, key, label) values ($1,'child_name','Name')", [templateId]);
  await q("insert into public.book_personalisation (book_id, template_id, is_enabled) values ($1,$2,true)", [bookId, templateId]);
  await q("update public.site_settings set value='true' where key='direct_sales_enabled'");
  await q("insert into public.site_settings (key, value) values ('shipping_flat_minor','5000'), ('shipping_free_over_minor','100000')");
}, 120_000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await q("delete from public.edition_inventory");
  await q("insert into public.edition_inventory (edition_id, stock_on_hand) values ($1, 10)", [editionId]);
});

describe("prices", () => {
  it("shows only active prices of published books to the public", async () => {
    const hidden = (await q<{ id: string }>("insert into public.books (title, slug) values ('Draft','draft-price') returning id")).rows[0].id;
    const e = (await q<{ id: string }>("insert into public.book_editions (book_id, format) values ($1,'paperback') returning id", [hidden])).rows[0].id;
    await q("insert into public.product_prices (edition_id, list_price_minor, is_active) values ($1, 100, true)", [e]);
    await q("insert into public.product_prices (edition_id, list_price_minor, is_active) values ($1, 111, false)", [editionB]);
    const rows = await asAnon(db, () => q<{ edition_id: string }>("select edition_id from public.product_prices"));
    expect(rows.rows.map((r) => r.edition_id).sort()).toEqual([editionId, editionB].sort());
    await q("delete from public.product_prices where list_price_minor in (100, 111)");
  });
  it("validates amounts and allows one active price per edition", async () => {
    expect(await failure(q("insert into public.product_prices (edition_id, list_price_minor, sale_price_minor) values ($1, 100, 100)", [editionId]))).not.toBeNull();
    expect(await failure(q("insert into public.product_prices (edition_id, list_price_minor) values ($1, 0)", [editionId]))).not.toBeNull();
    expect(await failure(q("insert into public.product_prices (edition_id, list_price_minor, is_active) values ($1, 500, true)", [editionId]))).not.toBeNull();
  });
  it("lets staff, not customers, change prices and inventory", async () => {
    // RLS hides every row from the UPDATE, so nothing is affected.
    expect((await asUser(db, alice, () => q("update public.product_prices set list_price_minor = 1 returning id"))).rows).toHaveLength(0);
    expect((await asUser(db, alice, () => q("update public.edition_inventory set stock_on_hand = 999 returning edition_id"))).rows).toHaveLength(0);
    expect(await asUser(db, alice, () => failure(q("insert into public.product_prices (edition_id, list_price_minor) values ($1, 5)", [editionB])))).not.toBeNull();
    expect(await asAnon(db, () => failure(q("select * from public.edition_inventory")))).not.toBeNull();
    expect((await asUser(db, curator, () => q("update public.edition_inventory set stock_on_hand = 10 returning edition_id"))).rows).toHaveLength(1);
  });
});

describe("create_order", () => {
  it("creates an order with a verified snapshot and decrements stock", async () => {
    const o = await place({ lines: [line({ quantity: 2 })] });
    expect(o.created).toBe(true);
    expect(o.total_minor).toBe(2 * 29900 + 5000);
    expect(o.order_number).toMatch(/^VS-\d+$/);
    const lines = await q("select title, edition_label, isbn13, quantity, unit_price_minor, line_total_minor from public.order_lines where order_id=$1", [o.order_id]);
    expect(lines.rows).toEqual([{ title: "Moons", edition_label: "Paperback (EN)", isbn13: "9780306406157", quantity: 2, unit_price_minor: 29900, line_total_minor: 59800 }]);
    expect(await stock()).toBe(8);
    expect((await q("select to_status from public.order_status_history where order_id=$1", [o.order_id])).rows).toEqual([{ to_status: "pending_payment" }]);
  });

  it("is idempotent for the same user and key", async () => {
    const first = await place({ key: "same-key-12345" });
    const second = await place({ key: "same-key-12345" });
    expect(second.created).toBe(false);
    expect(second.order_id).toBe(first.order_id);
    expect(await stock()).toBe(9);
    const other = await place({ key: "same-key-12345", user: bob });
    expect(other.order_id).not.toBe(first.order_id);
  });

  it("uses the sale price and adds personalisation per unit", async () => {
    const personal = { template_id: templateId, price_adjustment_minor: 15000, fields: [{ key: "child_name", label: "Name", value: "Mia" }] };
    const o = await place({ lines: [line({ edition_id: editionB, unit_price_minor: 49900, list_price_minor: 59900 }), line({ personalisation: personal, personalisation_unit_minor: 15000 })] });
    expect(o.total_minor).toBe(49900 + 29900 + 15000 + 5000);
    const snap = await q<{ personalisation: { fields: { value: string }[] } }>("select personalisation from public.order_lines where order_id=$1 and personalisation is not null", [o.order_id]);
    expect(snap.rows[0].personalisation.fields[0].value).toBe("Mia");
  });

  it("applies free shipping over the threshold and rejects wrong shipping", async () => {
    const big = await place({ lines: [line({ edition_id: editionB, unit_price_minor: 49900, list_price_minor: 59900, quantity: 3 })], shipping: 0 });
    expect(big.total_minor).toBe(149700);
    expect(await tryPlace({ shipping: 0 })).toMatch(/Shipping charge mismatch/);
    expect(await tryPlace({ shipping: 1 })).toMatch(/Shipping charge mismatch/);
  });

  it("rejects tampered or stale prices", async () => {
    expect(await tryPlace({ lines: [line({ unit_price_minor: 100 })] })).toMatch(/Prices changed/);
    expect(await tryPlace({ lines: [line({ list_price_minor: 100 })] })).toMatch(/Prices changed/);
    expect(await stock()).toBe(10);
  });

  it("rejects unavailable, unpublished and unpriced items", async () => {
    await q("update public.book_editions set availability='out_of_print' where id=$1", [editionId]);
    expect(await tryPlace()).toMatch(/no longer available/);
    await q("update public.book_editions set availability='available' where id=$1", [editionId]);
    await q("update public.product_prices set is_active=false where edition_id=$1", [editionId]);
    expect(await tryPlace()).toMatch(/no active price/);
    await q("update public.product_prices set is_active=true where edition_id=$1", [editionId]);
    await q("update public.books set status='archived' where id=$1", [bookId]);
    expect(await tryPlace()).toMatch(/no longer available/);
    await q("update public.books set status='published' where id=$1", [bookId]);
  });

  it("rejects bad quantities, bad addresses, and empty carts", async () => {
    expect(await tryPlace({ lines: [line({ quantity: 0 })] })).toMatch(/Invalid quantity/);
    expect(await tryPlace({ lines: [line({ quantity: 21 })] })).toMatch(/Invalid quantity/);
    expect(await tryPlace({ lines: [] })).toMatch(/between 1 and 50/);
    expect(await tryPlace({ addr: { ...address, postal_code: "12" } })).toMatch(/delivery address/);
  });

  it("refuses to oversell and rolls the whole order back", async () => {
    expect(await tryPlace({ lines: [line({ quantity: 11 })] })).toMatch(/Not enough stock/);
    expect(await tryPlace({ lines: [line({ quantity: 6 }), line({ quantity: 6 })] })).toMatch(/Not enough stock/);
    expect(await stock()).toBe(10);
  });

  it("does not track stock for editions without an inventory row", async () => {
    const o = await place({ lines: [line({ edition_id: editionB, unit_price_minor: 49900, list_price_minor: 59900, quantity: 5 })], shipping: 0 });
    expect(o.created).toBe(true);
  });

  it("requires direct sales to be enabled and shipping to be configured", async () => {
    await q("update public.site_settings set value='false' where key='direct_sales_enabled'");
    expect(await tryPlace()).toMatch(/not enabled/);
    await q("update public.site_settings set value='true' where key='direct_sales_enabled'");
    await q("delete from public.site_settings where key='shipping_flat_minor'");
    expect(await tryPlace()).toMatch(/Shipping is not configured/);
    await q("insert into public.site_settings (key, value) values ('shipping_flat_minor','5000')");
  });

  it("is callable by the service role only", async () => {
    const sql = "select * from public.create_order($1, 'k-1234567890', 'a@b.co', $2::jsonb, null, 5000, $3::jsonb)";
    const args = [alice, JSON.stringify(address), JSON.stringify([line()])];
    expect(await asUser(db, alice, () => failure(q(sql, args)))).not.toBeNull();
    expect(await asAnon(db, () => failure(q(sql, args)))).not.toBeNull();
  });
});

describe("discounts and coupons", () => {
  let ruleId: string;
  beforeAll(async () => {
    ruleId = (await q<{ id: string }>("insert into public.discount_rules (name, kind, value, is_active, requires_coupon) values ('10 off','percent',1000,true,true) returning id")).rows[0].id;
    await q("insert into public.coupons (code, rule_id, max_redemptions, per_user_limit) values ('SAVE10',$1,2,1)", [ruleId]);
  });

  it("accepts a valid coupon and records one redemption", async () => {
    const o = await place({ coupon: "save10", lines: [line({ discount_minor: 2990 })], shipping: 5000 });
    expect(o.total_minor).toBe(29900 - 2990 + 5000);
    const r = await q("select discount_minor from public.coupon_redemptions where order_id=$1", [o.order_id]);
    expect(r.rows).toEqual([{ discount_minor: 2990 }]);
  });
  it("enforces the per-user and overall limits", async () => {
    expect(await tryPlace({ coupon: "SAVE10", lines: [line({ discount_minor: 2990 })] })).toMatch(/already used/);
    await place({ coupon: "SAVE10", user: bob, lines: [line({ discount_minor: 2990 })] });
    const carol = await createUser(db, "carol@example.test");
    expect(await tryPlace({ coupon: "SAVE10", user: carol, lines: [line({ discount_minor: 2990 })] })).toMatch(/fully redeemed/);
  });
  it("rejects unknown, inactive, expired and under-minimum coupons", async () => {
    expect(await tryPlace({ coupon: "NOPE", lines: [line({ discount_minor: 100 })] })).toMatch(/not valid/);
    const rid = (await q<{ id: string }>("insert into public.discount_rules (name, kind, value, is_active, requires_coupon, min_subtotal_minor) values ('min','fixed',500,true,true,100000) returning id")).rows[0].id;
    await q("insert into public.coupons (code, rule_id) values ('MINSPEND',$1), ('OLDONE',$1)", [rid]);
    await q("update public.coupons set expires_at = now() - interval '1 day' where code='OLDONE'");
    expect(await tryPlace({ coupon: "MINSPEND", lines: [line({ discount_minor: 500 })] })).toMatch(/not valid for this order/);
    expect(await tryPlace({ coupon: "OLDONE", lines: [line({ discount_minor: 500 })] })).toMatch(/not valid/);
    await q("update public.discount_rules set is_active=false where id=$1", [rid]);
    expect(await tryPlace({ coupon: "MINSPEND", lines: [line({ discount_minor: 500 })] })).toMatch(/not valid for this order/);
  });
  it("rejects a discount with no coupon and no active automatic rule", async () => {
    expect(await tryPlace({ lines: [line({ discount_minor: 100 })] })).toMatch(/none is active/);
    await q("insert into public.discount_rules (name, kind, value, is_active) values ('Auto','percent',500,true)");
    const o = await place({ lines: [line({ discount_minor: 1495 })] });
    expect(o.created).toBe(true);
    await q("delete from public.discount_rules where name='Auto'");
  });
  it("rejects discounts larger than the line", async () => {
    await q("insert into public.discount_rules (name, kind, value, is_active) values ('Auto2','percent',500,true)");
    expect(await tryPlace({ lines: [line({ discount_minor: 99999 })] })).toMatch(/Invalid line discount/);
    await q("delete from public.discount_rules where name='Auto2'");
  });
  it("frees the coupon use when an unpaid order is cancelled", async () => {
    const dave = await createUser(db, "dave@example.test");
    await q("update public.coupons set max_redemptions = 99 where code='SAVE10'");
    const o = await place({ coupon: "SAVE10", user: dave, lines: [line({ discount_minor: 2990 })] });
    await asUser(db, dave, () => q("select public.cancel_pending_order($1)", [o.order_id]));
    expect((await q("select 1 from public.coupon_redemptions where order_id=$1", [o.order_id])).rows).toHaveLength(0);
    expect((await place({ coupon: "SAVE10", user: dave, lines: [line({ discount_minor: 2990 })] })).created).toBe(true);
  });
  it("only lets administrators manage discounts", async () => {
    expect(await asUser(db, curator, () => failure(q("insert into public.discount_rules (name, kind, value) values ('x','fixed',1)")))).not.toBeNull();
    expect(await asUser(db, admin, () => failure(q("insert into public.discount_rules (name, kind, value) values ('y','fixed',1)")))).toBeNull();
    expect((await asUser(db, alice, () => q("select 1 from public.coupons"))).rows).toHaveLength(0);
    expect(await asAnon(db, () => failure(q("select 1 from public.coupons")))).not.toBeNull();
  });
});

describe("immutability", () => {
  it("refuses to change an order's money, address or owner", async () => {
    const o = await place();
    for (const sql of [
      "update public.orders set total_minor = 1, subtotal_minor = 1, shipping_minor = 0 where id=$1",
      "update public.orders set user_id = '" + bob + "' where id=$1",
      "update public.orders set shipping_address = '{}'::jsonb where id=$1",
      "update public.orders set order_number = 'VS-1' where id=$1",
    ]) {
      expect(await asService(db, () => failure(q(sql, [o.order_id]))), sql).toMatch(/immutable/);
    }
  });
  it("never allows order lines, history or events to be edited or deleted", async () => {
    const o = await place();
    expect(await asService(db, () => failure(q("update public.order_lines set quantity = 5 where order_id=$1", [o.order_id])))).toMatch(/cannot be changed/);
    expect(await asService(db, () => failure(q("delete from public.order_lines where order_id=$1", [o.order_id])))).toMatch(/cannot be changed/);
    expect(await asService(db, () => failure(q("delete from public.order_status_history where order_id=$1", [o.order_id])))).toMatch(/cannot be changed/);
    expect(await asService(db, () => failure(q("delete from public.orders where id=$1", [o.order_id])))).toMatch(/cannot be changed/);
  });
  it("keeps the snapshot when catalogue data later changes", async () => {
    const o = await place();
    await q("update public.books set title = 'Renamed' where id=$1", [bookId]);
    await q("update public.product_prices set list_price_minor = 99900 where edition_id=$1", [editionId]);
    expect((await q("select title, unit_price_minor from public.order_lines where order_id=$1", [o.order_id])).rows[0]).toEqual({ title: "Moons", unit_price_minor: 29900 });
    await q("update public.books set title = 'Moons' where id=$1", [bookId]);
    await q("update public.product_prices set list_price_minor = 29900 where edition_id=$1", [editionId]);
  });
  it("enforces the status transition matrix", async () => {
    const o = await place();
    expect(await asService(db, () => failure(q("update public.orders set status='shipped' where id=$1", [o.order_id])))).toMatch(/not allowed/);
    expect(await asService(db, () => failure(q("update public.orders set status='delivered' where id=$1", [o.order_id])))).toMatch(/not allowed/);
  });
});

describe("payments", () => {
  it("marks an order paid once, however many times the event arrives", async () => {
    const o = await payableOrder();
    expect(await capture(o.providerOrder, o.amount, "evt-1")).toBe("applied");
    expect(await capture(o.providerOrder, o.amount, "evt-1")).toBe("duplicate");
    expect(await orderRow(o.order_id)).toEqual({ status: "paid", payment_status: "paid" });
    expect((await q("select 1 from public.payment_events where provider_event_id='evt-1'")).rows).toHaveLength(1);
    expect((await q("select 1 from public.order_status_history where order_id=$1 and to_status='paid'", [o.order_id])).rows).toHaveLength(1);
  });
  it("flags an amount mismatch for review instead of confirming", async () => {
    const o = await payableOrder();
    expect(await capture(o.providerOrder, o.amount - 100, "evt-mismatch")).toBe("amount_mismatch");
    expect(await orderRow(o.order_id)).toEqual({ status: "needs_review", payment_status: "unpaid" });
  });
  it("flags a second, different payment for the same order", async () => {
    const o = await payableOrder();
    await capture(o.providerOrder, o.amount, "evt-a", "pay_one");
    expect(await capture(o.providerOrder, o.amount, "evt-b", "pay_two")).toBe("duplicate_payment");
    expect(await orderRow(o.order_id)).toEqual({ status: "paid", payment_status: "paid" });
  });
  it("records a capture for a cancelled order as an exception", async () => {
    const o = await payableOrder();
    await asUser(db, alice, () => q("select public.cancel_pending_order($1)", [o.order_id]));
    expect(await capture(o.providerOrder, o.amount, "evt-late")).toBe("order_cancelled");
    expect((await orderRow(o.order_id)).status).toBe("cancelled");
  });
  it("records unknown provider orders without changing anything", async () => {
    expect(await capture("order_unknown", 100, "evt-unknown")).toBe("order_not_found");
  });
  it("records failures without cancelling the order", async () => {
    const o = await payableOrder();
    const r = await asService(db, () => q<{ apply_payment_failed: string }>("select public.apply_payment_failed('razorpay','evt-fail','payment.failed',$1,'{}'::jsonb)", [o.providerOrder]));
    expect(r.rows[0].apply_payment_failed).toBe("recorded");
    expect(await orderRow(o.order_id)).toEqual({ status: "pending_payment", payment_status: "failed" });
    expect(await capture(o.providerOrder, o.amount, "evt-retry")).toBe("applied");
  });
  it("is callable by the service role only", async () => {
    const sql = "select public.apply_payment_captured('razorpay','x','t','o','p',1,'{}'::jsonb)";
    expect(await asUser(db, admin, () => failure(q(sql)))).not.toBeNull();
    expect(await asAnon(db, () => failure(q(sql)))).not.toBeNull();
  });
  it("will not attach a provider order whose amount differs from the total", async () => {
    const o = await place();
    expect(await asService(db, () => failure(q("select public.attach_provider_order($1,'razorpay','order_bad',$2)", [o.order_id, o.total_minor + 1])))).toMatch(/does not match/);
  });
  it("hides payments and events from customers", async () => {
    const o = await payableOrder();
    await capture(o.providerOrder, o.amount, "evt-private");
    expect((await asUser(db, alice, () => q("select 1 from public.payments"))).rows).toHaveLength(0);
    expect((await asUser(db, alice, () => q("select 1 from public.payment_events"))).rows).toHaveLength(0);
    expect((await asUser(db, curator, () => q("select 1 from public.payment_events"))).rows.length).toBeGreaterThan(0);
  });
});

describe("refunds", () => {
  async function paidOrder() {
    const o = await payableOrder();
    await capture(o.providerOrder, o.amount, `evt-${o.order_number}`, `pay_${o.order_number}`);
    return o;
  }
  it("lets staff request refunds up to the refundable balance only", async () => {
    const o = await paidOrder();
    expect(await asUser(db, alice, () => failure(q("select public.request_refund($1, 100, 'because')", [o.order_id])))).toMatch(/Only staff/);
    expect(await asUser(db, curator, () => failure(q("select public.request_refund($1, $2, 'too much')", [o.order_id, o.total_minor + 1])))).toMatch(/exceeds/);
    expect(await asUser(db, curator, () => failure(q("select public.request_refund($1, 10000, 'damaged')", [o.order_id])))).toBeNull();
    expect(await asUser(db, curator, () => failure(q("select public.request_refund($1, $2, 'again')", [o.order_id, o.total_minor - 5000])))).toMatch(/exceeds/);
  });
  it("refuses refunds on unpaid orders", async () => {
    const o = await place();
    expect(await asUser(db, curator, () => failure(q("select public.request_refund($1, 100, 'x y z')", [o.order_id])))).toMatch(/Only paid/);
  });
  it("tracks partial then full refunds, and only admins confirm manual ones", async () => {
    const o = await paidOrder();
    const r1 = (await asUser(db, curator, () => q<{ request_refund: string }>("select public.request_refund($1, 10000, 'part')", [o.order_id]))).rows[0].request_refund;
    expect(await asUser(db, curator, () => failure(q("select public.mark_refund_processed($1, 'UTR1')", [r1])))).toMatch(/Only administrators/);
    await asUser(db, admin, () => q("select public.mark_refund_processed($1, 'UTR1')", [r1]));
    expect((await orderRow(o.order_id)).payment_status).toBe("partially_refunded");
    const r2 = (await asUser(db, curator, () => q<{ request_refund: string }>("select public.request_refund($1, $2, 'rest')", [o.order_id, o.total_minor - 10000]))).rows[0].request_refund;
    await asUser(db, admin, () => q("select public.mark_refund_processed($1, 'UTR2')", [r2]));
    expect((await orderRow(o.order_id)).payment_status).toBe("refunded");
    expect(await asUser(db, admin, () => failure(q("select public.mark_refund_processed($1, 'UTR2')", [r2])))).toMatch(/not awaiting/);
  });
  it("applies provider refund webhooks idempotently, including dashboard refunds", async () => {
    const o = await paidOrder();
    const call = (event: string, amount: number) => asService(db, () => q<{ apply_refund_processed: string }>("select public.apply_refund_processed('razorpay',$1,'refund.processed',$2,'rfnd_1',$3,'{}'::jsonb)", [event, `pay_${o.order_number}`, amount]));
    expect((await call("evt-r1", 10000)).rows[0].apply_refund_processed).toBe("applied");
    expect((await call("evt-r1", 10000)).rows[0].apply_refund_processed).toBe("duplicate");
    expect((await q("select 1 from public.refunds where order_id=$1", [o.order_id])).rows).toHaveLength(1);
    expect((await orderRow(o.order_id)).payment_status).toBe("partially_refunded");
  });
  it("lets customers see their own refunds only", async () => {
    const o = await paidOrder();
    await asUser(db, curator, () => q("select public.request_refund($1, 100, 'goodwill')", [o.order_id]));
    expect((await asUser(db, alice, () => q("select 1 from public.refunds where order_id=$1", [o.order_id]))).rows).toHaveLength(1);
    expect((await asUser(db, bob, () => q("select 1 from public.refunds where order_id=$1", [o.order_id]))).rows).toHaveLength(0);
  });
});

describe("order operations", () => {
  it("only lets staff move orders, never ship unpaid ones, and records shipping", async () => {
    const o = await payableOrder();
    expect(await asUser(db, alice, () => failure(q("select public.admin_set_order_status($1,'processing')", [o.order_id])))).toMatch(/Only staff/);
    expect(await asUser(db, curator, () => failure(q("select public.admin_set_order_status($1,'processing')", [o.order_id])))).toMatch(/not paid/);
    await capture(o.providerOrder, o.amount, `evt-${o.order_number}`);
    await asUser(db, curator, () => q("select public.admin_set_order_status($1,'processing','Packing')", [o.order_id]));
    expect(await asUser(db, curator, () => failure(q("select public.admin_set_order_status($1,'delivered')", [o.order_id])))).toMatch(/not allowed/);
    await asUser(db, curator, () => q("select public.admin_set_order_status($1,'shipped','Handed over','BlueDart','AWB123','https://track.example/AWB123')", [o.order_id]));
    const ship = await asUser(db, alice, () => q("select carrier, tracking_number from public.shipping_events where order_id=$1", [o.order_id]));
    expect(ship.rows).toEqual([{ carrier: "BlueDart", tracking_number: "AWB123" }]);
    await asUser(db, curator, () => q("select public.admin_set_order_status($1,'delivered')", [o.order_id]));
    const hist = await q<{ to_status: string; note: string | null }>("select to_status, note from public.order_status_history where order_id=$1 order by created_at, to_status", [o.order_id]);
    expect(hist.rows.map((h) => h.to_status)).toEqual(expect.arrayContaining(["pending_payment", "paid", "processing", "shipped", "delivered"]));
    expect(hist.rows.find((h) => h.to_status === "processing")?.note).toBe("Packing");
  });
  it("restores stock when an order is cancelled, but never for another user's order", async () => {
    const o = await place({ lines: [line({ quantity: 3 })] });
    expect(await stock()).toBe(7);
    expect(await asUser(db, bob, () => failure(q("select public.cancel_pending_order($1)", [o.order_id])))).toMatch(/not found/);
    await asUser(db, alice, () => q("select public.cancel_pending_order($1)", [o.order_id]));
    expect(await stock()).toBe(10);
  });
  it("does not let customers cancel paid orders", async () => {
    const o = await payableOrder();
    await capture(o.providerOrder, o.amount, `evt-${o.order_number}`);
    expect(await asUser(db, alice, () => failure(q("select public.cancel_pending_order($1)", [o.order_id])))).toMatch(/Only unpaid/);
  });
  it("expires stale unpaid orders and returns their stock", async () => {
    const o = await place({ lines: [line({ quantity: 2 })] });
    await q("alter table public.orders disable trigger orders_guard_update");
    await q("update public.orders set placed_at = now() - interval '5 hours' where id=$1", [o.order_id]);
    await q("alter table public.orders enable trigger orders_guard_update");
    const n = await asService(db, () => q<{ expire_pending_orders: number }>("select public.expire_pending_orders('2 hours')"));
    expect(n.rows[0].expire_pending_orders).toBeGreaterThanOrEqual(1);
    expect((await orderRow(o.order_id)).status).toBe("cancelled");
    expect(await stock()).toBe(10);
  });
});

describe("customer access", () => {
  it("shows customers only their own orders and lines, and no writes", async () => {
    const mine = await place();
    const theirs = await place({ user: bob });
    const rows = await asUser(db, alice, () => q<{ id: string }>("select id from public.orders"));
    expect(rows.rows.map((r) => r.id)).toContain(mine.order_id);
    expect(rows.rows.map((r) => r.id)).not.toContain(theirs.order_id);
    expect((await asUser(db, alice, () => q("select 1 from public.order_lines where order_id=$1", [theirs.order_id]))).rows).toHaveLength(0);
    expect(await asUser(db, alice, () => failure(q("update public.orders set status='paid' where id=$1", [mine.order_id])))).not.toBeNull();
    expect(await asUser(db, alice, () => failure(q("insert into public.orders (user_id, idempotency_key, subtotal_minor, total_minor, customer_email, shipping_address) values ($1,'x1234567890',1,1,'a@b.co','{}')", [alice])))).not.toBeNull();
    expect(await asAnon(db, () => failure(q("select 1 from public.orders")))).not.toBeNull();
  });
  it("keeps carts and the email outbox away from clients", async () => {
    await q("insert into public.carts (token_hash) values ('h1')");
    expect(await asUser(db, alice, () => failure(q("select 1 from public.carts")))).not.toBeNull();
    await q("insert into public.email_outbox (dedupe_key, to_email, template, subject, body_text) values ('k','a@b.co','t','s','b')");
    expect((await asUser(db, alice, () => q("select 1 from public.email_outbox"))).rows).toHaveLength(0);
    expect((await asUser(db, curator, () => q("select 1 from public.email_outbox"))).rows).toHaveLength(1);
    expect(await q("insert into public.email_outbox (dedupe_key, to_email, template, subject, body_text) values ('k','a@b.co','t','s','b')").then(() => null, (e: Error) => e.message)).toMatch(/duplicate|unique/);
  });
  it("enforces that order totals add up at the table level", async () => {
    expect(await failure(q("insert into public.orders (user_id, idempotency_key, subtotal_minor, discount_minor, shipping_minor, total_minor, customer_email, shipping_address) values ($1,'bad-total-123',1000,0,0,999,'a@b.co','{}')", [alice]))).not.toBeNull();
    expect(await failure(q("insert into public.orders (user_id, idempotency_key, subtotal_minor, discount_minor, shipping_minor, total_minor, customer_email, shipping_address) values ($1,'bad-disc-1234',1000,2000,0,0,'a@b.co','{}')", [alice]))).not.toBeNull();
  });
});
