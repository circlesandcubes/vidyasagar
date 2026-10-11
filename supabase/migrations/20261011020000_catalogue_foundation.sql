-- Phase 1 foundation: catalogue, skills taxonomy, verification records and the
-- purchasing-channel model.
--
-- Public access rules (enforced by row-level security, not by the UI):
--   * Anonymous visitors can read only rows that belong to a PUBLISHED book.
--   * Writes are not granted to anon/authenticated in this phase; catalogue
--     management is done with the service role until the admin phase adds
--     role-based policies.
--   * verification_evidence is never readable by anon/authenticated.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_valid_isbn13(value text)
returns boolean
language sql
immutable
as $$
  select case
    when value ~ '^[0-9]{13}$' then
      (
        select sum(substr(value, i, 1)::int * case when i % 2 = 1 then 1 else 3 end)
        from generate_series(1, 13) as i
      ) % 10 = 0
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.contributor_role as enum ('author', 'illustrator', 'editor', 'translator');
create type public.book_format as enum ('paperback', 'hardcover', 'board_book', 'ebook', 'other');
create type public.edition_availability as enum ('available', 'preorder', 'out_of_print', 'unavailable');
create type public.skill_relation as enum ('practised', 'supported', 'incidental');
create type public.verification_type as enum (
  'author_approved',
  'publisher_approved',
  'fact_checked',
  'expert_reviewed',
  'educator_reviewed',
  'story_and_imagination'
);
create type public.verification_status as enum ('draft', 'pending_approval', 'published', 'withdrawn');
create type public.purchase_channel as enum ('direct', 'amazon', 'flipkart', 'bulk_enquiry');
create type public.fulfilment_party as enum ('vidyasagar', 'publisher', 'external');

-- ---------------------------------------------------------------------------
-- Books: replace legacy single-value columns with relational structures.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.books
    where author is not null
       or isbn is not null
       or price_cents is not null
       or currency is not null
  ) then
    raise exception
      'books.author, isbn, price_cents or currency contain data. Move it into authors/book_contributors/book_editions before applying this migration.';
  end if;
end;
$$;

alter table public.books
  drop column author,
  drop column isbn,
  drop column price_cents,
  drop column currency;

-- The original rule demanded a description for every non-draft status. With the
-- fuller lifecycle that would block submitted/rejected/withdrawn records, so it
-- now applies only once a listing is approved or published.
alter table public.books drop constraint published_books_have_description;
alter table public.books
  add constraint approved_books_have_description check (
    status not in ('approved', 'published')
    or length(trim(coalesce(description, ''))) > 0
  );

alter table public.books
  add column cover_image_alt text,
  add column age_min_months integer check (age_min_months is null or age_min_months >= 0),
  add column age_max_months integer check (age_max_months is null or age_max_months >= 0),
  add column is_featured boolean not null default false,
  add constraint books_age_range_complete check ((age_min_months is null) = (age_max_months is null)),
  add constraint books_age_range_ordered check (age_min_months is null or age_max_months >= age_min_months);

create index books_status_featured_idx on public.books (status, is_featured);
create trigger books_set_updated_at before update on public.books
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authors and publishers
-- ---------------------------------------------------------------------------

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  bio text,
  image_url text,
  image_alt text,
  website_url text check (website_url is null or website_url ~ '^https://'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  logo_url text,
  logo_alt text,
  website_url text check (website_url is null or website_url ~ '^https://'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger authors_set_updated_at before update on public.authors
  for each row execute function public.set_updated_at();
create trigger publishers_set_updated_at before update on public.publishers
  for each row execute function public.set_updated_at();

-- Credits are separate from whoever submitted the book (submitter and rights
-- information arrive with the submissions phase).
create table public.book_contributors (
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete restrict,
  role public.contributor_role not null,
  display_order integer not null default 0,
  primary key (book_id, author_id, role)
);
create index book_contributors_author_idx on public.book_contributors (author_id);

-- ---------------------------------------------------------------------------
-- Editions
-- ---------------------------------------------------------------------------

create table public.book_editions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  format public.book_format not null,
  language text not null default 'en' check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]+)*$'),
  isbn13 text unique check (isbn13 is null or public.is_valid_isbn13(isbn13)),
  publisher_id uuid references public.publishers (id) on delete set null,
  publication_date date,
  page_count integer check (page_count is null or page_count > 0),
  availability public.edition_availability not null default 'unavailable',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index book_editions_book_idx on public.book_editions (book_id);
