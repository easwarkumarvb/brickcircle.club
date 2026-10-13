do $$ declare p text; begin
  foreach p in array array['Avatar images are publicly accessible','BrickCircle avatar owner delete','BrickCircle avatar owner update','BrickCircle avatar owner upload','BrickCircle avatar public read','Users can delete own avatars','Users can update own avatars','Users can upload own avatars','avatars_public_read','avatars_user_delete','avatars_user_insert','avatars_user_select','avatars_user_update']
  loop execute format('drop policy if exists %I on storage.objects',p); end loop;
end $$;
create policy "Avatar images are publicly accessible" on storage.objects for select to public using ((bucket_id = 'avatars'::text));
create policy "BrickCircle avatar owner delete" on storage.objects for delete to authenticated using (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));
create policy "BrickCircle avatar owner update" on storage.objects for update to authenticated using (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)))) with check (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));
create policy "BrickCircle avatar owner upload" on storage.objects for insert to authenticated with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));
create policy "BrickCircle avatar public read" on storage.objects for select to public using ((bucket_id = 'avatars'::text));
create policy "Users can delete own avatars" on storage.objects for delete to authenticated using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
create policy "Users can update own avatars" on storage.objects for update to authenticated using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text))))) with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
create policy "Users can upload own avatars" on storage.objects for insert to authenticated with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
create policy avatars_public_read on storage.objects for select to public using ((bucket_id = 'avatars'::text));
create policy avatars_user_delete on storage.objects for delete to authenticated using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
create policy avatars_user_insert on storage.objects for insert to authenticated with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
create policy avatars_user_select on storage.objects for select to authenticated using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
create policy avatars_user_update on storage.objects for update to authenticated using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text))))) with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.jwt() ->> 'sub'::text)))));
