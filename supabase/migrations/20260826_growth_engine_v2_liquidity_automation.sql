-- BrickCircle Growth Engine V2
-- Production migration applied 2026-08-26. Idempotent definitions retained in source control.

create extension if not exists pg_cron with schema extensions;

create table if not exists public.growth_member_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  match_ready_at timestamptz,
  first_match_alert_at timestamptz,
  last_campaign_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.growth_member_state enable row level security;
revoke all on public.growth_member_state from anon, authenticated;
grant all on public.growth_member_state to service_role;

create index if not exists growth_events_name_created_idx on public.growth_events(event_name, created_at desc);
create index if not exists growth_events_user_name_created_idx on public.growth_events(user_id, event_name, created_at desc);
create index if not exists profiles_city_country_idx on public.profiles(lower(country), lower(city)) where city is not null and country is not null;

create or replace function public.bc_growth_is_match_ready(p_user uuid)
returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.collection_items c where c.user_id=p_user)
     and exists(select 1 from public.collection_items c where c.user_id=p_user and c.available_for_exchange=true)
     and exists(select 1 from public.wishlists w where w.user_id=p_user);
$$;
revoke all on function public.bc_growth_is_match_ready(uuid) from public,anon,authenticated;
grant execute on function public.bc_growth_is_match_ready(uuid) to service_role;

create or replace function public.bc_refresh_growth_for_user(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_collection bigint; v_available bigint; v_wishlist bigint; v_city text; v_country text; v_ready boolean; r record;
begin
  if p_user is null or not exists(select 1 from public.profiles where id=p_user) then return jsonb_build_object('ok',false,'reason','unknown_user'); end if;
  insert into public.growth_member_state(user_id) values(p_user) on conflict(user_id) do nothing;
  select count(*),count(*) filter(where available_for_exchange),(select count(*) from public.wishlists w where w.user_id=p_user)
    into v_collection,v_available,v_wishlist from public.collection_items c where c.user_id=p_user;
  select nullif(trim(city),''),nullif(trim(country),'') into v_city,v_country from public.profiles where id=p_user;
  v_ready:=v_collection>0 and v_available>0 and v_wishlist>0;

  if v_collection=0 then
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(p_user,'onboarding','Add your first LEGO set','Add at least one LEGO set to your collection so BrickCircle can start building your exchange graph.','#catalogue','v2-activation-collection')
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif v_wishlist=0 then
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(p_user,'wishlist','Tell BrickCircle what you want','Add a few sets to your wishlist. Reciprocal matching only works when BrickCircle knows what you would like to borrow.','#wishlist','v2-activation-wishlist')
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif v_available=0 then
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(p_user,'collection','Make one set exchangeable','Mark at least one collection item available. That turns your wishlist into a live exchange opportunity.','#collection','v2-activation-availability')
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if v_ready then
    update public.growth_member_state set match_ready_at=coalesce(match_ready_at,now()),updated_at=now() where user_id=p_user;
    if not exists(select 1 from public.growth_events where user_id=p_user and event_name='match_ready') then
      insert into public.growth_events(user_id,event_name,properties)
      values(p_user,'match_ready',jsonb_build_object('collection_count',v_collection,'available_count',v_available,'wishlist_count',v_wishlist,'city',v_city,'country',v_country));
    end if;
    for r in
      select distinct c2.user_id other_user,c1.set_number my_set,c2.set_number their_set,l1.name my_name,l2.name their_name
      from public.collection_items c1
      join public.profiles p1 on p1.id=c1.user_id
      join public.collection_items c2 on c2.user_id<>p_user and c2.available_for_exchange=true
      join public.profiles p2 on p2.id=c2.user_id
      join public.wishlists w1 on w1.user_id=p_user and w1.set_number=c2.set_number
      join public.wishlists w2 on w2.user_id=c2.user_id and w2.set_number=c1.set_number
      join public.lego_sets l1 on l1.set_number=c1.set_number join public.lego_sets l2 on l2.set_number=c2.set_number
      where c1.user_id=p_user and c1.available_for_exchange=true
        and lower(trim(coalesce(p1.country,'')))=lower(trim(coalesce(p2.country,'')))
        and lower(trim(coalesce(p1.city,'')))=lower(trim(coalesce(p2.city,''))) limit 5
    loop
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(p_user,'match','You have a reciprocal LEGO match','A collector in your city has '||r.their_name||' and wants your '||r.my_name||'. Open Matches to review the exchange.','#matches','v2-reciprocal-'||r.other_user::text||'-'||r.my_set||'-'||r.their_set)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      update public.growth_member_state set first_match_alert_at=coalesce(first_match_alert_at,now()),updated_at=now() where user_id=p_user;
    end loop;
  end if;

  if v_city is not null and v_country is not null and v_wishlist>0 then
    for r in
      select distinct owner.user_id owner_user,owner.set_number,ls.name
      from public.wishlists w join public.collection_items owner on owner.set_number=w.set_number and owner.available_for_exchange=true and owner.user_id<>p_user
      join public.profiles op on op.id=owner.user_id join public.lego_sets ls on ls.set_number=owner.set_number
      where w.user_id=p_user and lower(trim(op.country))=lower(trim(v_country)) and lower(trim(op.city))=lower(trim(v_city))
        and not exists(select 1 from public.wishlists ow join public.collection_items mine on mine.user_id=p_user and mine.available_for_exchange=true and mine.set_number=ow.set_number where ow.user_id=owner.user_id)
      limit 5
    loop
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(r.owner_user,'match','A nearby collector wants your '||r.name,'There is active local demand for your '||r.name||'. Add sets you would like to borrow to see whether BrickCircle can turn this into a reciprocal exchange.','#wishlist','v2-near-match-'||r.set_number||'-'||p_user::text||'-'||to_char(current_date,'IYYY-IW'))
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'match_ready',v_ready,'collection_count',v_collection,'available_count',v_available,'wishlist_count',v_wishlist);
end $$;
revoke all on function public.bc_refresh_growth_for_user(uuid) from public,anon,authenticated;
grant execute on function public.bc_refresh_growth_for_user(uuid) to service_role;

