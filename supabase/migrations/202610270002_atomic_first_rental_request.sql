CREATE OR REPLACE FUNCTION public.submit_first_rental_request(
  p_member_id uuid,
  p_book_id uuid,
  p_reservation_request_id uuid,
  p_plan_id uuid,
  p_amount_bdt numeric,
  p_payment_method text,
  p_transaction_id text,
  p_payer_phone text,
  p_screenshot_path text,
  p_terms_version text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_request_id uuid;
  v_transaction_id text := pg_catalog.upper(pg_catalog.btrim(p_transaction_id));
BEGIN
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('bkash', 'nagad')
    OR v_transaction_id IS NULL OR v_transaction_id !~ '^[A-Z0-9]{10}$'
    OR p_payer_phone IS NULL OR p_payer_phone NOT LIKE 'pii:v1:%'
    OR p_terms_version IS NULL OR pg_catalog.length(p_terms_version) > 64 THEN
    RAISE EXCEPTION 'Invalid first rental payment details.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.membership_status <> 'active'
    OR v_member.is_id_verified IS NOT TRUE OR v_member.id_card_url IS NULL
    OR v_member.current_plan_id IS DISTINCT FROM p_plan_id THEN
    RAISE EXCEPTION 'An active, verified member with the assigned rental plan is required.' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = p_member_id
  ) THEN
    RAISE EXCEPTION 'A first rental subscription payment is not available for this account.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = p_plan_id
  FOR SHARE;
  IF NOT FOUND OR v_plan.is_active IS NOT TRUE OR v_plan.duration_days <> 30
    OR v_plan.price_bdt <> p_amount_bdt OR p_amount_bdt <= 0 THEN
    RAISE EXCEPTION 'The first rental amount must match an active 30-day plan.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = p_book_id
  FOR UPDATE;
  IF NOT FOUND OR v_book.is_active IS NOT TRUE OR v_book.availability <> 'available' THEN
    RAISE EXCEPTION 'This book is not available for a rental request.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rental_requests AS request
    WHERE request.member_id = p_member_id
      AND request.book_id = p_book_id
      AND request.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'A rental request for this book already exists.' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE pg_catalog.upper(payment.transaction_id) = v_transaction_id
      AND payment.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted for review.' USING ERRCODE = '23505';
  END IF;

  IF p_screenshot_path IS NOT NULL AND p_screenshot_path NOT LIKE 'payment-proofs/' || p_member_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid payment proof path.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rental_requests (
    member_id, book_id, reservation_request_id, subscription_plan_id,
    rental_day_credit_id, amount_bdt, terms_accepted_at, terms_version, status
  ) VALUES (
    p_member_id, p_book_id, p_reservation_request_id, p_plan_id,
    NULL, p_amount_bdt, pg_catalog.clock_timestamp(), p_terms_version, 'pending'
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.payment_submissions (
    member_id, payment_type, related_rental_request_id, payment_method,
    amount_bdt, transaction_id, payer_phone, screenshot_path, status
  ) VALUES (
    p_member_id, 'rental', v_request_id, p_payment_method,
    p_amount_bdt, v_transaction_id, p_payer_phone, p_screenshot_path, 'pending'
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_first_rental_request(uuid, uuid, uuid, uuid, numeric, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_first_rental_request(uuid, uuid, uuid, uuid, numeric, text, text, text, text, text) TO service_role;