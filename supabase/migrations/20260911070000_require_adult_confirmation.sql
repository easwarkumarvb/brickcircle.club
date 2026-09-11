-- Record an immutable, server-stamped 18+ attestation for every participating member.
alter table public.profiles
  add column if not exists adult_confirmed_at timestamptz,
  add column if not exists adult_confirmation_version text,
  add column if not exists adult_confirmation_text text;

comment on column public.profiles.adult_confirmed_at is
  'Server timestamp when the member affirmed that they are at least 18 years old.';
comment on column public.profiles.adult_confirmation_version is
  'Version of the adult-attestation wording accepted by the member.';
comment on column public.profiles.adult_confirmation_text is
  'Exact adult-attestation wording accepted by the member.';

create or replace function public.protect_adult_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.adult_confirmed_at is distinct from old.adult_confirmed_at
     or new.adult_confirmation_version is distinct from old.adult_confirmation_version
     or new.adult_confirmation_text is distinct from old.adult_confirmation_text then
    if current_setting('brickcircle.adult_confirmation_write', true) is distinct from 'on' then
      raise insufficient_privilege using message = 'Adult confirmation must be recorded through confirm_adult_status().';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_adult_confirmation on public.profiles;
create trigger protect_adult_confirmation
before update of adult_confirmed_at, adult_confirmation_version, adult_confirmation_text
on public.profiles
for each row execute function public.protect_adult_confirmation();

create or replace function public.confirm_adult_status(
  p_attestation text,
  p_version text default '2026-09-11'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected constant text := 'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.';
  v_confirmed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_version is distinct from '2026-09-11' or p_attestation is distinct from v_expected then
    raise exception 'The current adult attestation must be accepted exactly as shown.' using errcode = '22023';
  end if;

  perform set_config('brickcircle.adult_confirmation_write', 'on', true);
  update public.profiles
     set adult_confirmed_at = coalesce(adult_confirmed_at, now()),
         adult_confirmation_version = coalesce(adult_confirmation_version, p_version),
         adult_confirmation_text = coalesce(adult_confirmation_text, p_attestation),
         updated_at = now()
   where id = v_user_id
   returning adult_confirmed_at into v_confirmed_at;

  if not found then
    raise exception 'Complete your BrickCircle profile before confirming adult status.' using errcode = 'P0002';
  end if;
  return v_confirmed_at;
end;
$$;

revoke all on function public.confirm_adult_status(text, text) from public, anon;
grant execute on function public.confirm_adult_status(text, text) to authenticated;
