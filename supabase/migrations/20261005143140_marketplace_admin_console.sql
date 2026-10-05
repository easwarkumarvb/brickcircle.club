-- Additive, owner-only operations console. Collector agreements remain peer managed.
create table private.marketplace_admin_revisions (
  entity_type text not null check (entity_type in ('catalogue','support')),
  entity_id text not null,
  revision integer not null default 0,
  catalogue_hidden boolean not null default false,
  status text check (status in ('open','in_progress','resolved')),
  primary key (entity_type,entity_id)
);
create table private.marketplace_admin_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  before_value jsonb not null,
  after_value jsonb not null,
  revision integer not null,
  created_at timestamptz not null default now(),
  unique(actor_id,request_id)
);
create index marketplace_admin_audit_created_idx on private.marketplace_admin_audit(created_at desc,id);
alter table private.marketplace_admin_revisions enable row level security;
alter table private.marketplace_admin_audit enable row level security;
revoke all on private.marketplace_admin_revisions,private.marketplace_admin_audit from public,anon,authenticated;

-- Imports update source activity every day. An admin hide must survive those
-- upserts; the private override is changed only by the audited admin RPC.
create function private.preserve_admin_catalogue_visibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists (select 1 from private.marketplace_admin_revisions r
    where r.entity_type='catalogue' and r.entity_id=new.set_number and r.catalogue_hidden) then
    new.catalog_active:=false;
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_admin_catalogue_visibility() from public,anon,authenticated,service_role;
grant execute on function private.preserve_admin_catalogue_visibility() to service_role;
create trigger preserve_admin_catalogue_visibility
  before insert or update on public.lego_sets
  for each row execute function private.preserve_admin_catalogue_visibility();

create function private.assert_marketplace_admin() returns void
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
end;
$$;
revoke all on function private.assert_marketplace_admin() from public,anon,authenticated;

