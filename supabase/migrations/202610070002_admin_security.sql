alter table public.categories
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.books
  add column if not exists cover_path text;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create index if not exists books_tags_search_idx
  on public.books using gin (tags);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  constraint admin_sessions_expiration_check check (expires_at > created_at)
);

create index if not exists admin_sessions_expiration_idx
  on public.admin_sessions (expires_at);

create table if not exists public.admin_login_attempts (
  identifier_hash text primary key check (length(identifier_hash) = 64),
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz
);

alter table public.admin_sessions enable row level security;
alter table public.admin_login_attempts enable row level security;

revoke all on public.admin_sessions, public.admin_login_attempts from anon, authenticated;
grant all on public.admin_sessions, public.admin_login_attempts to service_role;

drop policy if exists "Public can read categories" on public.categories;
drop policy if exists "Public can read active categories" on public.categories;
create policy "Public can read active categories"
  on public.categories for select to anon, authenticated
  using (is_active = true);

create or replace function public.is_admin_login_limited(p_identifier_hash text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.admin_login_attempts
    where identifier_hash = p_identifier_hash
      and (
        locked_until > now()
        or (failed_attempts >= 5 and window_started_at > now() - interval '15 minutes')
      )
  );
$$;

create or replace function public.record_admin_login_failure(p_identifier_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  attempt_count integer;
begin
  insert into public.admin_login_attempts (identifier_hash, window_started_at, failed_attempts)
  values (p_identifier_hash, now(), 1)
  on conflict (identifier_hash) do update set
    window_started_at = case
      when public.admin_login_attempts.window_started_at <= now() - interval '15 minutes' then now()
      else public.admin_login_attempts.window_started_at
    end,
    failed_attempts = case
      when public.admin_login_attempts.window_started_at <= now() - interval '15 minutes' then 1
      else public.admin_login_attempts.failed_attempts + 1
    end,
    locked_until = case
      when public.admin_login_attempts.window_started_at <= now() - interval '15 minutes' then null
      else public.admin_login_attempts.locked_until
    end
  returning failed_attempts into attempt_count;

  if attempt_count >= 5 then
    update public.admin_login_attempts
      set locked_until = now() + interval '15 minutes'
      where identifier_hash = p_identifier_hash;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.is_admin_login_limited(text) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text) from public, anon, authenticated;
grant execute on function public.is_admin_login_limited(text) to service_role;
grant execute on function public.record_admin_login_failure(text) to service_role;