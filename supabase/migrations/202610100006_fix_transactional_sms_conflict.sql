CREATE OR REPLACE FUNCTION public.enqueue_member_transactional_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.channel = 'in_app'
     AND NEW.status = 'pending'
     AND NEW.event_key IS NOT NULL
     AND NEW.type IN (
       'subscription_expiring',
       'subscription_expired',
       'book_issued',
       'book_returned',
       'payment_approved',
       'payment_rejected',
       'fine_created'
     ) THEN
    INSERT INTO public.notifications (
      member_id,
      type,
      title,
      message,
      channel,
      scheduled_at,
      status,
      event_key
    ) VALUES (
      NEW.member_id,
      NEW.type,
      NEW.title,
      NEW.message,
      'sms',
      COALESCE(NEW.scheduled_at, pg_catalog.clock_timestamp()),
      'pending',
      pg_catalog.format('%s:sms', NEW.event_key)
    )
    ON CONFLICT (member_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;