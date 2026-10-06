const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationName = '20260930111000_admin_dashboard_exchange_admin_authorization.sql';
const sql = fs.readFileSync(path.join('supabase', 'migrations', migrationName), 'utf8');
const edge = fs.readFileSync(path.join('supabase', 'functions', 'admin-dashboard', 'handler.mjs'), 'utf8');
const client = fs.readFileSync('admin-dashboard.js', 'utf8');

assert.match(sql, /create or replace function public\.is_exchange_admin\(\)/i);
assert.match(sql, /returns boolean/i);
assert.match(sql, /stable/i);
assert.match(sql, /security definer/i);
assert.match(sql, /set search_path=''/i);
assert.match(sql, /private\.exchange_admins/i);
assert.match(sql, /auth\.uid\(\)/i);
assert.match(sql, /revoke all on function public\.is_exchange_admin\(\) from public, anon, authenticated, service_role/i);
assert.match(sql, /grant execute on function public\.is_exchange_admin\(\) to authenticated/i);
assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all).*private\.exchange_admins/i);

assert.doesNotMatch(edge, /OWNER_USER_ID|app_metadata\?\.role|app_metadata.*admin/i);
assert.match(edge, /userClient\.rpc\('is_exchange_admin'\)/);
assert.match(edge, /adminAccessError/);
assert.match(edge, /isExchangeAdmin !== true/);

const verifyUserAt = edge.indexOf('userClient.auth.getUser()');
const accessRpcAt = edge.indexOf("userClient.rpc('is_exchange_admin')");
const strictAllowAt = edge.indexOf('isExchangeAdmin !== true');
assert.ok(verifyUserAt >= 0 && accessRpcAt > verifyUserAt);
assert.ok(strictAllowAt > accessRpcAt);
assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY/);

assert.doesNotMatch(client, /OWNER_USER_ID|user\.id\s*!==/);
assert.match(client, /db\.auth\.getUser\(sessionData\.session\.access_token\)/);
assert.match(client, /functions\/v1\/admin-dashboard/);

console.log('admin dashboard canonical authorization contract passed');

const adminSql = fs.readFileSync('supabase/migrations/20261005143140_marketplace_admin_console.sql', 'utf8');
assert.match(adminSql, /auth\.sessions/);
assert.match(adminSql, /auth\.jwt\(\)->>'aal' is distinct from 'aal2'/);
assert.match(adminSql, /perform private\.assert_marketplace_admin\(\)/);
assert.match(adminSql, /pg_advisory_xact_lock/);
assert.match(adminSql, /v_revision<>p_revision/);
assert.doesNotMatch(adminSql, /update public\.exchange_cases/);
assert.match(adminSql, /preserve_admin_catalogue_visibility/);
assert.match(adminSql, /before insert or update on public\.lego_sets/);
assert.match(adminSql, /new\.catalog_active:=false/);
