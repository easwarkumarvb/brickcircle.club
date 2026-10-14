-- Source-only additive migration; no raw analytics tables or client-side auth data.
create function public.admin_growth_report(p_days integer default 28)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_end timestamptz; v_start timestamptz; v_previous timestamptz; v_result jsonb;
begin
  perform private.assert_marketplace_admin();
  if p_days is null or p_days not in (7,28,90) then
    raise exception 'Choose 7, 28 or 90 days' using errcode='22023';
  end if;
  v_end := pg_catalog.now();
  v_start := (pg_catalog.date_trunc('day',v_end at time zone 'UTC') - (p_days-1)*interval '1 day') at time zone 'UTC';
  v_previous := v_start - (v_end-v_start);
  with windows as (
    select 'current'::text label,v_start lo,v_end hi union all select 'previous',v_previous,v_start
  ), completions as (
    select id,user_a,user_b,completed_at from public.exchange_cases where state='COMPLETED' and completed_at<v_end
  ), participants as (
    select id,user_a collector,completed_at from completions union all select id,user_b,completed_at from completions
  ), repeat_rows as (
    select w.label,p.collector from windows w join participants p on p.completed_at<w.hi
    group by w.label,p.collector,w.lo
    having count(*)>=2 and count(*) filter(where p.completed_at>=w.lo)>0
  ), metric_rows as (
    select w.label,
      (select count(*) from auth.users u where u.created_at>=w.lo and u.created_at<w.hi) new_registrations,
      (select count(distinct e.actor_user_id) from public.exchange_case_events e where e.created_at>=w.lo and e.created_at<w.hi) active_exchange_collectors,
      (select count(*) from public.exchange_cases c where c.created_at>=w.lo and c.created_at<w.hi) proposals,
      (select count(*) from public.exchange_cases c where c.accepted_at>=w.lo and c.accepted_at<w.hi) accepted,
      (select count(*) from public.exchange_cases c where c.handoff_at>=w.lo and c.handoff_at<w.hi) handoffs,
      (select count(*) from completions c where c.completed_at>=w.lo and c.completed_at<w.hi) completed_exchanges,
      (select count(*) from repeat_rows r where r.label=w.label) repeat_collectors,
      (select count(*) from public.exchange_cases c where c.cancelled_at>=w.lo and c.cancelled_at<w.hi) cancellations
    from windows w
  ), metrics as (
    select pg_catalog.jsonb_object_agg(key,value) body from (
      select kv.key,pg_catalog.jsonb_object_agg(m.label,kv.value) value from metric_rows m
      cross join lateral pg_catalog.jsonb_each(pg_catalog.to_jsonb(m)-'label') kv group by kv.key
    ) grouped
  ), readiness as (
    select u.id,u.created_at,u.email_confirmed_at,
      nullif(pg_catalog.lower(pg_catalog.btrim(p.country)),'') country,
      nullif(public.normalize_city(p.country,p.city),'') city,
      (u.email_confirmed_at is not null and u.email_confirmed_at<v_end and p.adult_confirmed_at is not null
       and nullif(pg_catalog.btrim(p.display_name),'') is not null
       and nullif(pg_catalog.btrim(p.country),'') is not null and nullif(public.normalize_city(p.country,p.city),'') is not null
       and exists(select 1 from public.collection_items i where i.user_id=u.id and nullif(pg_catalog.btrim(i.owner_photo_path),'') is not null)
       and exists(select 1 from public.wishlists wl where wl.user_id=u.id)) ready
    from auth.users u left join public.profiles p on p.id=u.id where u.created_at<v_end
  ), city_rows as (
    select r.country,r.city,count(*) registered,count(*) filter(where r.ready) ready,
      (select count(*) from public.collection_items i join readiness owner on owner.id=i.user_id
       where owner.country=r.country and owner.city=r.city and i.available_for_exchange
       and not i.exchange_review_required and nullif(pg_catalog.btrim(i.owner_photo_path),'') is not null
       and not exists(select 1 from public.exchange_case_item_locks l where l.item_id=i.id)) available_sets,
      (select count(*) from completions c where c.completed_at>=v_start and exists(
        select 1 from readiness party where party.id in(c.user_a,c.user_b) and party.country=r.country and party.city=r.city)) completed_exchanges
    from readiness r where r.country is not null and r.city is not null group by r.country,r.city
    order by registered desc,r.country,r.city limit 20
  ), registrations_daily as (
    select (u.created_at at time zone 'UTC')::date date,count(*) registrations
    from auth.users u where u.created_at>=v_start and u.created_at<v_end group by 1
  ), completions_daily as (
    select (c.completed_at at time zone 'UTC')::date date,count(*) completed_exchanges
    from completions c where c.completed_at>=v_start group by 1
  ), daily_rows as (
    select d.day::date date,coalesce(r.registrations,0) registrations,coalesce(c.completed_exchanges,0) completed_exchanges
    from pg_catalog.generate_series(v_start at time zone 'UTC',pg_catalog.date_trunc('day',v_end at time zone 'UTC'),interval '1 day') d(day)
    left join registrations_daily r on r.date=d.day::date
    left join completions_daily c on c.date=d.day::date
  )
  select pg_catalog.jsonb_build_object(
    'version',1,'days',p_days,'generated_at',v_end,'start_at',v_start,'end_at',v_end,'previous_start_at',v_previous,
    'metrics',(select body from metrics),
    'activation',(select pg_catalog.jsonb_build_object('registered',count(*),'email_verified',count(*) filter(where email_confirmed_at<v_end),'ready',count(*) filter(where ready)) from readiness where created_at>=v_start),
    'exchange_cohort',(select pg_catalog.jsonb_build_object('proposed',count(*),'accepted',count(*) filter(where accepted_at<v_end),'handed_off',count(*) filter(where handoff_at<v_end),'completed',count(*) filter(where state='COMPLETED' and completed_at<v_end),'cancelled',count(*) filter(where cancelled_at<v_end)) from public.exchange_cases where created_at>=v_start and created_at<v_end),
    'daily',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.date) from daily_rows d),'[]'::jsonb),
    'cities',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.registered desc,c.country,c.city) from city_rows c),'[]'::jsonb),
    'health',pg_catalog.jsonb_build_object(
      'active_custody',(select count(*) from public.exchange_cases where handoff_at<v_end and state not in('COMPLETED','CANCELLED','DECLINED','WITHDRAWN','EXPIRED')),
      'overdue_returns',(select count(*) from public.exchange_cases where handoff_at<v_end and return_due_at<v_end and state not in('COMPLETED','CANCELLED','DECLINED','WITHDRAWN','EXPIRED')),
      'unresolved_issues',(select count(*) from public.exchange_cases c where c.state in('HANDOFF_ISSUE','DISPUTED') or exists(select 1 from public.exchange_case_issues i where i.case_id=c.id and i.status<>'resolved')),
      'open_support',(select count(*) from public.exchange_case_support_requests s left join private.marketplace_admin_revisions r on r.entity_type='support' and r.entity_id=s.id::text where coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end)<>'resolved')),
    'coverage',pg_catalog.jsonb_build_array('Canonical exchange activity only; visits and logins are not tracked.','Today is partial in UTC; comparison uses the same elapsed duration.','Readiness, cities and health are current snapshots, not historical activation.','Proposal cohorts are still maturing; later stages are observed by report end.','Available sets are current unlocked inventory, not reciprocal match opportunities.','Legacy migration timestamps may reflect incomplete historical stages.'),
    'definitions',pg_catalog.jsonb_build_object(
      'new_registrations','Auth account creation in the half-open window; profile timestamps are not signup evidence.',
      'active_exchange_collectors','Distinct non-null actors of canonical exchange events; not site visitors.',
      'proposals','Canonical cases created in the window, including imported cases.',
      'accepted','Cases with acceptance timestamp in the window.',
      'handoffs','Cases with actual handoff timestamp in the window.',
      'completed_exchanges','Cases currently COMPLETED with completion timestamp in the window.',
      'repeat_collectors','Distinct participants completing in the window with at least two lifetime canonical completions before that window end.',
      'cancellations','Cases with cancellation timestamp in the window; declines, withdrawals and expiries are separate outcomes.',
      'activation','Signup cohort; verified email and CURRENT adult-confirmed named locality profile, owner primary photo and wishlist define readiness.',
      'exchange_cohort','Cases proposed in the selected window and stages observed before end; incomplete cohorts are not conversion rates.',
      'cities','Top 20 current country and normalized city groups by registered accounts; each touching completed case counted once per city.',
      'health','Current custody requires actual handoff and nonterminal state; overdue requires custody plus past return due; issues count distinct cases with non-resolved issue records or legacy HANDOFF_ISSUE/DISPUTED state; support follows admin triage status.'
    )) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_growth_report(integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_growth_report(integer) to authenticated;
comment on function public.admin_growth_report(integer) is 'Version 1 bounded aggregate growth report, gated by live administrator session and AAL2. No personal records.';
