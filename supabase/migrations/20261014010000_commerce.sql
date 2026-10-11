-- Phase 4: direct commerce.
--
-- Principles
--   * Money is integer paise. Totals are computed by trusted server code and
--     RE-VERIFIED here: line prices are compared with the live price table,
--     sums must add up, discounts are bounded, stock is decremented atomically.
--   * Orders and order lines are immutable snapshots (title, price,
--     personalisation, address). Only status columns may change, and only along
--     an allowed path.
--   * Payment events are idempotent: (provider, provider_event_id) is unique.
--   * Carts, orders, payments and the outbox are never writable by clients.
--     Server code uses the service role through the SECURITY DEFINER functions
--     below; customers and staff only read (RLS).

-- Direct sales ship OFF. Checkout also needs shipping_flat_minor (private setting)
-- to be configured by an administrator; it is deliberately not seeded.
insert into public.site_settings (key, value, is_public) values ('direct_sales_enabled', 'false'::jsonb, true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Prices and inventory
-- ---------------------------------------------------------------------------

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.book_editions (id) on delete cascade,
  currency char(3) not null default 'INR' check (currency = 'INR'),
  list_price_minor integer not null check (list_price_minor > 0),
  sale_price_minor integer check (sale_price_minor is null or (sale_price_minor > 0 and sale_price_minor < list_price_minor)),
  -- Basis points included in the price (prices are tax-inclusive). The operator
  -- sets the correct rate; nothing is assumed.
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_prices_one_active_idx on public.product_prices (edition_id) where is_active;
create trigger product_prices_set_updated_at before update on public.product_prices
  for each row execute function public.set_updated_at();

-- NULL / missing row = not tracked (e.g. made to order). A row means tracked.
create table public.edition_inventory (
  edition_id uuid primary key references public.book_editions (id) on delete cascade,
  stock_on_hand integer not null check (stock_on_hand >= 0),
  updated_at timestamptz not null default now()
);

alter table public.product_prices enable row level security;
alter table public.edition_inventory enable row level security;
revoke all on public.product_prices, public.edition_inventory from anon, authenticated;
grant select on public.product_prices to anon, authenticated;
grant insert, update, delete on public.product_prices to authenticated;
grant select, insert, update, delete on public.edition_inventory to authenticated;

create policy "Active prices of published books are readable" on public.product_prices
  for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.book_editions e join public.books b on b.id = e.book_id
      where e.id = edition_id and b.status = 'published'
    )
  );
create policy "Staff manage prices" on public.product_prices for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff manage inventory" on public.edition_inventory for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 2. Discounts and coupons
-- ---------------------------------------------------------------------------

create type public.discount_kind as enum ('percent', 'fixed');

create table public.discount_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind public.discount_kind not null,
  -- percent: basis points (1000 = 10%); fixed: paise off the eligible subtotal
  value integer not null check (value > 0),
  min_subtotal_minor integer not null default 0 check (min_subtotal_minor >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  -- A stackable rule combines with the best automatic rule; otherwise the
  -- customer gets whichever of the two saves more, never both.
  stackable boolean not null default false,
  -- Coupon-only rules never apply automatically.
  requires_coupon boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_percent_bounds check (kind <> 'percent' or value <= 10000),
  constraint discount_window_order check (starts_at is null or ends_at is null or starts_at < ends_at)
);
create trigger discount_rules_set_updated_at before update on public.discount_rules
  for each row execute function public.set_updated_at();

