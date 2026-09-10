do $$
declare fn text;
begin
  foreach fn in array array[
    'public.bc_assign_founding_member()',
    'public.bc_founder_status()',
    'public.bc_liquidity_status()',
    'public.bc_membership_status()',
    'public.bc_my_referral_code()',
    'public.bc_growth_funnel_snapshot()'
  ] loop
    if has_function_privilege('anon',fn,'EXECUTE') then
      raise exception 'anonymous role can execute %',fn;
    end if;
  end loop;

  if has_function_privilege('authenticated','public.bc_assign_founding_member()','EXECUTE')
  then raise exception 'authenticated role can execute trigger helper'; end if;
  if has_function_privilege('authenticated','public.bc_growth_funnel_snapshot()','EXECUTE')
  then raise exception 'authenticated role can execute global analytics helper'; end if;

  foreach fn in array array[
    'public.bc_founder_status()',
    'public.bc_liquidity_status()',
    'public.bc_membership_status()',
    'public.bc_my_referral_code()'
  ] loop
    if not has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'signed-in RPC lost execute privilege: %',fn;
    end if;
  end loop;
end $$;

do $$
declare seq text;
begin
  foreach seq in array array[
    'public.bc_membership_ordinal_seq',
    'public.growth_events_id_seq',
    'public.product_metrics_id_seq'
  ] loop
    if has_sequence_privilege('anon',seq,'USAGE') or has_sequence_privilege('authenticated',seq,'USAGE')
    then raise exception 'browser role retains sequence usage: %',seq; end if;
    if not has_sequence_privilege('service_role',seq,'USAGE')
    then raise exception 'service role lost sequence usage: %',seq; end if;
  end loop;
end $$;

begin;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
insert into public.profiles(id) values('00000000-0000-4000-8000-000000000101');
do $$
begin
  if (select membership_ordinal from public.profiles where id='00000000-0000-4000-8000-000000000101') <> 1
  then raise exception 'trigger helper stopped working after browser execute revoke'; end if;
  if public.bc_founder_status()<>1 or public.bc_liquidity_status()<>1 or public.bc_membership_status()<>1
  then raise exception 'signed-in status RPC failed'; end if;
  if public.bc_my_referral_code()<>'TEST' then raise exception 'signed-in referral RPC failed'; end if;
end $$;
rollback;

set role postgres;
create function public.bc_default_acl_probe()
returns boolean language sql set search_path='' as $ select true $;
reset role;

do $$
begin
  if has_function_privilege('anon','public.bc_default_acl_probe()','EXECUTE')
     or has_function_privilege('authenticated','public.bc_default_acl_probe()','EXECUTE')
  then raise exception 'new function inherited browser execute privilege'; end if;
  if not has_function_privilege('service_role','public.bc_default_acl_probe()','EXECUTE')
  then raise exception 'new function not executable by service role'; end if;
end $$;
set role postgres;
drop function public.bc_default_acl_probe();
reset role;

select 'browser RPC privilege hardening passed' as result;
