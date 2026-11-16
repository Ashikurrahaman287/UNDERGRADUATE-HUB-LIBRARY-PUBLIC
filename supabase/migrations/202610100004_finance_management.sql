ALTER TABLE public.admin_sessions
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category text NOT NULL CHECK (
    category IN (
      'Subscription Fees',
      'Fine Payments',
      'Book Sales',
      'Sponsorships',
      'Others',
      'Book Purchases',
      'Web Hosting / Vercel',
      'Marketing',
      'Operations',
      'Maintenance'
    )
  ),
  amount_bdt numeric(12,2) NOT NULL CHECK (amount_bdt > 0),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  payment_method text NOT NULL DEFAULT 'Cash',
  external_ref text,
  created_by_admin_session_id uuid REFERENCES public.admin_sessions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_transactions_date_idx
  ON public.finance_transactions (transaction_date DESC);

CREATE INDEX IF NOT EXISTS finance_transactions_type_category_idx
  ON public.finance_transactions (entry_type, category);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_transactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.finance_transactions TO service_role;

DROP POLICY IF EXISTS "Finance admins manage transactions" ON public.finance_transactions;
CREATE POLICY "Finance admins manage transactions"
  ON public.finance_transactions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_transactions_set_updated_at ON public.finance_transactions;
CREATE TRIGGER finance_transactions_set_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.auto_log_approved_finance_entry(
  p_payment_id uuid,
  p_admin_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payment public.payment_submissions%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM public.payment_submissions
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.status <> 'approved' THEN
    RETURN;
  END IF;

  IF v_payment.payment_type = 'fine' THEN
    INSERT INTO public.finance_transactions (
      entry_type,
      category,
      amount_bdt,
      transaction_date,
      description,
      payment_method,
      external_ref,
      created_by_admin_session_id
    )
    SELECT
      'income',
      'Fine Payments',
      v_payment.amount_bdt,
      CURRENT_DATE,
      'Fine payment approved for member ' || member.full_name,
      v_payment.payment_method,
      v_payment.transaction_id,
      p_admin_session_id
    FROM public.member_profiles AS member
    WHERE member.id = v_payment.member_id;
  ELSIF v_payment.payment_type = 'renewal' THEN
    INSERT INTO public.finance_transactions (
      entry_type,
      category,
      amount_bdt,
      transaction_date,
      description,
      payment_method,
      external_ref,
      created_by_admin_session_id
    )
    SELECT
      'income',
      'Subscription Fees',
      v_payment.amount_bdt,
      CURRENT_DATE,
      'Subscription renewal approved for member ' || member.full_name,
      v_payment.payment_method,
      v_payment.transaction_id,
      p_admin_session_id
    FROM public.member_profiles AS member
    WHERE member.id = v_payment.member_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_member_payment_submission(
  p_payment_id uuid,
  p_reviewer_session_id uuid,
  p_approve boolean,
  p_admin_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_payment public.payment_submissions%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_total_outstanding numeric(10,2);
  v_note text := pg_catalog.left(pg_catalog.btrim(COALESCE(p_admin_note, '')), 1000);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'A review decision is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_submissions AS payment
  WHERE payment.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.payment_type NOT IN ('fine', 'renewal') THEN
    RAISE EXCEPTION 'Fine or renewal payment not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN CASE
      WHEN v_payment.status = 'approved' THEN 'already_approved'
      ELSE 'already_rejected'
    END;
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = v_payment.member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_approve AND v_payment.payment_type = 'fine' THEN
    SELECT COALESCE(pg_catalog.sum(fine.amount_bdt), 0)
    INTO v_total_outstanding
    FROM public.fine_ledger AS fine
    WHERE fine.member_id = v_member.id
      AND fine.status = 'outstanding';

    IF v_payment.related_fine_id IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM public.fine_ledger AS anchor
            WHERE anchor.id = v_payment.related_fine_id
              AND anchor.member_id = v_member.id
              AND anchor.status = 'outstanding'
          )
       OR v_total_outstanding <= 0
       OR v_total_outstanding <> v_payment.amount_bdt THEN
      RAISE EXCEPTION 'The submitted fine payment no longer matches the member outstanding balance.' USING ERRCODE = '23514';
    END IF;
  ELSIF p_approve AND v_payment.payment_type = 'renewal' THEN
    IF v_member.membership_status <> 'active' OR v_member.current_plan_id IS NULL THEN
      RAISE EXCEPTION 'The member is not eligible for renewal.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans AS plan
    WHERE plan.id = v_member.current_plan_id
      AND plan.is_active = true
      AND plan.duration_days = 30
    FOR SHARE;

    IF NOT FOUND OR v_payment.amount_bdt <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'The renewal amount does not match the active 30-day plan.' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = v_member.id
        AND subscription.plan_id = v_plan.id
        AND subscription.status = 'active'
        AND subscription.ends_at > v_now
    ) THEN
      RAISE EXCEPTION 'The member already has an active 30-day cycle.' USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.payment_submissions AS payment
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_at = v_now,
      reviewed_by = p_reviewer_session_id,
      admin_note = NULLIF(v_note, '')
  WHERE payment.id = v_payment.id
    AND payment.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment was already reviewed.' USING ERRCODE = '55000';
  END IF;

  IF NOT p_approve THEN
    RETURN 'rejected';
  END IF;

  IF v_payment.payment_type = 'fine' THEN
    UPDATE public.fine_ledger AS fine
    SET status = 'paid',
        paid_at = v_now,
        payment_submission_id = v_payment.id
    WHERE fine.member_id = v_member.id
      AND fine.status = 'outstanding';
  ELSE
    UPDATE public.member_subscriptions AS subscription
    SET status = 'expired',
        updated_at = v_now
    WHERE subscription.member_id = v_member.id
      AND subscription.status = 'active';

    INSERT INTO public.member_subscriptions (
      member_id,
      plan_id,
      plan_name_snapshot,
      plan_price_snapshot,
      status,
      started_at,
      ends_at
    ) VALUES (
      v_member.id,
      v_plan.id,
      v_plan.name,
      v_plan.price_bdt,
      'active',
      v_now,
      v_now + pg_catalog.make_interval(days => 30)
    );

    UPDATE public.member_profiles
    SET current_plan_id = v_plan.id,
        updated_at = v_now
    WHERE id = v_member.id;
  END IF;

  PERFORM public.auto_log_approved_finance_entry(v_payment.id, p_reviewer_session_id);
  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.review_member_payment_submission(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_member_payment_submission(uuid, uuid, boolean, text) TO service_role;
