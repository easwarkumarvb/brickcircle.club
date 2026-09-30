-- Authorize the BrickCircle administrator dashboard from the canonical
-- server-owned administrator allowlist. The helper exposes only a boolean for
-- the currently authenticated JWT identity; the private allowlist stays private.

create or replace function public.is_exchange_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from private.exchange_admins a
      where a.user_id = auth.uid()
    );
$$;

revoke all on function public.is_exchange_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_exchange_admin() to authenticated;

comment on function public.is_exchange_admin() is
  'Returns whether the authenticated JWT identity is in the private BrickCircle exchange administrator allowlist.';

notify pgrst, 'reload schema';
