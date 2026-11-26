-- Notify the BrickCircle admin when a new collector profile is created.
-- The notification is queued server-side and delivered through the existing email worker.
create or replace function public.enqueue_admin_registration_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
  alert_notification_id uuid;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  select u.id
    into admin_id
    from auth.users as u
   where lower(u.email) = lower('hello@brickcircle.club')
   order by u.created_at
   limit 1;

  if admin_id is null or admin_id = new.id then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    actor_user_id,
    kind,
    title,
    body,
    entity_type,
    entity_id,
    metadata,
    dedupe_key
  )
  values (
    admin_id,
    new.id,
    'registration_alert',
    'New BrickCircle registration',
    format(
      '%s (%s) just registered on BrickCircle.club.',
      coalesce(nullif(btrim(new.display_name), ''), 'A new collector'),
      new.email
    ),
    'profile',
    new.id,
    jsonb_build_object(
      'registration_alert', true,
      'email', new.email,
      'display_name', new.display_name
    ),
    'registration:' || new.id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into alert_notification_id;

  if alert_notification_id is not null then
    insert into public.notification_email_deliveries (
      notification_id,
      recipient_user_id,
      notification_kind
    )
    values (
      alert_notification_id,
      admin_id,
      'registration_alert'
    )
    on conflict (notification_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_admin_registration_alert() from public, anon, authenticated;
grant execute on function public.enqueue_admin_registration_alert() to service_role;

drop trigger if exists profiles_admin_registration_alert on public.profiles;
create trigger profiles_admin_registration_alert
after insert on public.profiles
for each row
execute function public.enqueue_admin_registration_alert();
