-- Additive derived read model only. Canonical exchange writers and custody remain unchanged.
-- All payloads resolve under source RLS; the projection stores references, never message bodies.
-- Apply this file transactionally; exclude source writes before adding triggers/backfill.
lock table public.exchange_cases,public.messages,public.exchange_case_messages,public.exchange_case_events in share row exclusive mode;
create table public.collector_conversation_read_cursors (
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id uuid not null references auth.users(id) on delete cascade,
  through_at timestamptz not null,
  through_type text collate "C" not null
    check (through_type in ('case_event','case_message','direct_message')),
  through_id uuid not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(user_id,peer_id),
  check(user_id<>peer_id)
);
alter table public.collector_conversation_read_cursors enable row level security;
revoke all on public.collector_conversation_read_cursors from public,anon,authenticated;
grant select,insert,update on public.collector_conversation_read_cursors to authenticated;
-- Invoker RPCs need table privileges. Direct owner writes can only affect that
-- owner's read bookkeeping; they cannot alter messages, cases or anyone else.
create policy "owners read conversation cursors"
  on public.collector_conversation_read_cursors for select to authenticated
  using(user_id=(select auth.uid()));
create policy "owners create conversation cursors"
  on public.collector_conversation_read_cursors for insert to authenticated
  with check(user_id=(select auth.uid()));
create policy "owners advance conversation cursors"
  on public.collector_conversation_read_cursors for update to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));


create index collector_conversation_active_pair_idx on public.exchange_cases(user_a,user_b)
 where state not in('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED');
create table public.collector_conversation_entries(
 user_id uuid not null references auth.users(id) on delete cascade,
 peer_id uuid not null references auth.users(id) on delete cascade,
 occurred_at timestamptz not null, source_type text collate "C" not null,
 source_id uuid not null, case_id uuid, incoming boolean not null,
 primary key(user_id,source_type,source_id),
 check(user_id<>peer_id),check(source_type in ('direct_message','case_message','case_event'))
);
create index collector_entries_peer_feed_idx on public.collector_conversation_entries
 (user_id,peer_id,occurred_at desc,source_type desc,source_id desc);
create index collector_entries_unread_idx on public.collector_conversation_entries
 (user_id,peer_id,occurred_at,source_type,source_id) where incoming;
create table public.collector_conversation_summaries(
 user_id uuid not null references auth.users(id) on delete cascade,
 peer_id uuid not null references auth.users(id) on delete cascade,
 last_at timestamptz,last_type text collate "C",last_id uuid,
 unread_count bigint not null default 0 check(unread_count>=0),
 active_case_count bigint not null default 0,
 through_at timestamptz,through_type text collate "C",through_id uuid,
 primary key(user_id,peer_id),check(user_id<>peer_id)
);
create index collector_summaries_inbox_idx on public.collector_conversation_summaries
 (user_id,last_at desc,peer_id desc) where last_at is not null;
alter table public.collector_conversation_entries enable row level security;
alter table public.collector_conversation_summaries enable row level security;
revoke all on public.collector_conversation_entries,public.collector_conversation_summaries from public,anon,authenticated;
grant select on public.collector_conversation_entries,public.collector_conversation_summaries to authenticated;
create policy "owners read derived entries" on public.collector_conversation_entries
 for select to authenticated using(user_id=(select auth.uid()));
create policy "owners read derived summaries" on public.collector_conversation_summaries
 for select to authenticated using(user_id=(select auth.uid()));

