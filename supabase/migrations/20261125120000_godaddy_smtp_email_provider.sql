-- New marketplace and registration deliveries use GoDaddy SMTP.
-- Preserve provider values on completed rows for accurate delivery history.

alter table public.notification_email_deliveries
  drop constraint if exists notification_email_deliveries_provider_check;
alter table public.notification_email_deliveries
  alter column provider set default 'godaddy_smtp';
alter table public.notification_email_deliveries
  add constraint notification_email_deliveries_provider_check
  check (provider in ('brevo', 'godaddy_smtp'));
update public.notification_email_deliveries
  set provider = 'godaddy_smtp'
  where provider = 'brevo' and status in ('pending', 'processing', 'retry');
comment on column public.notification_email_deliveries.provider is
  'Transport used for the latest delivery attempt; completed rows retain their historical provider.';

alter table public.registration_email_deliveries
  drop constraint if exists registration_email_deliveries_provider_check;
alter table public.registration_email_deliveries
  alter column provider set default 'godaddy_smtp';
alter table public.registration_email_deliveries
  add constraint registration_email_deliveries_provider_check
  check (provider in ('brevo', 'godaddy_smtp'));
update public.registration_email_deliveries
  set provider = 'godaddy_smtp'
  where provider = 'brevo' and status in ('pending', 'processing', 'retry');
comment on column public.registration_email_deliveries.provider is
  'Transport used for the latest delivery attempt; completed rows retain their historical provider.';
