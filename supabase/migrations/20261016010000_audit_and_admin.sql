-- Phase 6: append-only audit log and user administration.
--
-- The audit log records WHO changed WHAT and WHEN, for sensitive tables. It
-- deliberately stores column NAMES and a small allow-listed set of non-personal
-- values (a status, a role, a setting key) — never customer addresses, emails,
-- message bodies, policy text or other free text.

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,                      -- null = system (webhook, scheduled job, service role)
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  row_key text,
  changed_columns text[],
  detail jsonb
);
create index audit_log_time_idx on public.audit_log (occurred_at desc);
create index audit_log_table_idx on public.audit_log (table_name, occurred_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy "Admins read audit log" on public.audit_log for select to authenticated using (public.is_admin());

-- Append-only, even for the service role.
create function public.audit_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log is append-only';
end;
$$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- TG_ARGV[0] = column holding the row key; TG_ARGV[1] = comma-separated columns
-- whose values may be recorded (must be non-personal).
create function public.log_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  base jsonb := coalesce(new_row, old_row);
  cols text[];
  detail_cols text[] := case when coalesce(tg_argv[1], '') = '' then '{}' else string_to_array(tg_argv[1], ',') end;
  d jsonb := '{}'::jsonb;
  c text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into cols
    from jsonb_object_keys(new_row) k
    where new_row -> k is distinct from old_row -> k and k <> 'updated_at';
    if cols = '{}' then return null; end if;
  end if;
  foreach c in array detail_cols loop
    if tg_op = 'UPDATE' then
      if new_row -> c is distinct from old_row -> c then d := d || jsonb_build_object(c, jsonb_build_array(old_row -> c, new_row -> c)); end if;
    else
      d := d || jsonb_build_object(c, base -> c);
    end if;
  end loop;
  insert into public.audit_log (actor_id, table_name, action, row_key, changed_columns, detail)
  values (auth.uid(), tg_table_name, lower(tg_op), base ->> tg_argv[0], cols, nullif(d, '{}'::jsonb));
  return null;
end;
$$;
revoke execute on function public.log_audit() from public, anon, authenticated;

create trigger audit_user_roles after insert or delete on public.user_roles
  for each row execute function public.log_audit('user_id', 'user_id,role');
create trigger audit_site_settings after insert or update or delete on public.site_settings
  for each row execute function public.log_audit('key', 'key');
create trigger audit_product_prices after insert or update or delete on public.product_prices
  for each row execute function public.log_audit('id', 'edition_id,is_active');
create trigger audit_discount_rules after insert or update or delete on public.discount_rules
  for each row execute function public.log_audit('id', 'is_active');
create trigger audit_coupons after insert or update or delete on public.coupons
  for each row execute function public.log_audit('id', 'is_active');
create trigger audit_refunds after insert or update on public.refunds
  for each row execute function public.log_audit('id', 'order_id,status');
create trigger audit_orders after update of status, payment_status on public.orders
  for each row execute function public.log_audit('order_number', 'status,payment_status');
create trigger audit_books after update of status on public.books
  for each row execute function public.log_audit('id', 'status');
create trigger audit_book_reviews after update of status on public.book_reviews
  for each row execute function public.log_audit('id', 'status');
create trigger audit_quotations after update of status on public.quotations
  for each row execute function public.log_audit('reference', 'status');
create trigger audit_bulk_price_tiers after insert or update or delete on public.bulk_price_tiers
  for each row execute function public.log_audit('id', 'min_quantity,discount_bps,is_public');

-- ---------------------------------------------------------------------------
-- User administration (admin only). auth.users is not exposed over the API, so
-- the email lookup lives in a SECURITY DEFINER function.
-- ---------------------------------------------------------------------------

create function public.admin_list_users(p_query text default null)
returns table (user_id uuid, email text, created_at timestamptz, roles public.app_role[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only administrators may list users' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, u.created_at,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = u.id), '{}')
    from auth.users u
    where p_query is null or length(trim(p_query)) = 0 or u.email ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%'
    order by u.created_at desc
    limit 100;
end;
$$;
revoke execute on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;
