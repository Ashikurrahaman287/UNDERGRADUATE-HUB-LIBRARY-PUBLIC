-- Harden member-side rental requests and issued-rental access.
-- This migration is forward-only and does not alter already-applied production migrations.

create unique index if not exists rental_requests_member_book_pending_idx
  on public.rental_requests (member_id, book_id)
  where status in ('pending', 'approved');

revoke update on public.rental_requests from authenticated;
revoke insert, update, delete on public.rentals from authenticated;

-- Rental requests: members may only read their own records and create new pending requests.
-- They may not alter approval, reviewer, or financial fields after creation.
drop policy if exists "Members see own rental requests" on public.rental_requests;
create policy "Members see own rental requests"
  on public.rental_requests for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

drop policy if exists "Members create own rental requests" on public.rental_requests;
create policy "Members create own rental requests"
  on public.rental_requests for insert to authenticated
  with check (
    member_id in (select id from public.member_profiles where user_id = auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
    and amount_bdt > 0
  );

drop policy if exists "Members update own pending rental requests" on public.rental_requests;

-- Issued rentals: members may read only their own rentals, but may not insert, update, or delete issued records.
drop policy if exists "Members see own rentals" on public.rentals;
create policy "Members see own rentals"
  on public.rentals for select to authenticated
  using (member_id in (select id from public.member_profiles where user_id = auth.uid()));

-- Members cannot create or alter issued rentals. Admin workflows remain authorized via service role.
-- The public read access on books is preserved; members still cannot update books directly.
