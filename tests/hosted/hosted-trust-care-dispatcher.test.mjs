import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const trust=readFileSync(new URL('../../.github/workflows/hosted-trust-care-pr179-smoke.yml',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../../.github/workflows/hosted-supabase-exchange-smoke.yml',import.meta.url),'utf8');
test('Trust and Care staging dispatch is manual, branch-locked, PR-locked and exact-commit-locked',()=>{
  assert.match(trust,/workflow_dispatch:/);
  assert.doesNotMatch(trust,/pull_request:\s*\n/);
  assert.match(trust,/Number\(prText\) !== 179/);
  assert.match(trust,/pr\.draft !== true/);
  assert.match(trust,/dev\/trust-care-ux-20261019/);
  assert.match(trust,/pr\.head\.sha !== expectedSha/);
  assert.match(trust,/RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE/);
  assert.match(trust,/environment: hosted-supabase-staging/);
});
test('Staging secrets stay scoped to protected environment and outbox-safe harness',()=>{
  const validate=trust.slice(trust.indexOf('  validate-pr:'),trust.indexOf('  hosted-exchange-smoke:'));
  assert.doesNotMatch(validate, /secrets\.BC_STAGING_/);
  assert.match(trust,/BC_STAGING_NOTIFICATION_MODE: \$\{\{ vars\.BC_STAGING_NOTIFICATION_MODE \}\}/);
  assert.match(trust,/BC_PRODUCTION_SUPABASE_PROJECT_REF: \$\{\{ vars\.BC_PRODUCTION_SUPABASE_PROJECT_REF \}\}/);
  assert.match(trust,/npm run test:hosted:guard/);
  assert.match(trust,/node scripts\/bootstrap-hosted-smoke-users\.mjs/);
  assert.match(trust,/npm run smoke:hosted:exchange/);
  assert.match(trust,/persist-credentials: false/);
});
test('Original protected canonical exchange dispatcher remains unchanged and branch-locked',()=>{
  assert.match(legacy,/codex\/canonical-exchange-state-machine/);
  assert.doesNotMatch(legacy,/dev\/trust-care-ux-20261019/);
});
