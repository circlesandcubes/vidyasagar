-- Phase 3: customer accounts, saved books, interests, addresses,
-- personalisation templates, newsletter, customer reviews, site settings.
--
-- Privacy: no child names, birth dates or photos are stored. A customer may
-- record age *groups* and skill *interests* only.

-- ---------------------------------------------------------------------------
-- 1. Site settings (feature flags and configuration)
-- ---------------------------------------------------------------------------

create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

create policy "Public settings are readable" on public.site_settings for select to anon, authenticated
  using (is_public);
create policy "Staff read all settings" on public.site_settings for select to authenticated
  using (public.is_staff());
create policy "Admins write settings" on public.site_settings for insert to authenticated
  with check (public.is_admin());
create policy "Admins update settings" on public.site_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Everything optional ships OFF. Nothing here implies a capability exists.
insert into public.site_settings (key, value, is_public) values
  ('reviews_enabled', 'false'::jsonb, true),
  ('newsletter_enabled', 'false'::jsonb, true);

-- ---------------------------------------------------------------------------
-- 2. Addresses
-- ---------------------------------------------------------------------------

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text check (label is null or length(label) <= 40),
  recipient_name text not null check (length(trim(recipient_name)) between 1 and 120),
  phone text check (phone is null or phone ~ '^[0-9+][0-9 ]{7,14}$'),
  line1 text not null check (length(trim(line1)) between 1 and 200),
  line2 text check (line2 is null or length(line2) <= 200),
  city text not null check (length(trim(city)) between 1 and 100),
  state text not null check (length(trim(state)) between 1 and 100),
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  country char(2) not null default 'IN' check (country = 'IN'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_idx on public.addresses (user_id) where is_default;
create trigger addresses_set_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();

alter table public.addresses enable row level security;
revoke all on public.addresses from anon, authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
create policy "Own addresses" on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Saved books, interests
-- ---------------------------------------------------------------------------

create table public.saved_books (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create table public.user_skill_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (user_id, skill_id)
);
create table public.user_age_groups (
  user_id uuid not null references auth.users (id) on delete cascade,
  age_group_id uuid not null references public.age_groups (id) on delete cascade,
  primary key (user_id, age_group_id)
);

alter table public.saved_books enable row level security;
alter table public.user_skill_interests enable row level security;
alter table public.user_age_groups enable row level security;
revoke all on public.saved_books, public.user_skill_interests, public.user_age_groups from anon, authenticated;
grant select, insert, delete on public.saved_books, public.user_skill_interests, public.user_age_groups to authenticated;

create policy "Own saved books are readable" on public.saved_books for select to authenticated
  using (user_id = auth.uid());
-- Only published books can be saved (drafts stay unguessable).
create policy "Save published books" on public.saved_books for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
  );
create policy "Unsave own books" on public.saved_books for delete to authenticated
  using (user_id = auth.uid());

create policy "Own skill interests" on public.user_skill_interests for select to authenticated
  using (user_id = auth.uid());
create policy "Add own skill interests" on public.user_skill_interests for insert to authenticated
  with check (user_id = auth.uid());
create policy "Remove own skill interests" on public.user_skill_interests for delete to authenticated
  using (user_id = auth.uid());
create policy "Own age groups" on public.user_age_groups for select to authenticated
  using (user_id = auth.uid());
create policy "Add own age groups" on public.user_age_groups for insert to authenticated
  with check (user_id = auth.uid());
create policy "Remove own age groups" on public.user_age_groups for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Personalisation templates
-- ---------------------------------------------------------------------------
-- A template defines the fields a customer fills in. Order lines (Phase 4)
-- store an immutable snapshot of the template and the answers, so later edits
-- here never change an existing order.

create type public.personalisation_field_type as enum ('text', 'textarea', 'choice');

