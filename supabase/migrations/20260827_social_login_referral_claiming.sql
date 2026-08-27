create or replace function public.bc_claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.referrals%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(p_code),'') is null then return jsonb_build_object('ok',false,'reason','missing_code'); end if;
  select * into r from public.referrals where upper(code)=upper(trim(p_code)) and status='active' for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid_code'); end if;
  if r.referrer_id=me then return jsonb_build_object('ok',false,'reason','self_referral'); end if;
  if r.claimed_by is not null then return jsonb_build_object('ok',false,'reason','already_claimed'); end if;
  update public.referrals set claimed_by=me,status='claimed',claimed_at=now() where id=r.id;
  insert into public.growth_events(user_id,event_name,properties) values(me,'referral_claimed',jsonb_build_object('referrer_id',r.referrer_id,'code',r.code));
  insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
  values(r.referrer_id,'referral','Your BrickCircle invite worked','A collector joined BrickCircle using your invite. Their activity can now create more local matches for you.','#growth','referral-claimed-'||me::text)
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
  return jsonb_build_object('ok',true,'referrer_id',r.referrer_id);
end;
$$;
revoke all on function public.bc_claim_referral(text) from public, anon;
grant execute on function public.bc_claim_referral(text) to authenticated;

create or replace function public.bc_record_auth_provider(p_provider text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.growth_events(user_id,event_name,properties)
  values(auth.uid(),'auth_completed',jsonb_build_object('provider',lower(trim(coalesce(p_provider,'unknown')))));
end;
$$;
revoke all on function public.bc_record_auth_provider(text) from public, anon;
grant execute on function public.bc_record_auth_provider(text) to authenticated;