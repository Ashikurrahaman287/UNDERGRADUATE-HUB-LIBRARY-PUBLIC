create extension if not exists pgcrypto;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_bdt numeric(10,2) not null check (price_bdt >= 0),
  duration_days integer not null check (duration_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null unique,
  email text,
  address text,
  membership_status text not null default 'pending' check (membership_status in ('pending', 'active', 'rejected', 'suspended')),
  current_plan_id uuid references public.subscription_plans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  amount_bdt numeric(10,2) not null check (amount_bdt >= 0),
  payment_method text not null check (payment_method in ('bkash', 'nagad')),
  transaction_id text not null,
  payment_screenshot_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  plan_name_snapshot text not null,
  plan_price_snapshot numeric(10,2) not null,
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_plans_active_idx
  on public.subscription_plans (is_active, price_bdt);
create index if not exists member_profiles_user_idx
  on public.member_profiles (user_id);
create index if not exists member_profiles_status_idx
  on public.member_profiles (membership_status);
create index if not exists membership_applications_member_idx
  on public.membership_applications (member_id, status);
create index if not exists member_subscriptions_member_idx
  on public.member_subscriptions (member_id, status, ends_at);

alter table public.subscription_plans enable row level security;
alter table public.member_profiles enable row level security;
alter table public.membership_applications enable row level security;
alter table public.member_subscriptions enable row level security;

grant select on public.subscription_plans to anon, authenticated;
grant all on public.subscription_plans to service_role;
grant select, insert, update on public.member_profiles to authenticated;
grant all on public.member_profiles to service_role;
grant select, insert, update on public.membership_applications to authenticated;
grant all on public.membership_applications to service_role;
grant select, insert, update on public.member_subscriptions to authenticated;
grant all on public.member_subscriptions to service_role;

create policy "Public subscription plans are readable"
  on public.subscription_plans for select to anon, authenticated
  using (is_active = true);

create policy "Members see their own profile"
  on public.member_profiles for select to authenticated
  using (user_id = auth.uid());

create policy "Members can insert their own profile"
  on public.member_profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "Members can update their own profile"
  on public.member_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Members see their own membership applications"
  on public.membership_applications for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members can create their own membership applications"
  on public.membership_applications for insert to authenticated
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members can update their own pending application"
  on public.membership_applications for update to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status = 'pending')
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status in ('pending', 'rejected'));

create policy "Members see their own subscriptions"
  on public.member_subscriptions for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members can create their own subscriptions"
  on public.member_subscriptions for insert to authenticated
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

insert into public.subscription_plans (name, description, price_bdt, duration_days, is_active)
values
  ('29 BDT / 30 days', 'Standard 30-day rental subscription', 29.00, 30, true),
  ('49 BDT / 30 days', 'Extended 30-day rental subscription', 49.00, 30, true)
on conflict do nothing;

create or replace trigger member_profiles_set_updated_at
  before update on public.member_profiles
  for each row execute function public.set_updated_at();

create or replace trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create or replace trigger membership_applications_set_updated_at
  before update on public.membership_applications
  for each row execute function public.set_updated_at();

create or replace trigger member_subscriptions_set_updated_at
  before update on public.member_subscriptions
  for each row execute function public.set_updated_at();
