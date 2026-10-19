-- Preserve the canonical transition RPC verbatim except for the proposal
-- deadline check, so its signature, owner, ACL, search_path and other actions
-- remain exactly as deployed.
do $migration$
declare
  function_definition text;
  old_fragment constant text := $fragment$
  if clean_action='counter' then
    if c.state<>'PROPOSED' or me<>c.recipient_id then raise exception 'Only the current recipient can counter this proposal'; end if;
    next_duration:=$fragment$;
  new_fragment constant text := $fragment$
  if clean_action='counter' then
    if c.state<>'PROPOSED' or me<>c.recipient_id then raise exception 'Only the current recipient can counter this proposal'; end if;
    if c.response_deadline<=pg_catalog.now() then raise exception 'This proposal has expired'; end if;
    next_duration:=$fragment$;
  old_count integer;
  new_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.exchange_case_transition(uuid,bigint,text,text,jsonb)'::regprocedure
  ) into function_definition;

  old_count := (pg_catalog.length(function_definition)
    - pg_catalog.length(pg_catalog.replace(function_definition,old_fragment,'')))
    / pg_catalog.length(old_fragment);
  new_count := (pg_catalog.length(function_definition)
    - pg_catalog.length(pg_catalog.replace(function_definition,new_fragment,'')))
    / pg_catalog.length(new_fragment);

  if old_count=0 and new_count=1 then
    return;
  elsif old_count<>1 or new_count<>0 then
    raise exception 'Expected canonical exchange_case_transition counter branch was not found';
  end if;

  execute pg_catalog.replace(function_definition,old_fragment,new_fragment);
end
$migration$;

notify pgrst,'reload schema';