create or replace function public.bc_growth_refresh_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.bc_refresh_growth_for_user(coalesce(new.user_id,old.user_id)); return coalesce(new,old); end $$;
revoke all on function public.bc_growth_refresh_trigger() from public,anon,authenticated;
drop trigger if exists trg_growth_v2_collection on public.collection_items;
create trigger trg_growth_v2_collection after insert or delete or update of available_for_exchange,set_number on public.collection_items for each row execute function public.bc_growth_refresh_trigger();
drop trigger if exists trg_growth_v2_wishlist on public.wishlists;
create trigger trg_growth_v2_wishlist after insert or delete or update of set_number,priority on public.wishlists for each row execute function public.bc_growth_refresh_trigger();

create or replace function public.bc_queue_member_growth_email() returns trigger language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
  select nullif(trim(email),'') into v_email from public.profiles where id=new.user_id;
  if v_email is null then return new; end if;
  insert into public.email_outbox(user_id,notification_id,recipient_email,template_key,subject,payload)
  values(new.user_id,new.id,v_email,'growth_v2',new.title,jsonb_build_object('title',new.title,'body',new.body,'kind',new.kind,'cta_hash',new.cta_hash)) on conflict do nothing;
  return new;
end $$;
revoke all on function public.bc_queue_member_growth_email() from public,anon,authenticated;
drop trigger if exists trg_growth_v2_email_queue on public.member_notifications;
create trigger trg_growth_v2_email_queue after insert on public.member_notifications for each row execute function public.bc_queue_member_growth_email();

