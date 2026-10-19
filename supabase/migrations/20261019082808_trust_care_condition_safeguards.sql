-- Trust & Care: owner-attested inventory, server-enforced three-view readiness,
-- immutable evidence metadata when both independent handoffs are complete.
-- Fresh availability only: existing available copies are not retroactively disabled.
begin;

alter table public.collection_items
  add column if not exists inventory_review_status text not null default 'not_checked'
    check (inventory_review_status in ('not_checked','checked','known_gaps'));

-- Existing collection_items owner UPDATE RLS still governs this column.
grant update (inventory_review_status) on public.collection_items to authenticated;

create or replace function private.bc_guard_collection_trust_care()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  -- An accepted or active exchange freezes descriptive terms and listing photos.
  -- Changes require a new peer agreement, rather than editing the old evidence.
  if exists(select 1 from public.exchange_case_item_locks l where l.item_id=old.id)
    and (
      new.owner_photo_path is distinct from old.owner_photo_path
      or new.condition is distinct from old.condition
      or new.completeness is distinct from old.completeness
      or new.notes is distinct from old.notes
      or new.original_box is distinct from old.original_box
      or new.inventory_review_status is distinct from old.inventory_review_status
    ) then
    raise exception 'Set details are frozen during an exchange. Discuss changes with the collector or cancel before handoff.';
  end if;

  -- The UI is advisory; direct REST/RPC attempts are held to the same rule.
  if new.available_for_exchange is true and old.available_for_exchange is not true then
    if new.owner_photo_path is null
      or not exists(select 1 from public.collection_item_photo_angles a
                    where a.item_id=new.id and a.owner_id=new.user_id
                      and a.angle='side' and a.storage_path is not null)
      or not exists(select 1 from public.collection_item_photo_angles a
                    where a.item_id=new.id and a.owner_id=new.user_id
                      and a.angle='rear' and a.storage_path is not null) then
      raise exception 'Before making this set available, add front, side and rear photographs of your completed model.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bc_guard_collection_trust_care on public.collection_items;
create trigger bc_guard_collection_trust_care
before update on public.collection_items
for each row execute function private.bc_guard_collection_trust_care();

create or replace function private.bc_guard_trust_care_photo_changes()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if exists(select 1 from public.exchange_case_item_locks l where l.item_id=old.item_id) then
    raise exception 'Set photos are frozen during an exchange.';
  end if;
  if tg_op='DELETE' then
    if exists(select 1 from public.collection_items ci
              where ci.id=old.item_id and ci.available_for_exchange) then
      raise exception 'Make this set unavailable before removing a required photo.';
    end if;
    return old;
  end if;
  if exists(select 1 from public.collection_items ci
            where ci.id=old.item_id and ci.available_for_exchange)
     and (new.item_id is distinct from old.item_id
          or new.angle is distinct from old.angle or new.owner_id is distinct from old.owner_id) then
    raise exception 'Make this set unavailable before changing a required photo angle.';
  end if;
  return new;
end;
$$;

drop trigger if exists bc_guard_trust_care_photo_changes on public.collection_item_photo_angles;
create trigger bc_guard_trust_care_photo_changes
before update or delete on public.collection_item_photo_angles
for each row execute function private.bc_guard_trust_care_photo_changes();

create table if not exists public.exchange_case_handoff_baselines (
  case_id uuid primary key references public.exchange_cases(id) on delete restrict,
  snapshot jsonb not null check (pg_catalog.jsonb_typeof(snapshot)='object'),
  captured_at timestamptz not null default pg_catalog.now()
);
alter table public.exchange_case_handoff_baselines enable row level security;
revoke all on public.exchange_case_handoff_baselines from public,anon,authenticated;
grant select on public.exchange_case_handoff_baselines to authenticated;
grant all on public.exchange_case_handoff_baselines to service_role;
drop policy if exists "participants see handoff baseline" on public.exchange_case_handoff_baselines;
create policy "participants see handoff baseline"
  on public.exchange_case_handoff_baselines for select to authenticated
  using (exists(
    select 1 from public.exchange_cases c
    where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
  ));

create or replace function private.bc_handoff_item_snapshot(p_item_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'id',ci.id, 'set_number',ci.set_number,
    'condition',ci.condition,'owner_estimated_completeness',ci.completeness,
    'inventory_review_status',ci.inventory_review_status,
    'notes',ci.notes,'original_box',ci.original_box,
    'photos',pg_catalog.jsonb_build_object(
      'front',ci.owner_photo_path,
      'side',(select a.storage_path from public.collection_item_photo_angles a
              where a.item_id=ci.id and a.owner_id=ci.user_id and a.angle='side'),
      'rear',(select a.storage_path from public.collection_item_photo_angles a
              where a.item_id=ci.id and a.owner_id=ci.user_id and a.angle='rear')
    )
  )
  from public.collection_items ci where ci.id=p_item_id
$$;

create or replace function private.bc_capture_trust_care_handoff()
returns trigger language plpgsql security definer set search_path=''
as $$
declare agreed_version integer;
begin
  if old.state is distinct from new.state and new.state='ACTIVE'
     and new.handoff_at is not null and new.handoff_a_at is not null
     and new.handoff_b_at is not null then
    select pg_catalog.max(v.version) into agreed_version
      from public.exchange_case_agreement_versions v where v.case_id=new.id;
    insert into public.exchange_case_handoff_baselines(case_id,snapshot)
    values(new.id,pg_catalog.jsonb_build_object(
      'capture_stage','mutual_handoff',
      'mutual_handoff_at',new.handoff_at,
      'accepted_agreement_version',agreed_version,
      'item_a',private.bc_handoff_item_snapshot(new.item_a),
      'item_b',private.bc_handoff_item_snapshot(new.item_b)
    ));
  end if;
  return new;
end;
$$;
drop trigger if exists bc_capture_trust_care_handoff on public.exchange_cases;
create trigger bc_capture_trust_care_handoff
after update of state on public.exchange_cases
for each row execute function private.bc_capture_trust_care_handoff();

create or replace function private.bc_block_handoff_baseline_changes()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'Handoff baseline evidence is immutable';
end;
$$;
drop trigger if exists bc_block_handoff_baseline_changes on public.exchange_case_handoff_baselines;
create trigger bc_block_handoff_baseline_changes
before update or delete on public.exchange_case_handoff_baselines
for each row execute function private.bc_block_handoff_baseline_changes();

revoke all on function private.bc_handoff_item_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.bc_guard_collection_trust_care() from public,anon,authenticated;
revoke all on function private.bc_guard_trust_care_photo_changes() from public,anon,authenticated;
revoke all on function private.bc_capture_trust_care_handoff() from public,anon,authenticated;
revoke all on function private.bc_block_handoff_baseline_changes() from public,anon,authenticated;
commit;