create function public.admin_marketplace_read(
  p_section text default 'overview',p_query text default '',p_page integer default 0,p_id text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_total bigint; v_query text; v_offset integer;
begin
  perform private.assert_marketplace_admin();
  if p_section is null or p_page is null or p_page<0 or p_page>100000 or length(coalesce(p_query,''))>100 then
    raise exception 'Invalid query' using errcode='22023';
  end if;
  v_query:=coalesce(p_query,''); v_offset:=p_page*25;
  if p_section='overview' then
    return jsonb_build_object('summary',jsonb_build_object(
      'members',(select count(*) from public.profiles),
      'new_members',(select count(*) from public.profiles where created_at>now()-interval '7 days'),
      'owned_sets',(select count(*) from public.collection_items),
      'wanted_sets',(select count(*) from public.wishlists),
      'available_sets',(select count(*) from public.collection_items where available_for_exchange),
      'exchanges',(select count(*) from public.exchange_cases),
      'completed',(select count(*) from public.exchange_cases where state='COMPLETED'),
      'overdue',(select count(*) from public.exchange_cases where return_due_at<now() and completed_at is null and cancelled_at is null),
      'support_open',(select count(*) from public.exchange_case_support_requests s
        left join private.marketplace_admin_revisions r on r.entity_type='support' and r.entity_id=s.id::text
        where coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end)<>'resolved'),
      'catalogue_active',(select count(*) from public.lego_sets where catalog_active)),
      'states',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
        (select state,count(*) as count from public.exchange_cases group by state order by count(*) desc) t),
      'cities',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
        (select coalesce(nullif(city,''),'Unknown') city,count(*) members from public.profiles group by city order by count(*) desc limit 10) t),
      'generated_at',now());
  elsif p_section='members' then
    select count(*) into v_total from public.profiles p where v_query='' or
      strpos(lower(concat_ws(' ',p.display_name,p.email,p.city,p.country)),lower(v_query))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
      select p.id,p.display_name,p.email,p.city,p.country,p.created_at,p.adult_confirmed_at,p.trust_score
      from public.profiles p where v_query='' or strpos(lower(concat_ws(' ',p.display_name,p.email,p.city,p.country)),lower(v_query))>0
      order by p.created_at desc,p.id limit 25 offset v_offset) t;
  elsif p_section='catalogue' then
    select count(*) into v_total from public.lego_sets s where v_query='' or strpos(lower(concat_ws(' ',s.set_number,s.name,s.theme)),lower(v_query))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
      select s.set_number,s.name,s.theme,s.year,s.piece_count,s.catalog_active,coalesce(r.revision,0) revision
      from public.lego_sets s left join private.marketplace_admin_revisions r on r.entity_type='catalogue' and r.entity_id=s.set_number
      where v_query='' or strpos(lower(concat_ws(' ',s.set_number,s.name,s.theme)),lower(v_query))>0
      order by s.set_number limit 25 offset v_offset) t;
  elsif p_section='exchanges' then
    select count(*) into v_total from public.exchange_cases c where v_query='' or strpos(lower(concat_ws(' ',c.id::text,c.state,c.user_a::text,c.user_b::text)),lower(v_query))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
      select c.id,c.state,c.state_version,c.created_at,c.return_due_at,a.display_name member_a,b.display_name member_b
      from public.exchange_cases c left join public.profiles a on a.id=c.user_a left join public.profiles b on b.id=c.user_b
      where v_query='' or strpos(lower(concat_ws(' ',c.id::text,c.state,c.user_a::text,c.user_b::text)),lower(v_query))>0
      order by c.created_at desc,c.id limit 25 offset v_offset) t;
  elsif p_section='support' then
    select count(*) into v_total from public.exchange_case_support_requests s left join private.marketplace_admin_revisions r on r.entity_type='support' and r.entity_id=s.id::text
      where v_query='' or strpos(lower(concat_ws(' ',s.id::text,s.case_id::text,s.category,coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end))),lower(v_query))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
      select s.id,s.case_id,s.category,s.note,s.requested_by,s.created_at,s.case_state_at_request,
        coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end) status,coalesce(r.revision,0) revision
      from public.exchange_case_support_requests s left join private.marketplace_admin_revisions r on r.entity_type='support' and r.entity_id=s.id::text
      where v_query='' or strpos(lower(concat_ws(' ',s.id::text,s.case_id::text,s.category,coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end))),lower(v_query))>0
      order by (coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end)='resolved'),s.created_at desc,s.id limit 25 offset v_offset) t;
  elsif p_section='audit' then
    select count(*) into v_total from private.marketplace_admin_audit a where v_query='' or strpos(lower(concat_ws(' ',a.entity_id,a.action,a.actor_id::text)),lower(v_query))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
      select a.* from private.marketplace_admin_audit a where v_query='' or strpos(lower(concat_ws(' ',a.entity_id,a.action,a.actor_id::text)),lower(v_query))>0
      order by a.created_at desc,a.id limit 25 offset v_offset) t;
  elsif p_section='member_detail' then
    return jsonb_build_object('member',(select jsonb_build_object('id',p.id,'display_name',p.display_name,'email',p.email,'city',p.city,'country',p.country,'created_at',p.created_at,'adult_confirmed_at',p.adult_confirmed_at,'trust_score',p.trust_score) from public.profiles p where p.id=p_id::uuid),
      'collection_total',(select count(*) from public.collection_items where user_id=p_id::uuid),
      'wishlist_total',(select count(*) from public.wishlists where user_id=p_id::uuid),
      'collection',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select c.set_number,s.name,c.condition,c.completeness,c.available_for_exchange from public.collection_items c left join public.lego_sets s using(set_number) where c.user_id=p_id::uuid order by c.created_at desc limit 100) t),
      'wishlist',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select w.set_number,s.name,w.priority from public.wishlists w left join public.lego_sets s using(set_number) where w.user_id=p_id::uuid order by w.created_at desc limit 100) t));
  elsif p_section='exchange_detail' then
    return jsonb_build_object('exchange',(select jsonb_build_object('id',c.id,'state',c.state,'state_version',c.state_version,'user_a',c.user_a,'user_b',c.user_b,'item_a',c.item_a,'item_b',c.item_b,'created_at',c.created_at,'return_due_at',c.return_due_at,'completed_at',c.completed_at,'cancelled_at',c.cancelled_at,'migration_review_required',c.migration_review_required) from public.exchange_cases c where c.id=p_id::uuid),
      'events',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select event_type,previous_state,resulting_state,actor_user_id,state_version,created_at from public.exchange_case_events where case_id=p_id::uuid order by state_version desc,created_at desc limit 100) t));
  else raise exception 'Unknown section' using errcode='22023';
  end if;
  return jsonb_build_object('rows',v_rows,'total',v_total,'page',p_page,'page_size',25,'generated_at',now());
