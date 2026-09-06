-- Secure reciprocal matching RPC. It can only return matches for the authenticated caller.
create or replace function public.normalize_lego_product_name(p_name text)
returns text language sql immutable strict parallel safe set search_path='' as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(p_name),'[^a-z0-9]+',' ','g'));
$$;
revoke all on function public.normalize_lego_product_name(text) from public, anon, authenticated;
grant execute on function public.normalize_lego_product_name(text) to service_role;

create or replace function public.find_matches(p_user uuid) returns table(
  match_user uuid, offered_item uuid, offered_set text, offered_name text, offered_value numeric,
  requested_item uuid, requested_set text, requested_name text, requested_value numeric, match_score integer
) language sql security definer set search_path='' as $$
  select distinct c2.user_id, c1.id, c1.set_number, l1.name,
         coalesce(c1.estimated_value,l1.estimated_value,0),
         c2.id, c2.set_number, l2.name,
         coalesce(c2.estimated_value,l2.estimated_value,0),
         greatest(50, least(99,
           70 + case when pg_catalog.abs(coalesce(c1.estimated_value,l1.estimated_value,0)-coalesce(c2.estimated_value,l2.estimated_value,0)) <= greatest(25,coalesce(c2.estimated_value,l2.estimated_value,0)*0.15) then 15 else 0 end
              + case when l1.theme=l2.theme then 10 else 0 end
         ))
  from public.collection_items c1
  join public.lego_sets l1 on l1.set_number=c1.set_number
  join public.collection_items c2 on c2.available_for_exchange=true and c2.user_id<>p_user
  join public.lego_sets l2 on l2.set_number=c2.set_number
  join public.profiles p1 on p1.id=c1.user_id
  join public.profiles p2 on p2.id=c2.user_id
  join public.wishlists w1 on w1.user_id=p_user
  join public.lego_sets lw1 on lw1.set_number=w1.set_number and (w1.set_number=c2.set_number or (public.normalize_lego_product_name(lw1.name)<>'' and public.normalize_lego_product_name(lw1.name)=public.normalize_lego_product_name(l2.name)))
  join public.wishlists w2 on w2.user_id=c2.user_id
  join public.lego_sets lw2 on lw2.set_number=w2.set_number and (w2.set_number=c1.set_number or (public.normalize_lego_product_name(lw2.name)<>'' and public.normalize_lego_product_name(lw2.name)=public.normalize_lego_product_name(l1.name)))
  where p_user=auth.uid() and c1.user_id=p_user and c1.available_for_exchange=true
    and public.normalize_beta_city(p1.country,p1.city)=public.normalize_beta_city(p2.country,p2.city)
    and pg_catalog.lower(pg_catalog.btrim(coalesce(p1.country,'')))=pg_catalog.lower(pg_catalog.btrim(coalesce(p2.country,'')));
$$;
revoke all on function public.find_matches(uuid) from public, anon, authenticated, service_role;
grant execute on function public.find_matches(uuid) to authenticated, service_role;
