-- Complete member event capture and tighten notification write access.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'membership_submitted',
    'membership_approved',
    'membership_rejected',
    'rental_submitted',
    'rental_approved',
    'rental_rejected',
    'book_issued',
    'book_returned',
    'rental_due',
    'rental_overdue',
    'subscription_activated',
    'subscription_expiring',
    'subscription_expired',
    'reservation_available',
    'fine_created',
    'payment_approved',
    'payment_rejected'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_member_event_key_unique_idx
  ON public.notifications (member_id, event_key)
  WHERE event_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.notifications TO service_role;

DO $$
DECLARE
  v_policy_name text;
BEGIN
  FOR v_policy_name IN
    SELECT policy.polname
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'public.notifications'::pg_catalog.regclass
  LOOP
    EXECUTE pg_catalog.format('DROP POLICY %I ON public.notifications', v_policy_name);
  END LOOP;
END;
$$;

CREATE POLICY "Members see own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.notify_member_membership_application_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.enqueue_member_notification(
      NEW.member_id,
      'membership_submitted',
      'Membership application submitted',
      'Your membership application was received for review.',
      pg_catalog.format('membership-application:%s:submitted', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_member_rental_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.enqueue_member_notification(
      NEW.member_id,
      'rental_submitted',
      'Rental request submitted',
      'Your rental request was received for review.',
      pg_catalog.format('rental-request:%s:submitted', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_rental_review_notification_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_type text;
  v_title text;
  v_message text;
  v_event_key text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('approved', 'rejected') THEN
    v_type := CASE WHEN NEW.status = 'approved' THEN 'rental_approved' ELSE 'rental_rejected' END;
    v_title := CASE WHEN NEW.status = 'approved' THEN 'Rental request approved' ELSE 'Rental request update' END;
    v_message := CASE WHEN NEW.status = 'approved'
      THEN 'Your rental request was approved. Review your member dashboard for details.'
      ELSE 'Your rental request was not approved. Review your member dashboard for next steps.'
    END;
    v_event_key := pg_catalog.format('rental-request:%s:%s', NEW.id, NEW.status);

    PERFORM pg_catalog.set_config('app.member_notification_event_key', v_event_key, true);
    PERFORM public.enqueue_member_notification(
      NEW.member_id, v_type, v_title, v_message, v_event_key
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_rental_review_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_key text;
  v_request_id uuid;
  v_status text;
BEGIN
  IF NEW.type = 'rental_rejected' THEN
    NEW.title := 'Rental request update';
    NEW.message := 'Your rental request was not approved. Review your member dashboard for next steps.';
  END IF;

  IF NEW.type NOT IN ('rental_approved', 'rental_rejected') OR NEW.event_key IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_event_key := NULLIF(pg_catalog.current_setting('app.member_notification_event_key', true), '');
  v_status := CASE WHEN NEW.type = 'rental_approved' THEN 'approved' ELSE 'rejected' END;
  IF v_event_key IS NULL THEN
    RAISE EXCEPTION 'Rental review notifications require a trusted event key.' USING ERRCODE = '22023';
  END IF;

  v_request_id := pg_catalog.split_part(v_event_key, ':', 2)::uuid;
  IF v_event_key <> pg_catalog.format('rental-request:%s:%s', v_request_id, v_status)
    OR NOT EXISTS (
      SELECT 1
      FROM public.rental_requests AS request
      WHERE request.id = v_request_id
        AND request.member_id = NEW.member_id
        AND request.status = v_status
    ) THEN
    RAISE EXCEPTION 'Rental review notification does not match a completed request.' USING ERRCODE = '22023';
  END IF;

  NEW.event_key := v_event_key;
  IF EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE notification.member_id = NEW.member_id
      AND notification.event_key = v_event_key
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_member_book_returned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'returned'
    AND NEW.returned_at IS NOT NULL
    AND (OLD.status IS DISTINCT FROM 'returned' OR OLD.returned_at IS NULL) THEN
    PERFORM public.enqueue_member_notification(
      NEW.member_id,
      'book_returned',
      'Book returned',
      'A returned book has been recorded on your account.',
      pg_catalog.format('rental:%s:returned', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS membership_applications_notify_submitted ON public.membership_applications;
CREATE TRIGGER membership_applications_notify_submitted
  AFTER INSERT ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_membership_application_submitted();

DROP TRIGGER IF EXISTS rental_requests_notify_submitted ON public.rental_requests;
CREATE TRIGGER rental_requests_notify_submitted
  AFTER INSERT ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_rental_request_submitted();

DROP TRIGGER IF EXISTS rental_requests_set_review_notification_key ON public.rental_requests;
CREATE TRIGGER rental_requests_set_review_notification_key
  AFTER UPDATE OF status ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_rental_review_notification_key();

DROP TRIGGER IF EXISTS notifications_prepare_rental_review ON public.notifications;
CREATE TRIGGER notifications_prepare_rental_review
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.prepare_rental_review_notification();

DROP TRIGGER IF EXISTS rentals_notify_book_returned ON public.rentals;
CREATE TRIGGER rentals_notify_book_returned
  AFTER UPDATE OF status, returned_at ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_book_returned();

REVOKE ALL ON FUNCTION public.notify_member_membership_application_submitted() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_member_rental_request_submitted() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_rental_review_notification_key() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_rental_review_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_member_book_returned() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_member_notification_read(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_member_notification_read(uuid) TO authenticated;