-- Phase 2: accounts, roles, seller onboarding, submissions, editorial
-- workflow, reviewer assignments, error reports, rate limiting.
--
-- Design rules
--   * Row-level security is the gatekeeper; the application re-checks but is
--     never the only check.
--   * Supabase grants ALL on new public tables to anon/authenticated by default,
--     so this file first REVOKES everything on the Phase 1 tables and then
--     grants back only what is intended.
--   * Sellers (authors/publishers) never write to the public catalogue tables
--     directly. They write to their own book while it is a draft or has changes
--     requested; credits, skills, links and personalisation arrive as
--     *proposals* (jsonb) that staff turn into real rows.

-- ---------------------------------------------------------------------------
-- 0. Reset Phase 1 privileges to an explicit allow-list
-- ---------------------------------------------------------------------------

revoke all on
  public.books, public.authors, public.publishers, public.book_contributors,
  public.book_editions, public.subjects, public.book_subjects, public.age_groups,
  public.skills, public.book_skills, public.collections, public.collection_books,
  public.verification_reviews, public.verification_evidence,
  public.edition_purchase_channels
from anon, authenticated;

grant select on
  public.books, public.authors, public.publishers, public.book_contributors,
  public.book_editions, public.subjects, public.book_subjects, public.age_groups,
  public.skills, public.book_skills, public.collections, public.collection_books,
  public.verification_reviews, public.edition_purchase_channels
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Profiles and roles
-- ---------------------------------------------------------------------------

create type public.app_role as enum
  ('customer', 'author', 'publisher', 'curator', 'reviewer', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Role helpers. SECURITY DEFINER so policies can use them without recursing
-- into user_roles' own RLS; search_path is pinned.
create function public.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = p_role
  )
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role('admin')
$$;

-- Staff = may run the catalogue (curators and admins).
create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'curator')
  )
$$;

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 120), ''));
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Users may read and edit only their own display name. They cannot touch id.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "Own profile is readable" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy "Own profile is editable" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Roles are readable by their owner; only an administrator changes them.
grant select, insert, delete on public.user_roles to authenticated;
create policy "Own roles are readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "Admins grant roles" on public.user_roles for insert to authenticated
  with check (public.is_admin());
create policy "Admins revoke roles" on public.user_roles for delete to authenticated
  using (public.is_admin() and not (user_id = auth.uid() and role = 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Seller onboarding
-- ---------------------------------------------------------------------------

create table public.author_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id)
);
create table public.publisher_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, publisher_id)
);

create type public.application_status as enum ('pending', 'approved', 'rejected');

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('author', 'publisher')),
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  bio text check (bio is null or length(bio) <= 4000),
  website_url text check (website_url is null or website_url ~ '^https://'),
  status public.application_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  author_id uuid references public.authors (id) on delete set null,
  publisher_id uuid references public.publishers (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index seller_applications_one_pending_idx
  on public.seller_applications (user_id, kind) where status = 'pending';

alter table public.author_accounts enable row level security;
alter table public.publisher_accounts enable row level security;
alter table public.seller_applications enable row level security;

grant select on public.author_accounts, public.publisher_accounts to authenticated;
create policy "Own author links are readable" on public.author_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "Own publisher links are readable" on public.publisher_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

grant select, insert on public.seller_applications to authenticated;
create policy "Own applications are readable" on public.seller_applications for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "Users apply for themselves only" on public.seller_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null);

