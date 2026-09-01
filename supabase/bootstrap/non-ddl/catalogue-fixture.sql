insert into public.lego_sets(set_number,name,theme,year,piece_count,estimated_value,image_url,
  rebrickable_set_num,catalog_source,catalog_updated_at,catalog_active)
values
 ('75192-1','Millennium Falcon','Star Wars',2017,7541,849.99,null,'75192-1','fixture',now(),true),
 ('10307-1','Eiffel Tower','Icons',2022,10001,629.99,null,'10307-1','fixture',now(),true),
 ('10294-1','Titanic','Icons',2021,9090,679.99,null,'10294-1','fixture',now(),true)
on conflict(set_number) do update set name=excluded.name,theme=excluded.theme,year=excluded.year,
 piece_count=excluded.piece_count,estimated_value=excluded.estimated_value,
 rebrickable_set_num=excluded.rebrickable_set_num,catalog_source=excluded.catalog_source,
 catalog_active=excluded.catalog_active;
