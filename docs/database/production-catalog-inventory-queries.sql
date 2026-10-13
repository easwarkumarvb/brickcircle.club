-- BrickCircle production truth capture (SELECT-only)
-- Checkpoint: 2026-08-31; project: nsxtromjdpdscknadxez
-- This is evidence tooling, not a migration. Every statement is read-only.

-- Tables and columns.
select table_schema,table_name,ordinal_position,column_name,data_type,
       udt_schema,udt_name,is_nullable,column_default,is_identity,
       identity_generation,is_generated,generation_expression
from information_schema.columns
where table_schema in ('public','storage')
order by table_schema,table_name,ordinal_position;

-- Constraints, including FK actions as rendered by PostgreSQL.
select n.nspname as schema_name,c.relname as table_name,con.conname,
       con.contype,pg_get_constraintdef(con.oid,true) as definition
from pg_constraint con
join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage')
order by n.nspname,c.relname,con.contype,con.conname;

-- Indexes.
select schemaname,tablename,indexname,indexdef
from pg_indexes
where schemaname in ('public','storage')
order by schemaname,tablename,indexname;

-- RLS state and exact policies.
select n.nspname as schema_name,c.relname as table_name,
       c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p')
order by n.nspname,c.relname;

select schemaname,tablename,policyname,permissive,roles,cmd,
       qual as using_expression,with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname,tablename,policyname;

-- Exact application-function definitions and security metadata.
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,l.lanname as language,
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
       p.provolatile,p.proparallel,p.proconfig,pg_get_userbyid(p.proowner) as owner,
       md5(pg_get_functiondef(p.oid)) as definition_md5,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where n.nspname='public' and l.lanname<>'c'
order by p.proname,arguments;

-- Triggers.
select n.nspname as schema_name,c.relname as table_name,t.tgname,
       pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','auth','storage') and not t.tgisinternal
order by n.nspname,c.relname,t.tgname;

-- Views/materialized views.
select n.nspname as schema_name,c.relname as view_name,c.relkind,
       pg_get_viewdef(c.oid,true) as definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
order by c.relname;

-- Sequences.
select c.relname as sequence_name,pg_get_userbyid(c.relowner) as owner,
       coalesce(t.relname||'.'||a.attname,'unowned') as owned_by,
       s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcycle
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
join pg_sequence s on s.seqrelid=c.oid
left join pg_depend d on d.objid=c.oid and d.deptype in ('a','i')
left join pg_class t on t.oid=d.refobjid
left join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
where n.nspname='public' and c.relkind='S'
order by c.relname;

-- Enum/domain/custom types owned by the application schema.
select n.nspname as schema_name,t.typname as type_name,t.typtype,
       e.enumsortorder,e.enumlabel
from pg_type t
join pg_namespace n on n.oid=t.typnamespace
left join pg_enum e on e.enumtypid=t.oid
where n.nspname='public' and t.typtype in ('e','d','c')
  and not exists(select 1 from pg_class c where c.reltype=t.oid)
order by t.typname,e.enumsortorder;

-- Expanded table/sequence privileges.
select n.nspname as schema_name,c.relname as object_name,c.relkind,
       r.rolname as grantee,x.privilege_type,x.is_grantable
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,
  acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) x
join pg_roles r on r.oid=x.grantee
where n.nspname in ('public','storage')
  and r.rolname in ('anon','authenticated','service_role')
order by n.nspname,c.relname,r.rolname,x.privilege_type;

-- Expanded function execution privileges.
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       r.rolname as grantee,x.privilege_type,x.is_grantable
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
join pg_roles r on r.oid=x.grantee
where n.nspname='public' and r.rolname in ('anon','authenticated','service_role')
order by p.proname,arguments,r.rolname;

-- Bucket configuration and storage policies.
select id,name,public,file_size_limit,allowed_mime_types,
       avif_autodetection,type,versioning_status
from storage.buckets order by id;

select tablename,policyname,permissive,roles,cmd,
       qual as using_expression,with_check
from pg_policies
where schemaname='storage' and tablename in ('buckets','objects')
order by tablename,policyname;

-- Scheduled database work.
select jobid,jobname,schedule,command,nodename,nodeport,
       database,username,active
from cron.job order by jobname;

-- Supabase migration records. The linked integration's migration-list API was
-- used for the checkpoint because migration metadata schema is platform-owned.