create function public.slugify(p_text text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')), ''), 'item')
$$;

-- Approve or reject an application. Staff only (checked inside).
create function public.review_seller_application(p_id uuid, p_approve boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  app public.seller_applications;
  entity_id uuid;
  base_slug text;
begin
  if not public.is_staff() then
    raise exception 'Only staff may review seller applications' using errcode = '42501';
  end if;
  select * into app from public.seller_applications where id = p_id for update;
  if not found then raise exception 'Application not found'; end if;
  if app.status <> 'pending' then raise exception 'Application already reviewed'; end if;

  if not p_approve then
    if length(trim(coalesce(p_note, ''))) = 0 then
      raise exception 'A note is required when rejecting an application';
    end if;
    update public.seller_applications
      set status = 'rejected', reviewed_by = auth.uid(), review_note = p_note, reviewed_at = now()
      where id = p_id;
    return null;
  end if;

  base_slug := public.slugify(app.display_name) || '-' || substr(replace(app.id::text, '-', ''), 1, 6);
  if app.kind = 'author' then
    insert into public.authors (name, slug, bio, website_url)
      values (app.display_name, base_slug, app.bio, app.website_url) returning id into entity_id;
    insert into public.author_accounts (user_id, author_id) values (app.user_id, entity_id);
    insert into public.user_roles (user_id, role, granted_by)
      values (app.user_id, 'author', auth.uid()) on conflict do nothing;
    update public.seller_applications set author_id = entity_id where id = p_id;
  else
    insert into public.publishers (name, slug, description, website_url)
      values (app.display_name, base_slug, app.bio, app.website_url) returning id into entity_id;
    insert into public.publisher_accounts (user_id, publisher_id) values (app.user_id, entity_id);
    insert into public.user_roles (user_id, role, granted_by)
      values (app.user_id, 'publisher', auth.uid()) on conflict do nothing;
    update public.seller_applications set publisher_id = entity_id where id = p_id;
  end if;

  update public.seller_applications
    set status = 'approved', reviewed_by = auth.uid(), review_note = p_note, reviewed_at = now()
    where id = p_id;
  return entity_id;
end;
$$;
revoke execute on function public.review_seller_application(uuid, boolean, text) from public, anon;
grant execute on function public.review_seller_application(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Submissions: extra columns on books
-- ---------------------------------------------------------------------------

alter table public.books
  add column submitted_by uuid references auth.users (id) on delete set null,
  add column rights_confirmed boolean not null default false,
  add column rights_statement text check (rights_statement is null or length(rights_statement) <= 4000),
  add column submitted_credits jsonb not null default '[]'::jsonb
    check (jsonb_typeof(submitted_credits) = 'array'),
  add column proposed_skills jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_skills) = 'array'),
  add column proposed_links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_links) = 'array'),
  add column proposed_personalisation jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_personalisation) = 'array'),
  add column status_note text,
  add column submitted_at timestamptz,
  add column published_at timestamptz;

create index books_submitted_by_idx on public.books (submitted_by);

-- ---------------------------------------------------------------------------
-- 4. Review assignments, editorial history, internal notes
-- ---------------------------------------------------------------------------

create table public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  unique (book_id, reviewer_id)
);

create table public.editorial_events (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  from_status public.book_status,
  to_status public.book_status not null,
  note text,
  created_at timestamptz not null default now()
);
create index editorial_events_book_idx on public.editorial_events (book_id, created_at);

create table public.book_internal_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

-- Access helpers (SECURITY DEFINER: they read tables the caller may not).
create function public.can_manage_book(p_book_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.books b where b.id = p_book_id and b.submitted_by = auth.uid())
    or exists (
      select 1 from public.book_contributors bc
      join public.author_accounts aa on aa.author_id = bc.author_id
      where bc.book_id = p_book_id and aa.user_id = auth.uid()
    )
    or exists (
      select 1 from public.book_editions e
      join public.publisher_accounts pa on pa.publisher_id = e.publisher_id
      where e.book_id = p_book_id and pa.user_id = auth.uid()
    )
  )
$$;

create function public.can_review_book(p_book_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.review_assignments
    where book_id = p_book_id and reviewer_id = auth.uid() and status = 'assigned'
  )
$$;

-- Books in these statuses may be edited by their owner.
create function public.book_is_owner_editable(p_status public.book_status)
returns boolean language sql immutable set search_path = '' as $$
  select p_status in ('draft', 'changes_requested')
$$;

-- ---------------------------------------------------------------------------
-- 5. Lifecycle state machine
-- ---------------------------------------------------------------------------
-- Owners:  draft|changes_requested -> submitted
--          draft|submitted|changes_requested|approved -> withdrawn
--          withdrawn -> draft
-- Staff:   submitted -> editorial_review
--          editorial_review -> changes_requested | approved | rejected
--          approved -> published | changes_requested
--          published -> archived | withdrawn
--          archived -> published ; rejected -> draft
--          (and any staff-permitted owner move)

