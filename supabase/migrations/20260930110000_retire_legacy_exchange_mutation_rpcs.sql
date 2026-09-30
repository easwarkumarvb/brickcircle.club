-- Retire the last two legacy SECURITY DEFINER exchange mutation RPCs now that
-- the canonical exchange frontend is live. The functions and historical data
-- remain for audit; only execution capability is removed.

revoke all on function public.advance_exchange(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.submit_exchange_review(uuid,integer,text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
