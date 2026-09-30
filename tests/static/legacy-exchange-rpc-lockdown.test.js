const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationName = '20260930110000_retire_legacy_exchange_mutation_rpcs.sql';
const migrationPath = path.join('supabase', 'migrations', migrationName);
assert.ok(fs.existsSync(migrationPath), `missing migration ${migrationName}`);
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /revoke all on function public\.advance_exchange\(uuid,text,text\) from public, anon, authenticated, service_role/i);
assert.match(sql, /revoke all on function public\.submit_exchange_review\(uuid,integer,text\) from public, anon, authenticated, service_role/i);
assert.doesNotMatch(sql, /drop\s+function/i);
assert.doesNotMatch(sql, /drop\s+table/i);
assert.doesNotMatch(sql, /create_exchange_case|exchange_case_transition|submit_exchange_case_review|send_exchange_case_message|resolve_exchange_case/i);

for (const file of ['v2.html', 'release-assets.json', 'catalogue-cache-sw.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /v22\.js|v22b\.js|v22reviews\.js|advance_exchange|submit_exchange_review/i, `${file} must not load legacy exchange mutation paths`);
}

console.log('legacy exchange RPC lockdown contract passed');
