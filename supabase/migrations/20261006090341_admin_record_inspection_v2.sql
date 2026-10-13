-- Additive contract: keep the original four-argument RPC unchanged.
create function public.admin_marketplace_read_v2(
  p_section text default 'overview', p_query text default '', p_page integer default 0,
  p_id text default null, p_filters jsonb default '{}'::jsonb, p_part text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_base jsonb; v_case uuid; v_offset integer; v_keys text[];
begin
  perform private.assert_marketplace_admin();
  if p_section is null or p_query is null or length(p_query)>100 or p_page is null or p_page not between 0 and 100000
    or p_filters is null or jsonb_typeof(p_filters)<>'object' then
    raise exception 'Invalid query' using errcode='22023';
  end if;
  v_offset:=p_page*25;
  if p_section<>'member_detail' and p_part is not null then raise exception 'Invalid detail part' using errcode='22023'; end if;
  v_keys:=case p_section when 'support' then array['status','age'] when 'exchanges' then array['stage','overdue']
    when 'members' then array['new'] when 'catalogue' then array['visible'] when 'collection' then array['available'] else array[]::text[] end;
  if exists(select 1 from jsonb_object_keys(p_filters) k where not k=any(v_keys))
    or (p_filters ? 'status' and (jsonb_typeof(p_filters->'status')<>'string' or p_filters->>'status' not in ('open','in_progress','resolved','actionable')))
    or (p_filters ? 'age' and (jsonb_typeof(p_filters->'age')<>'string' or p_filters->>'age' not in ('older_7_days','older_30_days')))
    or (p_filters ? 'stage' and (jsonb_typeof(p_filters->'stage')<>'string' or p_filters->>'stage' not in
      ('PROPOSED','DECLINED','WITHDRAWN','EXPIRED','ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING','HANDOFF_ISSUE','ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED','CANCELLED','COMPLETED')))
    or exists(select 1 from jsonb_each(p_filters) f where f.key in ('overdue','new','visible','available') and jsonb_typeof(f.value)<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023';
  end if;
  if p_section='support' then
    with filtered as materialized (
      select s.id,s.case_id,s.category,s.note,s.requested_by,s.created_at,s.case_state_at_request,
        coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end) status,coalesce(r.revision,0) revision
      from public.exchange_case_support_requests s left join private.marketplace_admin_revisions r on r.entity_type='support' and r.entity_id=s.id::text
    ), matched as materialized (
      select * from filtered s where (p_query='' or strpos(lower(concat_ws(' ',s.id,s.case_id,s.category,s.status)),lower(p_query))>0)
        and (not p_filters ? 'status' or s.status=p_filters->>'status' or (p_filters->>'status'='actionable' and s.status<>'resolved'))
        and (not p_filters ? 'age' or s.created_at<=now()-case p_filters->>'age' when 'older_7_days' then interval '7 days' else interval '30 days' end)
    ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by (status='resolved'),created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
  elsif p_section='exchanges' then
    with matched as materialized (
      select c.id,c.state,c.state_version,c.created_at,c.return_due_at,a.display_name member_a,b.display_name member_b
      from public.exchange_cases c left join public.profiles a on a.id=c.user_a left join public.profiles b on b.id=c.user_b
      where (p_query='' or strpos(lower(concat_ws(' ',c.id,c.state,c.user_a,c.user_b)),lower(p_query))>0)
        and (not p_filters ? 'stage' or c.state=p_filters->>'stage')
        and (not coalesce((p_filters->>'overdue')::boolean,false) or (c.return_due_at<now() and c.completed_at is null and c.cancelled_at is null))
    ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
  elsif p_section='members' and p_filters ? 'new' then
    with matched as materialized (
      select p.id,p.display_name,p.email,p.city,p.country,p.created_at,p.adult_confirmed_at,p.trust_score from public.profiles p
      where (p_query='' or strpos(lower(concat_ws(' ',p.display_name,p.email,p.city,p.country)),lower(p_query))>0)
        and (not (p_filters->>'new')::boolean or p.created_at>now()-interval '7 days')
    ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
  elsif p_section='catalogue' and p_filters ? 'visible' then
    with matched as materialized (
      select s.set_number,s.name,s.theme,s.year,s.piece_count,s.catalog_active,coalesce(r.revision,0) revision
      from public.lego_sets s left join private.marketplace_admin_revisions r on r.entity_type='catalogue' and r.entity_id=s.set_number
      where (p_query='' or strpos(lower(concat_ws(' ',s.set_number,s.name,s.theme)),lower(p_query))>0) and s.catalog_active=(p_filters->>'visible')::boolean
    ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by set_number limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
  elsif p_section in ('collection','wishlist') then
    with items as materialized (
      select c.id,c.user_id,c.set_number,c.created_at,c.available_for_exchange,c.condition,c.completeness,null::integer priority
        from public.collection_items c where p_section='collection'
      union all
      select w.id,w.user_id,w.set_number,w.created_at,null::boolean,null::text,null::integer,w.priority
        from public.wishlists w where p_section='wishlist'
    ), matched as materialized (
      select i.*,s.name,p.display_name from items i left join public.lego_sets s using(set_number) left join public.profiles p on p.id=i.user_id
      where (p_query='' or strpos(lower(concat_ws(' ',i.set_number,s.name,p.display_name,i.user_id)),lower(p_query))>0)
        and (not p_filters ? 'available' or i.available_for_exchange=(p_filters->>'available')::boolean)
    ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
  elsif p_section='member_detail' then
    if p_part is null or p_part not in ('collection','wishlist') then raise exception 'Invalid detail part' using errcode='22023'; end if;
    v_base:=public.admin_marketplace_read(p_section,'',0,p_id);
    if v_base->'member'='null'::jsonb then raise exception 'Member not found' using errcode='P0002'; end if;
    if p_part='collection' then
      with matched as materialized (
        select c.id,c.set_number,s.name,c.condition,c.completeness,c.available_for_exchange,c.created_at
        from public.collection_items c left join public.lego_sets s using(set_number) where c.user_id=p_id::uuid
      ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
        (select * from matched order by created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
    else
      with matched as materialized (
        select w.id,w.set_number,s.name,w.priority,w.created_at from public.wishlists w left join public.lego_sets s using(set_number) where w.user_id=p_id::uuid
      ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
        (select * from matched order by created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
    end if;
    v_result:=v_result||jsonb_build_object('member',v_base->'member','collection_total',v_base->'collection_total','wishlist_total',v_base->'wishlist_total');
  elsif p_section='exchange_detail' then
    v_base:=public.admin_marketplace_read(p_section,'',0,p_id);
    if v_base->'exchange'='null'::jsonb then raise exception 'Exchange not found' using errcode='P0002'; end if;
    with matched as materialized (
      select id,event_type,previous_state,resulting_state,actor_user_id,state_version,created_at from public.exchange_case_events where case_id=p_id::uuid
    ) select jsonb_build_object('exchange',v_base->'exchange','total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by state_version desc,created_at desc,id limit 25 offset v_offset) t),'[]'::jsonb)) into v_result;
  else
    if p_part is not null then raise exception 'Invalid detail part' using errcode='22023'; end if;
    return public.admin_marketplace_read(p_section,p_query,p_page,p_id);
  end if;
  return v_result||jsonb_build_object('page',p_page,'page_size',25,'generated_at',now());
end;
$$;
revoke all on function public.admin_marketplace_read_v2(text,text,integer,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_marketplace_read_v2(text,text,integer,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
