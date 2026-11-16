-- Practical security checks for member profile and subscription access.
-- Run these in a Supabase SQL editor or local test project with a member auth user context.

-- 1. Authenticated member can read their own profile
select exists (
  select 1
  from public.member_profiles mp
  where mp.user_id = auth.uid()
);

-- 2. Member cannot read another member profile
select count(*)
from public.member_profiles mp
where mp.user_id <> auth.uid();
-- Expect: 0 from a member-scoped query in a policy-protected environment.

-- 3. Member cannot change their own membership_status to active
update public.member_profiles
set membership_status = 'active'
where user_id = auth.uid();
-- Expect: denied by column permissions and RLS.

-- 4. Member cannot change their own plan ID
update public.member_profiles
set current_plan_id = gen_random_uuid()
where user_id = auth.uid();
-- Expect: denied by column permissions and RLS.

-- 5. Member cannot change user_id
update public.member_profiles
set user_id = gen_random_uuid()
where user_id = auth.uid();
-- Expect: denied by policy with user_id = auth.uid().

-- 6. Members cannot write profile fields directly through PostgREST.
-- The server actions validate ownership and encrypt identity values before service-role writes.
update public.member_profiles
set full_name = 'Updated Name', phone = '01700000000', email = 'member@example.com', address = 'Dhaka'
where user_id = auth.uid();
-- Expect: denied to authenticated; submit changes through the member profile action.

-- 7. Member cannot create a subscription directly
insert into public.member_subscriptions (member_id, plan_id, plan_name_snapshot, plan_price_snapshot, status)
values (
  (select id from public.member_profiles where user_id = auth.uid()),
  gen_random_uuid(),
  'Test Plan',
  99.00,
  'active'
);
-- Expect: denied by lack of insert grant in member policy scope.

-- 8. Member cannot modify or delete their own subscription
update public.member_subscriptions
set status = 'expired'
where member_id = (select id from public.member_profiles where user_id = auth.uid());

delete from public.member_subscriptions
where member_id = (select id from public.member_profiles where user_id = auth.uid());
-- Expect: denied by missing update/delete privileges.

-- 9. Direct member profile inserts are disabled.
insert into public.member_profiles (user_id, full_name, phone, email, address)
values (
  auth.uid(),
  'New Member',
  '01700000000',
  'new@example.com',
  'Khulna'
);
-- Expect: denied to authenticated; the server action creates profiles for the verified session user.

-- 10. Administrative subscription workflows retain required permissions
-- This should remain handled by service-role/admin server-side workflows, not by member actions.
-- Expect: successful in trusted server-side code using the service role or an approved admin path.

select has_column_privilege('authenticated', 'public.member_profiles', 'address', 'UPDATE') as member_can_write_address,
       has_column_privilege('authenticated', 'public.member_profiles', 'id_number', 'INSERT') as member_can_insert_id_number,
       has_column_privilege('authenticated', 'public.member_profiles', 'dob', 'UPDATE') as member_can_write_dob;
-- Expect: all values are false.

-- 11. Run the following checks with an authenticated member JWT context.
select count(*)
from public.notifications notification
where notification.member_id not in (
  select id from public.member_profiles where user_id = auth.uid()
);
-- Expect: 0; RLS must hide notifications owned by other members.

select has_table_privilege('authenticated', 'public.notifications', 'INSERT') as member_can_insert_notifications,
       has_table_privilege('authenticated', 'public.notifications', 'UPDATE') as member_can_update_notifications;
-- Expect: both values are false; members can only use the read-state RPC.

select has_function_privilege('authenticated', 'public.mark_member_notification_read(uuid)', 'EXECUTE') as member_can_mark_read;
-- Expect: true.

do $$
declare
  v_own_notification_id uuid;
begin
  select notification.id into v_own_notification_id
  from public.notifications as notification
  join public.member_profiles as member on member.id = notification.member_id
  where member.user_id = auth.uid()
  order by notification.created_at desc
  limit 1;

  if v_own_notification_id is not null
    and public.mark_member_notification_read(v_own_notification_id) is not true then
    raise exception 'A member could not mark their own notification as read.';
  end if;

  if public.mark_member_notification_read(gen_random_uuid()) is not false then
    raise exception 'A member marked a notification they do not own as read.';
  end if;
