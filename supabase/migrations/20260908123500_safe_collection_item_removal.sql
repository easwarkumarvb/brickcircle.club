-- BrickCircle: allow collection cleanup without corrupting exchange integrity.
-- Active exchanges continue to block deletion. Terminal exchange rows keep snapshots
-- while their collection/request foreign keys are detached automatically.

alter table public.exchanges
  add column if not exists item_a_set_number text,
  add column if not exists item_b_set_number text,
  add column if not exists item_a_name text,
  add column if not exists item_b_name text;

update public.exchanges e
set item_a_set_number = coalesce(e.item_a_set_number, a.set_number),
    item_b_set_number = coalesce(e.item_b_set_number, b.set_number),
    item_a_name = coalesce(e.item_a_name, la.name, a.set_number),
    item_b_name = coalesce(e.item_b_name, lb.name, b.set_number)
from public.collection_items a
left join public.lego_sets la on la.set_number = a.set_number,
     public.collection_items b
left join public.lego_sets lb on lb.set_number = b.set_number
where a.id = e.item_a
  and b.id = e.item_b;

create or replace function public.bc_snapshot_exchange_items()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  a_set text;
  b_set text;
  a_name text;
  b_name text;
begin
  if new.item_a is not null then
    select ci.set_number, coalesce(ls.name, ci.set_number)
      into a_set, a_name
    from public.collection_items ci
    left join public.lego_sets ls on ls.set_number = ci.set_number
    where ci.id = new.item_a;
    new.item_a_set_number := coalesce(a_set, new.item_a_set_number);
    new.item_a_name := coalesce(a_name, new.item_a_name);
  end if;

  if new.item_b is not null then
    select ci.set_number, coalesce(ls.name, ci.set_number)
      into b_set, b_name
    from public.collection_items ci
    left join public.lego_sets ls on ls.set_number = ci.set_number
    where ci.id = new.item_b;
    new.item_b_set_number := coalesce(b_set, new.item_b_set_number);
    new.item_b_name := coalesce(b_name, new.item_b_name);
  end if;

  return new;
end;
$$;

drop trigger if exists bc_snapshot_exchange_items on public.exchanges;
create trigger bc_snapshot_exchange_items
before insert or update of item_a, item_b
on public.exchanges
for each row execute function public.bc_snapshot_exchange_items();

create or replace function public.bc_guard_collection_item_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
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

drop trigger if exists bc_guard_collection_item_delete on public.collection_items;
create trigger bc_guard_collection_item_delete
before delete on public.collection_items
for each row execute function public.bc_guard_collection_item_delete();

-- Terminal exchange history must survive collection cleanup. The snapshots above
-- preserve the set identity even after these references are cleared.
alter table public.exchanges
  alter column request_id drop not null,
  alter column item_a drop not null,
  alter column item_b drop not null;

alter table public.exchanges drop constraint if exists exchanges_request_id_fkey;
alter table public.exchanges drop constraint if exists exchanges_item_a_fkey;
alter table public.exchanges drop constraint if exists exchanges_item_b_fkey;

alter table public.exchanges
  add constraint exchanges_request_id_fkey
    foreign key (request_id) references public.exchange_requests(id) on delete set null,
  add constraint exchanges_item_a_fkey
    foreign key (item_a) references public.collection_items(id) on delete set null,
  add constraint exchanges_item_b_fkey
    foreign key (item_b) references public.collection_items(id) on delete set null;
