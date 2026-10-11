-- Phase 5: external-purchase click tracking and institutional / bulk sales.
--
-- Privacy: clicks store no IP address, user agent, account or cookie — only
-- which edition/channel was clicked and when. Bulk enquiries contain contact
-- details, so they are readable by administrators (and the enquirer's own
-- account when signed in) only.

-- ---------------------------------------------------------------------------
-- 1. Affiliate click redirect
-- ---------------------------------------------------------------------------

create table public.purchase_clicks (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.book_editions (id) on delete cascade,
  channel public.purchase_channel not null,
  source text check (source is null or source ~ '^[a-z0-9_-]{1,40}$'),
  clicked_at timestamptz not null default now()
);
create index purchase_clicks_edition_idx on public.purchase_clicks (edition_id, clicked_at desc);
create index purchase_clicks_time_idx on public.purchase_clicks (clicked_at desc);

alter table public.purchase_clicks enable row level security;
revoke all on public.purchase_clicks from anon, authenticated;
grant select on public.purchase_clicks to authenticated;
create policy "Staff read clicks" on public.purchase_clicks for select to authenticated using (public.is_staff());

-- Looks up the approved destination for an enabled external channel of a
-- published book, records the click, and returns the URL. Returns null (and
-- records nothing) when there is no such live link, so the route cannot be
-- used to redirect anywhere else.
create function public.record_purchase_click(p_edition_id uuid, p_channel text, p_source text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare ch public.edition_purchase_channels;
begin
  if p_channel not in ('amazon', 'flipkart') then return null; end if;
  select c.* into ch
  from public.edition_purchase_channels c
  join public.book_editions e on e.id = c.edition_id
  join public.books b on b.id = e.book_id
  where c.edition_id = p_edition_id and c.channel = p_channel::public.purchase_channel
    and c.is_enabled and c.destination_url is not null and b.status = 'published'
  order by c.region = 'IN' desc
  limit 1;
  if not found then return null; end if;
  insert into public.purchase_clicks (edition_id, channel, source)
  values (p_edition_id, ch.channel, case when p_source ~ '^[a-z0-9_-]{1,40}$' then p_source else null end);
  return ch.destination_url;
end;
$$;
revoke execute on function public.record_purchase_click(uuid, text, text) from public;
grant execute on function public.record_purchase_click(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bulk / institutional enquiries
-- ---------------------------------------------------------------------------

create type public.organisation_type as enum ('school', 'library', 'ngo', 'corporate', 'bookseller', 'individual', 'other');
create type public.enquiry_status as enum ('new', 'in_progress', 'quoted', 'accepted', 'declined', 'closed');

create sequence public.bulk_enquiry_seq start 1001;
create sequence public.quotation_seq start 1001;

create table public.bulk_enquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BE-' || nextval('public.bulk_enquiry_seq')::text),
  user_id uuid references auth.users (id) on delete set null,
  organisation_name text not null check (length(trim(organisation_name)) between 2 and 160),
  organisation_type public.organisation_type not null,
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  email text not null check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9+][0-9 ]{7,14}$'),
  city text check (city is null or length(city) <= 100),
  state text check (state is null or length(state) <= 100),
  expected_quantity integer check (expected_quantity is null or expected_quantity between 1 and 1000000),
  needed_by date,
  message text not null check (length(trim(message)) between 10 and 4000),
  status public.enquiry_status not null default 'new',
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bulk_enquiries_status_idx on public.bulk_enquiries (status, created_at desc);
create index bulk_enquiries_user_idx on public.bulk_enquiries (user_id);
create trigger bulk_enquiries_set_updated_at before update on public.bulk_enquiries
  for each row execute function public.set_updated_at();

create table public.bulk_enquiry_items (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.bulk_enquiries (id) on delete cascade,
  book_id uuid references public.books (id) on delete set null,
  title_text text check (title_text is null or length(title_text) <= 200),
  quantity integer not null check (quantity between 1 and 1000000),
  check (book_id is not null or title_text is not null)
);
create index bulk_enquiry_items_enquiry_idx on public.bulk_enquiry_items (enquiry_id);

create table public.bulk_enquiry_notes (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.bulk_enquiries (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- Optional guidance for staff and (if published) visitors. No rows ship by
-- default: no institutional discount exists until the business defines one.
create table public.bulk_price_tiers (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) > 0),
  min_quantity integer not null check (min_quantity > 1),
  discount_bps integer not null check (discount_bps between 1 and 10000),
  is_public boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index bulk_price_tiers_qty_idx on public.bulk_price_tiers (min_quantity) where is_active;

-- ---------------------------------------------------------------------------
-- 3. Quotations
-- ---------------------------------------------------------------------------

create type public.quotation_status as enum ('draft', 'issued', 'accepted', 'declined', 'expired');

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('QT-' || nextval('public.quotation_seq')::text),
  enquiry_id uuid not null references public.bulk_enquiries (id) on delete restrict,
  status public.quotation_status not null default 'draft',
  valid_until date,
  shipping_minor integer not null default 0 check (shipping_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  terms text check (terms is null or length(terms) <= 4000),
  subtotal_minor integer not null default 0 check (subtotal_minor >= 0),
  total_minor integer not null default 0 check (total_minor >= 0),
  created_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotation_discount_bounded check (discount_minor <= subtotal_minor),
  constraint quotation_total_adds_up check (total_minor = subtotal_minor - discount_minor + shipping_minor)
);
create index quotations_enquiry_idx on public.quotations (enquiry_id);
create trigger quotations_set_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  edition_id uuid references public.book_editions (id) on delete set null,
  description text not null check (length(trim(description)) between 1 and 300),
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  line_total_minor integer not null check (line_total_minor = quantity * unit_price_minor)
);
create index quotation_lines_quotation_idx on public.quotation_lines (quotation_id);

-- Keep quotation totals derived from lines: staff cannot set a total that
-- disagrees with the lines. Lines and totals freeze once issued.
create function public.refresh_quotation_totals(p_quotation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s integer;
begin
  select coalesce(sum(line_total_minor), 0) into s from public.quotation_lines where quotation_id = p_quotation_id;
  update public.quotations
     set subtotal_minor = s,
         discount_minor = least(discount_minor, s)
   where id = p_quotation_id;
end;
$$;
revoke execute on function public.refresh_quotation_totals(uuid) from public, anon, authenticated;

create function public.quotation_lines_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q uuid; st public.quotation_status;
begin
  q := coalesce(new.quotation_id, old.quotation_id);
  select status into st from public.quotations where id = q;
  if st <> 'draft' then raise exception 'Issued quotations cannot be changed'; end if;
  perform public.refresh_quotation_totals(q);
  return null;
end;
$$;
create trigger quotation_lines_after after insert or update or delete on public.quotation_lines
  for each row execute function public.quotation_lines_changed();

-- The total is always computed, never supplied.
create function public.quotations_compute_total()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.total_minor := new.subtotal_minor - new.discount_minor + new.shipping_minor;
  return new;
end;
$$;
create trigger quotations_compute before insert or update on public.quotations
  for each row execute function public.quotations_compute_total();

create function public.guard_quotation_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (
       new.shipping_minor is distinct from old.shipping_minor or new.discount_minor is distinct from old.discount_minor
    or new.subtotal_minor is distinct from old.subtotal_minor or new.total_minor is distinct from old.total_minor
    or new.terms is distinct from old.terms or new.valid_until is distinct from old.valid_until
    or new.enquiry_id is distinct from old.enquiry_id) then
    raise exception 'Issued quotations cannot be changed';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status = 'issued')
    or (old.status = 'issued' and new.status in ('accepted', 'declined', 'expired'))) then
    raise exception 'Quotation status change not allowed';
  end if;
  if new.status = 'issued' and old.status = 'draft' then
    if new.valid_until is null or new.valid_until <= current_date then raise exception 'A future validity date is required'; end if;
    if not exists (select 1 from public.quotation_lines where quotation_id = old.id) then raise exception 'Add at least one line before issuing'; end if;
    new.issued_at := now();
  end if;
  return new;
