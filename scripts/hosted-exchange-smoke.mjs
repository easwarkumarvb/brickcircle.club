#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const STAGING_CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';
const DEFAULT_REPORT = 'artifacts/hosted-exchange-smoke.json';
const REALTIME_TIMEOUT_MS = 20_000;
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com'
]);
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function projectRefFromUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('Hosted staging URL must use HTTPS');
  const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(url.hostname);
  if (!match) throw new Error('Hosted staging URL must be a direct *.supabase.co project URL');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Hosted staging URL must not include a path, query, or fragment');
  return match[1].toLowerCase();
}

export function validateDispatcherSelection(prNumber, sha) {
  const normalizedPr = String(prNumber || '').trim();
  const normalizedSha = String(sha || '').trim();
  if (!/^[1-9][0-9]*$/.test(normalizedPr)) throw new Error('Hosted smoke PR number must be a positive integer');
  if (!/^[0-9a-f]{40}$/.test(normalizedSha)) throw new Error('Hosted smoke head SHA must be a full lowercase commit SHA');
  return { pullRequestNumber: Number(normalizedPr), headSha: normalizedSha };
}

export function validateStagingEmails(users, allowedDomain, approvedSinkDomain = '') {
  const approved = String(allowedDomain || '').trim().toLowerCase().replace(/^@/, '');
  const sink = String(approvedSinkDomain || '').trim().toLowerCase().replace(/^@/, '');
  if (!approved) throw new Error('Missing required environment variable BC_STAGING_ALLOWED_EMAIL_DOMAIN');
  if (PUBLIC_EMAIL_DOMAINS.has(approved)) throw new Error('Public email domains are forbidden for hosted staging');
  if (approved === 'brickcircle.club' || approved.endsWith('.brickcircle.club')) {
    throw new Error('Production-like BrickCircle email identities are forbidden for hosted staging');
  }
  if (approved !== 'example.test' && (!sink || approved !== sink)) {
    throw new Error('Allowed email domain must be example.test or the explicitly approved staging sink domain');
  }

  const normalized = users.map(user => {
    const email = String(user.email || '').trim().toLowerCase();
    const match = EMAIL_PATTERN.exec(email);
    if (!match) throw new Error(`Malformed staging email for user ${user.label}`);
    const domain = match[1].toLowerCase();
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) throw new Error('Public email domains are forbidden for hosted staging');
    if (domain === 'brickcircle.club' || domain.endsWith('.brickcircle.club')) {
      throw new Error('Production-like BrickCircle email identities are forbidden for hosted staging');
    }
    if (domain !== approved) throw new Error('Every staging user email must match the approved domain');
    return { ...user, email };
  });
  if (new Set(normalized.map(user => user.email)).size !== normalized.length) {
    throw new Error('The hosted smoke test requires three distinct staging user emails');
  }
  return normalized;
}

export function idempotencyKey(runId, intent) {
  if (!runId || !intent) throw new Error('Idempotency keys require a run and intended action');
  return `${runId}:${intent}`;
}

export function redactIdentifier(value) {
  return `id:${createHash('sha256').update(String(value)).digest('hex').slice(0, 12)}`;
}

function sanitizeDiagnostic(value) {
  return String(value || 'Hosted staging smoke failed')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[redacted-credential]');
}

export function serializeRedactedReport(report) {
  const serialized = JSON.stringify(report, null, 2);
  const forbiddenKey = /"[^"\n]*(?:email|password|token|secret|api[_-]?key|supabase[_-]?url|auth)[^"\n]*"\s*:/i;
  const forbiddenValue = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|sb_(?:secret|publishable)_)/i;
  if (forbiddenKey.test(serialized) || forbiddenValue.test(serialized)) {
    throw new Error('Refusing to serialize a report containing credentials, email identities, or URLs');
  }
  return `${serialized}\n`;
}

