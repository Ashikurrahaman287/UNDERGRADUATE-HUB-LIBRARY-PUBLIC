create table if not exists public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete restrict,
  subscription_plan_id uuid references public.subscription_plans(id),
  amount_bdt numeric(10,2) not null check (amount_bdt >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete restrict,
  book_id uuid not null references public.books(id) on delete restrict,
  subscription_plan_id uuid references public.subscription_plans(id),
  plan_name_snapshot text,
  plan_price_snapshot numeric(10,2),
  started_at timestamptz not null default now(),
  subscription_ends_at timestamptz,
  returned_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'overdue', 'returned', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete restrict,
  position integer not null default 0,
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'fulfilled', 'cancelled', 'expired')),
  requested_at timestamptz not null default now(),
  notified_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_requests_member_status_idx
  on public.rental_requests (member_id, status, requested_at desc);
create index if not exists rental_requests_book_status_idx
  on public.rental_requests (book_id, status);
create index if not exists rentals_member_status_idx
  on public.rentals (member_id, status, subscription_ends_at);
create index if not exists rentals_book_status_idx
  on public.rentals (book_id, status);
create index if not exists reservation_requests_book_status_idx
  on public.reservation_requests (book_id, status, requested_at);
create index if not exists reservation_requests_member_idx
  on public.reservation_requests (member_id, book_id, status);

create unique index if not exists active_rental_per_book_idx
  on public.rentals (book_id)
  where status in ('pending', 'active', 'overdue');

create unique index if not exists active_reservation_per_member_book_idx
  on public.reservation_requests (member_id, book_id)
  where status in ('waiting', 'notified');

alter table public.rental_requests enable row level security;
alter table public.rentals enable row level security;
alter table public.reservation_requests enable row level security;

grant select, insert, update on public.rental_requests to authenticated;
grant all on public.rental_requests to service_role;
grant select, insert, update on public.rentals to authenticated;
grant all on public.rentals to service_role;
grant select, insert, update on public.reservation_requests to authenticated;
grant all on public.reservation_requests to service_role;

create policy "Members see own rental requests"
  on public.rental_requests for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members create own rental requests"
  on public.rental_requests for insert to authenticated
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members update own pending rental requests"
  on public.rental_requests for update to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status = 'pending')
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status in ('pending', 'rejected'));

create policy "Members see own rentals"
  on public.rentals for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members see own reservations"
  on public.reservation_requests for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members create own reservations"
  on public.reservation_requests for insert to authenticated
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members update own reservations while active"
  on public.reservation_requests for update to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status in ('waiting', 'notified'))
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status in ('waiting', 'notified', 'cancelled', 'fulfilled'));

create or replace trigger rental_requests_set_updated_at
  before update on public.rental_requests
  for each row execute function public.set_updated_at();

create or replace trigger rentals_set_updated_at
  before update on public.rentals
  for each row execute function public.set_updated_at();

create or replace trigger reservation_requests_set_updated_at
  before update on public.reservation_requests
  for each row execute function public.set_updated_at();