end;
$$;
create trigger quotations_guard before update on public.quotations
  for each row execute function public.guard_quotation_update();

-- ---------------------------------------------------------------------------
-- 4. Access: administrators only (contact details and commercial terms)
-- ---------------------------------------------------------------------------

alter table public.bulk_enquiries enable row level security;
alter table public.bulk_enquiry_items enable row level security;
alter table public.bulk_enquiry_notes enable row level security;
alter table public.bulk_price_tiers enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_lines enable row level security;
revoke all on public.bulk_enquiries, public.bulk_enquiry_items, public.bulk_enquiry_notes,
  public.bulk_price_tiers, public.quotations, public.quotation_lines from anon, authenticated;

grant select on public.bulk_enquiries, public.bulk_enquiry_items, public.quotations, public.quotation_lines to authenticated;
grant update (status, assigned_to) on public.bulk_enquiries to authenticated;
grant select, insert on public.bulk_enquiry_notes to authenticated;
grant select on public.bulk_price_tiers to anon, authenticated;
grant insert, update, delete on public.bulk_price_tiers to authenticated;
grant insert, delete on public.quotation_lines to authenticated;
grant update on public.quotation_lines to authenticated;
grant insert on public.quotations to authenticated;
grant update (status, valid_until, shipping_minor, discount_minor, terms) on public.quotations to authenticated;

