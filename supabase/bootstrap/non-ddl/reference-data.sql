insert into public.membership_program_config
  (id,founding_cap,early_member_limit,beta_free,city_min_members,city_min_exchangeable_sets,city_min_wishlist_items)
values (1,100,1000,true,100,200,300)
on conflict (id) do nothing;

do $$ begin
  if not exists(select 1 from public.membership_program_config where id=1 and founding_cap=100
    and early_member_limit=1000 and beta_free and city_min_members=100
    and city_min_exchangeable_sets=200 and city_min_wishlist_items=300) then
    raise exception 'membership_program_config drift';
  end if;
end $$;
