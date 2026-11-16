-- Deduplicated, private in-app notifications and daily reminder processing.

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

REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

DROP POLICY IF EXISTS "Members see own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Members can create own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Members can update own notification read state" ON public.notifications;
CREATE POLICY "Members see own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_member_notification(
  p_member_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_event_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_event_key IS NULL OR pg_catalog.btrim(p_event_key) = '' THEN
    RAISE EXCEPTION 'A notification event key is required.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status, event_key)
  VALUES (p_member_id, p_type, p_title, p_message, 'in_app', 'pending', p_event_key)
  ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_membership_application_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
    OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    PERFORM public.enqueue_member_notification(
      NEW.member_id,
      'membership_approved',
      'Membership approved',
      'Your membership application has been approved.',
      pg_catalog.format('membership-application:%s:approved', NEW.id)
    );

    IF EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS subscription
      JOIN public.member_profiles AS member ON member.id = subscription.member_id
      WHERE subscription.member_id = NEW.member_id
        AND subscription.status = 'active'
        AND subscription.ends_at > pg_catalog.clock_timestamp()
        AND (member.current_plan_id IS NULL OR member.current_plan_id = subscription.plan_id)
    ) THEN
      PERFORM public.enqueue_member_notification(
        NEW.member_id,
        'subscription_activated',
        'Subscription activated',
        'Your library subscription is now active.',
        pg_catalog.format('membership-application:%s:subscription-activated', NEW.id)
      );
    END IF;
  ELSE
    PERFORM public.enqueue_member_notification(
      NEW.member_id,
      'membership_rejected',
      'Membership application update',
      'Your membership application was not approved. Review your member dashboard for next steps.',
      pg_catalog.format('membership-application:%s:rejected', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_payment_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_key text;
  v_type text;
  v_title text;
  v_message text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_type = 'membership' THEN
      PERFORM public.enqueue_member_notification(
        NEW.member_id,
        'membership_submitted',
        'Membership application submitted',
        'Your membership application and payment details were received for review.',
        pg_catalog.format('membership-application:%s:submitted', COALESCE(NEW.related_membership_application_id, NEW.id))
      );
    ELSIF NEW.payment_type = 'rental' THEN
      PERFORM public.enqueue_member_notification(
        NEW.member_id,
        'rental_submitted',
        'Rental request submitted',
        'Your rental request and payment details were received for review.',
        pg_catalog.format('rental-request:%s:submitted', COALESCE(NEW.related_rental_request_id, NEW.id))
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status
    OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  v_type := CASE WHEN NEW.status = 'approved' THEN 'payment_approved' ELSE 'payment_rejected' END;
  v_title := CASE WHEN NEW.status = 'approved' THEN 'Payment approved' ELSE 'Payment review update' END;
  v_message := CASE WHEN NEW.status = 'approved'
    THEN 'Your payment submission was approved.'
    ELSE 'Your payment submission was not approved. Review your member dashboard for next steps.'
  END;
  v_event_key := pg_catalog.format('payment-submission:%s:%s', NEW.id, NEW.status);

  PERFORM public.enqueue_member_notification(
    NEW.member_id, v_type, v_title, v_message, v_event_key
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_member_book_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.enqueue_member_notification(
    NEW.member_id,
    'book_issued',
    'Book issued',
    'A book has been issued to your account.',
    pg_catalog.format('rental:%s:issued', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS membership_applications_notify_review ON public.membership_applications;
CREATE TRIGGER membership_applications_notify_review
  AFTER UPDATE OF status ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_membership_application_review();

DROP TRIGGER IF EXISTS payment_submissions_notify_insert ON public.payment_submissions;
CREATE TRIGGER payment_submissions_notify_insert
  AFTER INSERT ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_submission_event();

DROP TRIGGER IF EXISTS payment_submissions_notify_review ON public.payment_submissions;
CREATE TRIGGER payment_submissions_notify_review
  AFTER UPDATE OF status ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_submission_event();

DROP TRIGGER IF EXISTS rentals_notify_book_issued ON public.rentals;
CREATE TRIGGER rentals_notify_book_issued
  AFTER INSERT ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_book_issued();

CREATE OR REPLACE FUNCTION public.mark_member_notification_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_notification_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.notifications AS notification
  SET read_at = COALESCE(notification.read_at, pg_catalog.clock_timestamp()),
      status = 'read'
  FROM public.member_profiles AS member
  WHERE notification.id = p_notification_id
    AND notification.member_id = member.id
    AND member.user_id = v_user_id
  RETURNING notification.id INTO v_notification_id;

  RETURN v_notification_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_member_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_business_date date;
  v_expiring_3d integer := 0;
  v_expiring_1d integer := 0;
  v_expired integer := 0;
  v_due integer := 0;
  v_overdue integer := 0;
BEGIN
  v_business_date := (v_now AT TIME ZONE 'Asia/Dhaka')::date;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status, event_key)
  SELECT subscription.member_id,
         'subscription_expiring',
         'Subscription expires in three days',
         pg_catalog.format('Your subscription expires on %s.', pg_catalog.to_char((subscription.ends_at AT TIME ZONE 'Asia/Dhaka')::date, 'DD Mon YYYY')),
         'in_app',
         'pending',
         pg_catalog.format('member-subscription:%s:expiring:3d', subscription.id)
  FROM public.member_subscriptions AS subscription
  JOIN public.member_profiles AS member ON member.id = subscription.member_id
  WHERE subscription.status = 'active'
    AND subscription.ends_at > v_now
    AND (member.current_plan_id IS NULL OR member.current_plan_id = subscription.plan_id)
    AND (subscription.ends_at AT TIME ZONE 'Asia/Dhaka')::date = v_business_date + 3
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS newer
      WHERE newer.member_id = subscription.member_id
        AND newer.status IN ('active', 'expired')
        AND (member.current_plan_id IS NULL OR newer.plan_id = member.current_plan_id)
        AND newer.started_at > subscription.started_at
    )
  ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_expiring_3d = ROW_COUNT;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status, event_key)
  SELECT subscription.member_id,
         'subscription_expiring',
         'Subscription expires tomorrow',
         pg_catalog.format('Your subscription expires on %s.', pg_catalog.to_char((subscription.ends_at AT TIME ZONE 'Asia/Dhaka')::date, 'DD Mon YYYY')),
         'in_app',
         'pending',
         pg_catalog.format('member-subscription:%s:expiring:1d', subscription.id)
  FROM public.member_subscriptions AS subscription
  JOIN public.member_profiles AS member ON member.id = subscription.member_id
  WHERE subscription.status = 'active'
    AND subscription.ends_at > v_now
    AND (member.current_plan_id IS NULL OR member.current_plan_id = subscription.plan_id)
    AND (subscription.ends_at AT TIME ZONE 'Asia/Dhaka')::date = v_business_date + 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS newer
      WHERE newer.member_id = subscription.member_id
        AND newer.status IN ('active', 'expired')
        AND (member.current_plan_id IS NULL OR newer.plan_id = member.current_plan_id)
        AND newer.started_at > subscription.started_at
    )
  ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_expiring_1d = ROW_COUNT;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status, event_key)
  SELECT subscription.member_id,
         'subscription_expired',
         'Subscription expired',
         'Your library subscription has expired. Renew it before requesting another rental.',
         'in_app',
         'pending',
         pg_catalog.format('member-subscription:%s:expired', subscription.id)
  FROM public.member_subscriptions AS subscription
  JOIN public.member_profiles AS member ON member.id = subscription.member_id
  WHERE subscription.status IN ('active', 'expired')
    AND subscription.ends_at IS NOT NULL
    AND subscription.ends_at <= v_now
    AND (member.current_plan_id IS NULL OR member.current_plan_id = subscription.plan_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS newer
      WHERE newer.member_id = subscription.member_id
        AND newer.status IN ('active', 'expired')
        AND (member.current_plan_id IS NULL OR newer.plan_id = member.current_plan_id)
        AND newer.started_at > subscription.started_at
    )
  ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status, event_key)
  SELECT rental.member_id,
         'rental_due',
         'Rental due date reached',
         pg_catalog.format('A borrowed book reached its recorded rental end date on %s.', pg_catalog.to_char((rental.subscription_ends_at AT TIME ZONE 'Asia/Dhaka')::date, 'DD Mon YYYY')),
         'in_app',
         'pending',
         pg_catalog.format('rental:%s:due', rental.id)
  FROM public.rentals AS rental
  WHERE rental.status IN ('active', 'overdue')
    AND rental.returned_at IS NULL
    AND rental.subscription_ends_at IS NOT NULL
    AND (rental.subscription_ends_at AT TIME ZONE 'Asia/Dhaka')::date <= v_business_date
  ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_due = ROW_COUNT;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status, event_key)
  SELECT rental.member_id,
         'rental_overdue',
         'Rental is overdue',
         'A borrowed book remains unreturned after its applicable expiry date. Please contact the library.',
         'in_app',
         'pending',
         pg_catalog.format('rental:%s:overdue', rental.id)
  FROM public.rentals AS rental
  WHERE rental.status = 'overdue'
    AND rental.returned_at IS NULL
  ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'business_date', v_business_date,
    'subscription_expiring_3d', v_expiring_3d,
    'subscription_expiring_1d', v_expiring_1d,
    'subscriptions_expired', v_expired,
    'rentals_due', v_due,
    'rentals_overdue', v_overdue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_member_notification(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_membership_application_review() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_payment_submission_event() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_member_book_issued() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_member_notification_read(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_member_reminders() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_member_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_member_reminders() TO service_role;
