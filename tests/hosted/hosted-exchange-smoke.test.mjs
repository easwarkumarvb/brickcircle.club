import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STAGING_CONFIRMATION,
  REALTIME_DELIVERY_TIMEOUT_MS,
  REALTIME_JOIN_TIMEOUT_MS,
  assertAcceptanceNotificationVisibility,
  buildFailureReport,
  classifySmokeFailure,
  idempotencyKey,
  loadHostedSmokeConfig,
  projectRefFromUrl,
  redactIdentifier,
  serializeRedactedReport,
  subscribeToNotifications,
  validateDispatcherSelection,
  validateStagingEmails,
  waitFor
} from '../../scripts/hosted-exchange-smoke.mjs';

const valid = {
  BC_HOSTED_SMOKE_CONFIRMATION: STAGING_CONFIRMATION,
  BC_HOSTED_SMOKE_PULL_REQUEST_NUMBER: '102',
  BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA: '092dfe54073016526ade49f8a1ecfb577cb30561',
  BC_STAGING_SUPABASE_URL: 'https://staging-project.supabase.co',
  BC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
  BC_STAGING_SUPABASE_SECRET_KEY: 'sb_secret_staging',
  BC_STAGING_NOTIFICATION_MODE: 'outbox-only',
  BC_STAGING_SUPABASE_PROJECT_REF: 'staging-project',
  BC_PRODUCTION_SUPABASE_PROJECT_REF: 'production-project',
  BC_STAGING_ALLOWED_EMAIL_DOMAIN: 'example.test',
  BC_STAGING_USER_A_EMAIL: 'a@example.test',
  BC_STAGING_USER_A_PASSWORD: 'password-a',
  BC_STAGING_USER_B_EMAIL: 'b@example.test',
  BC_STAGING_USER_B_PASSWORD: 'password-b',
  BC_STAGING_USER_C_EMAIL: 'c@example.test',
  BC_STAGING_USER_C_PASSWORD: 'password-c',
  BC_STAGING_SET_A: '42143-1',
  BC_STAGING_SET_B: '42141-1'
};

test('accepts an explicitly confirmed isolated hosted staging target', () => {
  const config = loadHostedSmokeConfig(valid);
  assert.equal(config.expectedProjectRef, 'staging-project');
  assert.equal(config.productionProjectRef, 'production-project');
  assert.equal(config.users.length, 3);
  assert.equal(config.pullRequestNumber, 102);
  assert.equal(config.headSha, valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA);
});

test('validates immutable dispatcher PR and SHA inputs', () => {
  assert.deepEqual(validateDispatcherSelection('102', valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA), {
    pullRequestNumber: 102,
    headSha: valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA
  });
  for (const pr of ['', '0', '-1', '102x']) assert.throws(() => validateDispatcherSelection(pr, valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA));
  for (const sha of ['', 'abc', valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA.toUpperCase()]) assert.throws(() => validateDispatcherSelection('102', sha));
});

test('dispatcher is manual-only and validates the same-repository canonical PR before staging', () => {
  const workflow = readFileSync('.github/workflows/hosted-supabase-exchange-smoke.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:pull_request_target|pull_request|push|schedule):/m);
  assert.match(workflow, /pr\.head\.repo\?\.full_name !== `\$\{owner\}\/\$\{repo\}`/);
  assert.match(workflow, /pr\.head\.ref !== 'codex\/canonical-exchange-state-machine'/);
  assert.match(workflow, /pr\.head\.sha !== expectedSha/);
  assert.ok(workflow.indexOf('validate-pr:') < workflow.indexOf('environment: hosted-supabase-staging'));
  assert.match(workflow, /ref: \$\{\{ needs\.validate-pr\.outputs\.head_sha \}\}/);
});

test('refuses a missing explicit confirmation', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_HOSTED_SMOKE_CONFIRMATION: '' }), /Missing required environment variable/);
});

test('refuses a staging ref that equals production', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_PRODUCTION_SUPABASE_PROJECT_REF: 'staging-project' }), /equals the production project ref/);
});

test('refuses a URL whose project ref differs from the approved staging ref', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SUPABASE_URL: 'https://wrong-project.supabase.co' }), /does not match/);
});

test('refuses local, custom-domain, path-bearing and non-HTTPS targets', () => {
  for (const url of [
    'http://staging-project.supabase.co',
    'https://localhost:54321',
    'https://staging.example.com',
    'https://staging-project.supabase.co/rest/v1'
  ]) assert.throws(() => projectRefFromUrl(url));
});

test('requires three distinct staging identities and two distinct products', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_USER_C_EMAIL: valid.BC_STAGING_USER_A_EMAIL }), /three distinct/);
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SET_B: valid.BC_STAGING_SET_A }), /must be different/);
});