create policy "Admins and owners read enquiries" on public.bulk_enquiries for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
create policy "Admins update enquiries" on public.bulk_enquiries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins and owners read enquiry items" on public.bulk_enquiry_items for select to authenticated
  using (exists (select 1 from public.bulk_enquiries e where e.id = enquiry_id and (public.is_admin() or e.user_id = auth.uid())));
create policy "Admins read notes" on public.bulk_enquiry_notes for select to authenticated using (public.is_admin());
create policy "Admins add notes" on public.bulk_enquiry_notes for insert to authenticated
  with check (public.is_admin() and author_id = auth.uid());
create policy "Public tiers are readable" on public.bulk_price_tiers for select to anon, authenticated
  using (is_public and is_active);
create policy "Admins read all tiers" on public.bulk_price_tiers for select to authenticated using (public.is_admin());
create policy "Admins write tiers" on public.bulk_price_tiers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins and owners read quotations" on public.quotations for select to authenticated
  using (public.is_admin() or (status <> 'draft' and exists (select 1 from public.bulk_enquiries e where e.id = enquiry_id and e.user_id = auth.uid())));
create policy "Admins create quotations" on public.quotations for insert to authenticated
  with check (public.is_admin() and status = 'draft' and created_by = auth.uid());
create policy "Admins update quotations" on public.quotations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins and owners read quotation lines" on public.quotation_lines for select to authenticated
  using (exists (select 1 from public.quotations q join public.bulk_enquiries e on e.id = q.enquiry_id
                 where q.id = quotation_id and (public.is_admin() or (q.status <> 'draft' and e.user_id = auth.uid()))));
create policy "Admins write quotation lines" on public.quotation_lines for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Intake is performed by a server action using the service role (after rate
-- limiting); this function validates shape and writes both tables atomically.
create function public.submit_bulk_enquiry(
  p_user_id uuid, p_organisation text, p_type public.organisation_type, p_contact text, p_email text,
  p_phone text, p_city text, p_state text, p_quantity integer, p_needed_by date, p_message text, p_items jsonb
) returns table (enquiry_id uuid, reference text) language plpgsql security definer set search_path = '' as $$
declare e public.bulk_enquiries; item jsonb; n integer := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 50 then
    raise exception 'Too many items';
  end if;
  insert into public.bulk_enquiries (user_id, organisation_name, organisation_type, contact_name, email, phone, city, state, expected_quantity, needed_by, message)
  values (p_user_id, p_organisation, p_type, p_contact, p_email, nullif(p_phone, ''), nullif(p_city, ''), nullif(p_state, ''), p_quantity, p_needed_by, p_message)
  returning * into e;
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.bulk_enquiry_items (enquiry_id, book_id, title_text, quantity)
    values (e.id,
            (select b.id from public.books b where b.id = nullif(item ->> 'book_id', '')::uuid and b.status = 'published'),
            nullif(left(item ->> 'title', 200), ''),
            (item ->> 'quantity')::integer);
    n := n + 1;
  end loop;
  return query select e.id, e.reference;
end;
$$;
revoke execute on function public.submit_bulk_enquiry(uuid, text, public.organisation_type, text, text, text, text, text, integer, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_bulk_enquiry(uuid, text, public.organisation_type, text, text, text, text, text, integer, date, text, jsonb) to service_role;

-- References are assigned by column default, which runs as the inserting role.
grant usage on sequence public.quotation_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Staff analytics (aggregates only; no personal data)
-- ---------------------------------------------------------------------------

create function public.analytics_clicks(p_days integer default 30)
returns table (edition_id uuid, book_title text, channel text, clicks bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Only staff may view analytics' using errcode = '42501'; end if;
  return query
    select c.edition_id, b.title, c.channel::text, count(*)
    from public.purchase_clicks c
    join public.book_editions e on e.id = c.edition_id
    join public.books b on b.id = e.book_id
    where c.clicked_at >= now() - make_interval(days => greatest(1, least(p_days, 366)))
    group by c.edition_id, b.title, c.channel
    order by count(*) desc
    limit 100;
end;
$$;
revoke execute on function public.analytics_clicks(integer) from public, anon;
grant execute on function public.analytics_clicks(integer) to authenticated;

create function public.analytics_orders(p_days integer default 30)
returns table (status text, orders bigint, revenue_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Only staff may view analytics' using errcode = '42501'; end if;
  return query
    select o.status::text, count(*), coalesce(sum(o.total_minor) filter (where o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0)::bigint
    from public.orders o
    where o.placed_at >= now() - make_interval(days => greatest(1, least(p_days, 366)))
    group by o.status
    order by o.status;
end;
$$;
revoke execute on function public.analytics_orders(integer) from public, anon;
grant execute on function public.analytics_orders(integer) to authenticated;
