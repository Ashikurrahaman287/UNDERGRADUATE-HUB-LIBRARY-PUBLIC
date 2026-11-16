alter table public.member_profiles
  add column if not exists avatar_url text;

grant insert (avatar_url) on public.member_profiles to authenticated;
grant update (avatar_url) on public.member_profiles to authenticated;