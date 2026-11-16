create table if not exists public.fine_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  rental_id uuid references public.rentals(id) on delete restrict,
  amount_bdt numeric(10,2) not null check (amount_bdt >= 0),
  fine_date date not null default current_date,
  reason text not null default 'overdue rental',
  status text not null default 'outstanding' check (status in ('outstanding', 'paid', 'waived')),
  paid_at timestamptz,
  payment_submission_id uuid references public.payment_submissions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  type text not null check (type in (
    'membership_approved',
    'membership_rejected',
    'rental_approved',
    'rental_rejected',
    'subscription_expiring',
    'subscription_expired',
    'reservation_available',
    'fine_created',
    'payment_approved',
    'payment_rejected'
  )),
  title text not null,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'sms')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'read', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fine_ledger_member_status_idx
  on public.fine_ledger (member_id, status, fine_date desc);
create index if not exists notifications_member_status_idx
  on public.notifications (member_id, status, created_at desc);
create index if not exists notifications_type_status_idx
  on public.notifications (type, status, scheduled_at);

alter table public.fine_ledger enable row level security;
alter table public.notifications enable row level security;

grant select, insert, update on public.fine_ledger to authenticated;
grant all on public.fine_ledger to service_role;
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy "Members see own fines"
  on public.fine_ledger for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members update own fines only for status changes"
  on public.fine_ledger for update to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()))
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status in ('outstanding', 'paid', 'waived'));

create policy "Members see own notifications"
  on public.notifications for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members can create own notifications"
  on public.notifications for insert to authenticated
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Members can update own notification read state"
  on public.notifications for update to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()))
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create or replace trigger fine_ledger_set_updated_at
  before update on public.fine_ledger
  for each row execute function public.set_updated_at();

create or replace trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();
