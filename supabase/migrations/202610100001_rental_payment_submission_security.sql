-- Allow members to submit rental payments only for their own pending rental requests.
-- Membership payment rules remain unchanged; renewals and fines stay server-managed.

drop policy if exists "Members submit their own pending payment"
  on public.payment_submissions;

create policy "Members submit their own pending payment"
  on public.payment_submissions for insert to authenticated
  with check (
    member_id in (
      select id from public.member_profiles where user_id = auth.uid()
    )
    and status = 'pending'
    and amount_bdt > 0
    and payment_method in ('bkash', 'nagad')
    and transaction_id is not null
    and length(transaction_id) >= 6
    and (
      payment_type = 'membership'
      or (
        payment_type = 'rental'
        and related_rental_request_id is not null
        and exists (
          select 1
          from public.rental_requests as rental_request
          where rental_request.id = payment_submissions.related_rental_request_id
            and rental_request.member_id = payment_submissions.member_id
            and rental_request.member_id in (
              select id from public.member_profiles where user_id = auth.uid()
            )
            and rental_request.status = 'pending'
            and rental_request.amount_bdt = payment_submissions.amount_bdt
        )
      )
    )
  );