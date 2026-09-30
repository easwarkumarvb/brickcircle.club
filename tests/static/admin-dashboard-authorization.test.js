const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationName = '20260930111000_admin_dashboard_exchange_admin_authorization.sql';
const sql = fs.readFileSync(path.join('supabase', 'migrations', migrationName), 'utf8');
const edge = fs.readFileSync(path.join('supabase', 'functions', 'admin-dashboard', 'index.ts'), 'utf8');
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
const serviceClientAt = edge.indexOf('const admin = createClient(url, service');
assert.ok(verifyUserAt >= 0 && accessRpcAt > verifyUserAt);
assert.ok(strictAllowAt > accessRpcAt);
assert.ok(serviceClientAt > strictAllowAt);

assert.doesNotMatch(client, /OWNER_USER_ID|user\.id\s*!==/);
assert.match(client, /db\.auth\.getUser\(\)/);
assert.match(client, /functions\/v1\/admin-dashboard/);

console.log('admin dashboard canonical authorization contract passed');
