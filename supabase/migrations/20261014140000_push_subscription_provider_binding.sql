-- The sender independently validates every endpoint, including historical rows.
-- NOT VALID avoids rewriting or scanning legacy data while protecting new writes.
begin;
do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.push_subscriptions'::regclass and conname='push_subscription_provider_endpoint') then
    alter table public.push_subscriptions add constraint push_subscription_provider_endpoint check (
      pg_catalog.length(endpoint) between 16 and 4096
      and pg_catalog.octet_length(endpoint)=pg_catalog.length(endpoint)
      and endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+push[.]apple[.]com|([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+notify[.]windows[.]com)/[^[:space:]#]+$'
      and endpoint !~ '[[:cntrl:]]'
      and pg_catalog.strpos(endpoint,pg_catalog.chr(92))=0
      and endpoint !~ '(^|/)[.]{1,2}(/|$)'
    ) not valid;
  end if;
end $$;
commit;
