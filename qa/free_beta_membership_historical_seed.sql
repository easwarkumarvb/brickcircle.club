insert into public.profiles(id,display_name,email,country,city)
values
  ('00000000-0000-4000-8000-000000000001','Historical Member 1','member-1@example.invalid','India','Bengaluru');

select setval('public.bc_membership_ordinal_seq',100,true);

insert into public.profiles(id,display_name,email,country,city)
values
  ('00000000-0000-4000-8000-000000000101','Historical Member 101','member-101@example.invalid','India','Bengaluru');