create table public.personalisation_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text,
  preview_note text,
  -- Extra charge in minor units (paise); applied at checkout from Phase 4.
  price_adjustment_minor integer not null default 0 check (price_adjustment_minor >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 365),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger personalisation_templates_set_updated_at before update on public.personalisation_templates
  for each row execute function public.set_updated_at();

create table public.personalisation_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.personalisation_templates (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(trim(label)) > 0),
  help_text text,
  field_type public.personalisation_field_type not null default 'text',
  is_required boolean not null default true,
  min_length integer not null default 0 check (min_length >= 0),
  max_length integer not null default 30 check (max_length between 1 and 500),
  choices jsonb check (choices is null or (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 1 and 30)),
  display_order integer not null default 0,
  unique (template_id, key),
  constraint personalisation_length_order check (min_length <= max_length),
  constraint personalisation_choice_has_choices check (field_type <> 'choice' or choices is not null)
);

-- Which books offer which template. Per book (all editions) for simplicity.
create table public.book_personalisation (
  book_id uuid not null references public.books (id) on delete cascade,
  template_id uuid not null references public.personalisation_templates (id) on delete cascade,
  is_enabled boolean not null default false,
  primary key (book_id, template_id)
);

alter table public.personalisation_templates enable row level security;
alter table public.personalisation_fields enable row level security;
alter table public.book_personalisation enable row level security;
revoke all on public.personalisation_templates, public.personalisation_fields, public.book_personalisation from anon, authenticated;
grant select on public.personalisation_templates, public.personalisation_fields, public.book_personalisation to anon, authenticated;
grant insert, update, delete on public.personalisation_templates, public.personalisation_fields, public.book_personalisation to authenticated;

create policy "Active templates are readable" on public.personalisation_templates for select to anon, authenticated
  using (is_active);
create policy "Fields of active templates are readable" on public.personalisation_fields for select to anon, authenticated
  using (exists (select 1 from public.personalisation_templates t where t.id = template_id and t.is_active));
create policy "Enabled options of published books are readable" on public.book_personalisation for select to anon, authenticated
  using (
    is_enabled
    and exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
    and exists (select 1 from public.personalisation_templates t where t.id = template_id and t.is_active)
  );
create policy "Staff manage templates" on public.personalisation_templates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff manage fields" on public.personalisation_fields for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff manage book personalisation" on public.book_personalisation for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5. Newsletter (double opt-in; written by a server route using the service role)
-- ---------------------------------------------------------------------------

create table public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index newsletter_email_idx on public.newsletter_subscriptions (lower(email));
alter table public.newsletter_subscriptions enable row level security;
revoke all on public.newsletter_subscriptions from anon, authenticated;
grant select on public.newsletter_subscriptions to authenticated;
create policy "Staff read subscriptions" on public.newsletter_subscriptions for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Customer reviews (moderated; hidden unless reviews_enabled)
-- ---------------------------------------------------------------------------

create table public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null check (length(trim(body)) between 10 and 2000),
  display_name text check (display_name is null or length(display_name) <= 60),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  moderated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (book_id, user_id)
);
alter table public.book_reviews enable row level security;
revoke all on public.book_reviews from anon, authenticated;
grant select on public.book_reviews to anon, authenticated;
grant insert on public.book_reviews to authenticated;
grant update (status, moderated_by) on public.book_reviews to authenticated;

create function public.setting_enabled(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value)::text = 'true' from public.site_settings where key = p_key), false)
$$;

create policy "Published reviews are readable when enabled" on public.book_reviews for select to anon, authenticated
  using (
    status = 'published' and public.setting_enabled('reviews_enabled')
    and exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
  );
create policy "Own reviews are readable" on public.book_reviews for select to authenticated
  using (user_id = auth.uid());
create policy "Staff read all reviews" on public.book_reviews for select to authenticated
  using (public.is_staff());
create policy "Write own pending review when enabled" on public.book_reviews for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'pending' and moderated_by is null
    and public.setting_enabled('reviews_enabled')
    and exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
  );
create policy "Staff moderate reviews" on public.book_reviews for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
