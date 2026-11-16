ALTER TABLE public.membership_applications
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

ALTER TABLE public.rental_requests
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

DROP POLICY IF EXISTS "Members submit their own pending application" ON public.membership_applications;
CREATE POLICY "Members submit their own pending application"
  ON public.membership_applications FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid())
    AND status = 'pending'
    AND amount_bdt > 0
    AND payment_method IN ('bkash', 'nagad')
    AND transaction_id IS NOT NULL
    AND length(transaction_id) >= 6
    AND terms_accepted_at IS NOT NULL
    AND terms_version = '2026-10-17'
  );

DROP POLICY IF EXISTS "Members create own rental requests" ON public.rental_requests;
CREATE POLICY "Members create own rental requests"
  ON public.rental_requests FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_note IS NULL
    AND subscription_plan_id IS NOT NULL
    AND rental_day_credit_id IS NULL
    AND amount_bdt >= 0
    AND terms_accepted_at IS NOT NULL
    AND terms_version = '2026-10-17'
  );