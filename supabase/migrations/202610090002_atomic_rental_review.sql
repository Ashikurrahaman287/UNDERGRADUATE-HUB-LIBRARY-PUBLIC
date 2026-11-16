-- Atomic admin review for rental requests. Apply as a forward-only migration.

alter table public.rentals
  add column if not exists rental_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'rentals_rental_request_id_fkey'
      AND conrelid = 'public.rentals'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.rentals
      ADD CONSTRAINT rentals_rental_request_id_fkey
      FOREIGN KEY (rental_request_id)
      REFERENCES public.rental_requests(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'payment_submissions_related_rental_request_id_fkey'
      AND conrelid = 'public.payment_submissions'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.payment_submissions
      ADD CONSTRAINT payment_submissions_related_rental_request_id_fkey
      FOREIGN KEY (related_rental_request_id)
      REFERENCES public.rental_requests(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS rentals_rental_request_unique_idx
  ON public.rentals (rental_request_id)
  WHERE rental_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rental_payment_per_request_unique_idx
  ON public.payment_submissions (related_rental_request_id)
  WHERE payment_type = 'rental' AND related_rental_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.approve_rental_request(
  p_request_id uuid,
  p_reviewer_session_id uuid,
  p_admin_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.rental_requests%ROWTYPE;
  v_payment public.payment_submissions%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_subscription public.member_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_started_at timestamptz := clock_timestamp();
  v_note text := COALESCE(NULLIF(pg_catalog.btrim(p_admin_note), ''), 'Rental approved.');
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS s
    WHERE s.id = p_reviewer_session_id
      AND s.expires_at > v_started_at
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.rental_requests AS rr
  WHERE rr.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status = 'approved' THEN
    RETURN 'already_approved';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending rental requests can be approved.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS mp
  WHERE mp.id = v_request.member_id
  FOR SHARE;
  IF NOT FOUND OR v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'The member is not eligible for rental.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_subscription
  FROM public.member_subscriptions AS ms
  WHERE ms.member_id = v_request.member_id
    AND ms.plan_id = v_request.subscription_plan_id
    AND ms.status = 'active'
    AND ms.ends_at > v_started_at
  ORDER BY ms.ends_at DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The member does not have a current subscription for this plan.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS sp
  WHERE sp.id = v_request.subscription_plan_id
    AND sp.is_active = true
  FOR SHARE;
  IF NOT FOUND OR v_plan.price_bdt <= 0 OR v_request.amount_bdt <> v_plan.price_bdt THEN
    RAISE EXCEPTION 'The request price does not match its active subscription plan.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_submissions AS ps
  WHERE ps.payment_type = 'rental'
    AND ps.related_rental_request_id = v_request.id
  FOR UPDATE;
  IF NOT FOUND
    OR v_payment.member_id <> v_request.member_id
    OR v_payment.status <> 'pending'
    OR v_payment.amount_bdt <> v_request.amount_bdt THEN
    RAISE EXCEPTION 'A matching pending rental payment is required.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS b
  WHERE b.id = v_request.book_id
  FOR UPDATE;
  IF NOT FOUND OR v_book.is_active IS NOT TRUE OR v_book.availability <> 'available' THEN
    RAISE EXCEPTION 'The requested book is no longer available.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.rentals AS r
    WHERE r.rental_request_id = v_request.id
       OR (r.book_id = v_request.book_id AND r.status IN ('pending', 'active', 'overdue'))
  ) THEN
    RAISE EXCEPTION 'A conflicting rental already exists.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.rentals (
    rental_request_id,
    member_id,
    book_id,
    subscription_plan_id,
    plan_name_snapshot,
    plan_price_snapshot,
    started_at,
    subscription_ends_at,
    status
  ) VALUES (
    v_request.id,
    v_request.member_id,
    v_request.book_id,
    v_plan.id,
    v_plan.name,
    v_plan.price_bdt,
    v_started_at,
    v_started_at + pg_catalog.make_interval(days => v_plan.duration_days),
    'active'
  );

  UPDATE public.books AS b
  SET availability = 'unavailable', updated_at = v_started_at
  WHERE b.id = v_book.id AND b.availability = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested book is no longer available.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rental_requests AS rr
  SET status = 'approved', reviewed_at = v_started_at,
      reviewed_by = p_reviewer_session_id, admin_note = v_note
  WHERE rr.id = v_request.id AND rr.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental request was already processed.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.payment_submissions AS ps
  SET status = 'approved', reviewed_at = v_started_at,
      reviewed_by = p_reviewer_session_id, admin_note = v_note
  WHERE ps.id = v_payment.id AND ps.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental payment was already processed.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status)
  VALUES (
    v_request.member_id,
    'rental_approved',
    'Rental request approved',
    pg_catalog.format('Your rental request for %s has been approved.', v_book.title),
    'in_app',
    'pending'
  );

  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_rental_request(
  p_request_id uuid,
  p_reviewer_session_id uuid,
  p_admin_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.rental_requests%ROWTYPE;
  v_payment public.payment_submissions%ROWTYPE;
  v_started_at timestamptz := clock_timestamp();
  v_note text := COALESCE(NULLIF(pg_catalog.btrim(p_admin_note), ''), 'Rental request rejected.');
  v_has_payment boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS s
    WHERE s.id = p_reviewer_session_id
      AND s.expires_at > v_started_at
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.rental_requests AS rr
  WHERE rr.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status = 'rejected' THEN
    RETURN 'already_rejected';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending rental requests can be rejected.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_submissions AS ps
  WHERE ps.payment_type = 'rental'
    AND ps.related_rental_request_id = v_request.id
  FOR UPDATE;

  v_has_payment := FOUND;
  IF v_has_payment AND v_payment.member_id <> v_request.member_id THEN
    RAISE EXCEPTION 'The rental payment does not belong to this member.' USING ERRCODE = '23514';
  END IF;
  IF v_has_payment AND v_payment.status = 'approved' THEN
    RAISE EXCEPTION 'An approved payment cannot be rejected as a pending request.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.rental_requests AS rr
  SET status = 'rejected', reviewed_at = v_started_at,
      reviewed_by = p_reviewer_session_id, admin_note = v_note
  WHERE rr.id = v_request.id AND rr.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental request was already processed.' USING ERRCODE = '55000';
  END IF;

  IF v_has_payment AND v_payment.status = 'pending' THEN
    UPDATE public.payment_submissions AS ps
    SET status = 'rejected', reviewed_at = v_started_at,
        reviewed_by = p_reviewer_session_id, admin_note = v_note
    WHERE ps.id = v_payment.id AND ps.status = 'pending';
  END IF;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status)
  VALUES (v_request.member_id, 'rental_rejected', 'Rental request rejected', v_note, 'in_app', 'pending');

  RETURN 'rejected';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rental_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_rental_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rental_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_rental_request(uuid, uuid, text) TO service_role;
