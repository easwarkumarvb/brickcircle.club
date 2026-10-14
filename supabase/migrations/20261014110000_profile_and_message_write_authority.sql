-- Offline forward-only source preparation: no database/CLI operation performed.
-- Browser profile edits are biography, location and user-uploaded avatars only.
begin;
revoke insert, update on public.profiles from public, anon, authenticated;
-- Table REVOKE does not remove earlier column grants. Clear every column first,
-- including columns added by future migrations when this repair is replayed.
do $$
declare columns_sql text;
begin
  select pg_catalog.string_agg(pg_catalog.quote_ident(attname), ', ' order by attnum)
  into columns_sql from pg_catalog.pg_attribute
  where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
  execute 'revoke insert ('||columns_sql||'), update ('||columns_sql||') on public.profiles from public, anon, authenticated';
end;
$$;
-- id UPDATE is necessary for PostgREST ON CONFLICT(id) onboarding upserts.
-- Existing USING/WITH CHECK auth.uid()=id policies prohibit transferring it.
grant insert (id,display_name,country,city,bio,avatar_url,avatar_source,updated_at),
  update (id,display_name,country,city,bio,avatar_url,avatar_source,updated_at)
  on public.profiles to authenticated;

create or replace function public.bc_guard_browser_profile_metadata()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Trusted SECURITY DEFINER Auth/avatar/review functions retain their authority.
  if current_user in ('authenticated','anon') then
    new.updated_at:=pg_catalog.now();
    if tg_op='INSERT' then
      if new.avatar_source='provider' then
        raise exception 'Provider avatar provenance is server-owned' using errcode='42501';
      end if;
    elsif (new.avatar_source is distinct from old.avatar_source
       or new.avatar_url is distinct from old.avatar_url) and new.avatar_source='provider' then
      raise exception 'Provider avatar provenance is server-owned' using errcode='42501';
    end if;
    if new.avatar_source='upload' and (new.avatar_url is null
       or pg_catalog.split_part(new.avatar_url,'/',1)<>new.id::text
       or new.avatar_url ~* '^[a-z][a-z0-9+.-]*:'
       or pg_catalog.strpos(new.avatar_url,'..')>0) then
      raise exception 'Uploaded avatar must use your own storage folder' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.bc_guard_browser_profile_metadata() from public,anon,authenticated;
drop trigger if exists bc_guard_browser_profile_metadata on public.profiles;
create trigger bc_guard_browser_profile_metadata before insert or update on public.profiles
for each row execute function public.bc_guard_browser_profile_metadata();

-- Messages are append-only for collectors; current clients use separate read cursors.
revoke update,delete,truncate,references,trigger on public.messages from public,anon,authenticated;
do $$
declare columns_sql text;
begin
 select pg_catalog.string_agg(pg_catalog.quote_ident(attname),', ' order by attnum)
 into columns_sql from pg_catalog.pg_attribute
 where attrelid='public.messages'::regclass and attnum>0 and not attisdropped;
 execute 'revoke update ('||columns_sql||') on public.messages from public,anon,authenticated';
end; $$;

-- Direct INSERT is retained for the existing SECURITY INVOKER messaging RPC.
-- Enforce its validation and chronological authority at the underlying table.
create or replace function public.bc_prepare_exchange_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare exchange_row public.exchanges%rowtype; me uuid:=auth.uid();
begin
  if me is null or new.sender_id is distinct from me then
    raise exception 'Only the signed-in sender may create a message' using errcode='42501';
  end if;
  if new.body is null or pg_catalog.char_length(pg_catalog.btrim(new.body)) not between 1 and 4000 then
    raise exception 'Write a message of 1 to 4000 characters' using errcode='22023';
  end if;
  if new.exchange_id is not null then
    select * into exchange_row from public.exchanges where id=new.exchange_id;
    if not found or me not in(exchange_row.user_a,exchange_row.user_b) then
      raise exception 'Not an exchange participant' using errcode='42501';
    end if;
    new.recipient_id:=case when me=exchange_row.user_a then exchange_row.user_b else exchange_row.user_a end;
  elsif new.recipient_id is null or new.recipient_id=me then
    raise exception 'Choose another collector' using errcode='22023';
  end if;
  new.body:=pg_catalog.btrim(new.body);
  new.created_at:=pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.bc_prepare_exchange_message() from public,anon,authenticated;
drop trigger if exists bc_prepare_exchange_message on public.messages;
create trigger bc_prepare_exchange_message before insert on public.messages
for each row execute function public.bc_prepare_exchange_message();
do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.messages'::regclass and conname='messages_trimmed_body_length') then
    -- Existing history is preserved; every new/changed row is constrained.
    alter table public.messages add constraint messages_trimmed_body_length
      check(pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 4000) not valid;
  end if;
end; $$;
commit;
notify pgrst,'reload schema';
