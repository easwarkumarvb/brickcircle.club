const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationName = '20260930160000_retire_legacy_exchangeability_trigger.sql';
const migrationPath = path.join('supabase', 'migrations', migrationName);
assert.ok(fs.existsSync(migrationPath), `missing migration ${migrationName}`);

const rawSql = fs.readFileSync(migrationPath, 'utf8');
// Strip SQL comments so documentation mentions don't trigger code assertions.
const sql = rawSql.replace(/--[^\n]*/g, '');
assert.match(
  sql,
  /drop trigger if exists bc_guard_collection_exchangeability\s+on public\.collection_items/i
);
assert.doesNotMatch(sql, /drop\s+function/i);
assert.doesNotMatch(sql, /drop\s+table/i);
assert.doesNotMatch(sql, /delete\s+from/i);
assert.doesNotMatch(sql, /update\s+public\.collection_items/i);

// The migration must not weaken canonical guard functions or RPC grants.
assert.doesNotMatch(sql, /bc_guard_collection_case_fields/i);
assert.doesNotMatch(sql, /bc_guard_collection_case_delete/i);
assert.doesNotMatch(sql, /collection_item_exchange_status/i);
// The migration may mention set_exchange_item_availability only in comments,
// not in revoke/grant statements that would alter its execute privileges.
assert.doesNotMatch(sql, /revoke[^\n]*set_exchange_item_availability/i);
assert.doesNotMatch(sql, /grant[^\n]*set_exchange_item_availability/i);
assert.doesNotMatch(sql, /revoke[^\n]*collection_item_exchange_status/i);
assert.doesNotMatch(sql, /grant[^\n]*collection_item_exchange_status/i);
assert.doesNotMatch(sql, /revoke[^\n]*bc_guard_collection_case/i);
assert.doesNotMatch(sql, /grant[^\n]*bc_guard_collection_case/i);

const app = fs.readFileSync('app-v3.js', 'utf8');
assert.match(app, /!workflow&&row\.exchange_review_required/);
assert.match(app, /data-clear-owner-review/);
assert.match(app, /Review complete · make available/);
assert.match(app, /confirmOwnerReviewRecovery/);
assert.match(
  app,
  /set_exchange_item_availability'.*p_item_id:id,p_available:on/s
);
assert.match(app, /Cancel proposal & free set/);
assert.match(
  app,
  /\['ACTIVE','HANDOFF_PENDING','HANDOFF_ISSUE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED'\]/
);
assert.match(
  app,
  /This set is on owner review after a previous exchange/
);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.ok(
  pkg.scripts['test:owner-review-recovery']?.includes('owner-review-recovery.test.js'),
  'owner-review recovery contract must be wired to a package script'
);

console.log('owner-review-recovery contract passed');
