-- Secure reciprocal matching RPC. It can only return matches for the authenticated caller.
create or replace function public.find_matches(p_user uuid) returns table(
  match_user uuid, offered_item uuid, offered_set text, offered_name text, offered_value numeric,
  requested_item uuid, requested_set text, requested_name text, requested_value numeric, match_score integer
) language sql security definer set search_path=public as $$
  select c2.user_id, c1.id, c1.set_number, l1.name,
         coalesce(c1.estimated_value,l1.estimated_value,0),
         c2.id, c2.set_number, l2.name,
         coalesce(c2.estimated_value,l2.estimated_value,0),
         greatest(50, least(99,
           70 + case when abs(coalesce(c1.estimated_value,l1.estimated_value,0)-coalesce(c2.estimated_value,l2.estimated_value,0)) <= greatest(25,coalesce(c2.estimated_value,l2.estimated_value,0)*0.15) then 15 else 0 end
              + case when l1.theme=l2.theme then 10 else 0 end
         ))
  from public.collection_items c1
  join public.lego_sets l1 on l1.set_number=c1.set_number
  join public.collection_items c2 on c2.available_for_exchange=true and c2.user_id<>p_user
  join public.lego_sets l2 on l2.set_number=c2.set_number
  join public.wishlists w1 on w1.user_id=p_user and w1.set_number=c2.set_number
  join public.wishlists w2 on w2.user_id=c2.user_id and w2.set_number=c1.set_number
  where p_user=auth.uid() and c1.user_id=p_user and c1.available_for_exchange=true;
$$;
revoke all on function public.find_matches(uuid) from public;
grant execute on function public.find_matches(uuid) to authenticated;