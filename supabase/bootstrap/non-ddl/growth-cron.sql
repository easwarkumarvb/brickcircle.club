do $$
declare j cron.job%rowtype;
begin
  select * into j from cron.job where jobname='brickcircle-growth-engine-v2';
  if not found then
    perform cron.schedule('brickcircle-growth-engine-v2','17 * * * *','select public.bc_run_growth_campaigns(500);');
  elsif j.schedule <> '17 * * * *' or j.command <> 'select public.bc_run_growth_campaigns(500);'
     or j.database <> 'postgres' or j.username <> 'postgres' or j.active is distinct from true then
    raise exception 'brickcircle-growth-engine-v2 cron drift';
  end if;
end $$;
