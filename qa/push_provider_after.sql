begin;
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
grant usage on schema auth to authenticated;
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
do $$ declare endpoint_value text;begin
 foreach endpoint_value in array array['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/test','https://push.services.mozilla.com/wpush/test','https://web.push.apple.com/test','https://region.web.push.apple.com/test','https://wns.notify.windows.com/test'] loop
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),endpoint_value,'1234567890123456','12345678');
 end loop;
 foreach endpoint_value in array array['https://127.0.0.1/private','https://[::1]/private','https://localhost/private','https://example.test/push','http://fcm.googleapis.com/send','https://fcm.googleapis.com:443/send','https://fcm.googleapis.com:8443/send','https://user:secret@fcm.googleapis.com/send','https://fcm.googleapis.com.evil.test/send','https://%66cm.googleapis.com/send','https://foo..push.apple.com/send','https://fakepush.apple.com/send','https://fcm.googleapis.com/send#fragment','https://fcm.googleapis.com/','https://fcm.googleapis.com/../private',E'https://fcm.googleapis.com/send\n','https://fcm.googleapis.com/'||repeat('x',4096)] loop
  begin
   insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),endpoint_value,'1234567890123456','12345678');
   raise exception 'Forbidden endpoint accepted: %',endpoint_value;
  exception when check_violation then null;
  end;
 end loop;
 begin
  update public.push_subscriptions set endpoint='https://127.0.0.1/changed' where endpoint='https://fcm.googleapis.com/fcm/send/test';
  raise exception 'Unsafe endpoint update accepted';
 exception when check_violation then null;
 end;
 update public.push_subscriptions set user_agent='own allowed update';
 if not exists(select 1 from public.push_subscriptions where user_agent='own allowed update') then raise exception 'Own update unavailable';end if;
 begin
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('20000000-0000-4000-8000-000000000002','https://fcm.googleapis.com/fcm/send/foreign','1234567890123456','12345678');
  raise exception 'Foreign subscription insert accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
do $$ declare affected integer;begin
 if exists(select 1 from public.push_subscriptions) then raise exception 'Foreign subscription readable';end if;
 update public.push_subscriptions set disabled_at=now();get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Foreign subscription update allowed';end if;
 delete from public.push_subscriptions;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Foreign subscription deletion allowed';end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform count(*) from public.push_subscriptions;
  raise exception 'Anonymous subscription read allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
