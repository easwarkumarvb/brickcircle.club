create or replace function public.normalize_profile_beta_location()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  new.country := nullif(trim(new.country), '');
  new.city := public.normalize_beta_city(new.country, new.city);
  return new;
end
$function$;

alter function public.normalize_profile_beta_location() owner to postgres;

-- This is an internal trigger function; clients should not invoke it directly.
revoke all on function public.normalize_profile_beta_location() from public, anon, authenticated;
grant execute on function public.normalize_profile_beta_location() to postgres, service_role;

comment on function public.normalize_profile_beta_location() is
'Normalizes profile country/city inside the profiles trigger. SECURITY DEFINER allows the trigger to call the private normalize_beta_city helper without granting that helper to client roles.';
