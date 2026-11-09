-- Fixed-window rate limit for the shared admin gate. One row per administrator,
-- private storage only, and nested admin RPC calls in a single request count once.
create table private.admin_rpc_rate_limits (
  admin_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count between 0 and 60)
);
alter table private.admin_rpc_rate_limits enable row level security;
revoke all on private.admin_rpc_rate_limits from public,anon,authenticated,service_role;

create function private.assert_admin_rpc_rate_limit() returns void
language plpgsql security definer set search_path='' as $$
declare
  v_admin uuid := auth.uid();
  v_window timestamptz := pg_catalog.date_trunc('minute',pg_catalog.now());
  v_window_start timestamptz;
  v_count integer;
begin
  -- Nested admin RPCs share one transaction; count the request only once.
  if pg_catalog.current_setting('brickcircle.admin_rpc_rate_limited',true)='1' then
    return;
  end if;
  delete from private.admin_rpc_rate_limits
    where window_start < pg_catalog.now() - interval '1 hour';
  insert into private.admin_rpc_rate_limits(admin_id,window_start,request_count)
    values(v_admin,v_window,0) on conflict(admin_id) do nothing;
  select window_start,request_count into v_window_start,v_count from private.admin_rpc_rate_limits
    where admin_id=v_admin for update;
  if v_window_start<>v_window then
    update private.admin_rpc_rate_limits set window_start=v_window,request_count=0 where admin_id=v_admin;
    v_count:=0;
  end if;
  if v_count>=60 then
    raise sqlstate 'PT429' using message='Admin request rate limit exceeded; retry within the next minute';
  end if;
  update private.admin_rpc_rate_limits set request_count=v_count+1 where admin_id=v_admin;
  perform pg_catalog.set_config('brickcircle.admin_rpc_rate_limited','1',true);
end;
$$;
revoke all on function private.assert_admin_rpc_rate_limit() from public,anon,authenticated,service_role;

create or replace function private.assert_marketplace_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_exchange_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if not exists (select 1 from auth.sessions s
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
      and (s.not_after is null or s.not_after>now())) then
    raise exception 'Active session required' using errcode='42501';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then
    raise exception 'Authenticator verification required' using errcode='PT403';
  end if;
  perform private.assert_admin_rpc_rate_limit();
end;
$$;
revoke all on function private.assert_marketplace_admin() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';