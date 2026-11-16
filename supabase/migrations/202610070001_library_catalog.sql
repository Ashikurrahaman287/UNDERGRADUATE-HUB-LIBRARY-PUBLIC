create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  author text not null,
  category_id uuid not null references public.categories(id) on update cascade on delete restrict,
  subcategory text,
  description text not null,
  cover_image_url text,
  edition text,
  language text,
  isbn text,
  publication_year integer,
  availability text not null default 'available'
    check (availability in ('available', 'limited', 'unavailable')),
  featured boolean not null default false,
  tags text[] not null default '{}',
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint books_publication_year_reasonable check (
    publication_year is null or publication_year between -3000 and 2200
  )
);

create index if not exists books_active_added_at_idx
  on public.books (is_active, added_at desc);
create index if not exists books_category_active_idx
  on public.books (category_id, is_active);
create index if not exists books_availability_active_idx
  on public.books (availability, is_active);
create index if not exists books_featured_active_idx
  on public.books (featured, is_active);
create index if not exists books_title_search_idx
  on public.books using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(isbn, '')));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.books enable row level security;

grant select on public.categories, public.books to anon, authenticated;
revoke insert, update, delete on public.categories, public.books from anon, authenticated;
grant all on public.categories, public.books to service_role;

drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories"
  on public.categories for select to anon, authenticated
  using (true);

drop policy if exists "Public can read active books" on public.books;
create policy "Public can read active books"
  on public.books for select to anon, authenticated
  using (is_active = true);

insert into public.categories (name, slug, description) values
  ('Novels', 'novels', 'A story to step inside'),
  ('Fiction', 'fiction', 'Stories that stay with you'),
  ('Sci-Fi', 'science-fiction', 'Worlds beyond this one'),
  ('Fantasy', 'fantasy', 'A little room for wonder'),
  ('Mystery & Thriller', 'mystery-thriller', 'One more chapter'),
  ('Romance', 'romance', 'Connection, longing and love'),
  ('Psychology', 'psychology', 'Books exploring the human mind, behavior, emotions and thought.'),
  ('Philosophy', 'philosophy', 'Questions worth keeping'),
  ('Religion', 'religion', 'Traditions and belief'),
  ('Spirituality', 'spirituality', 'Ways of finding perspective'),
  ('Self Development', 'self-development', 'Small ideas, meaningful change'),
  ('Biography', 'biography', 'Lives in their own words'),
  ('History', 'history', 'The past, still in motion'),
  ('Science', 'science', 'Big questions, clearly explored'),
  ('Other', 'other', 'The books that resist a label')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view book covers" on storage.objects;
create policy "Public can view book covers"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-covers');