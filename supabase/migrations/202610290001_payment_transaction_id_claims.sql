CREATE TABLE IF NOT EXISTS public.payment_transaction_id_claims (
  transaction_id text PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

ALTER TABLE public.payment_transaction_id_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_transaction_id_claims FROM PUBLIC, anon, authenticated, service_role;

WITH existing_transaction_ids AS (
  SELECT pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(payment.transaction_id), '[[:space:]]+', '', 'g')) AS transaction_id
  FROM public.payment_submissions AS payment
  WHERE payment.transaction_id IS NOT NULL
  UNION
  SELECT pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(transaction.trx_id), '[[:space:]]+', '', 'g')) AS transaction_id
  FROM public.wallet_transactions AS transaction
  WHERE transaction.payment_method <> 'WALLET'
)
INSERT INTO public.payment_transaction_id_claims (transaction_id)
SELECT DISTINCT transaction_id
FROM existing_transaction_ids
ON CONFLICT (transaction_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_payment_submission_transaction_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_id text;
  v_old_transaction_id text;
BEGIN
  v_transaction_id := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(NEW.transaction_id), '[[:space:]]+', '', 'g'));
  IF TG_OP = 'UPDATE' THEN
    v_old_transaction_id := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(OLD.transaction_id), '[[:space:]]+', '', 'g'));
    IF v_transaction_id = v_old_transaction_id THEN
      NEW.transaction_id := v_transaction_id;
      RETURN NEW;
    END IF;
  END IF;

  IF v_transaction_id !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'Enter the 10-character transaction ID shown in your payment receipt.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_transaction_id, 0));
  INSERT INTO public.payment_transaction_id_claims (transaction_id)
  VALUES (v_transaction_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted for review.' USING ERRCODE = '23505';
  END IF;

  NEW.transaction_id := v_transaction_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_wallet_payment_transaction_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_id text;
  v_old_transaction_id text;
BEGIN
  v_transaction_id := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(NEW.trx_id), '[[:space:]]+', '', 'g'));
  IF NEW.payment_method = 'WALLET' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_transaction_id := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(OLD.trx_id), '[[:space:]]+', '', 'g'));
    IF v_transaction_id = v_old_transaction_id AND NEW.payment_method = OLD.payment_method THEN
      NEW.trx_id := v_transaction_id;
      RETURN NEW;
    END IF;
  END IF;

  IF v_transaction_id !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'Enter the 10-character transaction ID shown in your payment receipt.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_transaction_id, 0));
  INSERT INTO public.payment_transaction_id_claims (transaction_id)
  VALUES (v_transaction_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted for review.' USING ERRCODE = '23505';
  END IF;

  NEW.trx_id := v_transaction_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_payment_submission_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_id text;
BEGIN
  v_transaction_id := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(NEW.transaction_id), '[[:space:]]+', '', 'g'));
  IF NEW.status <> 'approved' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF v_transaction_id !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'Only a valid 10-character transaction ID can be approved.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_transaction_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE payment.id <> NEW.id
      AND pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(payment.transaction_id), '[[:space:]]+', '', 'g')) = v_transaction_id
  ) OR EXISTS (
    SELECT 1 FROM public.wallet_transactions AS transaction
    WHERE transaction.payment_method <> 'WALLET'
      AND pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(transaction.trx_id), '[[:space:]]+', '', 'g')) = v_transaction_id
  ) THEN
    RAISE EXCEPTION 'A previously recorded transaction ID cannot be approved twice.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_wallet_payment_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transaction_id text;
BEGIN
  v_transaction_id := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(NEW.trx_id), '[[:space:]]+', '', 'g'));
  IF NEW.status <> 'APPROVED' OR OLD.status = NEW.status OR NEW.payment_method = 'WALLET' THEN
    RETURN NEW;
  END IF;
  IF v_transaction_id !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'Only a valid 10-character transaction ID can be approved.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_transaction_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(payment.transaction_id), '[[:space:]]+', '', 'g')) = v_transaction_id
  ) OR EXISTS (
    SELECT 1 FROM public.wallet_transactions AS transaction
    WHERE transaction.transaction_id <> NEW.transaction_id
      AND transaction.payment_method <> 'WALLET'
      AND pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(transaction.trx_id), '[[:space:]]+', '', 'g')) = v_transaction_id
  ) THEN
    RAISE EXCEPTION 'A previously recorded transaction ID cannot be approved twice.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_submissions_claim_transaction_id ON public.payment_submissions;
CREATE TRIGGER payment_submissions_claim_transaction_id
  BEFORE INSERT OR UPDATE OF transaction_id ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.claim_payment_submission_transaction_id();

DROP TRIGGER IF EXISTS wallet_transactions_claim_transaction_id ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_claim_transaction_id
  BEFORE INSERT OR UPDATE OF trx_id, payment_method ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.claim_wallet_payment_transaction_id();

DROP TRIGGER IF EXISTS payment_submissions_unique_approval ON public.payment_submissions;
CREATE TRIGGER payment_submissions_unique_approval
  BEFORE UPDATE OF status ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_payment_submission_approval();

DROP TRIGGER IF EXISTS wallet_transactions_unique_approval ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_unique_approval
  BEFORE UPDATE OF status ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_wallet_payment_approval();

REVOKE ALL ON FUNCTION public.claim_payment_submission_transaction_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_wallet_payment_transaction_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_duplicate_payment_submission_approval() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_duplicate_wallet_payment_approval() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_wallet_transaction(numeric, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;