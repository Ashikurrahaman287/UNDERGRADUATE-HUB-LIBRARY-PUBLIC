-- Tighten membership application and payment-submission access so members only submit their own pending records.
-- Keep admin review flows available through trusted server-side workflows and the service role.

revoke all on public.membership_applications from authenticated;
revoke all on public.payment_submissions from authenticated;

grant select on public.membership_applications to authenticated;
grant insert on public.membership_applications to authenticated;
grant select on public.payment_submissions to authenticated;
grant insert on public.payment_submissions to authenticated;

grant all on public.membership_applications to service_role;
grant all on public.payment_submissions to service_role;

drop policy if exists "Members see their own membership applications" on public.membership_applications;
drop policy if exists "Members can create their own membership applications" on public.membership_applications;
drop policy if exists "Members can update their own pending application" on public.membership_applications;
drop policy if exists "Read own payment submissions" on public.payment_submissions;
drop policy if exists "Create own payment submissions" on public.payment_submissions;
drop policy if exists "Update own payment submissions before review" on public.payment_submissions;

create policy "Members read their own applications"
on public.membership_applications for select to authenticated
using (
  member_id in (
    select id from public.member_profiles where user_id = auth.uid()
  )
);

create policy "Members submit their own pending application"
on public.membership_applications for insert to authenticated
with check (
  member_id in (
    select id from public.member_profiles where user_id = auth.uid()
  )
  and status = 'pending'
  and amount_bdt > 0
  and payment_method in ('bkash', 'nagad')
  and transaction_id is not null
  and length(transaction_id) >= 6
);

create policy "Members read their own payment submissions"
on public.payment_submissions for select to authenticated
using (
  member_id in (
    select id from public.member_profiles where user_id = auth.uid()
  )
);

create policy "Members submit their own pending payment"
on public.payment_submissions for insert to authenticated
with check (
  member_id in (
    select id from public.member_profiles where user_id = auth.uid()
  )
  and payment_type = 'membership'
  and status = 'pending'
  and amount_bdt > 0
  and payment_method in ('bkash', 'nagad')
  and transaction_id is not null
  and length(transaction_id) >= 6
);

-- Members are intentionally not granted update/delete privileges on application or payment records.
-- Admin review and approval must remain server-driven and require trusted admin workflows.
