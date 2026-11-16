-- FIFO reservations, member-safe mutation RPCs, and reservation-aware rental issuance.

ALTER TABLE public.rental_requests
  ADD COLUMN IF NOT EXISTS reservation_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'rental_requests_reservation_request_id_fkey'
      AND conrelid = 'public.rental_requests'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.rental_requests
      ADD CONSTRAINT rental_requests_reservation_request_id_fkey
      FOREIGN KEY (reservation_request_id)
      REFERENCES public.reservation_requests(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS rental_requests_reservation_request_unique_idx
  ON public.rental_requests (reservation_request_id)
  WHERE reservation_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservation_requests_fifo_idx
  ON public.reservation_requests (book_id, status, requested_at, id);
COMMENT ON COLUMN public.reservation_requests.position IS
  'Legacy field; FIFO position is calculated from requested_at and id.';

REVOKE ALL ON public.reservation_requests FROM authenticated;
GRANT SELECT ON public.reservation_requests TO authenticated;
GRANT ALL ON public.reservation_requests TO service_role;

DROP POLICY IF EXISTS "Members see own reservations" ON public.reservation_requests;
DROP POLICY IF EXISTS "Members create own reservations" ON public.reservation_requests;
DROP POLICY IF EXISTS "Members update own reservations while active" ON public.reservation_requests;
CREATE POLICY "Members see own reservations"
  ON public.reservation_requests FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.reservation_candidate_is_eligible(
  p_reservation_id uuid,
  p_exclude_rental_request_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reservation_requests AS reservation
    JOIN public.member_profiles AS member ON member.id = reservation.member_id
    JOIN public.books AS book ON book.id = reservation.book_id
    WHERE reservation.id = p_reservation_id
      AND reservation.status IN ('waiting', 'notified')
      AND member.membership_status = 'active'
      AND book.is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.member_subscriptions AS subscription
        JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
        WHERE subscription.member_id = member.id
          AND (member.current_plan_id IS NULL OR subscription.plan_id = member.current_plan_id)
          AND subscription.status = 'active'
          AND subscription.ends_at > pg_catalog.statement_timestamp()
          AND plan.is_active = true
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.rentals AS rental
        WHERE rental.member_id = member.id
          AND rental.book_id = reservation.book_id
          AND rental.status IN ('pending', 'active', 'overdue')
          AND (
            p_exclude_rental_request_id IS NULL
            OR rental.rental_request_id IS DISTINCT FROM p_exclude_rental_request_id
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.rental_requests AS request
        WHERE request.member_id = member.id
          AND request.book_id = reservation.book_id
          AND request.status IN ('pending', 'approved')
          AND request.reservation_request_id IS DISTINCT FROM reservation.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.first_eligible_book_reservation(
  p_book_id uuid,
  p_exclude_rental_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT reservation.id
  FROM public.reservation_requests AS reservation
  WHERE reservation.book_id = p_book_id
    AND public.reservation_candidate_is_eligible(reservation.id, p_exclude_rental_request_id)
  ORDER BY reservation.requested_at ASC, reservation.id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.create_book_reservation(p_book_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member public.member_profiles%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_reservation_id uuid;
  v_subscription_id uuid;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before reserving a book.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.user_id = v_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A member profile is required to reserve a book.' USING ERRCODE = '23514';
  END IF;
  IF v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Only active members with a current subscription can reserve books.' USING ERRCODE = '23514';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  SELECT subscription.id INTO v_subscription_id
  FROM public.member_subscriptions AS subscription
  JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
  WHERE subscription.member_id = v_member.id
    AND (v_member.current_plan_id IS NULL OR subscription.plan_id = v_member.current_plan_id)
    AND subscription.status = 'active'
    AND subscription.ends_at > v_now
    AND plan.is_active = true
  ORDER BY subscription.ends_at DESC
  LIMIT 1
  FOR SHARE OF subscription, plan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only active members with a current subscription can reserve books.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = p_book_id
    AND book.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The book was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_book.availability = 'available' THEN
    RAISE EXCEPTION 'Reservations are available only for books that are currently unavailable.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.rental_requests AS request
    WHERE request.member_id = v_member.id
      AND request.book_id = v_book.id
      AND request.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'A pending rental request already exists for this book.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.rentals AS rental
    WHERE rental.member_id = v_member.id
      AND rental.book_id = v_book.id
      AND rental.status IN ('pending', 'active', 'overdue')
  ) THEN
    RAISE EXCEPTION 'An active rental already exists for this book.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.reservation_requests AS reservation
    WHERE reservation.member_id = v_member.id
      AND reservation.book_id = v_book.id
      AND reservation.status IN ('waiting', 'notified')
  ) THEN
    RAISE EXCEPTION 'You already have an active reservation for this book.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.reservation_requests (member_id, book_id, status, requested_at)
  VALUES (v_member.id, v_book.id, 'waiting', pg_catalog.clock_timestamp())
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_book_reservation(p_reservation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_book_id uuid;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before cancelling a reservation.' USING ERRCODE = '42501';
  END IF;

  SELECT reservation.book_id INTO v_book_id
  FROM public.reservation_requests AS reservation
  JOIN public.member_profiles AS member ON member.id = reservation.member_id
  WHERE reservation.id = p_reservation_id
    AND member.user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.books AS book WHERE book.id = v_book_id FOR UPDATE;

  SELECT reservation.status INTO v_status
  FROM public.reservation_requests AS reservation
  JOIN public.member_profiles AS member ON member.id = reservation.member_id
  WHERE reservation.id = p_reservation_id
    AND member.user_id = v_user_id
  FOR UPDATE OF reservation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN 'already_cancelled';
  END IF;
  IF v_status NOT IN ('waiting', 'notified') THEN
    RAISE EXCEPTION 'Only waiting or notified reservations can be cancelled.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.reservation_requests AS reservation
  SET status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp()
  WHERE reservation.id = p_reservation_id;

  RETURN 'cancelled';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_book_reservations()
RETURNS TABLE (
  reservation_id uuid,
  book_id uuid,
  book_title text,
  status text,
  requested_at timestamptz,
  queue_position integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to view your reservations.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH eligible_queue AS (
    SELECT reservation.id,
           pg_catalog.row_number() OVER (
             PARTITION BY reservation.book_id
             ORDER BY reservation.requested_at ASC, reservation.id ASC
           )::integer AS queue_position
    FROM public.reservation_requests AS reservation
    WHERE reservation.status IN ('waiting', 'notified')
      AND public.reservation_candidate_is_eligible(reservation.id)
  )
  SELECT reservation.id,
         reservation.book_id,
         book.title,
         reservation.status,
         reservation.requested_at,
         eligible_queue.queue_position
  FROM public.reservation_requests AS reservation
  JOIN public.member_profiles AS member ON member.id = reservation.member_id
  JOIN public.books AS book ON book.id = reservation.book_id
  LEFT JOIN eligible_queue ON eligible_queue.id = reservation.id
  WHERE member.user_id = v_user_id
  ORDER BY reservation.requested_at DESC, reservation.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_book_reservation(p_book_id uuid)
RETURNS TABLE (
  reservation_id uuid,
  book_id uuid,
  book_title text,
  member_id uuid,
  member_name text,
  member_phone text,
  requested_at timestamptz,
  queue_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_book public.books%ROWTYPE;
  v_reservation public.reservation_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = p_book_id
    AND book.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT reservation.* INTO v_reservation
  FROM public.reservation_requests AS reservation
  WHERE reservation.book_id = v_book.id
    AND public.reservation_candidate_is_eligible(reservation.id)
  ORDER BY reservation.requested_at ASC, reservation.id ASC
  LIMIT 1
  FOR UPDATE OF reservation;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_reservation.id,
         v_reservation.book_id,
         v_book.title,
         member.id,
         member.full_name,
         member.phone,
         v_reservation.requested_at,
          1
  FROM public.member_profiles AS member
  WHERE member.id = v_reservation.member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_rental_request_reservation_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_book public.books%ROWTYPE;
  v_first_reservation_id uuid;
  v_reservation public.reservation_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_request_id IS DISTINCT FROM OLD.reservation_request_id THEN
      RAISE EXCEPTION 'A rental request reservation link cannot be changed.' USING ERRCODE = '55000';
    END IF;
    IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = NEW.book_id
    AND book.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The book was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'INSERT' AND v_book.availability <> 'available' THEN
    RAISE EXCEPTION 'The book is not available for a rental request.' USING ERRCODE = '23514';
  END IF;

  v_first_reservation_id := public.first_eligible_book_reservation(
    NEW.book_id,
    CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END
  );
  IF v_first_reservation_id IS NULL THEN
    IF NEW.reservation_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'The linked reservation is no longer eligible.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.reservation_request_id IS DISTINCT FROM v_first_reservation_id THEN
    RAISE EXCEPTION 'This book has an earlier eligible reservation.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_reservation
  FROM public.reservation_requests AS reservation
  WHERE reservation.id = v_first_reservation_id
    AND reservation.member_id = NEW.member_id
    AND reservation.book_id = NEW.book_id
    AND reservation.status IN ('waiting', 'notified')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The linked reservation is no longer eligible.' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE public.reservation_requests AS reservation
    SET status = 'fulfilled', fulfilled_at = pg_catalog.clock_timestamp()
    WHERE reservation.id = v_reservation.id
      AND reservation.status IN ('waiting', 'notified');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The linked reservation was already processed.' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_requests_validate_reservation_order ON public.rental_requests;
CREATE TRIGGER rental_requests_validate_reservation_order
  BEFORE INSERT OR UPDATE OF status, reservation_request_id
  ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_rental_request_reservation_order();

REVOKE ALL ON FUNCTION public.reservation_candidate_is_eligible(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.first_eligible_book_reservation(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_rental_request_reservation_order() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_book_reservation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_book_reservation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_book_reservations() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_next_book_reservation(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_book_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_book_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_book_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_book_reservation(uuid) TO service_role;
