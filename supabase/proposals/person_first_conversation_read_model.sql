-- STAGED SOURCE PROPOSAL. Not a migration; not applied; not wired to the browser.
-- Generate a migration with `supabase migration new person_first_conversation_read_model`
-- in a disposable local database, then test RLS/query plans before approval.
-- No canonical writer, lifecycle policy, item lock or existing privilege changes.

-- Bound each source before the outer merge; avoid fetching every user's history.
create index if not exists messages_person_sender_history_idx
  on public.messages(sender_id,recipient_id,created_at desc,id desc)
  where exchange_id is null;
create index if not exists messages_person_recipient_history_idx
  on public.messages(recipient_id,sender_id,created_at desc,id desc)
  where exchange_id is null;
create index if not exists case_messages_person_sender_history_idx
  on public.exchange_case_messages(sender_id,recipient_id,created_at desc,id desc);
create index if not exists case_messages_person_recipient_history_idx
  on public.exchange_case_messages(recipient_id,sender_id,created_at desc,id desc);
-- Existing case/event indexes support per-case reads. EXPLAIN must verify the
-- peer-wide join remains acceptable for collectors with many historical cases.
create index if not exists exchange_cases_person_pair_idx
  on public.exchange_cases(user_a,user_b,id);
create index if not exists exchange_cases_person_reverse_pair_idx
  on public.exchange_cases(user_b,user_a,id);

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

create function public.collector_conversation_feed(
  p_peer_id uuid,
  p_before_at timestamptz default null,
  p_before_type text default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table(occurred_at timestamptz,source_type text,source_id uuid,case_id uuid,payload jsonb)
language plpgsql stable security invoker set search_path=''
as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'Sign in to read a conversation' using errcode='42501'; end if;
  if p_peer_id is null or p_peer_id=me then raise exception 'Choose another collector' using errcode='22023'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Page size must be 1 to 100' using errcode='22023'; end if;
  if (p_before_at is null)<>(p_before_type is null)
     or (p_before_at is null)<>(p_before_id is null)
     or (p_before_type is not null and p_before_type not in ('case_event','case_message','direct_message'))
  then raise exception 'Complete history cursor required' using errcode='22023'; end if;
  return query
  select f.occurred_at,f.source_type,f.source_id,f.case_id,f.payload
  from (
    (select m.created_at as occurred_at,'direct_message'::text as source_type,m.id as source_id,
       null::uuid as case_id,pg_catalog.to_jsonb(m) as payload
     from public.messages m
     where m.exchange_id is null
       and ((m.sender_id=me and m.recipient_id=p_peer_id) or (m.sender_id=p_peer_id and m.recipient_id=me))
       and (p_before_at is null or
         (m.created_at,'direct_message'::text collate "C",m.id)<(p_before_at,p_before_type collate "C",p_before_id))
     order by m.created_at desc,m.id desc limit p_limit)
    union all
    (select m.created_at,'case_message'::text,m.id,m.case_id,pg_catalog.to_jsonb(m)
     from public.exchange_case_messages m join public.exchange_cases c on c.id=m.case_id
     where ((c.user_a=me and c.user_b=p_peer_id) or (c.user_b=me and c.user_a=p_peer_id))
       and ((m.sender_id=me and m.recipient_id=p_peer_id) or (m.sender_id=p_peer_id and m.recipient_id=me))
       and (p_before_at is null or
         (m.created_at,'case_message'::text collate "C",m.id)<(p_before_at,p_before_type collate "C",p_before_id))
     order by m.created_at desc,m.id desc limit p_limit)
    union all
    (select e.created_at,'case_event'::text,e.id,e.case_id,pg_catalog.to_jsonb(e)
     from public.exchange_case_events e join public.exchange_cases c on c.id=e.case_id
     where ((c.user_a=me and c.user_b=p_peer_id) or (c.user_b=me and c.user_a=p_peer_id))
       and (p_before_at is null or
         (e.created_at,'case_event'::text collate "C",e.id)<(p_before_at,p_before_type collate "C",p_before_id))
     order by e.created_at desc,e.id desc limit p_limit)
  ) f
  order by f.occurred_at desc,f.source_type collate "C" desc,f.source_id desc
  limit p_limit;
end;
$$;
revoke all on function public.collector_conversation_feed(uuid,timestamptz,text,uuid,integer) from public,anon;
grant execute on function public.collector_conversation_feed(uuid,timestamptz,text,uuid,integer) to authenticated;

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