create function public.book_transition_allowed(
  p_old public.book_status, p_new public.book_status, p_staff boolean
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_old = p_new then true
    when (p_old, p_new) in (
      ('draft', 'submitted'), ('changes_requested', 'submitted'),
      ('draft', 'withdrawn'), ('submitted', 'withdrawn'),
      ('changes_requested', 'withdrawn'), ('approved', 'withdrawn'),
      ('withdrawn', 'draft')
    ) then true
    when p_staff and (p_old, p_new) in (
      ('submitted', 'editorial_review'),
      ('editorial_review', 'changes_requested'), ('editorial_review', 'approved'),
      ('editorial_review', 'rejected'),
      ('approved', 'published'), ('approved', 'changes_requested'),
      ('published', 'archived'), ('published', 'withdrawn'),
      ('archived', 'published'), ('rejected', 'draft')
    ) then true
    else false
  end
$$;

create function public.enforce_book_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  staff boolean := public.is_staff();
  -- Columns an owner may change. Everything else is staff-only.
  owner_cols constant text[] := array[
    'title', 'subtitle', 'description', 'cover_image_url', 'cover_image_alt',
    'publication_date', 'age_min_months', 'age_max_months', 'rights_confirmed',
    'rights_statement', 'submitted_credits', 'proposed_skills', 'proposed_links',
    'proposed_personalisation', 'status', 'status_note', 'updated_at'
  ];
  pure_owner boolean := auth.uid() is not null and not staff;
  changed_status boolean := new.status is distinct from old.status;
begin
  if pure_owner then
    if (to_jsonb(new) - owner_cols) is distinct from (to_jsonb(old) - owner_cols) then
      raise exception 'Only editorial staff may change those fields' using errcode = '42501';
    end if;
    if not public.book_is_owner_editable(old.status)
       and (to_jsonb(new) - 'status' - 'status_note' - 'updated_at')
           is distinct from (to_jsonb(old) - 'status' - 'status_note' - 'updated_at') then
      raise exception 'This listing cannot be edited in its current status' using errcode = '42501';
    end if;
  end if;

  if not changed_status then
    if new.status = 'published' and pure_owner then
      raise exception 'Published listings cannot be edited by their owner' using errcode = '42501';
    end if;
    new.status_note := null;
    return new;
  end if;

  -- auth.uid() is null for service-role / migration contexts: treated as staff.
  if not public.book_transition_allowed(old.status, new.status, staff or auth.uid() is null) then
    raise exception 'Transition % -> % is not allowed', old.status, new.status using errcode = '42501';
  end if;

  if new.status = 'submitted' then
    if not new.rights_confirmed then
      raise exception 'Rights must be confirmed before submitting';
    end if;
    if length(trim(coalesce(new.description, ''))) = 0 then
      raise exception 'A description is required before submitting';
    end if;
    new.submitted_at := now();
  end if;

  if new.status in ('changes_requested', 'rejected')
     and length(trim(coalesce(new.status_note, ''))) = 0 then
    raise exception 'A note is required when requesting changes or rejecting';
  end if;

  if new.status in ('approved', 'published') then
    if new.submitted_by is not null and not new.rights_confirmed then
      raise exception 'Rights must be confirmed before approval';
    end if;
    if not exists (
      select 1 from public.book_contributors where book_id = new.id and role = 'author'
    ) then
      raise exception 'An author credit is required before approval';
    end if;
    if not exists (select 1 from public.book_editions where book_id = new.id) then
      raise exception 'At least one edition is required before approval';
    end if;
  end if;

  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;

  insert into public.editorial_events (book_id, actor_id, from_status, to_status, note)
  values (new.id, auth.uid(), old.status, new.status, new.status_note);
  new.status_note := null;
  return new;
end;
$$;
revoke execute on function public.enforce_book_lifecycle() from public, anon, authenticated;

create trigger books_enforce_lifecycle before update on public.books
  for each row execute function public.enforce_book_lifecycle();

-- A non-staff user may only ever create a draft that names themselves.
create function public.enforce_book_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    if new.status <> 'draft' then
      raise exception 'New submissions start as drafts' using errcode = '42501';
    end if;
    new.submitted_by := auth.uid();
    new.is_featured := false;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_book_insert() from public, anon, authenticated;
create trigger books_enforce_insert before insert on public.books
  for each row execute function public.enforce_book_insert();

-- ---------------------------------------------------------------------------
-- 6. RLS for books and related tables
-- ---------------------------------------------------------------------------

alter table public.review_assignments enable row level security;
alter table public.editorial_events enable row level security;
alter table public.book_internal_notes enable row level security;

grant insert, update on public.books to authenticated;

-- The direct column test matters: INSERT ... RETURNING evaluates this policy
-- against the new row, which a STABLE helper function cannot yet see.
create policy "Owners read their books" on public.books for select to authenticated
  using (submitted_by = auth.uid() or public.can_manage_book(id));
create policy "Staff read all books" on public.books for select to authenticated
  using (public.is_staff());
create policy "Assigned reviewers read the book" on public.books for select to authenticated
  using (public.can_review_book(id));

create policy "Sellers create draft books" on public.books for insert to authenticated
  with check (
    (public.has_role('author') or public.has_role('publisher'))
    and status = 'draft' and submitted_by = auth.uid()
  );
create policy "Staff create books" on public.books for insert to authenticated
  with check (public.is_staff());

create policy "Owners update their books" on public.books for update to authenticated
  using (public.can_manage_book(id)) with check (public.can_manage_book(id));
create policy "Staff update books" on public.books for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Editions: owners manage them while the listing is editable.
grant insert, update, delete on public.book_editions to authenticated;
create policy "Owners read their editions" on public.book_editions for select to authenticated
  using (public.can_manage_book(book_id) or public.can_review_book(book_id) or public.is_staff());
create policy "Owners write editions while editable" on public.book_editions for insert to authenticated
  with check (
    public.can_manage_book(book_id)
    and exists (select 1 from public.books b where b.id = book_id and public.book_is_owner_editable(b.status))
    and (
      publisher_id is null
      or exists (select 1 from public.publisher_accounts pa
                 where pa.publisher_id = book_editions.publisher_id and pa.user_id = auth.uid())
    )
    and availability = 'unavailable' and not is_primary
  );
create policy "Owners update editions while editable" on public.book_editions for update to authenticated
  using (
    public.can_manage_book(book_id)
    and exists (select 1 from public.books b where b.id = book_id and public.book_is_owner_editable(b.status))
  )
  with check (
    public.can_manage_book(book_id)
    and (
      publisher_id is null
      or exists (select 1 from public.publisher_accounts pa
                 where pa.publisher_id = book_editions.publisher_id and pa.user_id = auth.uid())
    )
    and availability = 'unavailable' and not is_primary
  );
create policy "Owners delete editions while editable" on public.book_editions for delete to authenticated
  using (
    public.can_manage_book(book_id)
    and exists (select 1 from public.books b where b.id = book_id and public.book_is_owner_editable(b.status))
  );
create policy "Staff manage editions" on public.book_editions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Staff manage the rest of the catalogue. Sellers get no write access to these.
do $$
declare t text;
begin
  foreach t in array array[
    'authors', 'publishers', 'book_contributors', 'subjects', 'book_subjects',
    'age_groups', 'skills', 'book_skills', 'collections', 'collection_books',
    'edition_purchase_channels'
  ] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Staff manage %1$s" on public.%1$I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())', t);
    execute format(
      'create policy "Staff read all %1$s" on public.%1$I for select to authenticated
         using (public.is_staff())', t);
  end loop;
end $$;

-- Sellers see their own contributor rows and linked author record.
create policy "Owners read credits of their books" on public.book_contributors for select to authenticated
  using (public.can_manage_book(book_id) or public.can_review_book(book_id));
create policy "Sellers read their author record" on public.authors for select to authenticated
  using (exists (select 1 from public.author_accounts a where a.author_id = id and a.user_id = auth.uid()));
create policy "Sellers read their publisher record" on public.publishers for select to authenticated
  using (exists (select 1 from public.publisher_accounts p where p.publisher_id = id and p.user_id = auth.uid()));

-- Review assignments, editorial history, notes.
grant select, insert, update, delete on public.review_assignments to authenticated;
create policy "Staff manage assignments" on public.review_assignments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Reviewers read own assignments" on public.review_assignments for select to authenticated
  using (reviewer_id = auth.uid());
create policy "Reviewers update own assignments" on public.review_assignments for update to authenticated
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

grant select on public.editorial_events to authenticated;
create policy "Owners and staff read history" on public.editorial_events for select to authenticated
  using (public.can_manage_book(book_id) or public.is_staff());

grant select, insert on public.book_internal_notes to authenticated;
create policy "Staff read internal notes" on public.book_internal_notes for select to authenticated
  using (public.is_staff() or public.can_review_book(book_id));
create policy "Staff write internal notes" on public.book_internal_notes for insert to authenticated
  with check ((public.is_staff() or public.can_review_book(book_id)) and author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Verification review workflow
-- ---------------------------------------------------------------------------
-- Reviewers draft records for assigned books. Only an administrator may
-- publish a record, mark it admin-approved, or mark credentials verified.

create function public.guard_verification_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.admin_approved or new.credentials_verified or new.status = 'published' then
      raise exception 'Only an administrator may approve, publish or verify credentials'
        using errcode = '42501';
    end if;
  else
    if new.admin_approved is distinct from old.admin_approved
       or new.credentials_verified is distinct from old.credentials_verified
       or (new.status = 'published' and old.status is distinct from 'published')
       or (old.status = 'published') then
      raise exception 'Only an administrator may approve, publish or verify credentials'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_verification_review() from public, anon, authenticated;
create trigger verification_reviews_guard before insert or update on public.verification_reviews
  for each row execute function public.guard_verification_review();

grant insert, update on public.verification_reviews to authenticated;
create policy "Reviewers and staff read their records" on public.verification_reviews
  for select to authenticated
  using (public.is_staff() or public.can_review_book(book_id));
create policy "Reviewers draft records for assigned books" on public.verification_reviews
  for insert to authenticated
  with check (public.is_staff() or public.can_review_book(book_id));
create policy "Reviewers edit unpublished records for assigned books" on public.verification_reviews
  for update to authenticated
  using (public.is_staff() or (public.can_review_book(book_id) and status <> 'published'))
  with check (public.is_staff() or public.can_review_book(book_id));

-- Private evidence: staff and assigned reviewers only; never anon.
grant select, insert on public.verification_evidence to authenticated;
create policy "Evidence readable by staff and assigned reviewers" on public.verification_evidence
  for select to authenticated
  using (exists (
    select 1 from public.verification_reviews r
    where r.id = review_id and (public.is_staff() or public.can_review_book(r.book_id))
  ));
create policy "Evidence added by staff and assigned reviewers" on public.verification_evidence
  for insert to authenticated
  with check (exists (
    select 1 from public.verification_reviews r
    where r.id = review_id and (public.is_staff() or public.can_review_book(r.book_id))
  ));

-- ---------------------------------------------------------------------------
-- 8. Error reports and corrections
-- ---------------------------------------------------------------------------
-- Reports are inserted by a server route using the service role after a rate
-- limit check, so anonymous visitors have no direct write access.

create table public.content_error_reports (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books (id) on delete set null,
  page_path text check (page_path is null or (length(page_path) <= 300 and page_path like '/%')),
  category text not null check (category in
    ('factual_error', 'skill_mapping', 'age_suitability', 'broken_link', 'rights_or_safety', 'other')),
  description text not null check (length(trim(description)) between 10 and 4000),
  contact_email text check (contact_email is null or (length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  reporter_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'triaged', 'resolved', 'dismissed')),
  handled_by uuid references auth.users (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_error_reports_status_idx on public.content_error_reports (status, created_at);
create trigger content_error_reports_set_updated_at before update on public.content_error_reports
  for each row execute function public.set_updated_at();

create table public.content_corrections (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  report_id uuid references public.content_error_reports (id) on delete set null,
  summary text not null check (length(trim(summary)) between 5 and 1000),
  corrected_on date not null default current_date,
  is_published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.content_error_reports enable row level security;
alter table public.content_corrections enable row level security;

grant select, update on public.content_error_reports to authenticated;
create policy "Staff read reports" on public.content_error_reports for select to authenticated
  using (public.is_staff());
create policy "Reporters read their own" on public.content_error_reports for select to authenticated
  using (reporter_id = auth.uid());
create policy "Staff triage reports" on public.content_error_reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

grant select on public.content_corrections to anon, authenticated;
grant insert, update, delete on public.content_corrections to authenticated;
create policy "Published corrections of published books are readable" on public.content_corrections
  for select to anon, authenticated
  using (is_published and exists (select 1 from public.books b where b.id = book_id and b.status = 'published'));
create policy "Staff manage corrections" on public.content_corrections for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 9. Rate limiting (service role only)
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true when the call is allowed. Fixed windows; old rows are pruned
-- opportunistically.
create function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into current_hits;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return current_hits <= p_max;
end;
$$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Staff directory lookups
-- ---------------------------------------------------------------------------
-- Staff need to pick reviewers and see who an application came from, but must
-- not be able to read auth.users or other users' profiles wholesale.

create function public.list_users_with_role(p_role public.app_role)
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = '' as $$
  select r.user_id, p.display_name, u.email::text
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where r.role = p_role and public.is_staff()
  order by coalesce(p.display_name, u.email)
$$;
revoke execute on function public.list_users_with_role(public.app_role) from public, anon;
grant execute on function public.list_users_with_role(public.app_role) to authenticated;

create function public.application_contact(p_application_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select u.email::text
  from public.seller_applications a join auth.users u on u.id = a.user_id
  where a.id = p_application_id and public.is_staff()
$$;
revoke execute on function public.application_contact(uuid) from public, anon;
grant execute on function public.application_contact(uuid) to authenticated;