-- Internal trigger helper serializes all summary bookkeeping on one owner/peer row.
create function private.bc_project_conversation(p_user uuid,p_peer uuid,p_time timestamptz,p_type text,p_id uuid,p_case uuid,p_incoming boolean,p_delete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare s public.collector_conversation_summaries%rowtype; latest record; affected integer;
begin
 if p_user is null or p_peer is null or p_user=p_peer then return; end if;
 insert into public.collector_conversation_summaries(user_id,peer_id) values(p_user,p_peer) on conflict do nothing;
 select * into s from public.collector_conversation_summaries where user_id=p_user and peer_id=p_peer for update;
 if p_delete then
   delete from public.collector_conversation_entries where user_id=p_user and source_type=p_type and source_id=p_id;
 else
   insert into public.collector_conversation_entries(user_id,peer_id,occurred_at,source_type,source_id,case_id,incoming)
   values(p_user,p_peer,p_time,p_type,p_id,p_case,p_incoming) on conflict do nothing;
 end if;
 get diagnostics affected=row_count;
 if affected=0 then return; end if;
 if p_incoming and (s.through_at is null or (p_time,p_type collate "C",p_id)>(s.through_at,s.through_type,s.through_id)) then
   update public.collector_conversation_summaries set unread_count=greatest(0,unread_count+case when p_delete then -1 else 1 end)
   where user_id=p_user and peer_id=p_peer;
 end if;
 select occurred_at,source_type,source_id into latest from public.collector_conversation_entries
 where user_id=p_user and peer_id=p_peer order by occurred_at desc,source_type desc,source_id desc limit 1;
 update public.collector_conversation_summaries set last_at=latest.occurred_at,last_type=latest.source_type,last_id=latest.source_id
 where user_id=p_user and peer_id=p_peer;
end;$$;
revoke all on function private.bc_project_conversation(uuid,uuid,timestamptz,text,uuid,uuid,boolean,boolean) from public,anon,authenticated,service_role;

create function private.bc_conversation_source_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record; c public.exchange_cases%rowtype; kind text; phase integer; recipient uuid;
begin
 -- Delete then reinsert handles privileged timestamp/body/participant corrections.
 for phase in 1..2 loop
   if (phase=1 and tg_op='INSERT') or (phase=2 and tg_op='DELETE') then continue; end if;
   if phase=1 then r:=old; else r:=new; end if;
   if tg_table_name='messages' then
     if r.exchange_id is not null then continue; end if;
     kind:='direct_message';
     -- Stable UUID order avoids reverse-direction message deadlocks.
     if r.sender_id<r.recipient_id then
       perform private.bc_project_conversation(r.sender_id,r.recipient_id,r.created_at,kind,r.id,null,false,phase=1);
       perform private.bc_project_conversation(r.recipient_id,r.sender_id,r.created_at,kind,r.id,null,true,phase=1);
     else
       perform private.bc_project_conversation(r.recipient_id,r.sender_id,r.created_at,kind,r.id,null,true,phase=1);
       perform private.bc_project_conversation(r.sender_id,r.recipient_id,r.created_at,kind,r.id,null,false,phase=1);
     end if;
   else
     select * into c from public.exchange_cases where id=r.case_id;
     if not found then continue; end if;
     kind:=case when tg_table_name='exchange_case_messages' then 'case_message' else 'case_event' end;
     recipient:=null;
     if kind='case_message' then
       if not (r.sender_id in(c.user_a,c.user_b) and r.recipient_id in(c.user_a,c.user_b) and r.sender_id<>r.recipient_id) then continue; end if;
       recipient:=r.recipient_id;
     end if;
     -- incoming is true only for messages, never administrative/system events.
     if c.user_a<c.user_b then
       perform private.bc_project_conversation(c.user_a,c.user_b,r.created_at,kind,r.id,c.id,coalesce(recipient=c.user_a,false),phase=1);
       perform private.bc_project_conversation(c.user_b,c.user_a,r.created_at,kind,r.id,c.id,coalesce(recipient=c.user_b,false),phase=1);
     else
       perform private.bc_project_conversation(c.user_b,c.user_a,r.created_at,kind,r.id,c.id,coalesce(recipient=c.user_b,false),phase=1);
       perform private.bc_project_conversation(c.user_a,c.user_b,r.created_at,kind,r.id,c.id,coalesce(recipient=c.user_a,false),phase=1);
     end if;
   end if;
 end loop;
 return null;
end;$$;
revoke all on function private.bc_conversation_source_changed() from public,anon,authenticated,service_role;
create trigger person_conversation_direct after insert or update or delete on public.messages for each row execute function private.bc_conversation_source_changed();
create trigger person_conversation_case_message after insert or update or delete on public.exchange_case_messages for each row execute function private.bc_conversation_source_changed();
create trigger person_conversation_case_event after insert or update or delete on public.exchange_case_events for each row execute function private.bc_conversation_source_changed();

create function private.bc_conversation_read_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Read cursor owner mismatch' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.peer_id<>old.peer_id) then raise exception 'Cursor identity immutable' using errcode='22023'; end if;
 if tg_op='UPDATE' and (new.through_at,new.through_type,new.through_id)<(old.through_at,old.through_type,old.through_id) then
   raise exception 'Read cursor cannot move backward' using errcode='22023'; end if;
 if not exists(select 1 from public.collector_conversation_entries e where e.user_id=new.user_id and e.peer_id=new.peer_id
   and (e.occurred_at,e.source_type,e.source_id)=(new.through_at,new.through_type,new.through_id)) then
   raise exception 'Read cursor unavailable' using errcode='42501'; end if;
 if not (
   (new.through_type='direct_message' and exists(select 1 from public.messages m where m.id=new.through_id and m.created_at=new.through_at and m.exchange_id is null and ((m.sender_id=new.user_id and m.recipient_id=new.peer_id) or (m.recipient_id=new.user_id and m.sender_id=new.peer_id))))
   or (new.through_type='case_message' and exists(select 1 from public.exchange_case_messages m join public.exchange_cases c on c.id=m.case_id where m.id=new.through_id and m.created_at=new.through_at and ((c.user_a=new.user_id and c.user_b=new.peer_id) or (c.user_b=new.user_id and c.user_a=new.peer_id)) and ((m.sender_id=new.user_id and m.recipient_id=new.peer_id) or (m.recipient_id=new.user_id and m.sender_id=new.peer_id))))
   or (new.through_type='case_event' and exists(select 1 from public.exchange_case_events e join public.exchange_cases c on c.id=e.case_id where e.id=new.through_id and e.created_at=new.through_at and ((c.user_a=new.user_id and c.user_b=new.peer_id) or (c.user_b=new.user_id and c.user_a=new.peer_id))))
 ) then raise exception 'Canonical cursor unavailable' using errcode='42501'; end if;
 -- Cursor row locks are always acquired before summary locks. Projection writers
 -- never lock cursor rows, so read/message races cannot invert that lock order.
 perform 1 from public.collector_conversation_summaries where user_id=new.user_id and peer_id=new.peer_id for update;
 update public.collector_conversation_summaries s set through_at=new.through_at,through_type=new.through_type,through_id=new.through_id,
 unread_count=(select count(*) from public.collector_conversation_entries e where e.user_id=new.user_id and e.peer_id=new.peer_id and e.incoming
   and (e.occurred_at,e.source_type,e.source_id)>(new.through_at,new.through_type,new.through_id))
 where s.user_id=new.user_id and s.peer_id=new.peer_id;
 return new;
end;$$;
revoke all on function private.bc_conversation_read_changed() from public,anon,authenticated,service_role;
create trigger person_conversation_read after insert or update on public.collector_conversation_read_cursors for each row execute function private.bc_conversation_read_changed();

-- Cursor reads are source-validated by the invoker RPC below. Direct cursor writes
-- also must validate actual sources, not only projection presence.
create function private.bc_conversation_case_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record; entry record; u uuid; v uuid; n bigint;
begin
 if tg_op='DELETE' then
   r:=old;
   for entry in select * from public.collector_conversation_entries where case_id=old.id order by user_id,peer_id loop
     perform private.bc_project_conversation(entry.user_id,entry.peer_id,entry.occurred_at,entry.source_type,entry.source_id,entry.case_id,entry.incoming,true);
   end loop;
 else r:=new; end if;
 -- Create and lock both participant summaries before taking a fresh count.
 -- Different cases share these summary rows; counting before these locks would
 -- allow a waiting transaction to overwrite the committed count with stale data.
 for u,v in select r.user_a,r.user_b union all select r.user_b,r.user_a order by 1 loop
   insert into public.collector_conversation_summaries(user_id,peer_id) values(u,v) on conflict do nothing;
   perform 1 from public.collector_conversation_summaries where user_id=u and peer_id=v for update;
 end loop;
 select count(*) into n from public.exchange_cases c where
   ((c.user_a=r.user_a and c.user_b=r.user_b) or (c.user_a=r.user_b and c.user_b=r.user_a))
   and c.state not in('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED');
 for u,v in select r.user_a,r.user_b union all select r.user_b,r.user_a order by 1 loop
   insert into public.collector_conversation_summaries(user_id,peer_id,active_case_count) values(u,v,n)
   on conflict(user_id,peer_id) do update set active_case_count=excluded.active_case_count;
 end loop;
 return null;
end;$$;
revoke all on function private.bc_conversation_case_changed() from public,anon,authenticated,service_role;
create trigger person_conversation_case after insert or update or delete on public.exchange_cases for each row execute function private.bc_conversation_case_changed();

-- One transaction + source table locks prevent writes slipping between backfill
-- and trigger installation. CREATE TRIGGER already takes the necessary locks;
-- explicit source lock at the start retains them until commit.
insert into public.collector_conversation_entries(user_id,peer_id,occurred_at,source_type,source_id,case_id,incoming)
select m.sender_id,m.recipient_id,m.created_at,'direct_message',m.id,null,false from public.messages m where m.exchange_id is null and m.recipient_id is not null and m.sender_id<>m.recipient_id
union all select m.recipient_id,m.sender_id,m.created_at,'direct_message',m.id,null,true from public.messages m where m.exchange_id is null and m.recipient_id is not null and m.sender_id<>m.recipient_id
union all select p.u,p.v,m.created_at,'case_message',m.id,m.case_id,m.recipient_id=p.u
from public.exchange_case_messages m join public.exchange_cases c on c.id=m.case_id
cross join lateral (values(c.user_a,c.user_b),(c.user_b,c.user_a)) p(u,v)
where m.sender_id in(c.user_a,c.user_b) and m.recipient_id in(c.user_a,c.user_b) and m.sender_id<>m.recipient_id
union all select p.u,p.v,e.created_at,'case_event',e.id,e.case_id,false from public.exchange_case_events e join public.exchange_cases c on c.id=e.case_id
cross join lateral (values(c.user_a,c.user_b),(c.user_b,c.user_a)) p(u,v)
where true
on conflict do nothing;
insert into public.collector_conversation_summaries(user_id,peer_id,last_at,last_type,last_id,unread_count,active_case_count)
select last.user_id,last.peer_id,last.occurred_at,last.source_type,last.source_id,
 (select count(*) from public.collector_conversation_entries e where e.user_id=last.user_id and e.peer_id=last.peer_id and e.incoming),
 (select count(*) from public.exchange_cases c where ((c.user_a=last.user_id and c.user_b=last.peer_id) or (c.user_b=last.user_id and c.user_a=last.peer_id)) and c.state not in('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED'))
from (select distinct on(user_id,peer_id) * from public.collector_conversation_entries order by user_id,peer_id,occurred_at desc,source_type desc,source_id desc) last
where true
on conflict(user_id,peer_id) do update set last_at=excluded.last_at,last_type=excluded.last_type,last_id=excluded.last_id,unread_count=excluded.unread_count,active_case_count=excluded.active_case_count;

create function public.collector_conversation_feed(p_peer_id uuid,p_before_at timestamptz default null,p_before_type text default null,p_before_id uuid default null,p_limit integer default 50)
returns table(occurred_at timestamptz,source_type text,source_id uuid,case_id uuid,payload jsonb)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_peer_id is null or p_peer_id=auth.uid() or p_limit is null or p_limit not between 1 and 100
 or (p_before_at is null)<>(p_before_type is null) or (p_before_at is null)<>(p_before_id is null)
 or (p_before_type is not null and p_before_type not in('direct_message','case_message','case_event')) then raise exception 'Invalid feed cursor or limit' using errcode='22023'; end if;
 return query
 with page as not materialized(select e.* from public.collector_conversation_entries e where e.user_id=auth.uid() and e.peer_id=p_peer_id
 and (p_before_at is null or (e.occurred_at,e.source_type,e.source_id)<(p_before_at,p_before_type collate "C",p_before_id)))
 select e.occurred_at,e.source_type,e.source_id,e.case_id,
 case e.source_type when 'direct_message' then to_jsonb(m) when 'case_message' then to_jsonb(cm) else to_jsonb(ev) end
 from page e
 left join public.messages m on e.source_type='direct_message' and m.id=e.source_id and m.created_at=e.occurred_at and m.exchange_id is null
   and ((m.sender_id=auth.uid() and m.recipient_id=p_peer_id) or (m.recipient_id=auth.uid() and m.sender_id=p_peer_id))
 left join public.exchange_cases c on c.id=e.case_id and ((c.user_a=auth.uid() and c.user_b=p_peer_id) or (c.user_b=auth.uid() and c.user_a=p_peer_id))
 left join public.exchange_case_messages cm on e.source_type='case_message' and cm.id=e.source_id and cm.created_at=e.occurred_at and cm.case_id=c.id
   and ((cm.sender_id=auth.uid() and cm.recipient_id=p_peer_id) or (cm.recipient_id=auth.uid() and cm.sender_id=p_peer_id))
 left join public.exchange_case_events ev on e.source_type='case_event' and ev.id=e.source_id and ev.created_at=e.occurred_at and ev.case_id=c.id
 where m.id is not null or cm.id is not null or ev.id is not null
 order by e.occurred_at desc,e.source_type desc,e.source_id desc limit p_limit;
end;$$;
revoke all on function public.collector_conversation_feed(uuid,timestamptz,text,uuid,integer) from public,anon;
grant execute on function public.collector_conversation_feed(uuid,timestamptz,text,uuid,integer) to authenticated;

create function public.list_collector_conversations(p_before_at timestamptz default null,p_before_peer uuid default null,p_limit integer default 30)
returns table(peer_id uuid,last_at timestamptz,last_type text,last_id uuid,preview text,unread_count bigint,active_case_count bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or (p_before_at is null)<>(p_before_peer is null) then raise exception 'Invalid inbox cursor or limit' using errcode='22023'; end if;
 return query
 select s.peer_id,f.occurred_at,f.source_type,f.source_id,
 coalesce(f.payload->>'body',replace(f.payload->>'event_type','_',' '),'Exchange update'),s.unread_count,s.active_case_count
 from public.collector_conversation_summaries s
 join lateral public.collector_conversation_feed(s.peer_id,null,null,null,1) f on true
 where s.user_id=auth.uid() and s.last_at is not null
   and (p_before_at is null or (f.occurred_at,s.peer_id)<(p_before_at,p_before_peer))
 order by f.occurred_at desc,s.peer_id desc limit p_limit;
end;$$;
revoke all on function public.list_collector_conversations(timestamptz,uuid,integer) from public,anon;
grant execute on function public.list_collector_conversations(timestamptz,uuid,integer) to authenticated;
create function public.mark_collector_conversation_read(
  p_peer_id uuid,p_through_at timestamptz,p_through_type text,p_through_id uuid
)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare me uuid:=auth.uid(); valid_cursor boolean:=false;
  saved public.collector_conversation_read_cursors%rowtype;
begin
  if me is null then raise exception 'Sign in to mark a conversation read' using errcode='42501'; end if;
  if p_peer_id is null or p_peer_id=me or p_through_at is null or p_through_id is null then
    raise exception 'A visible conversation cursor is required' using errcode='22023';
  end if;
  if p_through_type='direct_message' then
    select exists(select 1 from public.messages m where m.id=p_through_id and m.created_at=p_through_at
      and m.exchange_id is null and ((m.sender_id=me and m.recipient_id=p_peer_id) or (m.sender_id=p_peer_id and m.recipient_id=me))) into valid_cursor;
  elsif p_through_type='case_message' then
    select exists(select 1 from public.exchange_case_messages m join public.exchange_cases c on c.id=m.case_id
      where m.id=p_through_id and m.created_at=p_through_at
        and ((c.user_a=me and c.user_b=p_peer_id) or (c.user_b=me and c.user_a=p_peer_id))
        and ((m.sender_id=me and m.recipient_id=p_peer_id) or (m.sender_id=p_peer_id and m.recipient_id=me))) into valid_cursor;
  elsif p_through_type='case_event' then
    select exists(select 1 from public.exchange_case_events e join public.exchange_cases c on c.id=e.case_id
      where e.id=p_through_id and e.created_at=p_through_at
        and ((c.user_a=me and c.user_b=p_peer_id) or (c.user_b=me and c.user_a=p_peer_id))) into valid_cursor;
  end if;
  if not valid_cursor then raise exception 'Conversation cursor unavailable' using errcode='42501'; end if;
  insert into public.collector_conversation_read_cursors as old(user_id,peer_id,through_at,through_type,through_id)
    values(me,p_peer_id,p_through_at,p_through_type,p_through_id)
    on conflict(user_id,peer_id) do update set
      through_at=excluded.through_at,through_type=excluded.through_type,through_id=excluded.through_id,updated_at=pg_catalog.now()
    where (old.through_at,old.through_type,old.through_id)<(excluded.through_at,excluded.through_type,excluded.through_id);
  select * into saved from public.collector_conversation_read_cursors where user_id=me and peer_id=p_peer_id;
  return pg_catalog.to_jsonb(saved);
end;
$$;
revoke all on function public.mark_collector_conversation_read(uuid,timestamptz,text,uuid) from public,anon;
grant execute on function public.mark_collector_conversation_read(uuid,timestamptz,text,uuid) to authenticated;
