-- BrickCircle peer-trust privacy and legacy-boundary hardening.
-- Forward-only follow-up to 20261001210000_peer_trust_exchange_hardening.sql.

-- Support requests are out-of-band communications with BrickCircle support.
-- The counterparty must not be able to read safety/account/technical support notes.
drop policy if exists "peer participants read support requests" on public.exchange_case_support_requests;
drop policy if exists "support requester reads own requests" on public.exchange_case_support_requests;
create policy "support requester reads own requests"
on public.exchange_case_support_requests for select to authenticated
using ((select auth.uid())=requested_by);

-- A reviewer may always see their own submitted review. The counterparty review
-- remains hidden until both peers submit or the 14-day reveal window opens.
create or replace function public.get_peer_exchange_reviews(p_case_id uuid)
returns table(
  id uuid,case_id uuid,reviewer_id uuid,reviewee_id uuid,overall_rating integer,
  return_reliability integer,set_accuracy integer,communication integer,
  condition_accuracy integer,would_exchange_again boolean,comment text,created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; review_count integer; first_reveal timestamptz;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select * into c from public.exchange_cases where public.exchange_cases.id=p_case_id;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;

  select pg_catalog.count(*),pg_catalog.min(r.reveal_after)
    into review_count,first_reveal
    from public.exchange_case_reviews r where r.case_id=p_case_id;

  if review_count<2 and (first_reveal is null or pg_catalog.now()<first_reveal) then
    return query
    select r.id,r.case_id,r.reviewer_id,r.reviewee_id,r.overall_rating,
      r.return_reliability,r.set_accuracy,r.communication,r.condition_accuracy,
      r.would_exchange_again,r.comment,r.created_at
    from public.exchange_case_reviews r
    where r.case_id=p_case_id and r.reviewer_id=me
    order by r.created_at,r.id;
    return;
  end if;

  return query
  select r.id,r.case_id,r.reviewer_id,r.reviewee_id,r.overall_rating,
    r.return_reliability,r.set_accuracy,r.communication,r.condition_accuracy,
    r.would_exchange_again,r.comment,r.created_at
  from public.exchange_case_reviews r where r.case_id=p_case_id order by r.created_at,r.id;
end;
$$;

-- Public reputation must not convert a one-sided allegation into an objective
-- unresolved mark. Count only explicitly unresolved issues where the subject
-- has engaged by responding or by recording an issue-status action.
create or replace function public.exchange_peer_reputation_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  me uuid:=auth.uid();
  completed_count integer:=0;
  tracked_returns integer:=0;
  on_time_returns integer:=0;
  unique_counterparties integer:=0;
  unresolved_issues integer:=0;
  revealed_reviews integer:=0;
  avg_rating numeric;
  exchange_again_pct numeric;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'Collector unavailable'; end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where c.return_due_at is not null)::integer,
    pg_catalog.count(*) filter (
      where c.return_due_at is not null
        and coalesce(greatest(c.return_confirmed_a_at,c.return_confirmed_b_at),c.completed_at)<=c.return_due_at
    )::integer,
    pg_catalog.count(distinct case when c.user_a=p_user_id then c.user_b else c.user_a end)::integer
  into completed_count,tracked_returns,on_time_returns,unique_counterparties
  from public.exchange_cases c
  where c.state='COMPLETED' and p_user_id in (c.user_a,c.user_b);

  select pg_catalog.count(*)::integer into unresolved_issues
  from public.exchange_case_issues i
  where i.subject_user_id=p_user_id
    and i.status='unresolved'
    and (
      exists(
        select 1 from public.exchange_case_issue_responses ir
        where ir.issue_id=i.id and ir.responder_id=p_user_id
      )
      or exists(
        select 1 from public.exchange_case_events ev
        where ev.case_id=i.case_id
          and ev.event_type='peer_issue_status'
          and ev.actor_user_id=p_user_id
          and ev.metadata->>'issue_id'=i.id::text
      )
    );

  select
    pg_catalog.count(*)::integer,
    pg_catalog.round(pg_catalog.avg(r.overall_rating)::numeric,2),
    pg_catalog.round(
      (100.0*pg_catalog.count(*) filter (where r.would_exchange_again))
      / nullif(pg_catalog.count(*),0),1
    )
  into revealed_reviews,avg_rating,exchange_again_pct
  from public.exchange_case_reviews r
  where r.reviewee_id=p_user_id
    and (
      pg_catalog.now()>=r.reveal_after
      or exists(
        select 1 from public.exchange_case_reviews counterpart
        where counterpart.case_id=r.case_id and counterpart.reviewer_id<>r.reviewer_id
      )
    );

  return pg_catalog.jsonb_build_object(
    'user_id',p_user_id,
    'completed_exchanges',completed_count,
    'return_tracked_exchanges',tracked_returns,
    'on_time_returns',on_time_returns,
    'on_time_return_percentage',case when tracked_returns=0 then null
      else pg_catalog.round((100.0*on_time_returns/tracked_returns)::numeric,1) end,
    'unresolved_issue_count',unresolved_issues,
    'unique_counterparties',unique_counterparties,
    'revealed_review_count',revealed_reviews,
    'overall_rating',avg_rating,
    'would_exchange_again_percentage',exchange_again_pct
  );
end;
$$;

-- The generic admin resolution function is intentionally disabled for ALL
-- runtime roles, `service_role` included: this product has no normal admin
-- arbitration, so no caller may force a DISPUTED/HANDOFF_ISSUE case to
-- COMPLETED/CANCELLED and emit `admin_resolved`. `public`/`anon`/`authenticated`
-- and `service_role` are all revoked here as a defensive idempotent guard.
-- The function itself is intentionally not dropped, because historical schema
-- and migration objects may still reference it; only its executability by
-- normal runtime roles is removed. Technical legacy migration repair is
-- performed solely through reconcile_exchange_quarantine_case(), which stays
-- service-role-only and restricted to quarantined/migration-review cases.
do $$
begin
  if pg_catalog.to_regprocedure('public.resolve_exchange_case(uuid,bigint,text,text,text)') is not null then
    execute 'revoke execute on function public.resolve_exchange_case(uuid,bigint,text,text,text) from public,anon,authenticated,service_role';
  end if;
end;
$$;

revoke all on function public.get_peer_exchange_reviews(uuid) from public,anon;
revoke all on function public.exchange_peer_reputation_summary(uuid) from public,anon;
grant execute on function public.get_peer_exchange_reviews(uuid),
  public.exchange_peer_reputation_summary(uuid) to authenticated;

comment on function public.get_peer_exchange_reviews(uuid) is
  'Double-blind peer-review reader: own submitted review is visible to its author; counterparty content reveals only after both submit or the reveal deadline.';
comment on function public.exchange_peer_reputation_summary(uuid) is
  'Objective peer reputation summary; one-sided issue allegations are excluded from the unresolved reputation metric until the subject engages.';
comment on table public.exchange_case_support_requests is
  'Out-of-band support requests readable by the requester and service role only; requests never alter exchange lifecycle or decide fault.';

notify pgrst,'reload schema';
