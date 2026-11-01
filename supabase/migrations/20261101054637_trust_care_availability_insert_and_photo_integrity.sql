-- Close INSERT-time availability and in-place photograph-replacement bypasses.
-- Existing available legacy sets remain grandfathered; new availability must
-- pass the existing three-angle check. This migration never touches production
-- directly and is safe to apply to staging before the frontend rollout.
begin;

create or replace function private.bc_guard_collection_trust_care()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.inventory_review_status='known_gaps'
     and pg_catalog.btrim(coalesce(new.notes,''))='' then
    raise exception 'Describe the known missing pieces in Notes before saving.';
  end if;

  -- A new collection row cannot have supplementary photo rows yet (FK).
  -- Require owners to add the set first, upload photos, then enable it.
  if tg_op='INSERT' then
    if new.available_for_exchange is true then
      raise exception 'Before making this set available, add front, side and rear photographs of your completed model.';
    end if;
    return new;
  end if;

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

  -- Replacing the front photo while a set is offered would silently change the
  -- evidence seen by peers. First make the set unavailable in a separate step.
  if old.available_for_exchange is true
     and new.owner_photo_path is distinct from old.owner_photo_path then
    raise exception 'Make this set unavailable before changing its front photo.';
  end if;

  -- Grandfather existing listings without disabling them. Require three angles
  -- whenever an owner changes availability from false to true.
  if new.available_for_exchange is true
     and old.available_for_exchange is not true then
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
before insert or update on public.collection_items
for each row execute function private.bc_guard_collection_trust_care();

create or replace function private.bc_guard_trust_care_photo_changes()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if exists(select 1 from public.exchange_case_item_locks l where l.item_id=new.item_id) then
      raise exception 'Set photos are frozen during an exchange.';
    end if;
    return new;
  end if;

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
          or new.angle is distinct from old.angle
          or new.owner_id is distinct from old.owner_id
          or new.storage_path is distinct from old.storage_path) then
    raise exception 'Make this set unavailable before replacing a required photo.';
  end if;
  return new;
end;
$$;

drop trigger if exists bc_guard_trust_care_photo_changes on public.collection_item_photo_angles;
create trigger bc_guard_trust_care_photo_changes
before insert or update or delete on public.collection_item_photo_angles
for each row execute function private.bc_guard_trust_care_photo_changes();

revoke all on function private.bc_guard_collection_trust_care() from public,anon,authenticated;
revoke all on function private.bc_guard_trust_care_photo_changes() from public,anon,authenticated;
commit;
