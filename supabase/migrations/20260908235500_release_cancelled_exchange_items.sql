-- BrickCircle: allow a set to be removed after an accepted exchange is cancelled.
--
-- The previous safe-removal migration detached terminal rows in `exchanges`, but
-- the originating `exchange_requests` row still held restrictive foreign keys to
-- the same collection items. PostgreSQL therefore rejected deletion even though
-- the exchange itself was already cancelled/completed.
--
-- Keep pending proposals and active exchanges protected. For terminal history,
-- preserve set identity in snapshots and let the live collection FK detach.

alter table public.exchange_requests
  add column if not exists offered_item_set_number text,
  add column if not exists requested_item_set_number text,
  add column if not exists offered_item_name text,
  add column if not exists requested_item_name text;

update public.exchange_requests r
set offered_item_set_number = coalesce(r.offered_item_set_number, offered.set_number),
    requested_item_set_number = coalesce(r.requested_item_set_number, requested.set_number),
    offered_item_name = coalesce(r.offered_item_name, offered_set.name, offered.set_number),
    requested_item_name = coalesce(r.requested_item_name, requested_set.name, requested.set_number)
from public.collection_items offered
left join public.lego_sets offered_set on offered_set.set_number = offered.set_number,
     public.collection_items requested
left join public.lego_sets requested_set on requested_set.set_number = requested.set_number
where offered.id = r.offered_item_id
  and requested.id = r.requested_item_id;

create or replace function public.bc_snapshot_exchange_request_items()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  offered_set_number text;
  requested_set_number text;
  offered_name text;
  requested_name text;
begin
  if new.offered_item_id is not null then
    select ci.set_number, coalesce(ls.name, ci.set_number)
      into offered_set_number, offered_name
    from public.collection_items ci
    left join public.lego_sets ls on ls.set_number = ci.set_number
    where ci.id = new.offered_item_id;

    new.offered_item_set_number := coalesce(offered_set_number, new.offered_item_set_number);
    new.offered_item_name := coalesce(offered_name, new.offered_item_name);
  end if;

  if new.requested_item_id is not null then
    select ci.set_number, coalesce(ls.name, ci.set_number)
      into requested_set_number, requested_name
    from public.collection_items ci
    left join public.lego_sets ls on ls.set_number = ci.set_number
    where ci.id = new.requested_item_id;

    new.requested_item_set_number := coalesce(requested_set_number, new.requested_item_set_number);
    new.requested_item_name := coalesce(requested_name, new.requested_item_name);
  end if;

  return new;
end;
$$;

drop trigger if exists bc_snapshot_exchange_request_items on public.exchange_requests;
create trigger bc_snapshot_exchange_request_items
before insert or update of offered_item_id, requested_item_id
on public.exchange_requests
for each row execute function public.bc_snapshot_exchange_request_items();

-- Pending proposals still represent a live commitment and must block removal.
-- Accepted proposals are protected by the active-exchange check in the same
-- collection-item delete guard. Once that exchange is cancelled/completed the
-- collection item can safely be removed.
create or replace function public.bc_guard_collection_item_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.exchange_requests r
    where (r.offered_item_id = old.id or r.requested_item_id = old.id)
      and r.status = 'pending'
  ) then
    raise exception 'This set is part of a pending exchange proposal. Cancel or decline that proposal before removing it from My Sets.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.exchanges e
    where (e.item_a = old.id or e.item_b = old.id)
      and coalesce(e.state, '') not in ('cancelled', 'completed')
  ) then
    raise exception 'This set is part of an active exchange. Cancel or complete that exchange before removing it from My Sets.'
      using errcode = '55000';
  end if;

  return old;
end;
$$;

-- Terminal proposal history survives collection cleanup. Snapshot columns above
-- retain the set identity after these live references are detached.
alter table public.exchange_requests
  alter column offered_item_id drop not null,
  alter column requested_item_id drop not null;

alter table public.exchange_requests drop constraint if exists exchange_requests_offered_item_id_fkey;
alter table public.exchange_requests drop constraint if exists exchange_requests_requested_item_id_fkey;

alter table public.exchange_requests
  add constraint exchange_requests_offered_item_id_fkey
    foreign key (offered_item_id) references public.collection_items(id) on delete set null,
  add constraint exchange_requests_requested_item_id_fkey
    foreign key (requested_item_id) references public.collection_items(id) on delete set null;

-- Keep the proposal state consistent with the exchange state. An accepted proposal
-- becomes cancelled when either participant cancels before physical handoff.
create or replace function public.cancel_in_person_exchange(p_exchange_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found then raise exception 'Exchange not found'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state='swap_active' then
  raise exception 'The LEGO sets have already been handed over. Use the return workflow to close the temporary swap.';
 end if;
 if e.state in('completed','cancelled','disputed') then raise exception 'Exchange is already closed'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 update public.exchanges set state='cancelled',updated_at=now() where id=e.id;
 update public.exchange_requests set status='cancelled',updated_at=now()
   where id=e.request_id and status='accepted';
 update public.exchange_meetups set status='cancelled',updated_at=now() where exchange_id=e.id;
 update public.collection_items set available_for_exchange=true where id in(e.item_a,e.item_b);
 insert into public.notifications(user_id,kind,title,body,created_at)
 values(other,'exchange_cancelled','Exchange cancelled',coalesce(nullif(trim(p_reason),''),'The other collector cancelled this exchange. The LEGO sets are available again.'),now());
 return jsonb_build_object('ok',true,'status','cancelled','sets_released',true);
end $$;

revoke all on function public.cancel_in_person_exchange(uuid,text) from public;
grant execute on function public.cancel_in_person_exchange(uuid,text) to authenticated;
