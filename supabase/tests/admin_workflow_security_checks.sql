DO $$
BEGIN
  IF has_table_privilege('anon', 'public.admin_login_challenges', 'SELECT')
    OR has_table_privilege('authenticated', 'public.admin_login_challenges', 'SELECT')
    OR has_table_privilege('anon', 'public.admin_otp_send_limits', 'SELECT')
    OR has_table_privilege('authenticated', 'public.admin_otp_send_limits', 'SELECT') THEN
    RAISE EXCEPTION 'Pending admin OTP state and rate-limit records must remain server-only.';
  END IF;
  IF has_table_privilege('anon', 'public.member_auth_rate_limit_events', 'SELECT')
    OR has_table_privilege('authenticated', 'public.member_auth_rate_limit_events', 'SELECT')
    OR has_table_privilege('anon', 'public.member_auth_rate_limit_events', 'INSERT')
    OR has_table_privilege('authenticated', 'public.member_auth_rate_limit_events', 'INSERT')
    OR has_function_privilege('anon', 'public.consume_member_auth_rate_limit(text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.consume_member_auth_rate_limit(text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.consume_member_auth_rate_limit(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Member authentication rate limits must remain server-only.';
  END IF;
  IF has_function_privilege('anon', 'public.consume_admin_login_rate_limit(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.consume_admin_login_rate_limit(text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.consume_admin_login_rate_limit(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Admin login rate limiting must remain server-only.';
  END IF;
  IF has_function_privilege('anon', 'public.consume_admin_otp_send_limit(text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.consume_admin_otp_send_limit(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.consume_admin_otp_send_limit(text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.consume_admin_login_otp(text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.consume_admin_login_otp(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.consume_admin_login_otp(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Admin OTP and send-limit RPCs must remain restricted to service_role.';
  END IF;

  IF has_function_privilege('anon', 'public.review_membership_application(uuid,uuid,uuid,boolean,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.review_membership_application(uuid,uuid,uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Membership review RPC must not be executable by public/member roles.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.review_membership_application(uuid,uuid,uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trusted server role must be able to execute membership review RPC.';
  END IF;
  IF to_regprocedure('public.admin_approve_pending_member(uuid,uuid)') IS NOT NULL
    OR has_function_privilege('anon', 'public.admin_approve_pending_member(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_approve_pending_member(uuid,uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_approve_pending_member(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Manual member activation must require a selected plan and remain server-only.';
  END IF;
  IF has_function_privilege('anon', 'public.admin_assign_member_rental_plan(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_assign_member_rental_plan(uuid,uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_assign_member_rental_plan(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rental plan assignment must remain server-only.';
  END IF;

  IF has_function_privilege('anon', 'public.archive_admin_book(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.archive_admin_book(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Book archive RPC must not be executable by public/member roles.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.archive_admin_book(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trusted server role must be able to execute book archive RPC.';
  END IF;

  IF has_function_privilege('anon', 'public.approve_rental_request(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.approve_rental_request(uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.approve_rental_request(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Atomic rental review RPC grants are incorrect.';
  END IF;
  IF has_function_privilege('anon', 'public.handover_rental(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.handover_rental(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.handover_rental(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rental handover RPC grants are incorrect.';
  END IF;
  IF has_function_privilege('anon', 'public.receive_rental(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.receive_rental(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.receive_rental(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rental receipt RPC grants are incorrect.';
  END IF;
  IF has_function_privilege('anon', 'public.request_rental_return(uuid,text,integer,integer,integer,integer,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.request_rental_return(uuid,text,integer,integer,integer,integer,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.request_rental_return_core(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Member return RPC must require a review and keep its core private.';
  END IF;
  IF has_table_privilege('anon', 'public.book_reviews', 'SELECT')
    OR has_table_privilege('authenticated', 'public.book_reviews', 'SELECT')
    OR has_table_privilege('authenticated', 'public.book_reviews', 'INSERT')
    OR NOT has_function_privilege('anon', 'public.get_public_book_reviews(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.get_public_book_rating_summary(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.get_library_service_rating()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Book reviews must be private except for sanitized public rating RPCs.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.book_reviews'::pg_catalog.regclass
      AND conname = 'book_reviews_rental_id_key'
  ) THEN
    RAISE EXCEPTION 'A rental must not receive more than one book review.';
  END IF;
  IF has_function_privilege('anon', 'public.submit_subscription_renewal(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.submit_subscription_renewal(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Member renewal RPC grants are incorrect.';
  END IF;
  IF has_function_privilege('anon', 'public.review_member_payment_submission(uuid,uuid,boolean,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.review_member_payment_submission(uuid,uuid,boolean,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.review_member_payment_submission(uuid,uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Member payment review RPC grants are incorrect.';
  END IF;
  IF has_function_privilege('anon', 'public.admin_review_fine(uuid,uuid,text,numeric,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_review_fine(uuid,uuid,text,numeric,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_review_fine(uuid,uuid,text,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Fine adjustment RPC grants are incorrect.';
  END IF;
  IF has_function_privilege('anon', 'public.admin_send_fine_reminder(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_send_fine_reminder(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_send_fine_reminder(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Fine reminder RPC grants are incorrect.';
  END IF;
  IF has_table_privilege('authenticated', 'public.fine_ledger_adjustments', 'INSERT')
    OR has_table_privilege('authenticated', 'public.fine_ledger_adjustments', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.fine_ledger_adjustments', 'DELETE')
    OR has_table_privilege('authenticated', 'public.rental_return_receipts', 'INSERT')
    OR has_table_privilege('authenticated', 'public.rental_return_receipts', 'UPDATE') THEN
    RAISE EXCEPTION 'Members must not write admin fine audits or return receipts.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.rental_return_receipts', 'SELECT') THEN
    RAISE EXCEPTION 'Members must be able to read their own return receipts.';
  END IF;
  IF has_table_privilege('authenticated', 'public.rental_day_credits', 'INSERT')
    OR has_table_privilege('authenticated', 'public.rental_day_credits', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.rental_day_credits', 'DELETE') THEN
    RAISE EXCEPTION 'Members must not write rental-day credit records.';
  END IF;

  IF has_function_privilege('anon', 'public.get_next_book_reservation(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.get_next_book_reservation(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.get_next_book_reservation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIFO admin RPC grants are incorrect.';
  END IF;

  IF has_table_privilege('authenticated', 'public.fine_ledger', 'INSERT')
    OR has_table_privilege('authenticated', 'public.fine_ledger', 'UPDATE') THEN
    RAISE EXCEPTION 'Members must not write fine ledger records.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'payment-proofs' AND public IS FALSE
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png']
  ) THEN
    RAISE EXCEPTION 'Payment proof bucket must remain private with strict 5 MB image limits.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'member-ids' AND public IS FALSE
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png']
  ) THEN
    RAISE EXCEPTION 'Member ID bucket must remain private with strict 5 MB image limits.';
  END IF;
  IF has_column_privilege('authenticated', 'public.member_profiles', 'is_id_verified', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'is_id_verified', 'INSERT') THEN
    RAISE EXCEPTION 'Members must not approve their own ID verification.';
  END IF;
  IF has_column_privilege('authenticated', 'public.member_profiles', 'verification_status', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'verification_status', 'INSERT')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'rejection_reason', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'rejection_reason', 'INSERT') THEN
    RAISE EXCEPTION 'Members must not set their own ID verification status or rejection reason.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'member_profiles_verification_status_check'
      AND conrelid = 'public.member_profiles'::pg_catalog.regclass
  ) THEN
    RAISE EXCEPTION 'ID verification status and rejection reason must remain consistent.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.member_profiles', 'id_type', 'UPDATE')
    OR NOT has_column_privilege('authenticated', 'public.member_profiles', 'id_card_url', 'UPDATE') THEN
    RAISE EXCEPTION 'Members must be able to submit their own ID details and photo path.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN ('Members can update own identity files', 'Members can delete own identity files')
  ) THEN
    RAISE EXCEPTION 'Members must not alter or delete ID files after upload.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'rental_requests_require_verified_member'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'reservations_require_verified_member'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Rental and reservation inserts must enforce ID verification.';
  END IF;

  IF has_function_privilege('anon', 'public.apply_membership_with_wallet(uuid,uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.apply_membership_with_wallet(uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.apply_membership_with_wallet(uuid,uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.submit_first_rental_request_with_wallet(uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.submit_first_rental_request_with_wallet(uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.submit_first_rental_request_with_wallet(uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Wallet checkout RPCs must remain restricted to service_role.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.wallet_transactions'::pg_catalog.regclass
      AND conname = 'wallet_transactions_type_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%MEMBERSHIP_APPLICATION%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%RENTAL_PAYMENT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.wallet_transactions'::pg_catalog.regclass
      AND conname = 'wallet_transactions_payment_method_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%WALLET%'
  ) THEN
    RAISE EXCEPTION 'Wallet ledger must support direct membership and rental payments.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.membership_applications'::pg_catalog.regclass
      AND conname = 'membership_applications_payment_method_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%WALLET%'
  ) THEN
    RAISE EXCEPTION 'Membership applications must allow wallet-paid records.';
  END IF;
  IF pg_catalog.position('User ID not verified.' IN pg_catalog.pg_get_functiondef(
       'public.submit_wallet_transaction(numeric,text,text,text,text)'::pg_catalog.regprocedure
     )) = 0
    OR pg_catalog.position('User ID not verified.' IN pg_catalog.pg_get_functiondef(
       'public.submit_subscription_renewal(text,text)'::pg_catalog.regprocedure
     )) = 0 THEN
    RAISE EXCEPTION 'Direct wallet top-up and renewal RPCs must enforce ID verification.';
  END IF;

  IF has_function_privilege('anon', 'public.admin_extend_member_validity(uuid,uuid,integer,date)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_extend_member_validity(uuid,uuid,integer,date)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_extend_member_validity(uuid,uuid,integer,date)', 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS schema ON schema.oid = relation.relnamespace
      WHERE schema.nspname = 'public'
        AND relation.relname = 'member_membership_extension_audit'
        AND relation.relrowsecurity
    )
    OR has_table_privilege('anon', 'public.member_membership_extension_audit', 'SELECT')
    OR has_table_privilege('authenticated', 'public.member_membership_extension_audit', 'SELECT') THEN
    RAISE EXCEPTION 'Membership validity extension and audit records must remain admin/service-role only.';
  END IF;

  IF has_function_privilege('anon', 'public.admin_extend_rental_due_date(uuid,uuid,integer,date)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_extend_rental_due_date(uuid,uuid,integer,date)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_extend_rental_due_date(uuid,uuid,integer,date)', 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS schema ON schema.oid = relation.relnamespace
      WHERE schema.nspname = 'public'
        AND relation.relname = 'rental_due_date_extension_audit'
        AND relation.relrowsecurity
    )
    OR has_table_privilege('anon', 'public.rental_due_date_extension_audit', 'SELECT')
    OR has_table_privilege('authenticated', 'public.rental_due_date_extension_audit', 'SELECT') THEN
    RAISE EXCEPTION 'Rental due-date extension and audit records must remain admin/service-role only.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.membership_applications', 'INSERT')
    OR has_table_privilege('authenticated', 'public.membership_applications', 'INSERT')
    OR has_table_privilege('anon', 'public.payment_submissions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.payment_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'Members must submit payment and membership records only through trusted server workflows.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN ('Members can update own payment proof files', 'Members can delete own payment proof files')
  ) THEN
    RAISE EXCEPTION 'Members must not alter or delete payment proof files after upload.';
  END IF;

  IF pg_catalog.position(
    'member.full_name' IN pg_catalog.pg_get_functiondef('public.get_public_book_reviews(uuid)'::pg_catalog.regprocedure)
  ) > 0 THEN
    RAISE EXCEPTION 'Public book reviews must not expose member profile names.';
  END IF;
END;
$$;