-- No rows for a rule = applies to every book.
create table public.discount_rule_books (
  rule_id uuid not null references public.discount_rules (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  primary key (rule_id, book_id)
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  rule_id uuid not null references public.discount_rules (id) on delete cascade,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index coupons_code_idx on public.coupons (code);

-- ---------------------------------------------------------------------------
-- 3. Carts (token cookie; service role only)
-- ---------------------------------------------------------------------------

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  coupon_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cart_lines (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  edition_id uuid not null references public.book_editions (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 20),
  -- Template + values; re-validated at checkout, never trusted from here.
  personalisation jsonb check (personalisation is null or jsonb_typeof(personalisation) = 'object'),
  created_at timestamptz not null default now()
);
create index cart_lines_cart_idx on public.cart_lines (cart_id);

-- ---------------------------------------------------------------------------
-- 4. Orders
-- ---------------------------------------------------------------------------

create type public.order_status as enum
  ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'needs_review');
create type public.payment_status as enum
  ('unpaid', 'paid', 'failed', 'partially_refunded', 'refunded');

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('VS-' || nextval('public.order_number_seq')::text),
  user_id uuid not null references auth.users (id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'unpaid',
  currency char(3) not null default 'INR' check (currency = 'INR'),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  shipping_minor integer not null default 0 check (shipping_minor >= 0),
  total_minor integer not null check (total_minor >= 0),
  coupon_code text,
  customer_email text not null,
  shipping_address jsonb not null,
  placed_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint order_total_adds_up check (total_minor = subtotal_minor - discount_minor + shipping_minor),
  constraint order_discount_bounded check (discount_minor <= subtotal_minor)
);
create index orders_user_idx on public.orders (user_id, placed_at desc);
create index orders_status_idx on public.orders (status, placed_at desc);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  edition_id uuid references public.book_editions (id) on delete set null,
  book_id uuid references public.books (id) on delete set null,
  -- Snapshot: what the customer saw and agreed to at purchase time.
  title text not null,
  edition_label text not null,
  isbn13 text,
  quantity integer not null check (quantity between 1 and 20),
  list_price_minor integer not null check (list_price_minor > 0),
  unit_price_minor integer not null check (unit_price_minor > 0),
  personalisation_unit_minor integer not null default 0 check (personalisation_unit_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  line_total_minor integer not null check (line_total_minor >= 0),
  tax_rate_bps integer not null default 0,
  personalisation jsonb,
  constraint line_total_adds_up check (
    line_total_minor = (unit_price_minor + personalisation_unit_minor) * quantity - discount_minor
  ),
  constraint line_discount_bounded check (discount_minor <= (unit_price_minor + personalisation_unit_minor) * quantity)
);
create index order_lines_order_idx on public.order_lines (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.shipping_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  carrier text check (carrier is null or length(carrier) <= 80),
  tracking_number text check (tracking_number is null or length(tracking_number) <= 80),
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  note text check (note is null or length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Payments and provider events -----------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null check (provider in ('razorpay')),
  provider_order_id text,
  provider_payment_id text,
  status text not null default 'created' check (status in ('created', 'captured', 'failed')),
  amount_minor integer not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_order_idx on public.payments (provider, provider_order_id) where provider_order_id is not null;
create unique index payments_provider_payment_idx on public.payments (provider, provider_payment_id) where provider_payment_id is not null;

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  order_id uuid references public.orders (id) on delete restrict,
  outcome text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  reason text not null check (length(trim(reason)) between 3 and 500),
  status text not null default 'requested' check (status in ('requested', 'processed', 'failed')),
  provider_refund_id text,
  reference text,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index refunds_provider_refund_idx on public.refunds (provider_refund_id) where provider_refund_id is not null;

-- Email outbox ------------------------------------------------------------------

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  to_email text not null,
  template text not null,
  subject text not null,
  body_text text not null,
  body_html text,
  -- skipped = provider not configured when queued; it is NEVER reported as sent.
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_status_idx on public.email_outbox (status, created_at);

-- ---------------------------------------------------------------------------
-- 5. Guards: immutability and status transitions
-- ---------------------------------------------------------------------------

create function public.order_transition_allowed(p_old public.order_status, p_new public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select p_old = p_new or (p_old, p_new) in (
    ('pending_payment', 'paid'), ('pending_payment', 'cancelled'), ('pending_payment', 'needs_review'),
    ('paid', 'processing'), ('paid', 'cancelled'), ('paid', 'needs_review'),
    ('processing', 'shipped'), ('processing', 'cancelled'),
    ('shipped', 'delivered'),
    ('needs_review', 'paid'), ('needs_review', 'cancelled')
  )
$$;

create function public.guard_order_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  mutable_cols constant text[] := array['status', 'payment_status', 'paid_at', 'updated_at'];
begin
  if (to_jsonb(new) - mutable_cols) is distinct from (to_jsonb(old) - mutable_cols) then
    raise exception 'Order snapshot fields are immutable' using errcode = '42501';
  end if;
  if not public.order_transition_allowed(old.status, new.status) then
    raise exception 'Order status change % -> % is not allowed', old.status, new.status using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger orders_guard_update before update on public.orders
  for each row execute function public.guard_order_update();

create function public.forbid_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows cannot be changed or deleted', tg_table_name using errcode = '42501';
end;
$$;
create trigger order_lines_immutable before update or delete on public.order_lines
  for each row execute function public.forbid_change();
create trigger order_history_immutable before update or delete on public.order_status_history
  for each row execute function public.forbid_change();
create trigger orders_no_delete before delete on public.orders
  for each row execute function public.forbid_change();
create trigger payment_events_immutable before update or delete on public.payment_events
  for each row execute function public.forbid_change();

-- Return stock (and free the coupon use) when an unshipped order is cancelled.
create function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if old.payment_status = 'unpaid' then
      delete from public.coupon_redemptions where order_id = new.id;
    end if;
    update public.edition_inventory i
      set stock_on_hand = i.stock_on_hand + l.qty, updated_at = now()
      from (select edition_id, sum(quantity)::integer as qty from public.order_lines
            where order_id = new.id and edition_id is not null group by edition_id) l
      where i.edition_id = l.edition_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.restore_stock_on_cancel() from public, anon, authenticated;
create trigger orders_restore_stock after update on public.orders
  for each row execute function public.restore_stock_on_cancel();

-- ---------------------------------------------------------------------------
-- 6. RLS: read-only for customers and staff
-- ---------------------------------------------------------------------------

alter table public.carts enable row level security;
alter table public.cart_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_status_history enable row level security;
alter table public.shipping_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.email_outbox enable row level security;
alter table public.discount_rules enable row level security;
alter table public.discount_rule_books enable row level security;
alter table public.coupons enable row level security;

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  discount_minor integer not null check (discount_minor >= 0),
  created_at timestamptz not null default now(),
  unique (order_id)
);
alter table public.coupon_redemptions enable row level security;

-- Record status changes (with an optional note passed through a local setting).
create function public.record_order_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, auth.uid(), nullif(current_setting('app.order_note', true), ''));
  end if;
  return new;
end;
$$;
revoke execute on function public.record_order_status_change() from public, anon, authenticated;
create trigger orders_record_status after update on public.orders
  for each row execute function public.record_order_status_change();

-- ---------------------------------------------------------------------------
-- 7. Read access (customers: own; staff: all). No client writes anywhere.
-- ---------------------------------------------------------------------------

revoke all on
  public.carts, public.cart_lines, public.orders, public.order_lines, public.order_status_history,
  public.shipping_events, public.payments, public.payment_events, public.refunds, public.email_outbox,
  public.discount_rules, public.discount_rule_books, public.coupons, public.coupon_redemptions
from anon, authenticated;

grant select on
  public.orders, public.order_lines, public.order_status_history, public.shipping_events, public.refunds,
  public.payments, public.payment_events, public.email_outbox, public.coupon_redemptions
to authenticated;
grant select, insert, update, delete on
  public.discount_rules, public.discount_rule_books, public.coupons
to authenticated;

create policy "Own orders" on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "Own order lines" on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "Own order history" on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "Own shipping events" on public.shipping_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "Own refunds" on public.refunds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "Staff read payments" on public.payments for select to authenticated using (public.is_staff());
create policy "Staff read payment events" on public.payment_events for select to authenticated using (public.is_staff());
create policy "Staff read outbox" on public.email_outbox for select to authenticated using (public.is_staff());
create policy "Staff read redemptions" on public.coupon_redemptions for select to authenticated using (public.is_staff());

create policy "Staff read discount rules" on public.discount_rules for select to authenticated using (public.is_staff());
create policy "Admins write discount rules" on public.discount_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Staff read rule books" on public.discount_rule_books for select to authenticated using (public.is_staff());
create policy "Admins write rule books" on public.discount_rule_books for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Staff read coupons" on public.coupons for select to authenticated using (public.is_staff());
create policy "Admins write coupons" on public.coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- carts / cart_lines: RLS on, no policy, no grant => service role only.

-- ---------------------------------------------------------------------------
-- 8. Order creation (service role only)
-- ---------------------------------------------------------------------------

create function public.setting_json(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.site_settings where key = p_key
$$;

create function public.create_order(
  p_user_id uuid,
  p_idempotency_key text,
  p_email text,
  p_address jsonb,
  p_coupon_code text,
  p_shipping_minor integer,
  p_lines jsonb
) returns table (order_id uuid, order_number text, total_minor integer, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  existing public.orders;
  line jsonb;
  norm jsonb := '[]'::jsonb;
  ed public.book_editions;
  bk public.books;
  price public.product_prices;
  inv public.edition_inventory;
  tmpl public.personalisation_templates;
  coupon public.coupons;
  rule public.discount_rules;
  qty integer;
  unit integer;
  listp integer;
  pers integer;
  ldisc integer;
  gross integer;
  sub integer := 0;
  disc integer := 0;
  flat integer;
  free_over integer;
  expected_ship integer;
  new_id uuid := gen_random_uuid();
  new_number text;
  new_total integer;
  item jsonb;
begin
  if not public.setting_enabled('direct_sales_enabled') then
    raise exception 'Direct sales are not enabled';
  end if;

  select * into existing from public.orders o where o.user_id = p_user_id and o.idempotency_key = p_idempotency_key;
  if found then
    return query select existing.id, existing.order_number, existing.total_minor, false;
    return;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'An order needs between 1 and 50 lines';
  end if;
  if p_address is null or jsonb_typeof(p_address) <> 'object'
     or coalesce(p_address ->> 'recipient_name', '') = '' or coalesce(p_address ->> 'line1', '') = ''
     or (p_address ->> 'postal_code') !~ '^[1-9][0-9]{5}$' then
    raise exception 'A complete Indian delivery address is required';
  end if;

  for line in select * from jsonb_array_elements(p_lines) loop
    qty := (line ->> 'quantity')::integer;
    if qty is null or qty not between 1 and 20 then raise exception 'Invalid quantity'; end if;

    select * into ed from public.book_editions where id = (line ->> 'edition_id')::uuid;
    if not found then raise exception 'Unknown edition'; end if;
    select * into bk from public.books where id = ed.book_id;
    if bk.status <> 'published' or ed.availability <> 'available' then
      raise exception 'An item is no longer available';
    end if;

    select * into price from public.product_prices where edition_id = ed.id and is_active;
    if not found then raise exception 'An item has no active price'; end if;
    unit := coalesce(price.sale_price_minor, price.list_price_minor);
    listp := price.list_price_minor;
    if (line ->> 'unit_price_minor')::integer is distinct from unit
       or (line ->> 'list_price_minor')::integer is distinct from listp then
      raise exception 'Prices changed. Please review your cart.';
    end if;

    pers := 0;
    if line -> 'personalisation' is not null and jsonb_typeof(line -> 'personalisation') = 'object' then
      select * into tmpl from public.personalisation_templates
        where id = (line -> 'personalisation' ->> 'template_id')::uuid and is_active;
      if not found or not exists (
        select 1 from public.book_personalisation bp where bp.book_id = bk.id and bp.template_id = tmpl.id and bp.is_enabled
      ) then
        raise exception 'Personalisation is not available for this book';
      end if;
      pers := tmpl.price_adjustment_minor;
      if (line -> 'personalisation' ->> 'price_adjustment_minor')::integer is distinct from pers then
        raise exception 'Personalisation price changed. Please review your cart.';
      end if;
    end if;
    if coalesce((line ->> 'personalisation_unit_minor')::integer, 0) <> pers then
      raise exception 'Personalisation price mismatch';
    end if;

    gross := (unit + pers) * qty;
    ldisc := coalesce((line ->> 'discount_minor')::integer, 0);
    if ldisc < 0 or ldisc > gross then raise exception 'Invalid line discount'; end if;

    select * into inv from public.edition_inventory where edition_id = ed.id for update;
    if found then
      if inv.stock_on_hand < qty then raise exception 'Not enough stock for %', bk.title; end if;
      update public.edition_inventory set stock_on_hand = stock_on_hand - qty, updated_at = now() where edition_id = ed.id;
    end if;

    sub := sub + gross;
    disc := disc + ldisc;
    norm := norm || jsonb_build_object(
      'edition_id', ed.id, 'book_id', bk.id, 'title', bk.title,
      'edition_label', initcap(replace(ed.format::text, '_', ' ')) || ' (' || upper(ed.language) || ')',
      'isbn13', ed.isbn13, 'quantity', qty, 'list', listp, 'unit', unit, 'pers', pers,
      'discount', ldisc, 'total', gross - ldisc, 'tax_bps', price.tax_rate_bps,
      'personalisation', line -> 'personalisation'
    );
  end loop;

  -- Discounts must be explainable: either a valid coupon or an active automatic rule.
  if p_coupon_code is not null and length(p_coupon_code) > 0 then
    select * into coupon from public.coupons where code = upper(p_coupon_code);
    if not found or not coupon.is_active or (coupon.expires_at is not null and coupon.expires_at < now()) then
      raise exception 'This coupon is not valid';
    end if;
    select * into rule from public.discount_rules where id = coupon.rule_id;
    if not rule.is_active or (rule.starts_at is not null and rule.starts_at > now())
       or (rule.ends_at is not null and rule.ends_at < now()) or sub < rule.min_subtotal_minor then
      raise exception 'This coupon is not valid for this order';
    end if;
    if coupon.max_redemptions is not null
       and (select count(*) from public.coupon_redemptions r where r.coupon_id = coupon.id) >= coupon.max_redemptions then
      raise exception 'This coupon has been fully redeemed';
    end if;
    if (select count(*) from public.coupon_redemptions r where r.coupon_id = coupon.id and r.user_id = p_user_id) >= coupon.per_user_limit then
      raise exception 'You have already used this coupon';
    end if;
  elsif disc > 0 and not exists (
    select 1 from public.discount_rules d
    where d.is_active and not d.requires_coupon
      and (d.starts_at is null or d.starts_at <= now()) and (d.ends_at is null or d.ends_at >= now())
  ) then
    raise exception 'A discount was supplied but none is active';
  end if;
  if disc > sub then raise exception 'Discount exceeds subtotal'; end if;

  -- Shipping is recomputed from settings; the caller's figure must match.
  begin
    flat := (public.setting_json('shipping_flat_minor') #>> '{}')::integer;
  exception when others then flat := null;
  end;
  if flat is null then raise exception 'Shipping is not configured'; end if;
  begin
    free_over := (public.setting_json('shipping_free_over_minor') #>> '{}')::integer;
  exception when others then free_over := null;
  end;
  expected_ship := case when free_over is not null and (sub - disc) >= free_over then 0 else flat end;
  if p_shipping_minor is distinct from expected_ship then
    raise exception 'Shipping charge mismatch';
  end if;

  new_total := sub - disc + expected_ship;
  if new_total <= 0 then raise exception 'Order total must be positive'; end if;

  insert into public.orders (id, user_id, idempotency_key, subtotal_minor, discount_minor, shipping_minor,
                             total_minor, coupon_code, customer_email, shipping_address)
  values (new_id, p_user_id, p_idempotency_key, sub, disc, expected_ship, new_total,
          case when coupon.id is not null then coupon.code end, p_email, p_address)
  returning orders.order_number into new_number;

  for item in select * from jsonb_array_elements(norm) loop
    insert into public.order_lines (order_id, edition_id, book_id, title, edition_label, isbn13, quantity,
      list_price_minor, unit_price_minor, personalisation_unit_minor, discount_minor, line_total_minor,
      tax_rate_bps, personalisation)
    values (new_id, (item ->> 'edition_id')::uuid, (item ->> 'book_id')::uuid, item ->> 'title',
      item ->> 'edition_label', item ->> 'isbn13', (item ->> 'quantity')::integer,
      (item ->> 'list')::integer, (item ->> 'unit')::integer, (item ->> 'pers')::integer,
      (item ->> 'discount')::integer, (item ->> 'total')::integer, (item ->> 'tax_bps')::integer,
      case when jsonb_typeof(item -> 'personalisation') = 'object' then item -> 'personalisation' end);
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
  values (new_id, null, 'pending_payment', p_user_id, 'Order placed');

  if coupon.id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, discount_minor)
    values (coupon.id, new_id, p_user_id, disc);
  end if;

  return query select new_id, new_number, new_total, true;
end;
$$;
revoke execute on function public.create_order(uuid, text, text, jsonb, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, jsonb, text, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Payments (service role only; idempotent)
-- ---------------------------------------------------------------------------

create function public.attach_provider_order(p_order_id uuid, p_provider text, p_provider_order_id text, p_amount_minor integer)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.status <> 'pending_payment' then raise exception 'Order cannot take a payment'; end if;
  if o.total_minor <> p_amount_minor then raise exception 'Provider amount does not match order total'; end if;
  insert into public.payments (order_id, provider, provider_order_id, amount_minor)
  values (p_order_id, p_provider, p_provider_order_id, p_amount_minor)
  on conflict do nothing;
end;
$$;
revoke execute on function public.attach_provider_order(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.attach_provider_order(uuid, text, text, integer) to service_role;

create function public.recompute_payment_status(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; refunded integer;
begin
  select * into o from public.orders where id = p_order_id;
  select coalesce(sum(amount_minor), 0) into refunded from public.refunds where order_id = p_order_id and status = 'processed';
  if o.payment_status in ('paid', 'partially_refunded', 'refunded') then
    update public.orders set payment_status = case
      when refunded >= o.total_minor then 'refunded'::public.payment_status
      when refunded > 0 then 'partially_refunded'::public.payment_status
      else 'paid'::public.payment_status end
    where id = p_order_id;
  end if;
end;
$$;
revoke execute on function public.recompute_payment_status(uuid) from public, anon, authenticated;

create function public.apply_payment_captured(
  p_provider text, p_event_id text, p_event_type text, p_provider_order_id text,
  p_provider_payment_id text, p_amount_minor integer, p_payload jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  o public.orders;
  outcome text;
begin
  perform pg_advisory_xact_lock(hashtext(p_provider || ':' || p_event_id));
  if exists (select 1 from public.payment_events where provider = p_provider and provider_event_id = p_event_id) then
    return 'duplicate';
  end if;

  select * into pay from public.payments where provider = p_provider and provider_order_id = p_provider_order_id;
  if not found then
    insert into public.payment_events (provider, provider_event_id, event_type, outcome, payload)
    values (p_provider, p_event_id, p_event_type, 'order_not_found', p_payload);
    return 'order_not_found';
  end if;
  select * into o from public.orders where id = pay.order_id for update;

  if pay.status = 'captured' and pay.provider_payment_id is distinct from p_provider_payment_id then
    outcome := 'duplicate_payment';       -- a second, different payment for one order: needs a refund
  elsif o.status in ('pending_payment', 'needs_review') then
    update public.payments set status = 'captured', provider_payment_id = p_provider_payment_id, updated_at = now() where id = pay.id;
    if p_amount_minor = o.total_minor and pay.amount_minor = o.total_minor then
      perform set_config('app.order_note', 'Payment captured', true);
      update public.orders set status = 'paid', payment_status = 'paid', paid_at = now() where id = o.id;
      outcome := 'applied';
    else
      perform set_config('app.order_note', 'Payment amount does not match order total', true);
      update public.orders set status = 'needs_review' where id = o.id and status = 'pending_payment';
      outcome := 'amount_mismatch';
    end if;
  elsif o.status = 'cancelled' then
    update public.payments set status = 'captured', provider_payment_id = p_provider_payment_id, updated_at = now() where id = pay.id;
    outcome := 'order_cancelled';         -- money taken for a cancelled order: needs a refund
  else
    outcome := 'already_paid';
  end if;

  insert into public.payment_events (provider, provider_event_id, event_type, order_id, outcome, payload)
  values (p_provider, p_event_id, p_event_type, o.id, outcome, p_payload);
  return outcome;
end;
$$;
revoke execute on function public.apply_payment_captured(text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.apply_payment_captured(text, text, text, text, text, integer, jsonb) to service_role;

create function public.apply_payment_failed(
  p_provider text, p_event_id text, p_event_type text, p_provider_order_id text, p_payload jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare pay public.payments;
begin
  perform pg_advisory_xact_lock(hashtext(p_provider || ':' || p_event_id));
  if exists (select 1 from public.payment_events where provider = p_provider and provider_event_id = p_event_id) then
    return 'duplicate';
  end if;
  select * into pay from public.payments where provider = p_provider and provider_order_id = p_provider_order_id;
  if found and pay.status = 'created' then
    update public.orders set payment_status = 'failed' where id = pay.order_id and payment_status = 'unpaid' and status = 'pending_payment';
  end if;
  insert into public.payment_events (provider, provider_event_id, event_type, order_id, outcome, payload)
  values (p_provider, p_event_id, p_event_type, pay.order_id, case when found then 'recorded' else 'order_not_found' end, p_payload);
  return case when found then 'recorded' else 'order_not_found' end;
end;
$$;
revoke execute on function public.apply_payment_failed(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_payment_failed(text, text, text, text, jsonb) to service_role;

create function public.apply_refund_processed(
  p_provider text, p_event_id text, p_event_type text, p_provider_payment_id text,
  p_provider_refund_id text, p_amount_minor integer, p_payload jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare pay public.payments; ref public.refunds; outcome text;
begin
  perform pg_advisory_xact_lock(hashtext(p_provider || ':' || p_event_id));
  if exists (select 1 from public.payment_events where provider = p_provider and provider_event_id = p_event_id) then
    return 'duplicate';
  end if;
  select * into pay from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if not found then
    insert into public.payment_events (provider, provider_event_id, event_type, outcome, payload)
    values (p_provider, p_event_id, p_event_type, 'order_not_found', p_payload);
    return 'order_not_found';
  end if;

  select * into ref from public.refunds where provider_refund_id = p_provider_refund_id;
  if found then
    update public.refunds set status = 'processed', processed_at = now() where id = ref.id;
  else
    -- A refund created directly in the provider dashboard: record it.
    insert into public.refunds (order_id, amount_minor, reason, status, provider_refund_id, processed_at)
    values (pay.order_id, p_amount_minor, 'Refund recorded from payment provider', 'processed', p_provider_refund_id, now());
  end if;
  perform public.recompute_payment_status(pay.order_id);
  outcome := 'applied';
  insert into public.payment_events (provider, provider_event_id, event_type, order_id, outcome, payload)
  values (p_provider, p_event_id, p_event_type, pay.order_id, outcome, p_payload);
  return outcome;
end;
$$;
revoke execute on function public.apply_refund_processed(text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.apply_refund_processed(text, text, text, text, text, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Staff and customer order operations
-- ---------------------------------------------------------------------------

create function public.request_refund(p_order_id uuid, p_amount_minor integer, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders; committed integer; new_id uuid;
begin
  if not public.is_staff() then raise exception 'Only staff may request refunds' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'Only paid orders can be refunded';
  end if;
  select coalesce(sum(amount_minor), 0) into committed from public.refunds where order_id = p_order_id and status in ('requested', 'processed');
  if p_amount_minor <= 0 or p_amount_minor > o.total_minor - committed then
    raise exception 'Refund exceeds the refundable balance';
  end if;
  insert into public.refunds (order_id, amount_minor, reason, requested_by)
  values (p_order_id, p_amount_minor, p_reason, auth.uid()) returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.request_refund(uuid, integer, text) from public, anon;
grant execute on function public.request_refund(uuid, integer, text) to authenticated;

-- For refunds paid outside the gateway (e.g. bank transfer); admin only.
create function public.mark_refund_processed(p_refund_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.refunds;
begin
  if not public.is_admin() then raise exception 'Only administrators may confirm refunds' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reference, ''))) = 0 then raise exception 'A payment reference is required'; end if;
  select * into r from public.refunds where id = p_refund_id for update;
  if not found or r.status <> 'requested' then raise exception 'Refund is not awaiting processing'; end if;
  update public.refunds set status = 'processed', reference = p_reference, processed_at = now() where id = p_refund_id;
  perform public.recompute_payment_status(r.order_id);
end;
$$;
revoke execute on function public.mark_refund_processed(uuid, text) from public, anon;
grant execute on function public.mark_refund_processed(uuid, text) to authenticated;

create function public.admin_set_order_status(
  p_order_id uuid, p_status public.order_status, p_note text default null,
  p_carrier text default null, p_tracking text default null, p_tracking_url text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'Only staff may change order status' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_status in ('processing', 'shipped', 'delivered') and o.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'Order is not paid';
  end if;
  perform set_config('app.order_note', coalesce(p_note, ''), true);
  update public.orders set status = p_status where id = p_order_id;
  if p_status = 'shipped' then
    insert into public.shipping_events (order_id, carrier, tracking_number, tracking_url, note, created_by)
    values (p_order_id, p_carrier, p_tracking, p_tracking_url, p_note, auth.uid());
  end if;
end;
$$;
revoke execute on function public.admin_set_order_status(uuid, public.order_status, text, text, text, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, public.order_status, text, text, text, text) to authenticated;

create function public.cancel_pending_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.user_id is distinct from auth.uid() then raise exception 'Order not found'; end if;
  if o.status <> 'pending_payment' or exists (select 1 from public.payments where order_id = o.id and status = 'captured') then
    raise exception 'Only unpaid orders can be cancelled here';
  end if;
  perform set_config('app.order_note', 'Cancelled by customer', true);
  update public.orders set status = 'cancelled' where id = p_order_id;
end;
$$;
revoke execute on function public.cancel_pending_order(uuid) from public, anon;
grant execute on function public.cancel_pending_order(uuid) to authenticated;

create function public.expire_pending_orders(p_older_than interval default interval '2 hours')
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; o record;
begin
  perform set_config('app.order_note', 'Expired: payment not completed', true);
  for o in
    select id from public.orders ord
    where ord.status = 'pending_payment' and ord.placed_at < now() - p_older_than
      and not exists (select 1 from public.payments p where p.order_id = ord.id and p.status = 'captured')
    for update skip locked
  loop
    update public.orders set status = 'cancelled' where id = o.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.expire_pending_orders(interval) from public, anon, authenticated;
grant execute on function public.expire_pending_orders(interval) to service_role;
