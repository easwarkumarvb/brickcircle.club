begin;

do $$
declare
  first_status record;
  later_status record;
  newcomer public.profiles%rowtype;
begin
  if exists(
    select 1 from pg_trigger
    where tgrelid='public.profiles'::regclass
      and tgname='trg_assign_founding_member'
      and not tgisinternal
  ) then
    raise exception 'signup-order assignment trigger is still active';
  end if;

  if (select membership_phase from public.membership_program_config where id=1)<>'beta_free' then
    raise exception 'membership phase is not beta_free';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  select * into first_status from public.bc_membership_status();

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
  select * into later_status from public.bc_membership_status();

  if first_status.my_tier<>'beta' or later_status.my_tier<>'beta'
     or first_status.my_access<>'free_beta' or later_status.my_access<>'free_beta'
     or first_status.my_number is not null or later_status.my_number is not null then
    raise exception 'historical signup order still changes current beta entitlement';
  end if;

  if not first_status.beta_free or not later_status.beta_free
     or first_status.city_pricing_enabled or later_status.city_pricing_enabled then
    raise exception 'beta access is not uniformly free';
  end if;

  if (select founding_member_number from public.profiles where id='00000000-0000-4000-8000-000000000001')<>1
     or (select early_member_number from public.profiles where id='00000000-0000-4000-8000-000000000101')<>101 then
    raise exception 'historical membership fields were not preserved';
  end if;

  insert into public.profiles(id,display_name,email,country,city)
  values ('00000000-0000-4000-8000-000000000202','New Beta Member','member-202@example.invalid','India','Bengaluru')
  returning * into newcomer;

  if newcomer.membership_ordinal is not null
     or newcomer.founding_member_number is not null
     or newcomer.early_member_number is not null then
    raise exception 'new signup received a signup-order membership designation';
  end if;
end $$;

do $$
begin
  if has_function_privilege('anon','public.bc_membership_status()','EXECUTE') then
    raise exception 'anonymous role can execute member status';
  end if;
  if not has_function_privilege('authenticated','public.bc_membership_status()','EXECUTE') then
    raise exception 'authenticated role cannot execute member status';
  end if;
  if has_function_privilege('authenticated','public.bc_assign_founding_member()','EXECUTE') then
    raise exception 'browser role can invoke historical assignment function';
  end if;
end $$;

rollback;
