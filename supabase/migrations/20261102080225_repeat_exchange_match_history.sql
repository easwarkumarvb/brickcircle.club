-- Participant-only shared exchange history and repeat-aware discovery events.
-- Exchange cases remain authoritative; this adds only bounded read projections.

create index if not exists exchange_cases_shared_history_a_idx
  on public.exchange_cases(user_a,user_b,(coalesce(completed_at,handoff_at,created_at)) desc,id desc)
  include (state,completed_at,handoff_at,item_a,item_b)
  where (state='COMPLETED'
     or (handoff_at is not null and state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
     and not migration_review_required;
create index if not exists exchange_cases_shared_history_b_idx
  on public.exchange_cases(user_b,user_a,(coalesce(completed_at,handoff_at,created_at)) desc,id desc)
  include (state,completed_at,handoff_at,item_a,item_b)
  where (state='COMPLETED'
     or (handoff_at is not null and state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
     and not migration_review_required;
create index if not exists exchange_cases_completed_item_a_idx
  on public.exchange_cases(item_a,(coalesce(completed_at,created_at)) desc,id desc)
  where state='COMPLETED' and not migration_review_required;
create index if not exists exchange_cases_completed_item_b_idx
  on public.exchange_cases(item_b,(coalesce(completed_at,created_at)) desc,id desc)
  where state='COMPLETED' and not migration_review_required;

create or replace function public.shared_exchange_history(
  p_peer_ids uuid[],
  p_limit integer default 3
)
returns table(
  peer_id uuid,
  shared_count bigint,
  latest_at timestamptz,
  recent jsonb,
  has_more boolean
)
language plpgsql stable security invoker set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
  if p_peer_ids is null or pg_catalog.cardinality(p_peer_ids)>50
     or p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Invalid peer batch or history limit' using errcode='22023';
  end if;

  return query
  with requested as (
    select distinct requested_peer as peer_id
    from pg_catalog.unnest(p_peer_ids) requested_peer
    where requested_peer is not null and requested_peer<>auth.uid()
  )
  select requested.peer_id,
    history.shared_count,
    history.latest_at,
    history.recent,
    history.shared_count>pg_catalog.jsonb_array_length(history.recent)
  from requested
  cross join lateral (
    select count(*) as shared_count,
      (
        select case when c.state='COMPLETED' then c.completed_at else c.handoff_at end
        from public.exchange_cases c
        where ((c.user_a=auth.uid() and c.user_b=requested.peer_id)
            or (c.user_b=auth.uid() and c.user_a=requested.peer_id))
          and not c.migration_review_required
          and (c.state='COMPLETED'
            or (c.handoff_at is not null and c.state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
        order by coalesce(c.completed_at,c.handoff_at,c.created_at) desc,c.id desc
        limit 1
      ) as latest_at,
      coalesce((
        select pg_catalog.jsonb_agg(row_data order by sort_at desc,case_id desc)
        from (
          select c.id as case_id,c.state,
            case when c.state='COMPLETED' then c.completed_at else c.handoff_at end as occurred_at,
            coalesce(c.completed_at,c.handoff_at,c.created_at) as sort_at,
            case when c.user_a=auth.uid() then c.item_a else c.item_b end as offered_item,
            offered.set_number as offered_set,offered_set.name as offered_name,
            case when c.user_a=auth.uid() then c.item_b else c.item_a end as requested_item,
            requested.set_number as requested_set,requested_set.name as requested_name,
            pg_catalog.jsonb_build_object(
              'case_id',c.id,'state',c.state,
              'occurred_at',case when c.state='COMPLETED' then c.completed_at else c.handoff_at end,
              'sort_at',coalesce(c.completed_at,c.handoff_at,c.created_at),
              'offered_item',case when c.user_a=auth.uid() then c.item_a else c.item_b end,
              'offered_set',offered.set_number,'offered_name',offered_set.name,
              'requested_item',case when c.user_a=auth.uid() then c.item_b else c.item_a end,
              'requested_set',requested.set_number,'requested_name',requested_set.name
            ) as row_data
          from public.exchange_cases c
          join public.collection_items offered on offered.id=case when c.user_a=auth.uid() then c.item_a else c.item_b end
          join public.lego_sets offered_set on offered_set.set_number=offered.set_number
          join public.collection_items requested on requested.id=case when c.user_a=auth.uid() then c.item_b else c.item_a end
          join public.lego_sets requested_set on requested_set.set_number=requested.set_number
          where ((c.user_a=auth.uid() and c.user_b=requested.peer_id)
              or (c.user_b=auth.uid() and c.user_a=requested.peer_id))
            and not c.migration_review_required
            and (c.state='COMPLETED'
              or (c.handoff_at is not null and c.state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
          order by coalesce(c.completed_at,c.handoff_at,c.created_at) desc,c.id desc
          limit p_limit
        ) rows
      ),'[]'::jsonb) as recent
    from public.exchange_cases c
    where ((c.user_a=auth.uid() and c.user_b=requested.peer_id)
        or (c.user_b=auth.uid() and c.user_a=requested.peer_id))
      and not c.migration_review_required
      and (c.state='COMPLETED'
        or (c.handoff_at is not null and c.state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
  ) history;
end;
$$;

create or replace function public.shared_exchange_history_page(
  p_peer_id uuid,
  p_before_sort_at timestamptz default null,
  p_before_case_id uuid default null,
  p_limit integer default 20
)
returns table(
  case_id uuid,
  state text,
  occurred_at timestamptz,
  sort_at timestamptz,
  offered_item uuid,
  offered_set text,
  offered_name text,
  requested_item uuid,
  requested_set text,
  requested_name text,
  has_more boolean
)
language plpgsql stable security invoker set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
  if p_peer_id is null or p_peer_id=auth.uid()
     or (p_before_sort_at is null)<>(p_before_case_id is null)
     or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid peer, cursor, or history limit' using errcode='22023';
  end if;

  return query
  with candidates as (
    select c.id as case_id,c.state,
      case when c.state='COMPLETED' then c.completed_at else c.handoff_at end as occurred_at,
      coalesce(c.completed_at,c.handoff_at,c.created_at) as sort_at,
      case when c.user_a=auth.uid() then c.item_a else c.item_b end as offered_item,
      offered.set_number as offered_set,offered_set.name as offered_name,
      case when c.user_a=auth.uid() then c.item_b else c.item_a end as requested_item,
      requested.set_number as requested_set,requested_set.name as requested_name
    from public.exchange_cases c
    join public.collection_items offered on offered.id=case when c.user_a=auth.uid() then c.item_a else c.item_b end
    join public.lego_sets offered_set on offered_set.set_number=offered.set_number
    join public.collection_items requested on requested.id=case when c.user_a=auth.uid() then c.item_b else c.item_a end
    join public.lego_sets requested_set on requested_set.set_number=requested.set_number
    where ((c.user_a=auth.uid() and c.user_b=p_peer_id)
        or (c.user_b=auth.uid() and c.user_a=p_peer_id))
      and not c.migration_review_required
      and (c.state='COMPLETED'
        or (c.handoff_at is not null and c.state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
      and (p_before_sort_at is null
        or (coalesce(c.completed_at,c.handoff_at,c.created_at),c.id)<(p_before_sort_at,p_before_case_id))
    order by coalesce(c.completed_at,c.handoff_at,c.created_at) desc,c.id desc
    limit p_limit+1
  ), numbered as (
    select candidates.*,pg_catalog.row_number() over(order by sort_at desc,case_id desc) as row_number,
      pg_catalog.count(*) over() as fetched_count
    from candidates
  )
  select numbered.case_id,numbered.state,numbered.occurred_at,numbered.sort_at,
    numbered.offered_item,numbered.offered_set,numbered.offered_name,
    numbered.requested_item,numbered.requested_set,numbered.requested_name,
    numbered.fetched_count>p_limit
  from numbered
  where numbered.row_number<=p_limit
  order by numbered.sort_at desc,numbered.case_id desc;
end;
$$;

revoke all on function public.shared_exchange_history(uuid[],integer) from public,anon;
revoke all on function public.shared_exchange_history_page(uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.shared_exchange_history(uuid[],integer) to authenticated;
grant execute on function public.shared_exchange_history_page(uuid,timestamptz,uuid,integer) to authenticated;

create or replace function public.queue_new_reciprocal_match_notifications(p_changed_user uuid)
returns integer
language plpgsql security definer set search_path=''
as $$
declare inserted_count integer:=0;
begin
  if p_changed_user is null then return 0; end if;

  with reciprocal as (
    select distinct c1.user_id as recipient_id,c2.user_id as partner_id,
      c1.id as offered_item_id,c2.id as requested_item_id,
      c1.set_number as offered_set,c2.set_number as requested_set,
      coalesce(nullif(pg_catalog.btrim(p2.display_name),''),'A nearby collector') as partner_name,
      public.canonical_lego_product_identity(c1.set_number) as offered_identity,
      public.canonical_lego_product_identity(c2.set_number) as requested_identity
    from public.collection_items c1
    join public.lego_sets l1 on l1.set_number=c1.set_number
    join public.profiles p1 on p1.id=c1.user_id and p1.adult_confirmed_at is not null
    join public.collection_items c2 on c2.available_for_exchange and not c2.exchange_review_required and c2.user_id<>c1.user_id
    join public.profiles p2 on p2.id=c2.user_id and p2.adult_confirmed_at is not null
    join public.lego_sets l2 on l2.set_number=c2.set_number
    join public.wishlists w1 on w1.user_id=c1.user_id
      and public.canonical_lego_product_identity(w1.set_number)=public.canonical_lego_product_identity(c2.set_number)
    join public.wishlists w2 on w2.user_id=c2.user_id
      and public.canonical_lego_product_identity(w2.set_number)=public.canonical_lego_product_identity(c1.set_number)
    where c1.available_for_exchange and not c1.exchange_review_required
      and c1.owner_photo_path is not null and c2.owner_photo_path is not null
      and c1.condition is not null and c2.condition is not null
      and c1.completeness is not null and c2.completeness is not null
      and (c1.user_id=p_changed_user or c2.user_id=p_changed_user)
      and not exists(select 1 from public.exchange_case_item_locks l where l.item_id in (c1.id,c2.id))
      and not exists(select 1 from public.exchange_user_blocks b where
        (b.blocker_id=c1.user_id and b.blocked_id=c2.user_id)
        or (b.blocker_id=c2.user_id and b.blocked_id=c1.user_id))
      and public.normalize_city(p1.country,p1.city)=public.normalize_city(p2.country,p2.city)
      and pg_catalog.lower(pg_catalog.btrim(coalesce(p1.country,'')))=pg_catalog.lower(pg_catalog.btrim(coalesce(p2.country,'')))
      and exists(select 1 from public.collection_item_photo_angles a
        where a.item_id=c1.id and a.owner_id=c1.user_id and a.angle='side' and a.storage_path is not null)
      and exists(select 1 from public.collection_item_photo_angles a
        where a.item_id=c1.id and a.owner_id=c1.user_id and a.angle='rear' and a.storage_path is not null)
      and exists(select 1 from public.collection_item_photo_angles a
        where a.item_id=c2.id and a.owner_id=c2.user_id and a.angle='side' and a.storage_path is not null)
      and exists(select 1 from public.collection_item_photo_angles a
        where a.item_id=c2.id and a.owner_id=c2.user_id and a.angle='rear' and a.storage_path is not null)
  ), enriched as (
    select reciprocal.*,
      shared.shared_count,shared.latest_shared_id,shared.latest_shared_at,
      least(coalesce(item_watermark.first_item_case::text,''),coalesce(item_watermark.second_item_case::text,'')) as watermark_low,
      greatest(coalesce(item_watermark.first_item_case::text,''),coalesce(item_watermark.second_item_case::text,'')) as watermark_high
    from reciprocal
    cross join lateral (
      select count(*) as shared_count,
        (array_agg(c.id order by coalesce(c.completed_at,c.handoff_at,c.created_at) desc,c.id desc))[1] as latest_shared_id,
        (array_agg(case when c.state='COMPLETED' then c.completed_at else c.handoff_at end
          order by coalesce(c.completed_at,c.handoff_at,c.created_at) desc,c.id desc))[1] as latest_shared_at
      from public.exchange_cases c
      where ((c.user_a=reciprocal.recipient_id and c.user_b=reciprocal.partner_id)
          or (c.user_b=reciprocal.recipient_id and c.user_a=reciprocal.partner_id))
        and not c.migration_review_required
        and (c.state='COMPLETED'
          or (c.handoff_at is not null and c.state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))
    ) shared
    cross join lateral (
      select
        (select c.id from public.exchange_cases c where c.state='COMPLETED' and not c.migration_review_required
          and (c.item_a=reciprocal.offered_item_id or c.item_b=reciprocal.offered_item_id)
          order by coalesce(c.completed_at,c.created_at) desc,c.id desc limit 1) as first_item_case,
        (select c.id from public.exchange_cases c where c.state='COMPLETED' and not c.migration_review_required
          and (c.item_a=reciprocal.requested_item_id or c.item_b=reciprocal.requested_item_id)
          order by coalesce(c.completed_at,c.created_at) desc,c.id desc limit 1) as second_item_case
    ) item_watermark
  ), notifications_to_insert as (
    select enriched.*,
      case when shared_count=0 and watermark_low='' and watermark_high=''
        then pg_catalog.md5(pg_catalog.format('reciprocal_match|%s|%s|%s|%s',
          recipient_id,partner_id,offered_identity,requested_identity))::uuid
        else pg_catalog.md5(pg_catalog.format('reciprocal_match_repeat|%s|%s|%s|%s|%s|%s|%s',
          least(recipient_id::text,partner_id::text),greatest(recipient_id::text,partner_id::text),
          least(offered_identity,requested_identity),greatest(offered_identity,requested_identity),
          coalesce(latest_shared_id::text,''),watermark_low,watermark_high))::uuid
      end as event_id
    from enriched
  )
  insert into public.notifications(user_id,kind,title,body,actor_user_id,entity_type,entity_id,metadata)
  select recipient_id,'reciprocal_match',
    case when shared_count>0 then 'A past exchange is a match again' else 'You have a new local BrickCircle match' end,
    case when shared_count>0 then pg_catalog.format(
      'You and %s have exchanged before (%s shared %s). Your local match is available again.%s',
      partner_name,shared_count,case when shared_count=1 then 'exchange' else 'exchanges' end,
      case when latest_shared_at is null then '' else ' Latest shared exchange: '||pg_catalog.to_char(latest_shared_at at time zone 'UTC','FMMonth FMDD, YYYY')||'.' end)
      else pg_catalog.format('%s has a reciprocal LEGO match with you.',partner_name) end,
    partner_id,'reciprocal_match',event_id,
    pg_catalog.jsonb_build_object(
      'match_user_id',partner_id,'offered_item_id',offered_item_id,'requested_item_id',requested_item_id,
      'offered_set',offered_set,'requested_set',requested_set,'route','#matches',
      'shared_exchange_count',shared_count,'latest_shared_exchange_id',latest_shared_id,
      'latest_shared_exchange_at',latest_shared_at
    )
  from notifications_to_insert
  on conflict (user_id,kind,entity_type,entity_id) where entity_id is not null do nothing;

  get diagnostics inserted_count=row_count;
  return inserted_count;
end;
$$;

revoke all on function public.queue_new_reciprocal_match_notifications(uuid) from public,anon,authenticated;
grant execute on function public.queue_new_reciprocal_match_notifications(uuid) to service_role;

create or replace function public.detect_new_reciprocal_matches()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.queue_new_reciprocal_match_notifications(new.user_id);
  return new;
end;
$$;
revoke all on function public.detect_new_reciprocal_matches() from public,anon,authenticated;
grant execute on function public.detect_new_reciprocal_matches() to service_role;

drop trigger if exists collection_reciprocal_match_notification on public.collection_items;
create trigger collection_reciprocal_match_notification
after insert or update of user_id,set_number,available_for_exchange,exchange_review_required,owner_photo_path,condition,completeness
on public.collection_items for each row execute function public.detect_new_reciprocal_matches();

drop trigger if exists wishlist_reciprocal_match_notification on public.wishlists;
create trigger wishlist_reciprocal_match_notification
after insert or update of user_id,set_number on public.wishlists
for each row execute function public.detect_new_reciprocal_matches();

create or replace function public.detect_profile_reciprocal_matches()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.queue_new_reciprocal_match_notifications(new.id);
  return new;
end;
$$;
revoke all on function public.detect_profile_reciprocal_matches() from public,anon,authenticated;
grant execute on function public.detect_profile_reciprocal_matches() to service_role;

drop trigger if exists profile_reciprocal_match_notification on public.profiles;
create trigger profile_reciprocal_match_notification
after update of country,city,adult_confirmed_at on public.profiles
for each row
when (old.country is distinct from new.country or old.city is distinct from new.city
  or old.adult_confirmed_at is distinct from new.adult_confirmed_at)
execute function public.detect_profile_reciprocal_matches();

notify pgrst,'reload schema';