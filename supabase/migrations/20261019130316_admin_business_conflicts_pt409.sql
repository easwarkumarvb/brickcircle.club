do $migration$
declare
  v_note text;
  v_mutate text;
  v_old text;
  v_new text;
  v_old_code text;
  v_new_code text;
  v_count integer;
begin
  v_note := pg_catalog.pg_get_functiondef('public.admin_support_note(uuid,text,uuid)'::pg_catalog.regprocedure);
  v_old_code := $$'40001'$$;
  v_new_code := $$'PT409'$$;
  v_count := (pg_catalog.length(v_note) - pg_catalog.length(pg_catalog.replace(v_note, v_old_code, ''))) / pg_catalog.length(v_old_code);
  if v_count <> 1 then
    raise exception 'Unexpected admin_support_note 40001 occurrence count; refusing PT409 migration';
  end if;
  v_old := $$raise exception 'Request ID already used for another payload' using errcode='40001';$$;
  v_new := $$raise sqlstate 'PT409' using message = 'Request ID already used for another payload';$$;
  v_count := (pg_catalog.length(v_note) - pg_catalog.length(pg_catalog.replace(v_note, v_old, ''))) / pg_catalog.length(v_old);
  if v_count <> 1 or pg_catalog.strpos(v_note, v_new) <> 0 then
    raise exception 'Unexpected admin_support_note definition; refusing PT409 migration';
  end if;
  v_note := pg_catalog.replace(v_note, v_old, v_new);
  if (pg_catalog.length(v_note) - pg_catalog.length(pg_catalog.replace(v_note, v_new_code, ''))) / pg_catalog.length(v_new_code) <> 1 or
    pg_catalog.strpos(v_note, v_old_code) <> 0 then
    raise exception 'admin_support_note PT409 replacement verification failed';
  end if;
  execute v_note;

  v_mutate := pg_catalog.pg_get_functiondef('public.admin_marketplace_mutate(text,text,text,integer,text,uuid)'::pg_catalog.regprocedure);
  v_count := (pg_catalog.length(v_mutate) - pg_catalog.length(pg_catalog.replace(v_mutate, v_old_code, ''))) / pg_catalog.length(v_old_code);
  if v_count <> 2 then
    raise exception 'Unexpected admin_marketplace_mutate 40001 occurrence count; refusing PT409 migration';
  end if;
  v_old := $$raise exception 'Request ID already used for another change' using errcode='40001';$$;
  v_new := $$raise sqlstate 'PT409' using message = 'Request ID already used for another change';$$;
  v_count := (pg_catalog.length(v_mutate) - pg_catalog.length(pg_catalog.replace(v_mutate, v_old, ''))) / pg_catalog.length(v_old);
  if v_count <> 1 or pg_catalog.strpos(v_mutate, v_new) <> 0 then
    raise exception 'Unexpected admin_marketplace_mutate replay definition; refusing PT409 migration';
  end if;
  v_mutate := pg_catalog.replace(v_mutate, v_old, v_new);
  if (pg_catalog.length(v_mutate) - pg_catalog.length(pg_catalog.replace(v_mutate, v_new_code, ''))) / pg_catalog.length(v_new_code) <> 1 then
    raise exception 'admin_marketplace_mutate replay replacement verification failed';
  end if;

  v_old := $$raise exception 'This record changed. Refresh and retry.' using errcode='40001';$$;
  v_new := $$raise sqlstate 'PT409' using message = 'This record changed. Refresh and retry.';$$;
  v_count := (pg_catalog.length(v_mutate) - pg_catalog.length(pg_catalog.replace(v_mutate, v_old, ''))) / pg_catalog.length(v_old);
  if v_count <> 1 or pg_catalog.strpos(v_mutate, v_new) <> 0 then
    raise exception 'Unexpected admin_marketplace_mutate revision definition; refusing PT409 migration';
  end if;
  v_mutate := pg_catalog.replace(v_mutate, v_old, v_new);
  if (pg_catalog.length(v_mutate) - pg_catalog.length(pg_catalog.replace(v_mutate, v_new_code, ''))) / pg_catalog.length(v_new_code) <> 2 or
    pg_catalog.strpos(v_mutate, v_old_code) <> 0 then
    raise exception 'admin_marketplace_mutate revision replacement verification failed';
  end if;
  execute v_mutate;
end;
$migration$;