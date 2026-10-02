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

// Canonical post-handoff handling: HANDOFF_PENDING is a *pre*-mutual-handoff
// state, because custody cannot have changed until BOTH physical handoffs are
// confirmed. It therefore moved out of the "custody may have changed" list and
// into the pre-mutual-handoff cancellable list. The remaining post-handoff
// states stay locked, and the legacy HANDOFF_ISSUE/DISPUTED rows are still
// supported for cases that predate the peer-trust state machine.
const PRE_HANDOFF_CANCELLABLE_STATES = [
  'ACCEPTED',
  'MEETUP_PLANNING',
  'MEETUP_CONFIRMED',
  'INSPECTION',
  'HANDOFF_PENDING'
];
const POST_HANDOFF_LOCKED_STATES = [
  'ACTIVE',
  'HANDOFF_ISSUE',
  'EARLY_RETURN',
  'RETURN_PLANNING',
  'RETURN_INSPECTION',
  'DISPUTED'
];

function stateLiteral(states) {
  return `['${states.join("','")}']`;
}

const releaseStart = app.indexOf('async function releaseSetFromWorkflow(');
const releaseEnd = app.indexOf('function confirmOwnerReviewRecovery(');
assert.ok(
  releaseStart !== -1 && releaseEnd > releaseStart,
  'releaseSetFromWorkflow owner release path must exist'
);
const releaseSource = app.slice(releaseStart, releaseEnd);

assert.ok(
  releaseSource.includes(stateLiteral(PRE_HANDOFF_CANCELLABLE_STATES)),
  `pre-mutual-handoff cancellable states must be exactly ${stateLiteral(
    PRE_HANDOFF_CANCELLABLE_STATES
  )}`
);
assert.ok(
  releaseSource.includes(stateLiteral(POST_HANDOFF_LOCKED_STATES)),
  `post-handoff locked states must be exactly ${stateLiteral(POST_HANDOFF_LOCKED_STATES)}`
);

// HANDOFF_PENDING must not be treated as a post-handoff locked state, and the
// superseded combined array must be gone.
assert.ok(
  !POST_HANDOFF_LOCKED_STATES.includes('HANDOFF_PENDING'),
  'HANDOFF_PENDING must not be treated as a post-handoff locked state'
);
assert.doesNotMatch(releaseSource, /'ACTIVE','HANDOFF_PENDING'/);

// The pre-mutual-handoff list gates the canonical cancel RPC, and the locked
// post-handoff branch routes into the case instead of cancelling.
assert.ok(
  releaseSource.includes(
    `const cancellable=${stateLiteral(
      PRE_HANDOFF_CANCELLABLE_STATES
    )}.includes(workflow.state);`
  ),
  'pre-mutual-handoff states must gate the cancel-before-mutual-handoff branch'
);
assert.match(releaseSource, /cancel_exchange_case_before_mutual_handoff/);
assert.ok(
  releaseSource.includes(
    `if(${stateLiteral(
      POST_HANDOFF_LOCKED_STATES
    )}.includes(workflow.state)){toast('Physical custody may have changed, so this exchange can no longer be cancelled.`
  ),
  'post-handoff locked states must route the owner into the case, not cancel'
);

// Legacy HANDOFF_ISSUE/DISPUTED rows are intentionally still supported, but
// only as read-only legacy cases without the new peer-trust issue tools.
assert.match(
  app,
  /^function legacyIssueCase\(e\)\{return e\.state==='HANDOFF_ISSUE'\|\|e\.state==='DISPUTED'\}$/m
);
assert.match(
  app,
  /function canReportCaseIssue\(e\)\{return Boolean\(e\.handoff_at\)&&!legacyIssueCase\(e\)\}/
);
assert.match(app, /This set is on owner review after a previous exchange/);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.ok(
  pkg.scripts['test:owner-review-recovery']?.includes('owner-review-recovery.test.js'),
  'owner-review recovery contract must be wired to a package script'
);

console.log('owner-review-recovery contract passed');
