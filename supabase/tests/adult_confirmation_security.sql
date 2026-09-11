\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege('anon', 'public.confirm_adult_status(text,text)', 'EXECUTE') then
    raise exception 'anon must not execute confirm_adult_status';
  end if;
  if not has_function_privilege('authenticated', 'public.confirm_adult_status(text,text)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute confirm_adult_status';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);

do $$
begin
  begin
    perform public.confirm_adult_status('I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.', 'wrong-version');
    raise exception 'wrong attestation version was accepted';
  exception when invalid_parameter_value then
    null;
  end;
end
$$;

select public.confirm_adult_status(
  'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.',
  '2026-09-11'
);

reset role;
reset request.jwt.claim.sub;

do $$
declare
  confirmed_count integer;
  untouched_count integer;
begin
  select count(*) into confirmed_count
  from public.profiles
  where id = '00000000-0000-4000-8000-000000000007'
    and adult_confirmed_at is not null
    and adult_confirmation_version = '2026-09-11'
    and adult_confirmation_text = 'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.';

  select count(*) into untouched_count
  from public.profiles
  where id = '00000000-0000-4000-8000-000000000099'
    and adult_confirmed_at is null
    and adult_confirmation_version is null
    and adult_confirmation_text is null;

  if confirmed_count <> 1 then
    raise exception 'caller attestation was not recorded exactly once';
  end if;
  if untouched_count <> 1 then
    raise exception 'another member profile was modified';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);

do $$
begin
  begin
    update public.profiles
       set adult_confirmation_version = 'tampered'
     where id = '00000000-0000-4000-8000-000000000007';
    raise exception 'direct adult confirmation edit was accepted';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;
reset request.jwt.claim.sub;

do $$
begin
  if exists (
    select 1 from public.profiles
    where id = '00000000-0000-4000-8000-000000000007'
      and adult_confirmation_version <> '2026-09-11'
  ) then
    raise exception 'adult confirmation fields are mutable';
  end if;
end
$$;