export function loadHostedSmokeConfig(env = process.env) {
  const confirmation = required(env, 'BC_HOSTED_SMOKE_CONFIRMATION');
  if (confirmation !== STAGING_CONFIRMATION) {
    throw new Error(`BC_HOSTED_SMOKE_CONFIRMATION must equal ${STAGING_CONFIRMATION}`);
  }
  const dispatcher = validateDispatcherSelection(
    required(env, 'BC_HOSTED_SMOKE_PULL_REQUEST_NUMBER'),
    required(env, 'BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA')
  );

  const url = required(env, 'BC_STAGING_SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = required(env, 'BC_STAGING_SUPABASE_PUBLISHABLE_KEY');
  const secretKey = required(env, 'BC_STAGING_SUPABASE_SECRET_KEY');
  const notificationMode = required(env, 'BC_STAGING_NOTIFICATION_MODE');
  if (notificationMode !== 'outbox-only') {
    throw new Error('BC_STAGING_NOTIFICATION_MODE must equal outbox-only');
  }
  const expectedProjectRef = required(env, 'BC_STAGING_SUPABASE_PROJECT_REF').toLowerCase();
  const productionProjectRef = required(env, 'BC_PRODUCTION_SUPABASE_PROJECT_REF').toLowerCase();
  const actualProjectRef = projectRefFromUrl(url);

  if (actualProjectRef !== expectedProjectRef) {
    throw new Error(`Staging URL project ref ${actualProjectRef} does not match the approved staging ref`);
  }
  if (actualProjectRef === productionProjectRef) {
    throw new Error('Refusing to run: the staging project ref equals the production project ref');
  }
  if (publishableKey === secretKey) throw new Error('Publishable and server secret keys must be different');

  const users = validateStagingEmails(['A', 'B', 'C'].map(label => ({
    label,
    email: required(env, `BC_STAGING_USER_${label}_EMAIL`),
    password: required(env, `BC_STAGING_USER_${label}_PASSWORD`)
  })), required(env, 'BC_STAGING_ALLOWED_EMAIL_DOMAIN'), env.BC_STAGING_APPROVED_SINK_DOMAIN);

  const setA = required(env, 'BC_STAGING_SET_A');
  const setB = required(env, 'BC_STAGING_SET_B');
  if (setA.toLowerCase() === setB.toLowerCase()) throw new Error('BC_STAGING_SET_A and BC_STAGING_SET_B must be different');

  return {
    url,
    publishableKey,
    secretKey,
    notificationMode,
    expectedProjectRef,
    productionProjectRef,
    users,
    pullRequestNumber: dispatcher.pullRequestNumber,
    headSha: dispatcher.headSha,
    setA,
    setB,
    reportPath: String(env.BC_HOSTED_SMOKE_REPORT || DEFAULT_REPORT),
    runId: `hosted-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  };
}

function browserClient(config) {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } }
  });
}

function serverClient(config) {
  return createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

async function signIn(config, credentials) {
  const client = browserClient(config);
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password
  });
  if (error) throw new Error(`Staging user ${credentials.label} could not sign in: ${error.message}`);
  assert.ok(data.user?.id, `Staging user ${credentials.label} did not return a user id`);
  const verified = await client.auth.getUser();
  if (verified.error || verified.data.user?.id !== data.user.id) {
    throw new Error(`Staging user ${credentials.label} session could not be verified`);
  }
  return { label: credentials.label, client, id: data.user.id };
}

async function ownProfile(session) {
  const { data, error } = await session.client.from('profiles').select('*').eq('id', session.id).single();
  if (error) throw new Error(`Could not read staging profile ${session.label}: ${error.message}`);
  assert.ok(data.adult_confirmed_at, `Staging profile ${session.label} must already have adult confirmation`);
  assert.ok(data.country && data.city, `Staging profile ${session.label} must already have country and city`);
  return data;
}

async function assertCatalogSets(session, setNumbers) {
  const { data, error } = await session.client.from('lego_sets').select('set_number,name').in('set_number', setNumbers);
  if (error) throw new Error(`Could not read staging catalogue: ${error.message}`);
  const found = new Set((data || []).map(row => row.set_number));
  for (const setNumber of setNumbers) assert.ok(found.has(setNumber), `Staging catalogue is missing ${setNumber}`);
}

async function insertOwnedItem(session, setNumber, runId) {
  const id = randomUUID();
  const { data, error } = await session.client.from('collection_items').insert({
    id,
    user_id: session.id,
    set_number: setNumber,
    condition: 'Excellent',
    completeness: 100,
    original_box: false,
    notes: `[${runId}] hosted Supabase release-gate fixture`,
    owner_photo_path: `hosted-smoke/${runId}/${session.label.toLowerCase()}.jpg`,
    available_for_exchange: false
  }).select('*').single();
  if (error) throw new Error(`Could not create staging item ${session.label}: ${error.message}`);
  return data;
}

async function ensureWishlist(session, setNumber) {
  const existing = await session.client.from('wishlists').select('id').eq('user_id', session.id).eq('set_number', setNumber).limit(1);
  if (existing.error) throw new Error(`Could not inspect wishlist ${session.label}: ${existing.error.message}`);
  if (existing.data?.length) return { id: existing.data[0].id, created: false };
  const inserted = await session.client.from('wishlists').insert({ user_id: session.id, set_number: setNumber, priority: 3 }).select('id').single();
  if (inserted.error) throw new Error(`Could not seed wishlist ${session.label}: ${inserted.error.message}`);
  return { id: inserted.data.id, created: true };
}

async function setAvailable(session, itemId) {
  const result = await session.client.rpc('set_exchange_item_availability', { p_item_id: itemId, p_available: true });
  if (result.error) throw new Error(`Could not make staging item ${session.label} available: ${result.error.message}`);
  assert.equal(result.data?.status, 'AVAILABLE');
}

async function waitFor(predicate, description, timeoutMs = REALTIME_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function subscribeToNotifications(session, filterUserId, runId, observed) {
  const channel = session.client
    .channel(`bc-${runId}-${session.label}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${filterUserId}`
    }, payload => observed.push(payload.new));

  await new Promise((resolveSubscription, rejectSubscription) => {
    const timeout = setTimeout(() => rejectSubscription(new Error('Realtime subscription did not become ready')), REALTIME_TIMEOUT_MS);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolveSubscription();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        rejectSubscription(new Error(`Realtime subscription failed with ${status}`));
      }
    });
  });
  return channel;
}

function rpcData(result, description) {
  if (result.error) throw new Error(`${description}: ${result.error.message}`);
  assert.equal(result.data?.ok, true, `${description} did not return ok=true`);
  return result.data;
}

async function countRows(client, table, filters = []) {
  let query = client.from(table).select('id', { count: 'exact', head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count || 0;
}

async function reciprocalPairAppears(session, offeredItem, requestedItem) {
  const result = await session.client.rpc('find_matches', { p_user: session.id });
  if (result.error) throw new Error(`Could not inspect reciprocal matches for ${session.label}: ${result.error.message}`);
  return result.data.some(row => row.offered_item === offeredItem && row.requested_item === requestedItem);
}

async function readCase(session, caseId) {
  const result = await session.client.from('exchange_cases').select('*').eq('id', caseId).single();
  if (result.error) throw new Error(`Could not reload exchange case: ${result.error.message}`);
  return result.data;
}

async function readItemStatus(session, itemId) {
  const result = await session.client.rpc('collection_item_exchange_status', { p_item_id: itemId });
  if (result.error) throw new Error(`Could not inspect item status: ${result.error.message}`);
  return result.data;
}

async function transitionCase(config, session, exchangeCase, action, payload, intent) {
  const args = {
    p_case_id: exchangeCase.id,
    p_expected_version: exchangeCase.state_version,
    p_action: action,
    p_idempotency_key: idempotencyKey(config.runId, intent),
    p_payload: payload || {}
  };
  const data = rpcData(await session.client.rpc('exchange_case_transition', args), `${session.label} ${action}`);
  return { case: data.case, data, args };
}

async function runHostedSmoke(config) {
  const admin = serverClient(config);
  const [a, b, c] = await Promise.all(config.users.map(credentials => signIn(config, credentials)));
  assert.equal(new Set([a.id, b.id, c.id]).size, 3, 'Authenticated staging sessions must represent three different users');

  const observedRealtime = [];
  const unauthorizedRealtime = [];
  let realtimeChannel;
  let unauthorizedRealtimeChannel;
  let switchedClient;
  let switchedRealtimeChannel;
  const report = {
    ok: false,
    runId: config.runId,
    testedPullRequestNumber: config.pullRequestNumber,
    testedHeadSha: config.headSha,
    projectRef: config.expectedProjectRef,
    startedAt: new Date().toISOString(),
    checks: [],
    retainedEvidencePolicy: 'Canonical staging evidence is retained; replace the isolated staging project between release candidates.',
    retainedEvidence: {}
  };
  const passed = detail => report.checks.push({ status: 'passed', detail });

  try {
    const [profileA, profileB] = await Promise.all([ownProfile(a), ownProfile(b)]);
    assert.equal(String(profileA.country).trim().toLowerCase(), String(profileB.country).trim().toLowerCase(), 'Staging participants must use the same country');
    assert.equal(String(profileA.city).replace(/[^a-z0-9]/gi, '').toLowerCase(), String(profileB.city).replace(/[^a-z0-9]/gi, '').toLowerCase(), 'Staging participants must use the same normalized city');
    await ownProfile(c);
    await assertCatalogSets(a, [config.setA, config.setB]);
    passed('three independent Auth sessions and eligible same-city participant profiles');

    const [itemA, itemB] = await Promise.all([
      insertOwnedItem(a, config.setA, config.runId),
      insertOwnedItem(b, config.setB, config.runId)
    ]);
    await Promise.all([ensureWishlist(a, config.setB), ensureWishlist(b, config.setA)]);
    await Promise.all([setAvailable(a, itemA.id), setAvailable(b, itemB.id)]);

    const [matchesA, matchesB] = await Promise.all([
      a.client.rpc('find_matches', { p_user: a.id }),
      b.client.rpc('find_matches', { p_user: b.id })
    ]);
    if (matchesA.error || matchesB.error) throw new Error(`Hosted reciprocal matching failed: ${matchesA.error?.message || matchesB.error?.message}`);
    assert.ok(matchesA.data.some(row => row.offered_item === itemA.id && row.requested_item === itemB.id));
    assert.ok(matchesB.data.some(row => row.offered_item === itemB.id && row.requested_item === itemA.id));
    passed('PostgREST/RPC reciprocal match in both directions');

    realtimeChannel = await subscribeToNotifications(b, b.id, config.runId, observedRealtime);
    unauthorizedRealtimeChannel = await subscribeToNotifications(c, b.id, `${config.runId}-unauthorized`, unauthorizedRealtime);

    const proposalKey = idempotencyKey(config.runId, 'happy-proposal');
    const proposalArgs = {
      p_offered_item_id: itemA.id,
      p_requested_item_id: itemB.id,
      p_duration_days: 30,
      p_message: `[${config.runId}] hosted release-gate proposal`,
      p_idempotency_key: proposalKey
    };
    const created = rpcData(await a.client.rpc('create_exchange_case', proposalArgs), 'Proposal creation');
    let currentCase = created.case;
    assert.equal(currentCase.state, 'PROPOSED');
    const caseId = currentCase.id;
    const proposalRetry = rpcData(await a.client.rpc('create_exchange_case', proposalArgs), 'Proposal retry');
    assert.equal(proposalRetry.idempotent, true);
    assert.equal(proposalRetry.case.id, caseId);
    assert.equal(await countRows(a.client, 'exchange_case_events', [['case_id', caseId], ['event_type', 'proposal_created']]), 1);
    assert.equal(await countRows(b.client, 'notifications', [['exchange_case_id', caseId], ['kind', 'exchange_proposed']]), 1);
    passed('proposal committed/lost-response retry is idempotent');

    await waitFor(() => observedRealtime.find(row => row.exchange_case_id === caseId && row.kind === 'exchange_proposed'), 'proposal Realtime notification');
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
    assert.equal(unauthorizedRealtime.filter(row => row.exchange_case_id === caseId).length, 0, 'Third user must not receive another user\'s Realtime notification');
    passed('recipient-scoped Realtime notification delivery');

    const unauthorizedCase = await c.client.from('exchange_cases').select('id').eq('id', caseId);
    assert.ifError(unauthorizedCase.error);
    assert.deepEqual(unauthorizedCase.data, []);
    const unauthorizedTransition = await c.client.rpc('exchange_case_transition', {
      p_case_id: caseId,
      p_expected_version: currentCase.state_version,
      p_action: 'accept',
      p_idempotency_key: idempotencyKey(config.runId, 'unauthorized-transition'),
      p_payload: {}
    });
    assert.ok(unauthorizedTransition.error, 'Third user must not transition another pair\'s case');
    const unauthorizedEvents = await c.client.from('exchange_case_events').select('id').eq('case_id', caseId);
    const unauthorizedMessages = await c.client.from('exchange_case_messages').select('id').eq('case_id', caseId);
    const unauthorizedNotifications = await c.client.from('notifications').select('id').eq('exchange_case_id', caseId);
    assert.ifError(unauthorizedEvents.error);
    assert.ifError(unauthorizedMessages.error);
    assert.ifError(unauthorizedNotifications.error);
    assert.deepEqual(unauthorizedEvents.data, []);
    assert.deepEqual(unauthorizedMessages.data, []);
    assert.deepEqual(unauthorizedNotifications.data, []);
    const unauthorizedMessageWrite = await c.client.from('exchange_case_messages').insert({
      conversation_id: created.conversation_id,
      case_id: caseId,
      sender_id: c.id,
      recipient_id: b.id,
      body: 'unauthorized hosted smoke write',
      idempotency_key: idempotencyKey(config.runId, 'unauthorized-message')
    });
    assert.ok(unauthorizedMessageWrite.error, 'Third user must not write to the canonical conversation table');
    passed('third-user RLS and RPC authorization boundaries');

    const messageKey = idempotencyKey(config.runId, 'happy-message');
    const messageArgs = { p_case_id: caseId, p_body: `[${config.runId}] hello from hosted staging`, p_idempotency_key: messageKey };
    const message = rpcData(await a.client.rpc('send_exchange_case_message', messageArgs), 'Case message');
    const messageRetry = rpcData(await a.client.rpc('send_exchange_case_message', messageArgs), 'Case message retry');
    assert.equal(messageRetry.idempotent, true);
    assert.equal(messageRetry.message.id, message.message.id);
    assert.equal(await countRows(a.client, 'exchange_case_messages', [['case_id', caseId], ['sender_id', a.id]]), 1);
    assert.equal(await countRows(b.client, 'notifications', [['exchange_case_id', caseId], ['kind', 'exchange_message']]), 1);
    await waitFor(() => observedRealtime.find(row => row.exchange_case_id === caseId && row.kind === 'exchange_message'), 'message Realtime notification');
    passed('persistent case conversation and idempotent message retry');

    async function transition(session, action, payload = {}, keySuffix = action) {
      const key = idempotencyKey(config.runId, `happy-${keySuffix}`);
      const args = {
        p_case_id: caseId,
        p_expected_version: currentCase.state_version,
        p_action: action,
        p_idempotency_key: key,
        p_payload: payload
      };
      const data = rpcData(await session.client.rpc('exchange_case_transition', args), `${session.label} ${action}`);
      currentCase = data.case;
      return { data, args };
    }

    const beforeCounterVersion = currentCase.state_version;
    const countered = await transition(b, 'counter', {
      duration_days: 60,
      message: `[${config.runId}] sixty-day counterproposal`
    });
    assert.equal(countered.data.case.id, caseId);
    assert.equal(currentCase.state_version, beforeCounterVersion + 1);
    assert.equal(currentCase.duration_days, 60);
    const counterRetry = rpcData(await b.client.rpc('exchange_case_transition', countered.args), 'Counter retry');
    assert.equal(counterRetry.idempotent, true);
    assert.equal(counterRetry.case.id, caseId);
    assert.equal(counterRetry.case.state_version, currentCase.state_version);
    assert.equal(await countRows(a.client, 'exchange_case_events', [['case_id', caseId], ['event_type', 'counter']]), 1);
    const counterNotificationCount = await countRows(a.client, 'notifications', [['exchange_case_id', caseId], ['kind', 'exchange_countered']]);
    assert.equal(counterNotificationCount, 1);
    passed('counterproposal preserves the durable case and is idempotent');

    const accepted = await transition(a, 'accept');
    const acceptedRetry = rpcData(await a.client.rpc('exchange_case_transition', accepted.args), 'Accept retry');
    assert.equal(acceptedRetry.idempotent, true);
    assert.equal(acceptedRetry.case.id, caseId);
    assert.equal(await countRows(a.client, 'exchange_case_events', [['case_id', caseId], ['event_type', 'accept']]), 1);
    assert.equal(await countRows(a.client, 'notifications', [['exchange_case_id', caseId], ['kind', 'exchange_accepted']]), 1);
    assert.equal(await countRows(admin, 'exchange_case_item_locks', [['case_id', caseId]]), 2);
    assert.equal(await reciprocalPairAppears(a, itemA.id, itemB.id), false);
    assert.equal(await reciprocalPairAppears(b, itemB.id, itemA.id), false);
    passed('transition committed/lost-response retry is idempotent');

    const staleVersion = currentCase.state_version - 1;
    const staleBefore = {
      state: currentCase.state,
      version: currentCase.state_version,
      events: await countRows(admin, 'exchange_case_events', [['case_id', caseId]]),
      notifications: await countRows(admin, 'notifications', [['exchange_case_id', caseId]]),
      locks: await countRows(admin, 'exchange_case_item_locks', [['case_id', caseId]])
    };
    const staleAttempt = await a.client.rpc('exchange_case_transition', {
      p_case_id: caseId,
      p_expected_version: staleVersion,
      p_action: 'propose_meetup',
      p_idempotency_key: idempotencyKey(config.runId, 'stale-meetup'),
      p_payload: { venue_name: 'Stale venue', venue_area: 'QA', meetup_at: new Date(Date.now() + 86_400_000).toISOString() }
    });
    assert.ok(staleAttempt.error, 'A stale state version must be rejected');
    currentCase = await readCase(a, caseId);
    assert.equal(currentCase.state, staleBefore.state);
    assert.equal(currentCase.state_version, staleBefore.version);
    assert.equal(await countRows(admin, 'exchange_case_events', [['case_id', caseId]]), staleBefore.events);
    assert.equal(await countRows(admin, 'notifications', [['exchange_case_id', caseId]]), staleBefore.notifications);
    assert.equal(await countRows(admin, 'exchange_case_item_locks', [['case_id', caseId]]), staleBefore.locks);
    passed('stale transition leaves state, events, notifications and locks unchanged');

    const future = new Date(Date.now() + 86_400_000).toISOString();
    await transition(a, 'propose_meetup', { venue_name: 'Staging public library', venue_area: 'QA', meetup_at: future });
    await transition(b, 'accept_meetup');
    await transition(a, 'safety_ack', {}, 'safety-a');
    await transition(b, 'safety_ack', {}, 'safety-b');
    assert.equal(currentCase.state, 'INSPECTION');
    await transition(a, 'arrive', {}, 'arrive-a');
    const earlyInspection = await a.client.rpc('exchange_case_transition', {
      p_case_id: caseId,
      p_expected_version: currentCase.state_version,
      p_action: 'inspect',
      p_idempotency_key: idempotencyKey(config.runId, 'premature-inspection'),
      p_payload: {}
    });
    assert.ok(earlyInspection.error, 'Inspection must remain blocked until both arrivals');
    await transition(b, 'arrive', {}, 'arrive-b');
    await transition(a, 'inspect', {}, 'inspect-a');
    await transition(b, 'inspect', {}, 'inspect-b');
    assert.equal(currentCase.state, 'HANDOFF_PENDING');
    await transition(a, 'handoff', {}, 'handoff-a');
    assert.equal(currentCase.state, 'HANDOFF_PENDING', 'One handoff confirmation must not activate the exchange');
    assert.equal(currentCase.handoff_at, null);
    await transition(b, 'handoff', {}, 'handoff-b');
    assert.equal(currentCase.state, 'ACTIVE');
    assert.ok(currentCase.handoff_at);
    assert.ok(currentCase.return_due_at);
    const handoffDurationMs = new Date(currentCase.return_due_at).getTime() - new Date(currentCase.handoff_at).getTime();
    assert.ok(Math.abs(handoffDurationMs - (60 * 86_400_000)) <= 2_000, 'Return deadline must be 60 days after mutual handoff');
    passed('two-session meetup, both-arrived inspection, and handoff activation');

    const returnFuture = new Date(Date.now() + 172_800_000).toISOString();
    await transition(a, 'propose_return', { venue_name: 'Staging public library', venue_area: 'QA', meetup_at: returnFuture });
    await transition(b, 'accept_return');
    assert.equal(currentCase.state, 'RETURN_INSPECTION');
    await transition(a, 'return_arrive', {}, 'return-arrive-a');
    const earlyReturnInspection = await a.client.rpc('exchange_case_transition', {
      p_case_id: caseId,
      p_expected_version: currentCase.state_version,
      p_action: 'return_inspect',
      p_idempotency_key: idempotencyKey(config.runId, 'premature-return-inspection'),
      p_payload: {}
    });
    assert.ok(earlyReturnInspection.error, 'Return inspection must remain blocked until both arrivals');
    await transition(b, 'return_arrive', {}, 'return-arrive-b');
    await transition(a, 'return_inspect', {}, 'return-inspect-a');
    await transition(b, 'return_inspect', {}, 'return-inspect-b');
    await transition(a, 'return_confirm', {}, 'return-confirm-a');
    await transition(b, 'return_confirm', {}, 'return-confirm-b');
    assert.equal(currentCase.state, 'COMPLETED');
    passed('two-session return inspection and completion');

    const [conversationA, conversationB, conversationC, messagesA, messagesB, messagesC] = await Promise.all([
      a.client.from('exchange_case_conversations').select('id,archived_at').eq('case_id', caseId).single(),
      b.client.from('exchange_case_conversations').select('id,archived_at').eq('case_id', caseId).single(),
      c.client.from('exchange_case_conversations').select('id,archived_at').eq('case_id', caseId),
      a.client.from('exchange_case_messages').select('id').eq('case_id', caseId),
      b.client.from('exchange_case_messages').select('id').eq('case_id', caseId),
      c.client.from('exchange_case_messages').select('id').eq('case_id', caseId)
    ]);
    assert.ifError(conversationA.error);
    assert.ifError(conversationB.error);
    assert.ok(conversationA.data.archived_at);
    assert.equal(conversationB.data.id, conversationA.data.id);
    assert.ifError(conversationC.error);
    assert.deepEqual(conversationC.data, []);
    assert.ifError(messagesA.error);
    assert.ifError(messagesB.error);
    assert.ifError(messagesC.error);
    assert.ok(messagesA.data.length >= 1);
    assert.equal(messagesB.data.length, messagesA.data.length);
    assert.deepEqual(messagesC.data, []);
    const archivedMessage = await a.client.rpc('send_exchange_case_message', {
      p_case_id: caseId,
      p_body: `[${config.runId}] must not be accepted after archival`,
      p_idempotency_key: idempotencyKey(config.runId, 'archived-message')
    });
    assert.ok(archivedMessage.error, 'Archived conversations must reject new messages');
    passed('completed conversation is archived, participant-readable, third-user-hidden and write-closed');

    const lockCount = await countRows(admin, 'exchange_case_item_locks', [['case_id', caseId]]);
    assert.equal(lockCount, 0, 'Completed case must release its item locks');
    const [finalItemA, finalItemB] = await Promise.all([
      a.client.from('collection_items').select('available_for_exchange,exchange_review_required').eq('id', itemA.id).single(),
      b.client.from('collection_items').select('available_for_exchange,exchange_review_required').eq('id', itemB.id).single()
    ]);
    assert.ifError(finalItemA.error);
    assert.ifError(finalItemB.error);
    for (const row of [finalItemA.data, finalItemB.data]) {
      assert.equal(row.available_for_exchange, false);
      assert.equal(row.exchange_review_required, true);
    }
    passed('completion lock release and owner-review state');

    const reviewCountBefore = Number(profileB.review_count || 0);
    const review = rpcData(await a.client.rpc('submit_exchange_case_review', {
      p_case_id: caseId,
      p_rating: 5,
      p_comment: `[${config.runId}] hosted staging review`
    }), 'Canonical review');
    assert.equal(review.review.case_id, caseId);
    const duplicateReview = await a.client.rpc('submit_exchange_case_review', { p_case_id: caseId, p_rating: 5, p_comment: 'duplicate' });
    assert.ok(duplicateReview.error, 'A participant must not submit two reviews for one case');
    const refreshedB = await ownProfile(b);
    assert.equal(Number(refreshedB.review_count), reviewCountBefore + 1);
    passed('canonical completion-to-review path and rating update');

    for (const [session, item] of [[c, itemA], [c, itemB], [a, itemB], [b, itemA]]) {
      const denied = await session.client.rpc('set_exchange_item_availability', { p_item_id: item.id, p_available: true });
      assert.ok(denied.error, `${session.label} must not re-enable an item they do not own`);
    }
    await Promise.all([setAvailable(a, itemA.id), setAvailable(b, itemB.id)]);
    assert.equal(await readItemStatus(a, itemA.id), 'AVAILABLE');
    assert.equal(await readItemStatus(b, itemB.id), 'AVAILABLE');
    assert.equal(await reciprocalPairAppears(a, itemA.id, itemB.id), true);
    assert.equal(await reciprocalPairAppears(b, itemB.id, itemA.id), true);
    passed('owner review re-enable persists and reciprocal matching returns');

    const cancellationProposalArgs = {
      p_offered_item_id: itemA.id,
      p_requested_item_id: itemB.id,
      p_duration_days: 30,
      p_message: `[${config.runId}] pre-handoff cancellation fixture`,
      p_idempotency_key: idempotencyKey(config.runId, 'cancel-proposal')
    };
    let cancellationCase = rpcData(await a.client.rpc('create_exchange_case', cancellationProposalArgs), 'Cancellation proposal').case;
    cancellationCase = (await transitionCase(config, b, cancellationCase, 'accept', {}, 'cancel-accept')).case;
    assert.equal(cancellationCase.state, 'ACCEPTED');
    const locksBeforeCancellation = await countRows(admin, 'exchange_case_item_locks', [['case_id', cancellationCase.id]]);
    assert.equal(locksBeforeCancellation, 2);
    assert.equal(await reciprocalPairAppears(a, itemA.id, itemB.id), false);
    assert.equal(await reciprocalPairAppears(b, itemB.id, itemA.id), false);

    const cancellationVersion = cancellationCase.state_version;
    const cancelled = await transitionCase(config, a, cancellationCase, 'cancel', { reason: `[${config.runId}] pre-handoff release` }, 'cancel-action');
    cancellationCase = cancelled.case;
    assert.equal(cancellationCase.state, 'CANCELLED');
    const cancelledRetry = rpcData(await a.client.rpc('exchange_case_transition', cancelled.args), 'Cancellation retry');
    assert.equal(cancelledRetry.idempotent, true);
    assert.equal(cancelledRetry.case.state_version, cancellationVersion + 1);
    assert.equal(await countRows(admin, 'exchange_case_events', [['case_id', cancellationCase.id], ['event_type', 'cancel']]), 1);
    const locksAfterCancellation = await countRows(admin, 'exchange_case_item_locks', [['case_id', cancellationCase.id]]);
    assert.equal(locksAfterCancellation, 0);
    assert.equal(await readItemStatus(a, itemA.id), 'AVAILABLE');
    assert.equal(await readItemStatus(b, itemB.id), 'AVAILABLE');
    assert.equal(await reciprocalPairAppears(a, itemA.id, itemB.id), true);
    assert.equal(await reciprocalPairAppears(b, itemB.id, itemA.id), true);
    const cancellationNotifications = await admin.from('notifications')
      .select('id,user_id,kind')
      .eq('exchange_case_id', cancellationCase.id)
      .eq('kind', 'exchange_cancelled');
    assert.ifError(cancellationNotifications.error);
    assert.equal(cancellationNotifications.data.filter(row => row.user_id === a.id).length, 1, 'Cancelling participant must receive one durable release confirmation');
    assert.equal(cancellationNotifications.data.filter(row => row.user_id === b.id).length, 1, 'Other participant must receive one cancellation notification');
    assert.equal(cancellationNotifications.data.length, 2, 'Cancellation retry must not duplicate participant notifications');
    passed('pre-handoff cancellation atomically releases both sets, restores matching and retries idempotently');

    switchedClient = browserClient(config);
    const switchedA = await switchedClient.auth.signInWithPassword({
      email: config.users[0].email,
      password: config.users[0].password
    });
    if (switchedA.error) throw new Error(`Reusable session could not sign in as A: ${switchedA.error.message}`);
    const switchedAId = switchedA.data.user.id;
    const switchedANotifications = await switchedClient.from('notifications').select('id').eq('user_id', switchedAId);
    assert.ifError(switchedANotifications.error);
    const staleRealtime = [];
    const switchedSession = { label: 'switch-A', client: switchedClient, id: switchedAId };
    switchedRealtimeChannel = await subscribeToNotifications(switchedSession, switchedAId, `${config.runId}-switch`, staleRealtime);
    await switchedClient.removeChannel(switchedRealtimeChannel);
    switchedRealtimeChannel = undefined;
    assert.equal(switchedClient.getChannels().length, 0);
    assert.ifError((await switchedClient.auth.signOut({ scope: 'local' })).error);
    assert.equal((await switchedClient.auth.getSession()).data.session, null);
    const switchedC = await switchedClient.auth.signInWithPassword({
      email: config.users[2].email,
      password: config.users[2].password
    });
    if (switchedC.error) throw new Error(`Reusable session could not sign in as C: ${switchedC.error.message}`);

    const recoveryProposalArgs = {
      p_offered_item_id: itemB.id,
      p_requested_item_id: itemA.id,
      p_duration_days: 30,
      p_message: `[${config.runId}] post-handoff recovery fixture`,
      p_idempotency_key: idempotencyKey(config.runId, 'recovery-proposal')
    };
    let recoveryCase = rpcData(await b.client.rpc('create_exchange_case', recoveryProposalArgs), 'Recovery proposal').case;
    await new Promise(resolveWait => setTimeout(resolveWait, 750));
    assert.deepEqual(staleRealtime, [], 'Removed A Realtime channel must not deliver after switching to C');
    for (const [table, selection] of [
      ['exchange_cases', 'id'],
      ['exchange_case_messages', 'id'],
      ['exchange_case_events', 'id'],
      ['notifications', 'id']
    ]) {
      let query = switchedClient.from(table).select(selection);
      query = table === 'exchange_cases'
        ? query.eq('id', recoveryCase.id)
        : query.eq('exchange_case_id', recoveryCase.id);
      if (table === 'exchange_case_messages' || table === 'exchange_case_events') query = switchedClient.from(table).select(selection).eq('case_id', recoveryCase.id);
      const hidden = await query;
      assert.ifError(hidden.error);
      assert.deepEqual(hidden.data, [], `Switched User C must not read A's ${table}`);
    }
    passed('account switch clears local session and Realtime state before third-user RLS checks');

    recoveryCase = (await transitionCase(config, a, recoveryCase, 'accept', {}, 'recovery-accept')).case;
    recoveryCase = (await transitionCase(config, b, recoveryCase, 'propose_meetup', {
      venue_name: 'Staging public library', venue_area: 'QA', meetup_at: new Date(Date.now() + 86_400_000).toISOString()
    }, 'recovery-meetup')).case;
    recoveryCase = (await transitionCase(config, a, recoveryCase, 'accept_meetup', {}, 'recovery-accept-meetup')).case;
    recoveryCase = (await transitionCase(config, a, recoveryCase, 'safety_ack', {}, 'recovery-safety-a')).case;
    recoveryCase = (await transitionCase(config, b, recoveryCase, 'safety_ack', {}, 'recovery-safety-b')).case;
    recoveryCase = (await transitionCase(config, a, recoveryCase, 'arrive', {}, 'recovery-arrive-a')).case;
    recoveryCase = (await transitionCase(config, b, recoveryCase, 'arrive', {}, 'recovery-arrive-b')).case;
    recoveryCase = (await transitionCase(config, a, recoveryCase, 'inspect', {}, 'recovery-inspect-a')).case;
    recoveryCase = (await transitionCase(config, b, recoveryCase, 'inspect', {}, 'recovery-inspect-b')).case;
    recoveryCase = (await transitionCase(config, a, recoveryCase, 'handoff', {}, 'recovery-handoff-a')).case;
    recoveryCase = (await transitionCase(config, b, recoveryCase, 'handoff', {}, 'recovery-handoff-b')).case;
    assert.equal(recoveryCase.state, 'ACTIVE');
    const activeVersion = recoveryCase.state_version;
    const activeLocks = await countRows(admin, 'exchange_case_item_locks', [['case_id', recoveryCase.id]]);
    const postHandoffCancel = await b.client.rpc('exchange_case_transition', {
      p_case_id: recoveryCase.id,
      p_expected_version: activeVersion,
      p_action: 'cancel',
      p_idempotency_key: idempotencyKey(config.runId, 'recovery-invalid-cancel'),
      p_payload: { reason: `[${config.runId}] must use early return` }
    });
    assert.ok(postHandoffCancel.error, 'Ordinary cancellation must be rejected after mutual physical handoff');
    recoveryCase = await readCase(a, recoveryCase.id);
    assert.equal(recoveryCase.state, 'ACTIVE');
    assert.equal(recoveryCase.state_version, activeVersion);
    assert.equal(await countRows(admin, 'exchange_case_item_locks', [['case_id', recoveryCase.id]]), activeLocks);
    recoveryCase = (await transitionCase(config, b, recoveryCase, 'early_return', {}, 'recovery-early-return')).case;
    assert.equal(recoveryCase.state, 'EARLY_RETURN');
    assert.equal(await countRows(admin, 'exchange_case_item_locks', [['case_id', recoveryCase.id]]), 2);
    passed('post-handoff exit rejects cancellation and preserves locks through early return');

    const evidenceCaseIds = [caseId, cancellationCase.id, recoveryCase.id];
    const notifications = await admin.from('notifications')
      .select('id,user_id,kind,exchange_case_id,dedupe_key')
      .in('exchange_case_id', evidenceCaseIds);
    if (notifications.error) throw new Error(`Could not inspect notification evidence: ${notifications.error.message}`);
    const kinds = new Set(notifications.data.map(row => row.kind));
    for (const kind of ['exchange_proposed', 'exchange_message', 'exchange_accepted', 'exchange_completed', 'review_received']) {
      assert.ok(kinds.has(kind), `Missing hosted notification ${kind}`);
    }
    assert.equal(new Set(notifications.data.map(row => row.dedupe_key).filter(Boolean)).size, notifications.data.filter(row => row.dedupe_key).length, 'Notification dedupe keys must be unique');

    const queuedKinds = new Set([
      'exchange_proposed', 'exchange_countered', 'exchange_accepted', 'exchange_declined', 'exchange_withdrawn',
      'exchange_expired', 'exchange_cancelled', 'meetup_proposed', 'meetup_accepted', 'exchange_activated',
      'early_return_requested', 'return_meetup_proposed', 'return_meetup_accepted', 'return_due_7d',
      'return_due_1d', 'return_overdue', 'exchange_disputed', 'exchange_resolved', 'exchange_completed', 'exchange_message'
    ]);
    const queuedNotifications = notifications.data.filter(row => queuedKinds.has(row.kind));
    const notificationIds = queuedNotifications.map(row => row.id);
    const deliveries = await admin.from('notification_email_deliveries')
      .select('id,notification_id,recipient_user_id,notification_kind,status,attempt_count')
      .in('notification_id', notificationIds);
    if (deliveries.error) throw new Error(`Could not inspect notification email outbox: ${deliveries.error.message}`);
    assert.equal(deliveries.data.length, notificationIds.length, 'Every queue-eligible notification must have exactly one email outbox row');
    assert.equal(new Set(deliveries.data.map(row => row.notification_id)).size, notificationIds.length, 'Email outbox must not duplicate notification rows');
    passed('durable notification records and server-only email delivery outbox');

    report.ok = true;
    report.completedAt = new Date().toISOString();
    report.retainedEvidence = {
      happyPathCaseId: redactIdentifier(caseId),
      cancellationCaseId: redactIdentifier(cancellationCase.id),
      recoveryCaseId: redactIdentifier(recoveryCase.id),
      itemIds: [redactIdentifier(itemA.id), redactIdentifier(itemB.id)],
      statesTraversed: ['PROPOSED', 'ACCEPTED', 'MEETUP_PLANNING', 'MEETUP_CONFIRMED', 'INSPECTION', 'HANDOFF_PENDING', 'ACTIVE', 'RETURN_PLANNING', 'RETURN_INSPECTION', 'COMPLETED', 'CANCELLED', 'EARLY_RETURN'],
      acceptedDurationDays: 60,
      handoffReturnDuration: { expectedDays: 60, observedMilliseconds: handoffDurationMs, withinTolerance: true },
      counterNotificationCount,
      cancellationNotificationCount: cancellationNotifications.data.length,
      cancellationLockCounts: { before: locksBeforeCancellation, after: locksAfterCancellation },
      rematching: { afterCompletionReview: true, afterCancellation: true },
      accountSwitchIsolation: { localSessionCleared: true, channelsRemoved: true, thirdUserRowsVisible: 0 },
      notificationCount: notifications.data.length,
      emailOutboxCount: deliveries.data.length,
      realtime: {
        recipientKinds: [...new Set(observedRealtime.filter(row => row.exchange_case_id === caseId).map(row => row.kind))].sort(),
        unauthorizedDeliveryCount: unauthorizedRealtime.filter(row => evidenceCaseIds.includes(row.exchange_case_id)).length,
        stalePostSwitchDeliveryCount: staleRealtime.length
      }
    };
    return report;
  } finally {
    if (realtimeChannel) await b.client.removeChannel(realtimeChannel);
    if (unauthorizedRealtimeChannel) await c.client.removeChannel(unauthorizedRealtimeChannel);
    if (switchedRealtimeChannel && switchedClient) await switchedClient.removeChannel(switchedRealtimeChannel);
    if (switchedClient) await switchedClient.auth.signOut({ scope: 'local' });
    await Promise.allSettled([a, b, c].map(session => session.client.auth.signOut({ scope: 'local' })));
  }
}

async function writeReport(report, reportPath) {
  const absolute = resolve(reportPath);
  await mkdir(resolve(absolute, '..'), { recursive: true });
  await writeFile(absolute, serializeRedactedReport(report), 'utf8');
  return absolute;
}

export async function main(env = process.env) {
  const config = loadHostedSmokeConfig(env);
  console.log(`Starting guarded hosted smoke against approved staging project ${config.expectedProjectRef}`);
  console.log('This harness does not apply migrations, invoke production, delete users, or delete canonical audit evidence.');
  let report;
  try {
    report = await runHostedSmoke(config);
  } catch (error) {
    report = {
      ok: false,
      runId: config.runId,
      testedPullRequestNumber: config.pullRequestNumber,
      testedHeadSha: config.headSha,
      projectRef: config.expectedProjectRef,
      failedAt: new Date().toISOString(),
      error: sanitizeDiagnostic(error instanceof Error ? error.message : String(error))
    };
    const path = await writeReport(report, config.reportPath);
    console.error(`Hosted exchange smoke failed. Redacted report: ${path}`);
    throw error;
  }
  const path = await writeReport(report, config.reportPath);
  console.log(`Hosted exchange smoke passed. Evidence report: ${path}`);
  console.log(serializeRedactedReport(report));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
