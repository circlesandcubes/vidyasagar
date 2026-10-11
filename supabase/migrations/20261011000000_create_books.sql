create extension if not exists pgcrypto;

create type public.book_status as enum ('draft', 'published');

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subtitle text,
  description text,
  author text,
  cover_image_url text,
  isbn text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency char(3),
  publication_date date,
  status public.book_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_books_have_description check (
    status = 'draft' or length(trim(coalesce(description, ''))) > 0
  )
);

create index books_publication_status_title_idx on public.books (status, title);

alter table public.books enable row level security;
grant select on public.books to anon, authenticated;

create policy "Published books are readable by everyone"
  on public.books
  for select
  to anon, authenticated
  using (status = 'published');

insert into public.books (title, slug, status)
values
  ('How Many Planets?', 'how-many-planets', 'draft'),
  ('How Many Moons for Earth?', 'how-many-moons-for-earth', 'draft');
