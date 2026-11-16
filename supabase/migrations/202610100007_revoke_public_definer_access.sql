REVOKE ALL ON FUNCTION public.auto_log_approved_finance_entry(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public."UH_DATABASE"') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."UH_DATABASE" FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;