-- Allow authenticated members' own append-only activity events through RLS.
--
-- The legacy V1 collection/wishlist trigger functions run as SECURITY INVOKER.
-- The beta RLS hardening left growth_events with only a SELECT policy, so the
-- trigger-side analytics insert aborted the parent collection/wishlist insert.

alter table public.growth_events enable row level security;

revoke all on table public.growth_events from anon;
revoke all on table public.growth_events from authenticated;
grant select, insert on table public.growth_events to authenticated;

revoke all on sequence public.growth_events_id_seq from anon;
revoke all on sequence public.growth_events_id_seq from authenticated;
grant usage on sequence public.growth_events_id_seq to authenticated;

drop policy if exists "members insert own growth events" on public.growth_events;
create policy "members insert own growth events"
on public.growth_events
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

-- Growth Engine V2 already owns member-notification generation. Keep these V1
-- triggers as least-privilege, append-only activity writers so they no longer
-- attempt a second notification insert under the member's role.
create or replace function public.bc_growth_after_collection()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.growth_events(user_id, event_name, properties)
  values (
    new.user_id,
    'collection_added',
    jsonb_build_object(
      'set_number', new.set_number,
      'available', new.available_for_exchange
    )
  );

  return new;
end;
$$;

create or replace function public.bc_growth_after_wishlist()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.growth_events(user_id, event_name, properties)
  values (
    new.user_id,
    'wishlist_added',
    jsonb_build_object(
      'set_number', new.set_number,
      'priority', new.priority
    )
  );

  return new;
end;
$$;
