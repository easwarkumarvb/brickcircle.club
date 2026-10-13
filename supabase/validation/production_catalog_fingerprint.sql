-- BrickCircle production-current-state validation (SELECT-only).
-- This is not a migration. Run through a read-only connection.
-- The output is normalized to make ordering-independent drift visible.

with fingerprints as (
  select 'columns' as component,
         md5(string_agg(concat_ws('|', n.nspname, c.relname, a.attnum,
           a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
           a.attnotnull, coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
           a.attidentity, a.attgenerated), E'\n' order by n.nspname,c.relname,a.attnum)) as fingerprint
  from pg_attribute a
  join pg_class c on c.oid=a.attrelid
  join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
  union all
  select 'constraints', md5(string_agg(concat_ws('|',n.nspname,c.relname,x.conname,
    x.contype,pg_get_constraintdef(x.oid,true)), E'\n' order by n.nspname,c.relname,x.conname))
  from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
  union all
  select 'indexes', md5(string_agg(concat_ws('|',schemaname,tablename,indexname,indexdef), E'\n'
    order by schemaname,tablename,indexname)) from pg_indexes where schemaname='public'
  union all
  select 'policies', md5(string_agg(concat_ws('|',schemaname,tablename,policyname,permissive,
    roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')), E'\n'
    order by schemaname,tablename,policyname)) from pg_policies where schemaname in ('public','storage')
  union all
  select 'functions', md5(string_agg(concat_ws('|',n.nspname,p.oid::regprocedure::text,
    p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),pg_get_functiondef(p.oid)), E'\n'
    order by n.nspname,p.oid::regprocedure::text))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all
  select 'triggers', md5(string_agg(concat_ws('|',n.nspname,c.relname,t.tgname,
    pg_get_triggerdef(t.oid,true)), E'\n' order by n.nspname,c.relname,t.tgname))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('public','auth','storage')
  union all
  select 'relation_acl', md5(string_agg(concat_ws('|',n.nspname,c.relname,
    coalesce(a.grantee::regrole::text,''),coalesce(a.privilege_type,''),coalesce(a.is_grantable::text,'')), E'\n'
    order by n.nspname,c.relname,a.grantee::regrole::text,a.privilege_type))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a
  where n.nspname='public' and c.relkind in ('r','p','S','v','m')
  union all
  select 'function_acl', md5(string_agg(concat_ws('|',n.nspname,p.oid::regprocedure::text,
    a.grantee::regrole::text,a.privilege_type,a.is_grantable), E'\n'
    order by n.nspname,p.oid::regprocedure::text,a.grantee::regrole::text,a.privilege_type))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='public'
)
select component,fingerprint from fingerprints order by component;

-- Non-DDL configuration fingerprints are intentionally separate.
select 'storage_bucket' as component,
       md5(string_agg(row_to_json(x)::text,E'\n' order by x.id)) as fingerprint
from (select id,name,public,file_size_limit,allowed_mime_types,type,avif_autodetection,versioning_status
      from storage.buckets where id='avatars') x
union all
select 'cron_job', md5(string_agg(row_to_json(x)::text,E'\n' order by x.jobid))
from (select jobid,schedule,command,database,username,active,jobname
      from cron.job where jobname='brickcircle-growth-engine-v2') x;