end;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_profiles'
      AND column_name = 'id_verification_submitted_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'Member ID verification submission time must be persisted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE schema.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname = ANY (ARRAY[
        'admin_login_attempts', 'admin_login_challenges', 'admin_otp_send_limits', 'admin_sessions',
        'book_reviews', 'books', 'categories', 'fine_accrual_control', 'fine_accrual_cursors',
        'fine_ledger', 'fine_ledger_adjustments', 'finance_transactions', 'library_settings',
        'job_applications', 'jobs', 'member_profiles', 'member_subscriptions', 'membership_applications', 'notifications',
        'payment_submissions', 'payment_transaction_id_claims', 'referrals', 'referral_rewards', 'rental_day_credits',
        'rental_requests', 'rental_return_receipts', 'rentals', 'reservation_requests',
        'subscription_plans', 'wallet_transactions', 'member_auth_rate_limit_events',
        'member_membership_extension_audit', 'rental_due_date_extension_audit'
      ]::name[])
      AND NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Every public application table must have row-level security enabled.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE schema.nspname = 'public'
      AND relation.relname = 'payment_transaction_id_claims'
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Transaction ID claims must remain protected by RLS.';
  END IF;

  IF has_table_privilege('anon', 'public.payment_transaction_id_claims', 'SELECT')
    OR has_table_privilege('authenticated', 'public.payment_transaction_id_claims', 'SELECT')
    OR has_table_privilege('service_role', 'public.payment_transaction_id_claims', 'SELECT') THEN
    RAISE EXCEPTION 'Transaction ID claim records must not be directly readable by API roles.';
  END IF;

  IF has_function_privilege('authenticated', 'public.submit_wallet_transaction(numeric,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.submit_wallet_transaction(numeric,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Disabled wallet submissions must not remain callable through Supabase RPC.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payment_transaction_id_claims AS claim
      WHERE claim.transaction_id = pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(payment.transaction_id), '[[:space:]]+', '', 'g'))
    )
  ) OR EXISTS (
    SELECT 1 FROM public.wallet_transactions AS transaction
    WHERE transaction.payment_method <> 'WALLET'
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transaction_id_claims AS claim
        WHERE claim.transaction_id = pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(transaction.trx_id), '[[:space:]]+', '', 'g'))
      )
  ) THEN
    RAISE EXCEPTION 'All historical external transaction IDs must remain permanently claimed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'payment_submissions_claim_transaction_id' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'payment_submissions_unique_approval' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'wallet_transactions_claim_transaction_id' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'wallet_transactions_unique_approval' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Payment transaction IDs must be claimed at insert and checked before approval.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals'
      AND column_name = 'completed_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.referrals'::pg_catalog.regclass
      AND conname = 'referrals_status_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%completed%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'member_profiles_complete_referral_on_activation' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'member_profiles_complete_referral_on_insert' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'rental_requests_complete_referral_on_approval' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Referral completion time, status, and approval triggers must be installed.';
  END IF;

  IF has_function_privilege('anon', 'public.reward_pending_member_referrals(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.reward_pending_member_referrals(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Referral completion must remain trigger-only and server-managed.';
  END IF;

  IF has_table_privilege('authenticated', 'public.referral_rewards', 'INSERT')
    OR has_table_privilege('authenticated', 'public.referral_rewards', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.referral_rewards', 'DELETE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = 'public.referral_rewards'::pg_catalog.regclass
        AND polname = 'Members can read their referral rewards'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgname = 'member_subscriptions_apply_locked_referral_rewards' AND NOT tgisinternal
    ) THEN
    RAISE EXCEPTION 'Locked referral rewards must be member read-only and automatically released on subscription insert.';
  END IF;

  IF has_table_privilege('anon', 'public.jobs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.jobs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.jobs', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.jobs', 'DELETE')
    OR has_table_privilege('anon', 'public.job_applications', 'SELECT')
    OR has_table_privilege('authenticated', 'public.job_applications', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.job_applications', 'DELETE')
    OR NOT has_table_privilege('authenticated', 'public.job_applications', 'SELECT') THEN
    RAISE EXCEPTION 'Career postings and applications must retain public-read/owner-read and server-only admin writes.';
  END IF;

  IF NOT has_table_privilege('anon', 'public.jobs', 'SELECT')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = 'public.jobs'::pg_catalog.regclass
        AND polname = 'Public can read active jobs'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = 'public.job_applications'::pg_catalog.regclass
        AND polname = 'Users can view their own applications'
        AND polcmd = 'r'
        AND pg_catalog.pg_get_expr(polqual, polrelid) ~* 'user_id[[:space:]]*=[[:space:]]*auth\.uid\(\)'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = 'public.job_applications'::pg_catalog.regclass
        AND polname = 'Applicants can submit their own application to active jobs'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgname = 'job_applications_validate_submission' AND NOT tgisinternal
    ) THEN
    RAISE EXCEPTION 'Career reads, owner-scoped application policies, and server-side field validation must remain enabled.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'career-submissions' AND public IS FALSE
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
  ) OR NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'career-banners' AND public IS TRUE
  ) THEN
    RAISE EXCEPTION 'Career application files must remain private and only job banners public.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'book-covers' AND public IS TRUE
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png']
  ) OR NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'career-banners' AND public IS TRUE
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png']
  ) THEN
    RAISE EXCEPTION 'Public image buckets must retain strict 5 MB JPEG/PNG limits.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books'
      AND column_name = 'reviews' AND data_type = 'jsonb'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.books'::pg_catalog.regclass
      AND conname = 'books_admin_reviews_array_check'
  ) THEN
    RAISE EXCEPTION 'Admin-curated book reviews must use a constrained JSONB array.';
  END IF;
END;
$$;