end;
$$;

create function public.admin_marketplace_mutate(
  p_entity text,p_id text,p_value text,p_revision integer,p_reason text,p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision integer; v_before jsonb; v_after jsonb; v_replay private.marketplace_admin_audit; v_status text; v_active boolean;
begin
  perform private.assert_marketplace_admin();
  if p_entity is null or p_entity not in ('catalogue','support') or p_id is null or length(p_id)>100
    or p_revision is null or p_revision<0 or p_reason is null or length(btrim(p_reason)) not between 10 and 1000 or p_request is null then
    raise exception 'Invalid change; a reason of 10–1000 characters is required' using errcode='22023';
  end if;
  -- Serialize request IDs before examining replay, including requests targeting different rows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_request::text,0));
  select * into v_replay from private.marketplace_admin_audit where actor_id=auth.uid() and request_id=p_request;
  if found then
    if v_replay.entity_type<>p_entity or v_replay.entity_id<>p_id or v_replay.after_value->>'value' is distinct from p_value or v_replay.reason<>btrim(p_reason) or v_replay.revision<>p_revision+1 then
      raise exception 'Request ID already used for another change' using errcode='40001';
    end if;
    return jsonb_build_object('revision',v_replay.revision,'audit_id',v_replay.id,'replayed',true);
  end if;
  if p_entity='catalogue' then
    if p_value is null or p_value not in ('visible','hidden') then raise exception 'Invalid visibility' using errcode='22023'; end if;
    select catalog_active into v_active from public.lego_sets where set_number=p_id for update;
    if not found then raise exception 'Set not found' using errcode='P0002'; end if;
    v_before:=jsonb_build_object('value',case when v_active then 'visible' else 'hidden' end);
  else
    if p_value is null or p_value not in ('open','in_progress','resolved') then raise exception 'Invalid support status' using errcode='22023'; end if;
    select case when closed_at is null then 'open' else 'resolved' end into v_status from public.exchange_case_support_requests where id=p_id::uuid for update;
    if not found then raise exception 'Support request not found' using errcode='P0002'; end if;
  end if;
  insert into private.marketplace_admin_revisions(entity_type,entity_id) values(p_entity,p_id) on conflict do nothing;
  select revision,coalesce(status,v_status) into v_revision,v_status from private.marketplace_admin_revisions where entity_type=p_entity and entity_id=p_id for update;
  if v_revision<>p_revision then raise exception 'This record changed. Refresh and retry.' using errcode='40001'; end if;
  if p_entity='catalogue' then
    update private.marketplace_admin_revisions set catalogue_hidden=(p_value='hidden')
      where entity_type=p_entity and entity_id=p_id;
    update public.lego_sets set catalog_active=(p_value='visible') where set_number=p_id;
  else
    v_before:=jsonb_build_object('value',v_status);
  end if;
  v_after:=jsonb_build_object('value',p_value);
  update private.marketplace_admin_revisions set revision=revision+1,status=case when p_entity='support' then p_value else null end where entity_type=p_entity and entity_id=p_id;
  insert into private.marketplace_admin_audit(actor_id,request_id,entity_type,entity_id,action,reason,before_value,after_value,revision)
    values(auth.uid(),p_request,p_entity,p_id,case when p_entity='catalogue' then 'catalogue_visibility' else 'support_triage' end,btrim(p_reason),v_before,v_after,v_revision+1)
    returning * into v_replay;
  return jsonb_build_object('revision',v_revision+1,'audit_id',v_replay.id,'replayed',false);
end;
$$;
revoke all on function public.admin_marketplace_read(text,text,integer,text),public.admin_marketplace_mutate(text,text,text,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_marketplace_read(text,text,integer,text),public.admin_marketplace_mutate(text,text,text,integer,text,uuid) to authenticated;
notify pgrst,'reload schema';
