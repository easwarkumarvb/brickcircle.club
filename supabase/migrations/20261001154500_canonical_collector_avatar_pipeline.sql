-- Canonical collector-avatar pipeline.
-- profiles.avatar_url is the single public identity-photo value consumed through public_profiles.
-- HTTPS Auth-provider photos populate blank/provider-backed profiles; BrickCircle storage paths
-- represent explicit user uploads and are never overwritten by provider metadata refreshes.
--
-- Provider-metadata synchronization uses an authenticated, self-scoped SECURITY DEFINER RPC
-- (sync_my_provider_avatar) invoked on sign-in/token-refresh instead of an auth.users trigger.
-- Rationale: auth.users is owned by the GoTrue auth service; a trigger there fires for every
-- raw_user_meta_data write (including auth-service-internal updates) and a defect would affect
-- all auth flows, not just avatars. The RPC is caller-scoped (auth.uid() = self), runs only at
-- sign-in/refresh, and can be revoked instantly without touching the auth schema. Smaller blast
-- radius; the client calls it on SIGNED_IN / TOKEN_REFRESHED and after session restore.

create or replace function public.bc_provider_avatar_from_metadata(p_metadata jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(pg_catalog.btrim(coalesce(p_metadata->>'avatar_url','')), '') ~* '^https://[^[:space:]]+$'
      then pg_catalog.btrim(p_metadata->>'avatar_url')
    when nullif(pg_catalog.btrim(coalesce(p_metadata->>'picture','')), '') ~* '^https://[^[:space:]]+$'
      then pg_catalog.btrim(p_metadata->>'picture')
    else null
  end;
$$;

revoke all on function public.bc_provider_avatar_from_metadata(jsonb) from public, anon, authenticated;

-- Explicit avatar provenance. NULL = unset/legacy; 'provider' = HTTPS Auth metadata;
-- 'upload' = BrickCircle storage object chosen by the user. Never exposed through public_profiles.
alter table public.profiles
  add column if not exists avatar_source text check (avatar_source in ('provider','upload'));

-- Preserve recognizable legacy BrickCircle uploads before provider backfill/sync begins.
-- Unknown nonblank legacy avatar values remain source=NULL and are deliberately not overwritten.
update public.profiles p
set avatar_source = 'upload'
where p.avatar_source is null
  and nullif(pg_catalog.btrim(coalesce(p.avatar_url,'')), '') is not null
  and p.avatar_url like p.id::text || '/%'
  and p.avatar_url !~* '^[a-z][a-z0-9+.-]*:'
  and pg_catalog.strpos(p.avatar_url, '..') = 0;

-- Existing OAuth members created before the avatar pipeline are repaired only when
-- their canonical profile has no avatar. Existing user-uploaded/manual values win.
update public.profiles p
set avatar_url = public.bc_provider_avatar_from_metadata(u.raw_user_meta_data),
    avatar_source = 'provider',
    updated_at = now()
from auth.users u
where u.id = p.id
  and nullif(pg_catalog.btrim(coalesce(p.avatar_url,'')), '') is null
  and public.bc_provider_avatar_from_metadata(u.raw_user_meta_data) is not null;

-- Future Auth users start with the provider avatar when one is supplied.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  provider_avatar text := public.bc_provider_avatar_from_metadata(new.raw_user_meta_data);
begin
  insert into public.profiles(id,display_name,email,email_verified,avatar_url,avatar_source)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),
    new.email,
    new.email_confirmed_at is not null,
    provider_avatar,
    case when provider_avatar is not null then 'provider' end
  )
  on conflict(id) do nothing;

  insert into public.exchange_preferences(user_id)
  values(new.id)
  on conflict(user_id) do nothing;

  return new;
end;
$$;

-- Sign-in/refresh synchronization. Self-scoped: only the caller's own profile is touched.
-- Fills a blank avatar or refreshes a provider-backed avatar; never overwrites avatar_source='upload'.
create or replace function public.sync_my_provider_avatar()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  select public.bc_provider_avatar_from_metadata(u.raw_user_meta_data)
    into candidate
    from auth.users u
   where u.id = auth.uid();

  if candidate is null then
    return jsonb_build_object('synced', false, 'reason', 'no_https_provider_avatar');
  end if;

  update public.profiles p
     set avatar_url = candidate,
         avatar_source = 'provider',
         updated_at = now()
   where p.id = auth.uid()
     and (
       p.avatar_source = 'provider'
       or (
         p.avatar_source is null
         and nullif(pg_catalog.btrim(coalesce(p.avatar_url,'')), '') is null
       )
     )
     and p.avatar_url is distinct from candidate;

  return jsonb_build_object('synced', true, 'avatar_url', candidate);
end;
$$;

revoke all on function public.sync_my_provider_avatar() from public, anon;
grant execute on function public.sync_my_provider_avatar() to authenticated;

notify pgrst, 'reload schema';
