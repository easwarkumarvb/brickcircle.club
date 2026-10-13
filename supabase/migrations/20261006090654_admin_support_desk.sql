-- Internal notes are append-only audit records, not collector messages or status edits.
create function public.admin_support_note(p_id uuid,p_note text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_replay private.marketplace_admin_audit; v_revision integer;
begin
  perform private.assert_marketplace_admin();
  if p_id is null or p_request is null or p_note is null or length(btrim(p_note)) not between 10 and 1000 then
    raise exception 'Invalid note' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_request::text,0));
  select * into v_replay from private.marketplace_admin_audit where actor_id=auth.uid() and request_id=p_request;
  if found then
    if v_replay.entity_type<>'support' or v_replay.entity_id<>p_id::text or v_replay.action<>'support_note' or v_replay.reason<>btrim(p_note) then
      raise exception 'Request ID already used for another payload' using errcode='40001';
    end if;
    return jsonb_build_object('audit_id',v_replay.id,'revision',v_replay.revision,'replayed',true);
  end if;
  perform 1 from public.exchange_case_support_requests where id=p_id for update;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  select coalesce((select revision from private.marketplace_admin_revisions where entity_type='support' and entity_id=p_id::text),0) into v_revision;
  insert into private.marketplace_admin_audit(actor_id,request_id,entity_type,entity_id,action,reason,before_value,after_value,revision)
    values(auth.uid(),p_request,'support',p_id::text,'support_note',btrim(p_note),'{}','{}',v_revision) returning * into v_replay;
  return jsonb_build_object('audit_id',v_replay.id,'revision',v_revision,'replayed',false);
end;
$$;

create function public.admin_support_detail_v2(p_id uuid,p_page integer default 0,p_part text default 'history')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request jsonb; v_case uuid; v_result jsonb; v_exchange jsonb;
begin
  perform private.assert_marketplace_admin();
  if p_id is null or p_page is null or p_page not between 0 and 100000 or p_part is null or p_part not in ('history','events') then
    raise exception 'Invalid detail query' using errcode='22023';
  end if;
  select jsonb_build_object('id',s.id,'case_id',s.case_id,'category',s.category,'note',s.note,'requested_by',s.requested_by,
    'created_at',s.created_at,'case_state_at_request',s.case_state_at_request,
    'status',coalesce(r.status,case when s.closed_at is null then 'open' else 'resolved' end),'revision',coalesce(r.revision,0)),s.case_id
    into v_request,v_case from public.exchange_case_support_requests s left join private.marketplace_admin_revisions r
      on r.entity_type='support' and r.entity_id=s.id::text where s.id=p_id;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  v_exchange:=public.admin_marketplace_read('exchange_detail','',0,v_case::text)->'exchange';
  if p_part='events' then
    v_result:=public.admin_marketplace_read_v2('exchange_detail','',p_page,v_case::text);
  else
    with matched as materialized (
      select id,actor_id,action,reason,before_value,after_value,revision,created_at from private.marketplace_admin_audit
      where entity_type='support' and entity_id=p_id::text
    ) select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select * from matched order by created_at desc,id limit 25 offset p_page*25) t),'[]'::jsonb)) into v_result;
  end if;
  return v_result||jsonb_build_object('request',v_request,'exchange',v_exchange,'page',p_page,'page_size',25,'generated_at',now());
end;
$$;
revoke all on function public.admin_support_note(uuid,text,uuid),public.admin_support_detail_v2(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_support_note(uuid,text,uuid),public.admin_support_detail_v2(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