create index book_editions_publisher_idx on public.book_editions (publisher_id);
create unique index book_editions_one_primary_idx on public.book_editions (book_id) where is_primary;
create trigger book_editions_set_updated_at before update on public.book_editions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Subjects, age groups, skills
-- ---------------------------------------------------------------------------

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  is_published boolean not null default true
);

create table public.book_subjects (
  book_id uuid not null references public.books (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  primary key (book_id, subject_id)
);
create index book_subjects_subject_idx on public.book_subjects (subject_id);

-- Configurable, indicative age bands in months. Bands may overlap; they are
-- discovery aids, not developmental assessments.
create table public.age_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  min_months integer not null check (min_months >= 0),
  max_months integer not null,
  display_order integer not null default 0,
  is_published boolean not null default true,
  constraint age_groups_range_ordered check (max_months >= min_months)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.skills (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  age_guidance text,
  icon text,
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skills_not_own_parent check (parent_id is null or parent_id <> id)
);
create index skills_parent_idx on public.skills (parent_id);
create trigger skills_set_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

-- A skill association always carries an explanation. It is publicly visible only
-- once a curator has approved it.
create table public.book_skills (
  book_id uuid not null references public.books (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  relation public.skill_relation not null,
  explanation text not null check (length(trim(explanation)) > 0),
  rationale text,
  attribution_source text,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (book_id, skill_id)
);
create index book_skills_skill_idx on public.book_skills (skill_id);
create trigger book_skills_set_updated_at before update on public.book_skills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_books (
  collection_id uuid not null references public.collections (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  position integer not null default 0,
  curator_note text,
  primary key (collection_id, book_id)
);
create index collection_books_book_idx on public.collection_books (book_id);

-- ---------------------------------------------------------------------------
-- Vidyasagar Verified Knowledge Framework
-- ---------------------------------------------------------------------------
-- Author/publisher approval and independent review are different review types.
-- Nothing is public until the approving party has granted publication
-- permission AND an administrator has approved the record.

create table public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  edition_id uuid references public.book_editions (id) on delete set null,
  review_type public.verification_type not null,
  reviewer_name text,
  reviewer_organisation text,
  approval_authority text,
  scope text not null check (length(trim(scope)) > 0),
  claims_covered text,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  limitations text,
  reviewed_on date,
  version_reviewed text,
  -- Shown publicly only when credentials were checked and disclosure authorised.
  public_credentials text,
  credentials_verified boolean not null default false,
  publication_permission boolean not null default false,
  admin_approved boolean not null default false,
  status public.verification_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_published_requires_approval check (
    status <> 'published'
    or (publication_permission and admin_approved and reviewed_on is not null)
  ),
  constraint verification_credentials_require_check check (
    public_credentials is null or credentials_verified
  ),
  constraint verification_fact_check_requires_sources check (
    review_type <> 'fact_checked' or jsonb_array_length(sources) > 0
  ),
  constraint verification_requires_named_party check (
    review_type = 'story_and_imagination'
    or length(trim(coalesce(reviewer_name, ''))) > 0
  )
);
create index verification_reviews_book_idx on public.verification_reviews (book_id);
create trigger verification_reviews_set_updated_at before update on public.verification_reviews
  for each row execute function public.set_updated_at();

-- Private reviewer documents and notes. No public grant, no public policy.
create table public.verification_evidence (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.verification_reviews (id) on delete cascade,
  kind text not null check (kind in ('document', 'url', 'note')),
  reference text,
  storage_path text,
  note text,
  created_at timestamptz not null default now()
);
create index verification_evidence_review_idx on public.verification_evidence (review_id);

-- ---------------------------------------------------------------------------
-- Purchasing-channel model (Direct, Amazon, Flipkart, Bulk enquiry)
-- ---------------------------------------------------------------------------
-- One row per edition, channel and region. Direct pricing is introduced with
-- commerce; external channels carry an exact, approved destination URL.

create table public.edition_purchase_channels (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.book_editions (id) on delete cascade,
  channel public.purchase_channel not null,
  region char(2) not null default 'IN',
  is_enabled boolean not null default false,
  fulfilment public.fulfilment_party not null,
  destination_url text,
  campaign_id text,
  last_validated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, channel, region),
  constraint purchase_channel_fulfilment_matches check (
    (channel in ('amazon', 'flipkart')) = (fulfilment = 'external')
  ),
  constraint purchase_channel_url_matches_channel check (
    case channel
      when 'amazon' then destination_url is null
        or destination_url ~* '^https://([a-z0-9-]+\.)*(amazon\.(in|com)|amzn\.(to|in)|a\.co)(/|$)'
      when 'flipkart' then destination_url is null
        or destination_url ~* '^https://([a-z0-9-]+\.)*(flipkart\.com|fkrt\.(it|cc))(/|$)'
      else destination_url is null
    end
  ),
  constraint purchase_channel_enabled_external_has_url check (
    not is_enabled or channel not in ('amazon', 'flipkart') or destination_url is not null
  )
);
create index edition_purchase_channels_edition_idx on public.edition_purchase_channels (edition_id);
create trigger edition_purchase_channels_set_updated_at before update on public.edition_purchase_channels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.authors enable row level security;
alter table public.publishers enable row level security;
alter table public.book_contributors enable row level security;
alter table public.book_editions enable row level security;
alter table public.subjects enable row level security;
alter table public.book_subjects enable row level security;
alter table public.age_groups enable row level security;
alter table public.skills enable row level security;
alter table public.book_skills enable row level security;
alter table public.collections enable row level security;
alter table public.collection_books enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.edition_purchase_channels enable row level security;

grant select on
  public.authors,
  public.publishers,
  public.book_contributors,
  public.book_editions,
  public.subjects,
  public.book_subjects,
  public.age_groups,
  public.skills,
  public.book_skills,
  public.collections,
  public.collection_books,
  public.verification_reviews,
  public.edition_purchase_channels
to anon, authenticated;

-- verification_evidence: RLS on, no policy, no grant => unreadable by clients.

create policy "Published authors are readable"
  on public.authors for select to anon, authenticated
  using (is_published);

create policy "Published publishers are readable"
  on public.publishers for select to anon, authenticated
  using (is_published);

create policy "Contributors of published books are readable"
  on public.book_contributors for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id and b.status = 'published'));

