#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

export const PROJECT = 'tteyypklldgwwicrgjzt';
export const CONFIRMATION = 'RUN_OWNED_DISPOSABLE_ADMIN_SMOKE';
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function assertCheckout(expected, actual) {
  if (!/^[0-9a-f]{40}$/.test(expected) || actual !== expected)
    throw new Error('Reviewed checkout required');
}
export function validateConfig(c) {
  assert.equal(c.url, `https://${PROJECT}.supabase.co`);
  assert.equal(c.confirmation, CONFIRMATION);
  assert.equal(c.pr, '124'); assert.match(c.sha, /^[0-9a-f]{40}$/);
  for (const id of [c.run, c.caseId, c.supportId]) assert.match(id, uuid);
  assert.ok(c.key); assert.match(c.totpSecret, /^[A-Z2-7]{16,}=*$/i);
  assert.equal(c.credentials.length, 2);
  for (const credential of c.credentials) {
    assert.match(credential.email, /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/i);
    assert.ok(credential.password);
  }
  assert.notEqual(c.credentials[0].email.toLowerCase(), c.credentials[1].email.toLowerCase());
  return c;
}
export function configFromEnv(env) {
  return validateConfig({ url: env.BC_STAGING_SUPABASE_URL, key: env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY,
    confirmation: env.BC_ADMIN_SMOKE_CONFIRMATION, pr: env.BC_ADMIN_SMOKE_PR,
    sha: env.BC_ADMIN_SMOKE_EXPECTED_HEAD_SHA, run: env.BC_ADMIN_SMOKE_RUN_ID,
    caseId: env.BC_ADMIN_SMOKE_CASE_ID, supportId: env.BC_ADMIN_SMOKE_SUPPORT_ID,
    totpSecret: env.BC_ADMIN_SMOKE_ADMIN_TOTP_SECRET,
    credentials: ['MEMBER', 'ADMIN'].map(role => ({ email: env[`BC_ADMIN_SMOKE_${role}_EMAIL`], password: env[`BC_ADMIN_SMOKE_${role}_PASSWORD`] })) });
}
export function guardedFetch(url, transport = fetch) {
  assert.equal(url, `https://${PROJECT}.supabase.co`);
  return async (input, init = {}) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(target.origin, url);
    assert.ok(['/auth/v1/', '/rest/v1/', '/functions/v1/'].some(p => target.pathname.startsWith(p)));
    return transport(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  };
}
export function totp(secret, now = Date.now()) {
  assert.match(secret, /^[A-Z2-7]+=*$/i);
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=+$/, '')) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest(); const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function mask(value) {
  if (process.env.GITHUB_ACTIONS === 'true' && value)
    console.log(`::add-mask::${String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
}
function checked(result) {
  if (result.error) throw new Error('Provider operation failed'); // never propagate provider details
  return result.data;
}
export function assertDenied(data) {
  assert.equal(typeof data.error, 'string');
  // Denials must be error envelopes only, not a private payload plus an error.
  assert.ok(Object.keys(data).every(key => ['error', 'code'].includes(key)));
}
export async function runSmoke(config, { factory = createClient, transport = fetch, conceal = mask } = {}) {
  validateConfig(config); // MUST precede client construction, network and mutations
  const c = structuredClone(config); const evidence = []; const cleanup = [];
  let phase = 'password-login'; let failed = false; let attemptedNote = false;
  let memberId; let adminId; const requestId = randomUUID();
  const guarded = guardedFetch(c.url, transport);
  for (const value of [c.key, c.totpSecret, ...c.credentials.flatMap(x => [x.email, x.password])]) conceal(value);
  const client = () => factory(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: guarded } });
  const member = client(); const admin = client();
  async function edge(token, body, statuses = [200]) {
    const response = await guarded(`${c.url}/functions/v1/admin-dashboard`, { method: 'POST',
      headers: { apikey: c.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(statuses.includes(response.status)); assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json(); if (response.status !== 200) assertDenied(data); return data;
  }
  const read = (section, extra = {}) => ({ operation: 'read', version: 2, section, page: 0, ...extra });
  const detail = part => read('support_detail', { id: c.supportId, part });
  try {
    const sessions = []; const users = [];
    for (const [i, sdk] of [member, admin].entries()) {
      const data = checked(await sdk.auth.signInWithPassword(c.credentials[i]));
      conceal(data.session?.access_token); conceal(data.session?.refresh_token);
      const user = checked(await sdk.auth.getUser()).user;
      assert.equal(user.email.toLowerCase(), c.credentials[i].email.toLowerCase());
      assert.equal(user.app_metadata?.staging_admin_smoke_run, c.run);
      assert.equal(data.session.user.id, user.id);
      users.push(user); sessions.push(data.session);
    }
    memberId = users[0].id; adminId = users[1].id; assert.notEqual(memberId, adminId);
    assert.equal(checked(await member.rpc('is_exchange_admin')), false);
    assert.equal(checked(await admin.rpc('is_exchange_admin')), true);
    phase = 'ordinary-denial'; await edge(sessions[0].access_token, read('overview'), [403]); evidence.push(phase);
    phase = 'aal1-denial';
    assert.equal(checked(await admin.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel, 'aal1');
    assert.equal((await edge(sessions[1].access_token, read('overview'), [403])).code, 'mfa_required'); evidence.push(phase);
    phase = 'real-totp-verification';
    const factors = checked(await admin.auth.mfa.listFactors()).totp.filter(f => f.status === 'verified');
    assert.equal(factors.length, 1);
    const code = totp(c.totpSecret); conceal(code);
    const verified = checked(await admin.auth.mfa.challengeAndVerify({ factorId: factors[0].id, code }));
    conceal(verified.access_token); conceal(verified.refresh_token);
    assert.equal(checked(await admin.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel, 'aal2');
    const session = checked(await admin.auth.getSession()).session;
    conceal(session.access_token); conceal(session.refresh_token);
    assert.equal(session.user.id, adminId); assert.equal(checked(await admin.auth.getUser()).user.id, adminId);
    assert.equal(session.access_token, verified.access_token);
    const token = session.access_token; evidence.push(phase);
    phase = 'authorized-reads';
    const overview = await edge(token, read('overview'));
    assert.ok(overview.summary && typeof overview.summary === 'object');
    const list = await edge(token, read('support', { query: c.supportId, filters: { status: 'actionable' } }));
    assert.ok(list.rows.some(row => row.id === c.supportId));
    const before = await edge(token, detail('history'));
    assert.equal(before.request.id, c.supportId); assert.equal(before.request.case_id, c.caseId);
    assert.equal(before.request.requested_by, memberId);
    assert.equal(before.request.note, `Owned staging admin smoke ${c.run}`);
    const eventsBefore = await edge(token, detail('events')); evidence.push(phase);
    phase = 'note-replay-conflict';
    const envelope = { operation: 'note', id: c.supportId, request_id: requestId, reason: `Owned staging integration note ${c.run}` };
    attemptedNote = true; // includes unknown delivery: connector can inspect exact key
    const first = await edge(token, envelope); const replay = await edge(token, envelope);
    assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(first.audit_id, replay.audit_id);
    await edge(token, { ...envelope, reason: `Different owned note ${c.run}` }, [409]);
    const after = await edge(token, detail('history'));
    assert.equal(after.total, before.total + 1); assert.equal(after.request.revision, before.request.revision);
    assert.equal(after.request.status, before.request.status); assert.deepEqual(after.exchange, before.exchange);
    const eventsAfter = await edge(token, detail('events'));
    assert.equal(eventsAfter.total, eventsBefore.total); assert.deepEqual(eventsAfter.rows, eventsBefore.rows);
    evidence.push(phase, 'unchanged-visible-case-and-event-page');
    phase = 'signout-revoked-denial'; checked(await admin.auth.signOut({ scope: 'local' }));
    await edge(token, read('overview'), [401, 403]); evidence.push(phase);
  } catch { failed = true; }
  finally {
    for (const sdk of [member, admin]) {
      try { checked(await sdk.auth.signOut({ scope: 'local' })); cleanup.push('local-test-session-signed-out'); }
      catch { failed = true; cleanup.push('session-cleanup-failed'); }
    }
  }
  return { passed: !failed, project: PROJECT, head: c.sha, run: c.run, phase, evidence, cleanup,
    retainedDisposableAudit: attemptedNote, connectorReview: { supportId: c.supportId, caseId: c.caseId,
      memberId, adminId, requestId: attemptedNote ? requestId : null },
    realMfa: evidence.includes('real-totp-verification'), ui: 'not-run; production-hardcoded frontend excluded' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configFromEnv(process.env);
    const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    assertCheckout(config.sha, actualHead); // before clients or network, including local runs
    const report = await runSmoke(config);
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/hosted-admin-smoke.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); if (!report.passed) process.exitCode = 1;
  } catch { console.error('Admin smoke configuration/report failure; provider details withheld.'); process.exitCode = 1; }
}