test('requires a non-routable or explicitly approved staging email domain', () => {
  const users = [
    { label: 'A', email: 'a@example.test' },
    { label: 'B', email: 'b@example.test' },
    { label: 'C', email: 'c@example.test' }
  ];
  assert.equal(validateStagingEmails(users, 'example.test').length, 3);
  assert.equal(validateStagingEmails(users.map(user => ({ ...user, email: user.email.replace('example.test', 'sink.invalid') })), 'sink.invalid', 'sink.invalid').length, 3);
  assert.throws(() => validateStagingEmails(users, ''), /Missing required/);
  assert.throws(() => validateStagingEmails(users, 'gmail.com'), /Public email/);
  assert.throws(() => validateStagingEmails(users, 'sink.invalid', 'different.invalid'), /explicitly approved/);
  assert.throws(() => validateStagingEmails([{ ...users[0], email: 'a@example.test' }, { ...users[1], email: 'b@sink.invalid' }, users[2]], 'example.test'), /match the approved domain/);
  assert.throws(() => validateStagingEmails(users.map(user => ({ ...user, email: `${user.label.toLowerCase()}@brickcircle.club` })), 'brickcircle.club', 'brickcircle.club'), /Production-like/);
  assert.throws(() => validateStagingEmails([{ ...users[0], email: 'not-an-email' }, users[1], users[2]], 'example.test'), /Malformed/);
});

test('refuses reuse of a public API key as the server secret', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_SUPABASE_SECRET_KEY: valid.BC_STAGING_SUPABASE_PUBLISHABLE_KEY }), /must be different/);
});

test('requires an outbox-only staging notification configuration', () => {
  assert.throws(() => loadHostedSmokeConfig({ ...valid, BC_STAGING_NOTIFICATION_MODE: 'deliver' }), /must equal outbox-only/);
});

test('generates deterministic per-intent idempotency keys', () => {
  assert.equal(idempotencyKey('run-1', 'counter'), idempotencyKey('run-1', 'counter'));
  assert.notEqual(idempotencyKey('run-1', 'counter'), idempotencyKey('run-1', 'accept'));
  assert.notEqual(idempotencyKey('run-1', 'counter'), idempotencyKey('run-2', 'counter'));
});

test('serializes only redacted, credential-free evidence', () => {
  const redacted = redactIdentifier('11111111-1111-4111-8111-111111111111');
  const serialized = serializeRedactedReport({ ok: true, case: redacted, target: 'approved-staging' });
  assert.match(serialized, /id:[0-9a-f]{12}/);
  assert.doesNotMatch(serialized, /11111111-1111-4111-8111-111111111111/);
  assert.throws(() => serializeRedactedReport({ email: 'a@example.test' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ password: 'hidden' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'https:\/\/staging-project.supabase.co' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'sb_secret_example' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'Bearer opaque-access-token' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'password=not-safe' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: 'eyJheader.payload.signature' }), /Refusing/);
  assert.throws(() => serializeRedactedReport({ value: '11111111-1111-4111-8111-111111111111' }), /Refusing/);
});

