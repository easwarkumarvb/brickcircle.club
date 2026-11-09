import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../../supabase/functions/admin-dashboard/handler.mjs';

const migrationPath='supabase/migrations/20261109094000_admin_console_rpc_rate_limit.sql';
const gatePath='supabase/migrations/20261005143140_marketplace_admin_console.sql';

test('rate limit migration keeps storage private, capped and helper-only',async()=>{
  const migration=await readFile(migrationPath,'utf8');
  assert.match(migration,/create table private\.admin_rpc_rate_limits/);
  assert.match(migration,/admin_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(migration,/request_count integer not null check \(request_count between 0 and 60\)/);
  assert.match(migration,/alter table private\.admin_rpc_rate_limits enable row level security/);
  assert.match(migration,/revoke all on private\.admin_rpc_rate_limits from public,anon,authenticated,service_role/);
  assert.match(migration,/create function private\.assert_admin_rpc_rate_limit\(\) returns void/);
  assert.match(migration,/revoke all on function private\.assert_admin_rpc_rate_limit\(\) from public,anon,authenticated,service_role/);
  assert.match(migration,/security definer set search_path=''/);
  assert.match(migration,/date_trunc\('minute',pg_catalog\.now\(\)\)/);
  assert.match(migration,/delete from private\.admin_rpc_rate_limits\s+where window_start < pg_catalog\.now\(\) - interval '1 hour'/);
  assert.match(migration,/on conflict\(admin_id\) do nothing/);
  assert.match(migration,/for update/);
  assert.match(migration,/raise sqlstate 'PT429'/);
  assert.match(migration,/current_setting\('brickcircle\.admin_rpc_rate_limited',true\)='1'/);
  assert.match(migration,/set_config\('brickcircle\.admin_rpc_rate_limited','1',true\)/);
});

test('rate limit runs inside the shared gate after allowlist, session and AAL2 checks',async()=>{
  const migration=await readFile(migrationPath,'utf8');
  const gate=await readFile(gatePath,'utf8');
  const replaced=/create or replace function private\.assert_marketplace_admin\(\) returns void[\s\S]*?\$\$;/.exec(migration);
  assert.ok(replaced,'migration must replace private.assert_marketplace_admin');
  const body=replaced[0];
  const allowlist=body.indexOf('public.is_exchange_admin()');
  const session=body.indexOf('auth.sessions');
  const aal2=body.indexOf("'aal2'");
  const limit=body.indexOf('private.assert_admin_rpc_rate_limit()');
  assert.ok(allowlist!==-1&&session!==-1&&aal2!==-1&&limit!==-1);
  assert.ok(allowlist<session&&session<aal2&&aal2<limit,'rate limit must run after all three existing gates');
  assert.match(body,/errcode='42501'/);
  assert.match(body,/errcode='PT403'/);
  assert.match(migration,/revoke all on function private\.assert_marketplace_admin\(\) from public,anon,authenticated,service_role/);
  // The historical gate definition stays untouched; the migration layers on top.
  assert.match(gate,/create function private\.assert_marketplace_admin\(\) returns void/);
});

test('admin dashboard maps PT429 to a safe HTTP 429 without leaking internals',async()=>{
  const calls=[];
  const client={auth:{getUser:async()=>({data:{user:{id:'12345678-1234-1234-1234-123456789012'}},error:null})},
    rpc:async(name)=>{calls.push(name);return name==='is_exchange_admin'?{data:true,error:null}:{data:null,error:{code:'PT429',message:'sensitive rate limit internals'}};}};
  const handler=createHandler(()=>client,name=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-key'}[name]));
  const request=()=>new Request('https://example.supabase.co/functions/v1/admin-dashboard',{method:'POST',
    headers:{Authorization:'Bearer test-user-token','Content-Type':'application/json',Origin:'https://www.brickcircle.club'},
    body:JSON.stringify({operation:'read',section:'overview'})});
  const response=await handler(request());
  assert.equal(response.status,429);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const body=await response.json();
  assert.equal(body.code,'rate_limited');
  assert.doesNotMatch(JSON.stringify(body),/sensitive|internals/);
  assert.deepEqual(calls,['is_exchange_admin','admin_marketplace_read']);
});
