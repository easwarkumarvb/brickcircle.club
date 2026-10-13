-- Cancel-before-handoff must not be blocked by the owner-photo rule.
-- Legacy sets can be in accepted exchanges even though they predate mandatory owner photos.
-- Releasing an exchange should always succeed; only re-advertising the set as exchangeable
-- should depend on whether an owner photo exists.

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

 -- Do not force a legacy no-photo item back to exchangeable=true: that would fire
 -- bc_require_owner_photo_for_exchange and roll the whole cancellation transaction back.
 update public.collection_items
    set available_for_exchange=(nullif(btrim(coalesce(owner_photo_path,'')),'') is not null)
  where id in(e.item_a,e.item_b);

 insert into public.notifications(user_id,kind,title,body,created_at)
 values(other,'exchange_cancelled','Exchange cancelled',coalesce(nullif(trim(p_reason),''),'The other collector cancelled this exchange. The LEGO sets are available again.'),now());
 return jsonb_build_object('ok',true,'status','cancelled','sets_released',true);
end $$;

revoke all on function public.cancel_in_person_exchange(uuid,text) from public;
grant execute on function public.cancel_in_person_exchange(uuid,text) to authenticated;
