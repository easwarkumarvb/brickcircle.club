-- Close browser-facing privilege gaps without changing application behavior.
-- Signed-in RPCs stay available to authenticated users; trigger/admin helpers do not.

revoke all on function public.bc_assign_founding_member() from public, anon, authenticated;
grant execute on function public.bc_assign_founding_member() to service_role;

revoke all on function public.bc_growth_funnel_snapshot() from public, anon, authenticated;
grant execute on function public.bc_growth_funnel_snapshot() to service_role;

revoke all on function public.bc_founder_status() from public, anon;
revoke all on function public.bc_liquidity_status() from public, anon;
revoke all on function public.bc_membership_status() from public, anon;
revoke all on function public.bc_my_referral_code() from public, anon;

grant execute on function public.bc_founder_status() to authenticated, service_role;
grant execute on function public.bc_liquidity_status() to authenticated, service_role;
grant execute on function public.bc_membership_status() to authenticated, service_role;
grant execute on function public.bc_my_referral_code() to authenticated, service_role;

revoke all on sequence public.bc_membership_ordinal_seq from public, anon, authenticated;
revoke all on sequence public.growth_events_id_seq from public, anon, authenticated;
revoke all on sequence public.product_metrics_id_seq from public, anon, authenticated;

grant usage, select on sequence public.bc_membership_ordinal_seq to service_role;
grant usage, select on sequence public.growth_events_id_seq to service_role;
grant usage, select on sequence public.product_metrics_id_seq to service_role;

-- New functions are private by default. Client RPCs must be granted deliberately.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
