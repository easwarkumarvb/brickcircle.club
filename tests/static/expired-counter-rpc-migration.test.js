const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationPath = path.join('supabase', 'migrations', '20261019030051_reject_expired_exchange_counters.sql');
assert.ok(fs.existsSync(migrationPath), 'missing expired-counter migration');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /pg_get_functiondef\(\s*'public\.exchange_case_transition\(uuid,bigint,text,text,jsonb\)'::regprocedure\s*\)/i);
assert.match(sql, /if clean_action='counter' then[\s\S]*?if c\.response_deadline<=pg_catalog\.now\(\) then raise exception 'This proposal has expired'; end if;[\s\S]*?next_duration:=/);
assert.match(sql, /strpos\(function_definition,old_fragment\)=0/);
assert.match(sql, /replace\(function_definition,old_fragment,new_fragment\)/);
assert.doesNotMatch(sql, /\b(?:grant|revoke|alter owner)\b/i);
assert.doesNotMatch(sql, /user_metadata|create\s+table|alter\s+table/i);

const regressionPath = path.join('supabase', 'tests', 'expired_exchange_counter.sql');
assert.ok(fs.existsSync(regressionPath), 'missing real-role expired-counter regression');
const regression = fs.readFileSync(regressionPath, 'utf8');
for (const evidence of [
  'late-counter-expired',
  'late-counter-boundary',
  'future-counter',
  'outsider-counter',
  'expired-decline',
  'expired-withdraw',
  'notification_email_deliveries',
  'Rejected late counter changed case'
]) assert.ok(regression.includes(evidence), `missing SQL regression evidence: ${evidence}`);

console.log('expired-counter RPC migration contract passed');