create or replace function public.bc_run_growth_campaigns(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; v_processed integer:=0; v_ready boolean; v_last_activity timestamptz; v_city_ready integer; d record;
begin
  for r in select p.id,p.city,p.country,p.member_since from public.profiles p order by p.created_at limit greatest(1,least(coalesce(p_limit,500),5000)) loop
    v_processed:=v_processed+1; perform public.bc_refresh_growth_for_user(r.id); v_ready:=public.bc_growth_is_match_ready(r.id);
    if not v_ready and now()-coalesce(r.member_since,now())>=interval '1 day' then
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key) values(r.id,'onboarding','Finish becoming match-ready','You are one step away from letting BrickCircle search for exchanges. Complete your collection, availability and wishlist setup.','#catalogue','v2-activation-day1') on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    if not v_ready and now()-coalesce(r.member_since,now())>=interval '3 days' then
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key) values(r.id,'onboarding','Unlock your first BrickCircle match','Collectors can only discover a reciprocal opportunity once you have an exchangeable set and wishlist demand. Finish those two signals now.','#catalogue','v2-activation-day3') on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    select max(created_at) into v_last_activity from public.growth_events where user_id=r.id;
    if v_ready and coalesce(v_last_activity,r.member_since,now())<now()-interval '14 days' then
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key) values(r.id,'match','See what changed in your local LEGO exchange market','New collections and wishlists may have created opportunities since your last activity. Check your matches and local demand.','#matches','v2-reactivate-'||to_char(current_date,'IYYY-IW')) on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    if nullif(trim(r.city),'') is not null and nullif(trim(r.country),'') is not null then
      select count(*) into v_city_ready from public.profiles p2 where lower(trim(p2.city))=lower(trim(r.city)) and lower(trim(p2.country))=lower(trim(r.country)) and public.bc_growth_is_match_ready(p2.id);
      if v_city_ready>=3 then
        insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key) values(r.id,'match',v_city_ready||' match-ready collectors are active in '||r.city,'BrickCircle now has enough local activity to make checking Matches worthwhile. See what collectors in your city are offering and wanting.','#matches','v2-city-liquidity-'||lower(regexp_replace(r.country||'-'||r.city,'[^a-zA-Z0-9]+','-','g'))||'-'||to_char(current_date,'IYYY-IW')) on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end if;
    update public.growth_member_state set last_campaign_at=now(),updated_at=now() where user_id=r.id;
  end loop;
  for d in
    select owner.user_id,owner.set_number,ls.name,p.city,count(distinct w.user_id) demanders from public.collection_items owner join public.profiles p on p.id=owner.user_id join public.lego_sets ls on ls.set_number=owner.set_number join public.wishlists w on w.set_number=owner.set_number and w.user_id<>owner.user_id join public.profiles wp on wp.id=w.user_id and lower(trim(wp.city))=lower(trim(p.city)) and lower(trim(wp.country))=lower(trim(p.country)) where owner.available_for_exchange=true and nullif(trim(p.city),'') is not null and nullif(trim(p.country),'') is not null group by owner.user_id,owner.set_number,ls.name,p.city having count(distinct w.user_id)>=2 limit 500
  loop
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key) values(d.user_id,'collection',d.demanders||' collectors in '||d.city||' want your '||d.name,'Your set has local wishlist demand. Keep it exchangeable and expand your wishlist to improve the chance of a reciprocal match.','#wishlist','v2-set-demand-'||d.set_number||'-'||to_char(current_date,'IYYY-IW')) on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end loop;
  return jsonb_build_object('ok',true,'processed_users',v_processed,'ran_at',now());
end $$;
revoke all on function public.bc_run_growth_campaigns(integer) from public,anon,authenticated;
grant execute on function public.bc_run_growth_campaigns(integer) to service_role;

create or replace function public.bc_growth_funnel_snapshot()
returns table(total_members bigint,members_with_collection bigint,members_with_available bigint,members_with_wishlist bigint,match_ready_members bigint,members_with_match_alert bigint,exchange_requesters bigint,accepted_exchanges bigint,completed_exchanges bigint)
language sql security definer set search_path=public as $$
select (select count(*) from public.profiles),(select count(distinct user_id) from public.collection_items),(select count(distinct user_id) from public.collection_items where available_for_exchange=true),(select count(distinct user_id) from public.wishlists),(select count(*) from public.profiles p where public.bc_growth_is_match_ready(p.id)),(select count(distinct user_id) from public.member_notifications where kind='match'),(select count(distinct requester_id) from public.exchange_requests),(select count(*) from public.exchange_requests where status='accepted'),(select count(*) from public.exchanges where state='completed');
$$;
revoke all on function public.bc_growth_funnel_snapshot() from public,anon;
grant execute on function public.bc_growth_funnel_snapshot() to authenticated,service_role;

select cron.unschedule(jobid) from cron.job where jobname='brickcircle-growth-engine-v2';
select cron.schedule('brickcircle-growth-engine-v2','17 * * * *',$$select public.bc_run_growth_campaigns(500);$$);
select public.bc_refresh_growth_for_user(id) from public.profiles;