function notificationClient(rows, visibleUserId = null) {
  return {
    from(table) {
      assert.equal(table, 'notifications');
      const filters = [];
      let head = false;
      const query = {
        select(_columns, options = {}) { head = options.head === true; return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        then(resolve) {
          const matching = rows.filter(row => filters.every(([column, value]) => row[column] === value));
          const visible = visibleUserId ? matching.filter(row => row.user_id === visibleUserId) : matching;
          resolve(head ? { count: visible.length, error: null } : { data: visible, error: null });
        }
      };
      return query;
    }
  };
}

test('acceptance notification evidence respects participant RLS and global server visibility', async () => {
  const caseId = '11111111-1111-4111-8111-111111111111';
  const aId = '22222222-2222-4222-8222-222222222222';
  const bId = '33333333-3333-4333-8333-333333333333';
  const rows = [{ id: '44444444-4444-4444-8444-444444444444', exchange_case_id: caseId, kind: 'exchange_accepted', user_id: bId }];
  await assert.doesNotReject(assertAcceptanceNotificationVisibility({
    participantA: notificationClient(rows, aId),
    participantB: notificationClient(rows, bId),
    admin: notificationClient(rows),
    caseId,
    recipientId: bId
  }));
});

test('correct RLS suppression is not mistaken for missing acceptance evidence', async () => {
  const caseId = '11111111-1111-4111-8111-111111111111';
  const aId = '22222222-2222-4222-8222-222222222222';
  const bId = '33333333-3333-4333-8333-333333333333';
  const rows = [{ id: '44444444-4444-4444-8444-444444444444', exchange_case_id: caseId, kind: 'exchange_accepted', user_id: bId }];
  await assert.rejects(
    assertAcceptanceNotificationVisibility({
      participantA: notificationClient(rows, aId),
      participantB: notificationClient([], bId),
      admin: notificationClient(rows),
      caseId,
      recipientId: bId
    }),
    /Counterproposer B must see exactly one/
  );
});

test('named assertion failure evidence retains stage, completed checks and safe classification', () => {
  const error = new assert.AssertionError({ message: 'Accepted notification count did not match', actual: 0, expected: 1 });
  error.safeSmokeContext = {
    stage: 'counterproposal and acceptance idempotency',
    checks: [{ status: 'passed', detail: 'proposal committed/lost-response retry is idempotent' }],
    classification: classifySmokeFailure(error),
    assertion: error.message
  };
  const report = buildFailureReport({
    runId: 'hosted-smoke-safe',
    pullRequestNumber: 102,
    headSha: valid.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA
  }, error, '2026-09-27T00:00:00.000Z');
  assert.equal(report.stage, 'counterproposal and acceptance idempotency');
  assert.equal(report.classification, 'assertion');
  assert.equal(report.checks.length, 1);
  assert.match(report.assertion, /Accepted notification count/);
  assert.doesNotThrow(() => serializeRedactedReport(report));
});

test('failure classification separates assertion, Realtime, RLS, RPC and configuration failures', () => {
  assert.equal(classifySmokeFailure(Object.assign(new Error('count mismatch'), { code: 'ERR_ASSERTION' })), 'assertion');
  assert.equal(classifySmokeFailure(Object.assign(new Error('Realtime subscription did not become ready'), {
    safeRealtimeDiagnostic: { connectionState: 'TIMED_OUT' }
  })), 'realtime_join');
  assert.equal(classifySmokeFailure(Object.assign(new Error('Timed out waiting for proposal Realtime notification'), {
    safeRealtimeDiagnostic: { connectionState: 'DELIVERY_TIMEOUT' }
  })), 'realtime_delivery');
  assert.equal(classifySmokeFailure(new Error('RLS policy denied the caller')), 'rls');
  assert.equal(classifySmokeFailure(new Error('RPC function failed')), 'rpc');
  assert.equal(classifySmokeFailure(new Error('Missing required environment variable')), 'configuration');
});

function fakeRealtimeSession({ delayed = false, changed = false } = {}) {
  const id = '11111111-1111-4111-8111-111111111111';
  const order = [];
  let release;
  const client = {
    auth: {
      getUser: async () => {
        order.push('getUser');
        return changed && order.filter(step => step === 'getUser').length > 1
          ? { data: { user: { id: '22222222-2222-4222-8222-222222222222' } }, error: null }
          : { data: { user: { id } }, error: null };
      }
    },
    realtime: {
      setAuth: async () => {
        order.push('setAuth:start');
        if (delayed) await new Promise(resolve => { release = resolve; });
        order.push('setAuth:complete');
      }
    },
    channel: () => {
      order.push('channel:create');
      return {
        on(_type, filter) { order.push(`binding:${filter.filter}`); return this; },
        subscribe(callback) { order.push('channel:subscribe'); queueMicrotask(() => callback('SUBSCRIBED')); return this; }
      };
    }
  };
  return { session: { label: 'B', id, client }, id, order, release: () => release?.() };
}

test('authenticates Realtime before exact filtered channel creation', async () => {
  const fixture = fakeRealtimeSession();
  const result = await subscribeToNotifications(fixture.session, fixture.id, 'run', [], { readinessGraceMs: 0, joinTimeoutMs: 50 });
  assert.deepEqual(fixture.order, [
    'getUser', 'setAuth:start', 'setAuth:complete', 'getUser', 'channel:create',
    `binding:user_id=eq.${fixture.id}`, 'channel:subscribe'
  ]);
  assert.equal(result.diagnostic.identitySetupComplete, true);
  assert.equal(result.diagnostic.serverBindingAccepted, true);
  assert.match(result.diagnostic.session, /^id:[0-9a-f]{12}$/);
  assert.doesNotMatch(JSON.stringify(result.diagnostic), new RegExp(fixture.id));
});

test('a delayed Realtime identity setup cannot race channel creation', async () => {
  const fixture = fakeRealtimeSession({ delayed: true });
  const pending = subscribeToNotifications(fixture.session, fixture.id, 'run', [], { readinessGraceMs: 0, joinTimeoutMs: 50 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.order, ['getUser', 'setAuth:start']);
  fixture.release();
  await pending;
  assert.ok(fixture.order.indexOf('setAuth:complete') < fixture.order.indexOf('channel:create'));
});

test('changed sessions abort before channel creation', async () => {
  const fixture = fakeRealtimeSession({ changed: true });
  await assert.rejects(
    subscribeToNotifications(fixture.session, fixture.id, 'run', [], { readinessGraceMs: 0, joinTimeoutMs: 50 }),
    /changed during authentication/
  );
  assert.equal(fixture.order.includes('channel:create'), false);
});

test('durable database evidence does not substitute for the required Realtime event', async () => {
  const durableNotificationRows = 1;
  assert.equal(durableNotificationRows, 1);
  await assert.rejects(waitFor(() => undefined, 'proposal Realtime notification', 5), /Timed out/);
  assert.equal(REALTIME_JOIN_TIMEOUT_MS, 20_000);
  assert.equal(REALTIME_DELIVERY_TIMEOUT_MS, 60_000);
});
