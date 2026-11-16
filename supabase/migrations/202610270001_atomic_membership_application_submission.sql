ALTER TABLE public.payment_submissions
  ADD COLUMN IF NOT EXISTS payer_phone text;

CREATE OR REPLACE FUNCTION public.submit_membership_application(
  p_member_id uuid,
  p_payment_method text,
  p_transaction_id text,
  p_payer_phone text,
  p_screenshot_path text,
  p_terms_version text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.member_profiles%ROWTYPE;
  v_fee numeric(12, 2);
  v_application_id uuid;
  v_transaction_id text := pg_catalog.upper(pg_catalog.btrim(p_transaction_id));
BEGIN
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('bkash', 'nagad')
    OR v_transaction_id IS NULL OR v_transaction_id !~ '^[A-Z0-9]{10}$'
    OR p_payer_phone IS NULL OR p_payer_phone NOT LIKE 'pii:v1:%'
    OR p_terms_version IS NULL OR pg_catalog.length(p_terms_version) > 64 THEN
    RAISE EXCEPTION 'Invalid membership payment details.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership profile not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.membership_status = 'active' THEN
    RAISE EXCEPTION 'This account already has an active membership.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.membership_applications AS application
    WHERE application.member_id = p_member_id
      AND application.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'A membership application is already pending or approved.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE pg_catalog.upper(payment.transaction_id) = v_transaction_id
      AND payment.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted for review.' USING ERRCODE = '23505';
  END IF;

  SELECT setting.value_number INTO v_fee
  FROM public.library_settings AS setting
  WHERE setting.key = 'membership_fee_bdt'
  FOR SHARE;
  IF v_fee IS NULL OR v_fee <= 0 THEN
    RAISE EXCEPTION 'The membership fee is not configured.' USING ERRCODE = '55000';
  END IF;

  IF p_screenshot_path IS NOT NULL AND p_screenshot_path NOT LIKE 'payment-proofs/' || p_member_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid payment proof path.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.membership_applications (
    member_id, amount_bdt, payment_method, transaction_id,
    payment_screenshot_path, terms_accepted_at, terms_version, status
  ) VALUES (
    p_member_id, v_fee, p_payment_method, v_transaction_id,
    p_screenshot_path, pg_catalog.clock_timestamp(), p_terms_version, 'pending'
  ) RETURNING id INTO v_application_id;

  INSERT INTO public.payment_submissions (
    member_id, payment_type, related_membership_application_id,
    payment_method, amount_bdt, transaction_id, payer_phone,
    screenshot_path, status
  ) VALUES (
    p_member_id, 'membership', v_application_id,
    p_payment_method, v_fee, v_transaction_id, p_payer_phone,
    p_screenshot_path, 'pending'
  );

  RETURN v_application_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_membership_application(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_membership_application(uuid, text, text, text, text, text) TO service_role;