create policy "Editions of published books are readable"
  on public.book_editions for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id and b.status = 'published'));

create policy "Published subjects are readable"
  on public.subjects for select to anon, authenticated
  using (is_published);

create policy "Subject links of published books are readable"
  on public.book_subjects for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id and b.status = 'published'));

create policy "Published age groups are readable"
  on public.age_groups for select to anon, authenticated
  using (is_published);

create policy "Published skills are readable"
  on public.skills for select to anon, authenticated
  using (is_published);

create policy "Approved skill links of published books are readable"
  on public.book_skills for select to anon, authenticated
  using (
    is_approved
    and exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
    and exists (select 1 from public.skills s where s.id = skill_id and s.is_published)
  );

create policy "Published collections are readable"
  on public.collections for select to anon, authenticated
  using (is_published);

create policy "Collection links to published books are readable"
  on public.collection_books for select to anon, authenticated
  using (
    exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
    and exists (select 1 from public.collections c where c.id = collection_id and c.is_published)
  );

create policy "Approved, permitted verification records are readable"
  on public.verification_reviews for select to anon, authenticated
  using (
    status = 'published'
    and publication_permission
    and admin_approved
    and exists (select 1 from public.books b where b.id = book_id and b.status = 'published')
  );

create policy "Enabled purchase channels of published books are readable"
  on public.edition_purchase_channels for select to anon, authenticated
  using (
    is_enabled
    and exists (
      select 1
      from public.book_editions e
      join public.books b on b.id = e.book_id
      where e.id = edition_id and b.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Seed: configurable age bands (months; bands intentionally overlap)
-- ---------------------------------------------------------------------------

insert into public.age_groups (name, slug, min_months, max_months, display_order) values
  ('Babies and toddlers', 'babies-and-toddlers', 0, 35, 1),
  ('Ages 2–4', 'ages-2-4', 24, 59, 2),
  ('Ages 4–6', 'ages-4-6', 48, 83, 3),
  ('Ages 6–8', 'ages-6-8', 72, 107, 4),
  ('Ages 8 and above', 'ages-8-and-above', 96, 216, 5);

-- ---------------------------------------------------------------------------
-- Seed: editable skills taxonomy (book-discovery categories, not diagnoses)
-- ---------------------------------------------------------------------------

insert into public.skills (name, slug, description, display_order) values
  ('Language and Literacy', 'language-and-literacy', 'Words, sounds and stories.', 1),
  ('Numeracy', 'numeracy', 'Numbers, quantities, shapes and patterns.', 2),
  ('Science and Discovery', 'science-and-discovery', 'Noticing, asking and finding out about the world.', 3),
  ('Thinking Skills', 'thinking-skills', 'Remembering, focusing, sequencing and reasoning.', 4),
  ('Creative Development', 'creative-development', 'Imagining, making and expressing.', 5),
  ('Social and Emotional Learning', 'social-and-emotional-learning', 'Feelings, relationships and everyday situations.', 6),
  ('Physical and Practical Skills', 'physical-and-practical-skills', 'Hands-on activities and following instructions.', 7);

insert into public.skills (name, slug, parent_id, display_order)
select child.name, child.slug, parent.id, child.display_order
from (values
  ('language-and-literacy', 'Vocabulary', 'vocabulary', 1),
  ('language-and-literacy', 'Phonics', 'phonics', 2),
  ('language-and-literacy', 'Letter recognition', 'letter-recognition', 3),
  ('language-and-literacy', 'Listening comprehension', 'listening-comprehension', 4),
  ('language-and-literacy', 'Story sequencing', 'story-sequencing', 5),
  ('language-and-literacy', 'Early reading', 'early-reading', 6),
  ('numeracy', 'Counting', 'counting', 1),
  ('numeracy', 'Number recognition', 'number-recognition', 2),
  ('numeracy', 'Quantity comparison', 'quantity-comparison', 3),
  ('numeracy', 'Shapes and patterns', 'shapes-and-patterns', 4),
  ('numeracy', 'Early addition concepts', 'early-addition-concepts', 5),
  ('science-and-discovery', 'Observation', 'observation', 1),
  ('science-and-discovery', 'Classification', 'classification', 2),
  ('science-and-discovery', 'Cause and effect', 'cause-and-effect', 3),
  ('science-and-discovery', 'Space and astronomy', 'space-and-astronomy', 4),
  ('science-and-discovery', 'Nature and animals', 'nature-and-animals', 5),
  ('thinking-skills', 'Memory', 'memory', 1),
  ('thinking-skills', 'Attention', 'attention', 2),
  ('thinking-skills', 'Sequencing', 'sequencing', 3),
  ('thinking-skills', 'Logical reasoning', 'logical-reasoning', 4),
  ('thinking-skills', 'Problem-solving', 'problem-solving', 5),
  ('creative-development', 'Imagination', 'imagination', 1),
  ('creative-development', 'Drawing and expression', 'drawing-and-expression', 2),
  ('creative-development', 'Story creation', 'story-creation', 3),
  ('creative-development', 'Creative exploration', 'creative-exploration', 4),
  ('social-and-emotional-learning', 'Identifying emotions', 'identifying-emotions', 1),
  ('social-and-emotional-learning', 'Empathy', 'empathy', 2),
  ('social-and-emotional-learning', 'Sharing and cooperation', 'sharing-and-cooperation', 3),
  ('social-and-emotional-learning', 'Everyday social situations', 'everyday-social-situations', 4),
  ('physical-and-practical-skills', 'Fine-motor practice', 'fine-motor-practice', 1),
  ('physical-and-practical-skills', 'Hand-eye coordination', 'hand-eye-coordination', 2),
  ('physical-and-practical-skills', 'Following instructions', 'following-instructions', 3)
) as child (parent_slug, name, slug, display_order)
join public.skills parent on parent.slug = child.parent_slug;

-- ---------------------------------------------------------------------------
-- Seed: the featured collection record. It has no books and stays hidden on the
-- site until published books are added to it.
-- ---------------------------------------------------------------------------

insert into public.collections (title, slug, is_published, is_featured, display_order)
values ('Little Space Explorers', 'little-space-explorers', true, true, 1);
