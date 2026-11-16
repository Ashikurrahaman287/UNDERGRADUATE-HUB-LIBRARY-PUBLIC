create table if not exists public.library_settings (
  key text primary key,
  value_text text,
  value_number numeric(12,2),
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  payment_type text not null check (payment_type in ('membership', 'rental', 'renewal', 'fine')),
  related_membership_application_id uuid references public.membership_applications(id),
  related_rental_request_id uuid,
  related_fine_id uuid,
  payment_method text not null check (payment_method in ('bkash', 'nagad')),
  amount_bdt numeric(10,2) not null check (amount_bdt >= 0),
  transaction_id text not null,
  screenshot_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_submissions_member_status_idx
  on public.payment_submissions (member_id, status, submitted_at desc);
create index if not exists payment_submissions_type_status_idx
  on public.payment_submissions (payment_type, status);
create unique index if not exists payment_submissions_txid_unique
  on public.payment_submissions (transaction_id)
  where transaction_id is not null and status in ('pending', 'approved');

alter table public.library_settings enable row level security;
alter table public.payment_submissions enable row level security;

grant select on public.library_settings to anon, authenticated;
grant all on public.library_settings to service_role;
grant select, insert, update on public.payment_submissions to authenticated;
grant all on public.payment_submissions to service_role;

drop policy if exists "Read own payment submissions" on public.payment_submissions;
create policy "Read own payment submissions"
  on public.payment_submissions for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Create own payment submissions"
  on public.payment_submissions for insert to authenticated
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()));

create policy "Update own payment submissions before review"
  on public.payment_submissions for update to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status = 'pending')
  with check (member_id in (select id from public.member_profiles where user_id = auth.uid()) and status in ('pending', 'rejected'));

insert into public.library_settings (key, value_text, value_number, description)
values
  ('membership_fee_bdt', '99', 99.00, 'One-time membership activation fee in BDT'),
  ('fine_per_day_bdt', '10', 10.00, 'Daily overdue fine in BDT')
on conflict (key) do update set
  value_text = excluded.value_text,
  value_number = excluded.value_number,
  description = excluded.description,
  updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can view own payment proof files"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and owner = auth.uid());

create policy "Members can upload own payment proofs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and owner = auth.uid());

create policy "Members can update own payment proof files"
  on storage.objects for update to authenticated
  using (bucket_id = 'payment-proofs' and owner = auth.uid())
  with check (bucket_id = 'payment-proofs' and owner = auth.uid());

create policy "Members can delete own payment proof files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs' and owner = auth.uid());

create or replace trigger payment_submissions_set_updated_at
  before update on public.payment_submissions
  for each row execute function public.set_updated_at();

create or replace trigger library_settings_set_updated_at
  before update on public.library_settings
  for each row execute function public.set_updated_at();
