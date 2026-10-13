insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000801','photo-a@example.test'),
('00000000-0000-4000-8000-000000000802','photo-b@example.test'),
('00000000-0000-4000-8000-000000000803','photo-outsider@example.test');
insert into public.profiles(id,display_name,country,city,adult_confirmed_at) select id,email,'India','Mumbai',now() from auth.users;
insert into public.lego_sets(set_number,name,theme,estimated_value) values('photo-a','Photo A','Icons',100),('photo-b','Photo B','Icons',100),('photo-hidden','Hidden','Icons',100),('photo-legacy','Legacy','Icons',100);
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange) values
('81000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000801','photo-a','Good',100,'00000000-0000-4000-8000-000000000801/a.jpg',true),
('81000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000802','photo-b','Good',100,'00000000-0000-4000-8000-000000000802/b.jpg',true),
('81000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000802','photo-hidden','Good',100,'00000000-0000-4000-8000-000000000802/hidden.jpg',false),
('81000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000802','photo-legacy','Good',100,'00000000-0000-4000-8000-000000000802/legacy.jpg',false);
insert into public.wishlists(user_id,set_number) values('00000000-0000-4000-8000-000000000801','photo-b'),('00000000-0000-4000-8000-000000000802','photo-a');
insert into storage.objects(bucket_id,name) select 'collection-photos',owner_photo_path from public.collection_items;
insert into storage.buckets(id,name) values('foreign-bucket','foreign-bucket');
-- Existing legacy participant path is deliberately exercised without mocking read policy.
insert into public.exchange_requests(id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days) values('82000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000802','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000004',30);
