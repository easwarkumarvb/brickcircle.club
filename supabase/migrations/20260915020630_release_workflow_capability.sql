-- Deployment-safe capability boundary for the owner-controlled release workflow.
-- This function is deliberately read-only: clients may call it before exposing
-- release controls without probing the destructive transition itself.

create or replace function public.bc_exchange_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'release_item', coalesce(
      pg_catalog.has_function_privilege(
        current_user,
        pg_catalog.to_regprocedure('public.release_exchange_item(uuid,text)'),
        'EXECUTE'
      ),
      false
    )
  );
$$;

revoke all on function public.bc_exchange_capabilities() from public, anon;
grant execute on function public.bc_exchange_capabilities() to authenticated;

comment on function public.bc_exchange_capabilities() is
  'Read-only PostgREST capability contract for deployment-safe exchange workflow rollout.';

-- Function DDL normally invalidates PostgREST automatically. The explicit reload
-- also repairs projects whose schema cache remained stale after an earlier deploy.
notify pgrst, 'reload schema';
