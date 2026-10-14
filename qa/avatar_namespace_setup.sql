-- Disposable PostgreSQL: exact legacy policies loaded from source bootstrap.
create schema auth;
create schema storage;
create role authenticated;
create role anon;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
 select jsonb_build_object('sub',auth.uid()::text)
$$;
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
create table storage.objects(bucket_id text not null,name text not null,owner_id text,metadata jsonb default '{}',unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
\ir ../supabase/bootstrap/non-ddl/storage-policies.sql
-- Independent bucket permission must survive the avatar-specific guard.
create policy fixture_other_bucket on storage.objects for all to authenticated
using(bucket_id='fixture-other' and owner_id=auth.uid()::text)
with check(bucket_id='fixture-other' and owner_id=auth.uid()::text);
create function public.qa_avatar_assert(ok boolean,label text) returns void language plpgsql as $$
 begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end
$$;
insert into storage.objects(bucket_id,name,owner_id) values
 ('avatars','10000000-0000-4000-8000-000000000001/original.jpg','10000000-0000-4000-8000-000000000001'),
 ('avatars','20000000-0000-4000-8000-000000000002/victim.jpg','20000000-0000-4000-8000-000000000002'),
 ('avatars','10000000-0000-4000-8000-000000000001/legacy-null.jpg',null),
 ('avatars','20000000-0000-4000-8000-000000000002/legacy-inconsistent.jpg','10000000-0000-4000-8000-000000000001');
