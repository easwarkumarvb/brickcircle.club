-- Durable, server-only Brevo delivery queue for high-value marketplace events.
-- The source public.notifications row remains the user-visible source of truth.

create table public.notification_email_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text,
  notification_kind text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'permanent_failure')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  provider text not null default 'brevo' check (provider = 'brevo'),
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default pg_catalog.now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint notification_email_delivery_source_key unique (notification_id),
  constraint notification_email_delivery_recipient_key unique (notification_id, recipient_user_id)
);

alter table public.notification_email_deliveries enable row level security;
revoke all on table public.notification_email_deliveries from public, anon, authenticated;
grant all on table public.notification_email_deliveries to service_role;

create index notification_email_deliveries_due_idx
on public.notification_email_deliveries(next_attempt_at, created_at)
where status in ('pending', 'retry');

create or replace function public.enqueue_marketplace_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = any(array[
    'reciprocal_match',
    'request_received',
    'exchange_accepted',
    'exchange_declined',
    'exchange_cancelled',
    'meetup_proposed',
    'swap_started',
    'return_meetup_proposed',
    'return_overdue',
    'return_dispute',
    'return_completed'
  ]::text[]) then
    insert into public.notification_email_deliveries(
      notification_id,
      recipient_user_id,
      notification_kind
    ) values (
      new.id,
      new.user_id,
      new.kind
    )
    on conflict (notification_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_marketplace_notification_email() from public, anon, authenticated;
grant execute on function public.enqueue_marketplace_notification_email() to service_role;

drop trigger if exists marketplace_notification_email_outbox on public.notifications;
create trigger marketplace_notification_email_outbox
after insert on public.notifications
for each row execute function public.enqueue_marketplace_notification_email();

create or replace function public.claim_notification_email_deliveries(
  p_limit integer default 20,
  p_delivery_id uuid default null
)
returns setof public.notification_email_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50';
  end if;

  return query
  with claimable as (
    select d.id
    from public.notification_email_deliveries d
    where (p_delivery_id is null or d.id = p_delivery_id)
      and d.attempt_count < 3
      and (
        (d.status in ('pending', 'retry') and d.next_attempt_at <= pg_catalog.now())
        or (d.status = 'processing' and d.claimed_at < pg_catalog.now() - interval '10 minutes')
      )
    order by d.created_at, d.id
    for update skip locked
    limit p_limit
  )
  update public.notification_email_deliveries d
  set status = 'processing',
      attempt_count = d.attempt_count + 1,
      claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  from claimable c
  where d.id = c.id
  returning d.*;
end;
$$;

revoke all on function public.claim_notification_email_deliveries(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_notification_email_deliveries(integer, uuid) to service_role;

