-- Harden member profile and subscription access so members only manage their own personal data.
-- This is a follow-up migration for the member account tables that were created earlier.

revoke all on public.member_profiles from authenticated;
revoke all on public.member_subscriptions from authenticated;

grant select on public.member_profiles to authenticated;
grant insert (user_id, full_name, phone, email, address) on public.member_profiles to authenticated;
grant update (full_name, phone, email, address) on public.member_profiles to authenticated;

grant select on public.member_subscriptions to authenticated;

drop policy if exists "Members see their own profile" on public.member_profiles;
drop policy if exists "Members can insert their own profile" on public.member_profiles;
drop policy if exists "Members can update their own profile" on public.member_profiles;
drop policy if exists "Members see their own subscriptions" on public.member_subscriptions;
drop policy if exists "Members can create their own subscriptions" on public.member_subscriptions;

create policy "Members can read their own profile"
on public.member_profiles for select to authenticated
using (user_id = auth.uid());

create policy "Members can create their own profile"
on public.member_profiles for insert to authenticated
with check (
  user_id = auth.uid()
  and full_name is not null
  and phone is not null
  and membership_status = 'pending'
);

create policy "Members can update only their own profile data"
on public.member_profiles for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and full_name is not null
  and phone is not null
);

create policy "Members can read their own subscriptions"
on public.member_subscriptions for select to authenticated
using (member_id in (
  select id from public.member_profiles where user_id = auth.uid()
));

-- No authenticated member insert/update/delete policies are defined below.
-- Subscription creation and updates remain restricted to trusted server-side/admin workflows.
