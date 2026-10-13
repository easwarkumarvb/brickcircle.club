begin;

do $$
declare v text;
begin
  -- Backfill: legacy blank profile received the HTTPS provider avatar and provenance.
  select avatar_url into v from public.profiles where id='10000000-0000-4000-8000-000000000001';
  if v <> 'https://lh3.googleusercontent.com/legacy-avatar' then
    raise exception 'legacy provider avatar was not backfilled: %', v;
  end if;
  select avatar_source into v from public.profiles where id='10000000-0000-4000-8000-000000000001';
  if v <> 'provider' then
    raise exception 'backfilled avatar did not record provider provenance: %', v;
  end if;

  -- Projection: the backfilled avatar flowed to the sanitized public projection.
  select avatar_url into v from public.public_profiles where id='10000000-0000-4000-8000-000000000001';
  if v <> 'https://lh3.googleusercontent.com/legacy-avatar' then
    raise exception 'provider avatar did not reach public profile projection: %', v;
  end if;

  -- Override protection: an existing uploaded avatar was not overwritten by the backfill,
  -- and recognizable legacy BrickCircle paths receive upload provenance.
  select avatar_url into v from public.profiles where id='10000000-0000-4000-8000-000000000002';
  if v <> '10000000-0000-4000-8000-000000000002/profile-uploaded.jpg' then
    raise exception 'existing uploaded avatar was overwritten: %', v;
  end if;
  select avatar_source into v from public.profiles where id='10000000-0000-4000-8000-000000000002';
  if v <> 'upload' then
    raise exception 'legacy BrickCircle upload did not receive upload provenance: %', v;
  end if;

  -- Unknown nonblank legacy values stay unclassified and must not be replaced.
  select avatar_source into v from public.profiles where id='10000000-0000-4000-8000-000000000006';
  if v is not null then
    raise exception 'unknown legacy avatar was incorrectly classified: %', v;
  end if;

  -- Insecure provider metadata must never become a public avatar.
  select avatar_url into v from public.profiles where id='10000000-0000-4000-8000-000000000003';
  if v is not null then
    raise exception 'insecure HTTP provider avatar was accepted: %', v;
  end if;

  -- Provenance is private: the public projection must not expose avatar_source.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='public_profiles' and column_name='avatar_source'
  ) then
    raise exception 'avatar_source leaked into public_profiles';
  end if;

  -- Provenance values are constrained.
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass
      and pg_get_constraintdef(oid) like '%avatar_source%'
  ) then
    raise exception 'profiles.avatar_source check constraint is missing';
  end if;
end $$;

-- Future OAuth signup must initialize the canonical profile avatar and provenance.
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000004','future@example.invalid',
 '{"name":"Future OAuth","avatar_url":"https://lh3.googleusercontent.com/future-avatar"}'::jsonb);

do $$
declare v text;
begin
  select avatar_url into v from public.profiles where id='10000000-0000-4000-8000-000000000004';
  if v <> 'https://lh3.googleusercontent.com/future-avatar' then
    raise exception 'new-user provider avatar was not initialized: %', v;
  end if;
  select avatar_source into v from public.profiles where id='10000000-0000-4000-8000-000000000004';
  if v <> 'provider' then
    raise exception 'new-user avatar did not record provider provenance: %', v;
  end if;
  select avatar_url into v from public.public_profiles where id='10000000-0000-4000-8000-000000000004';
  if v <> 'https://lh3.googleusercontent.com/future-avatar' then
    raise exception 'new-user avatar missing from public projection: %', v;
  end if;
end $$;

-- Signup without a usable provider avatar stays blank (no insecure scheme accepted).
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000005','insecure@example.invalid',
 '{"name":"Insecure OAuth","picture":"http://example.invalid/avatar.jpg"}'::jsonb);

do $$
declare v text;
begin
  select avatar_url into v from public.profiles where id='10000000-0000-4000-8000-000000000005';
  if v is not null then
    raise exception 'non-HTTPS provider avatar was accepted at signup: %', v;
  end if;
end $$;

-- Provider-backed avatars may refresh from Auth metadata via the sign-in RPC.
update auth.users
set raw_user_meta_data='{"full_name":"Legacy OAuth","picture":"https://lh3.googleusercontent.com/legacy-avatar-v2"}'::jsonb
where id='10000000-0000-4000-8000-000000000001';

do $$
declare provider_value text; upload_value text; public_value text;
begin
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  perform public.sync_my_provider_avatar();

  select avatar_url into provider_value from public.profiles where id='10000000-0000-4000-8000-000000000001';
  if provider_value <> 'https://lh3.googleusercontent.com/legacy-avatar-v2' then
    raise exception 'provider avatar did not refresh: %', provider_value;
  end if;

  select avatar_url into public_value from public.public_profiles where id='10000000-0000-4000-8000-000000000001';
  if public_value <> provider_value then
    raise exception 'refreshed provider avatar did not project publicly';
  end if;

  -- User-uploaded storage paths are authoritative and may never be overwritten.
  update auth.users
  set raw_user_meta_data='{"full_name":"Uploaded Avatar","picture":"https://lh3.googleusercontent.com/provider-refresh"}'::jsonb
  where id='10000000-0000-4000-8000-000000000002';

  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  perform public.sync_my_provider_avatar();

  select avatar_url into upload_value from public.profiles where id='10000000-0000-4000-8000-000000000002';
  if upload_value <> '10000000-0000-4000-8000-000000000002/profile-uploaded.jpg' then
    raise exception 'provider refresh overwrote explicit upload: %', upload_value;
  end if;

  -- A nonblank legacy value with no provenance is preserved rather than guessed.
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
  perform public.sync_my_provider_avatar();
  select avatar_url into upload_value from public.profiles where id='10000000-0000-4000-8000-000000000006';
  if upload_value <> 'legacy/manual-avatar.jpg' then
    raise exception 'provider refresh overwrote unknown legacy avatar: %', upload_value;
  end if;
end $$;

-- The RPC also fills a still-blank profile when the provider later supplies an HTTPS avatar.
update auth.users
set raw_user_meta_data='{"name":"Insecure OAuth","picture":"https://lh3.googleusercontent.com/late-avatar"}'::jsonb
where id='10000000-0000-4000-8000-000000000005';

do $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
  perform public.sync_my_provider_avatar();
  select avatar_url into v from public.profiles where id='10000000-0000-4000-8000-000000000005';
  if v <> 'https://lh3.googleusercontent.com/late-avatar' then
    raise exception 'blank profile was not filled by sign-in sync: %', v;
  end if;
end $$;

-- Helper/trigger functions are server-only; the sync RPC is authenticated-only.
do $$
begin
  if has_function_privilege('authenticated','public.bc_provider_avatar_from_metadata(jsonb)','EXECUTE') then
    raise exception 'authenticated role can execute provider-avatar parser';
  end if;
  if has_function_privilege('anon','public.sync_my_provider_avatar()','EXECUTE') then
    raise exception 'anonymous role can execute provider avatar sync';
  end if;
  if not has_function_privilege('authenticated','public.sync_my_provider_avatar()','EXECUTE') then
    raise exception 'authenticated role cannot execute provider avatar sync';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgrelid='auth.users'::regclass
      and not tgisinternal
      and pg_get_triggerdef(oid) like '%sync_provider_avatar%'
  ) then
    raise exception 'auth.users avatar sync trigger must not exist';
  end if;
end $$;

rollback;
