do $$
begin
  if exists (
    select 1
    from public.member_profiles
    where email is not null and btrim(email) <> ''
    group by lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'Duplicate member profile emails exist; resolve them before applying the normalized email uniqueness migration.';
  end if;
end;
$$;

update public.member_profiles
set email = nullif(lower(btrim(email)), '')
where email is not null
  and email is distinct from nullif(lower(btrim(email)), '');

create unique index if not exists member_profiles_email_normalized_uidx
  on public.member_profiles (lower(btrim(email)))
  where email is not null and btrim(email) <> '';