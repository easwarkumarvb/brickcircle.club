do $$
declare b storage.buckets%rowtype;
begin
  select * into b from storage.buckets where id='avatars';
  if not found then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types,type,avif_autodetection,versioning_status)
    values('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp'],'STANDARD',false,'DISABLED');
  elsif b.name <> 'avatars' or b.public is distinct from true
     or b.file_size_limit is distinct from 5242880
     or b.allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']
     or b.type::text <> 'STANDARD' or b.avif_autodetection is distinct from false
     or b.versioning_status <> 'DISABLED' then
    raise exception 'avatars bucket configuration drift';
  end if;
end $$;
