#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  ENVIRONMENT, PROJECT_REF, PROJECT_URL, PROVISION_CONFIRMATION, REPOSITORY,
  UUID_RE, WORKFLOW_REF, encryptFixturePayload, parsePublicKeyDerBase64,
  validateServerKey,
} from './admin-mfa-fixture-crypto.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateProvisioningInput(input, { requireServerKey = false } = {}) {
  assert.equal(input.repository, REPOSITORY, 'Trusted repository required');
  assert.equal(input.ref, 'refs/heads/main', 'Main branch dispatch required');
  assert.equal(input.eventName, 'workflow_dispatch', 'Manual workflow dispatch required');
  assert.equal(input.workflowRef, WORKFLOW_REF, 'Trusted workflow source required');
  assert.match(input.expectedDispatchSha, SHA_RE, 'Expected dispatch SHA required');
  assert.equal(input.actualDispatchSha, input.expectedDispatchSha, 'Trusted dispatch checkout required');
  assert.equal(input.projectUrl, PROJECT_URL, 'Exact staging project required');
  assert.equal(input.confirmation, PROVISION_CONFIRMATION, 'Explicit staging confirmation required');
  assert.match(input.runId, UUID_PATTERN, 'A fresh v4 run UUID is required');
  const publicKey = parsePublicKeyDerBase64(input.publicKeyDerBase64);
  if (requireServerKey) validateServerKey(input.serverKey);
  return { ...input, publicKey };
}

export function provisioningInputFromEnv(env) {
  return {
    repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF,
    eventName: env.GITHUB_EVENT_NAME,
    workflowRef: env.GITHUB_WORKFLOW_REF,
    expectedDispatchSha: env.INPUT_EXPECTED_TRUSTED_DISPATCH_SHA,
    actualDispatchSha: env.GITHUB_SHA,
    projectUrl: env.BC_STAGING_SUPABASE_URL,
    confirmation: env.INPUT_CONFIRMATION,
    runId: env.INPUT_RUN_ID,
    publicKeyDerBase64: env.INPUT_PUBLIC_KEY_DER_BASE64,
    serverKey: env.BC_STAGING_SUPABASE_SECRET_KEY,
    publishableKey: env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY,
  };
}

function validatePublishableKey(value) {
  if (typeof value !== 'string' || value.trim() !== value) throw new Error('Staging publishable key required');
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return value;
  try {
    const parts = value.split('.');
    if (parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)) &&
        JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.role === 'anon')
      return value;
  } catch {
    throw new Error('Staging publishable key required');
  }
  throw new Error('Staging publishable key required');
}

function maskValue(value, conceal) {
  if (value !== undefined && value !== null && value !== '') conceal(String(value));
}

export function concealForGitHub(value) {
  if (process.env.GITHUB_ACTIONS === 'true' && value)
    console.log(`::add-mask::${String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
}

export function authOnlyFetch(url, transport = fetch) {
  assert.equal(url, PROJECT_URL, 'Exact staging project required');
  const requestCounts = new Map();
  const bounded = (name, limit) => {
    const count = (requestCounts.get(name) ?? 0) + 1;
    requestCounts.set(name, count);
    return count <= limit;
  };
  const factorPath = /^\/auth\/v1\/factors\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:challenge|verify)$/i;
  const allowed = (pathname, method, searchParams) => {
    if (pathname === '/auth/v1/admin/users' && method === 'POST' && searchParams.size === 0) {
      return bounded('admin-create', 2);
    }
    if (pathname === '/auth/v1/token' && method === 'POST')
      return [...searchParams].length === 1 && searchParams.get('grant_type') === 'password' &&
        bounded('password-session', 1);
    if (pathname === '/auth/v1/factors' && searchParams.size === 0) {
      if (method === 'GET') return bounded('factor-list', 1);
      if (method === 'POST') return bounded('factor-enroll', 1);
    }
    if (factorPath.test(pathname) && method === 'POST' && searchParams.size === 0) {
      return bounded(pathname.endsWith('/challenge') ? 'factor-challenge' : 'factor-verify', 1);
    }
    if (pathname === '/auth/v1/user' && method === 'GET' && searchParams.size === 0)
      return bounded('user-read', 4);
    if (pathname === '/auth/v1/logout' && method === 'POST' &&
        (searchParams.size === 0 ||
          (searchParams.size === 1 && searchParams.get('scope') === 'local')))
      return bounded('local-signout', 1);
    return false;
  };
  const guarded = async (input, init = {}) => {
    let target;
    try {
      target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    } catch {
      throw new Error('Auth API transport rejected');
    }
    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    if (target.origin !== PROJECT_URL || target.username || target.password || target.hash ||
        !allowed(target.pathname, method, target.searchParams))
      throw new Error('Auth API transport rejected');
    let response;
    try {
      response = await transport(input, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error('Staging Auth API request failed');
    }
    if (response.redirected || (response.url && response.url !== target.href))
      throw new Error('Staging Auth API redirect rejected');
    return response;
  };
  return {
    fetch: guarded,
    getAdminCreateRequestCount: () => requestCounts.get('admin-create') ?? 0,
  };
}

export function totp(secret, now = Date.now()) {
  if (typeof secret !== 'string' || !/^[A-Z2-7]+=*$/i.test(secret))
    throw new Error('TOTP setup response invalid');
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, ''))
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function checked(result) {
  if (!result || result.error) throw new Error('Provider operation failed');
  return result.data;
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function resultUser(result, expectedEmail, runId) {
  const user = checked(result)?.user;
  if (!user || !isUuid(user.id) || user.email?.toLowerCase() !== expectedEmail.toLowerCase() ||
      user.app_metadata?.staging_admin_smoke_run !== runId || !user.email_confirmed_at)
    throw new Error('Created Auth user verification failed');
  return user;
}

function buildMetadata(config, memberId, adminId, factorId) {
  return {
    schema: 'brickcircle.admin-mfa-fixtures.v1',
    repository: REPOSITORY,
    environment: ENVIRONMENT,
    workflowRef: WORKFLOW_REF,
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
    dispatchSha: config.expectedDispatchSha,
    projectRef: PROJECT_REF,
    runId: config.runId,
    publicKeyFingerprint: config.publicKey.fingerprint,
    result: 'provisioned',
    member: { userId: memberId },
    admin: { userId: adminId, factorId, verified: true },
  };
}

function publicReport(config, users, factorId, phase, passed) {
  if (passed) return buildMetadata(
    config, users[0].userId, users[1].userId, factorId,
  );
  return {
    schema: 'brickcircle.admin-mfa-fixtures.v1',
    repository: REPOSITORY,
    environment: ENVIRONMENT,
    workflowRef: WORKFLOW_REF,
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
    dispatchSha: config.expectedDispatchSha,
    projectRef: PROJECT_REF,
    runId: config.runId,
    publicKeyFingerprint: config.publicKey.fingerprint,
    status: passed ? 'provisioned' : 'partial-or-failed',
    phase,
    ownership: users.map(({ role, userId, status }) => ({
      role, ...(userId ? { userId } : {}), status,
    })),
    ...(factorId ? { adminFactorId: factorId } : {}),
    ...(passed ? { adminFactorVerified: true } : {}),
  };
}

export async function runProvisioning(input, {
  actualDispatchSha = input.actualDispatchSha, repository = input.repository, ref = input.ref,
  eventName = input.eventName, workflowRef = input.workflowRef, factory, transport = fetch,
  conceal = concealForGitHub, now = Date.now,
} = {}) {
  const config = validateProvisioningInput({
    ...input, actualDispatchSha, repository, ref, eventName, workflowRef,
  }, { requireServerKey: true });
  config.publishableKey = validatePublishableKey(config.publishableKey);

  const credentials = {
    member: {
      email: `member-${config.runId}@example.test`,
      password: randomBytes(32).toString('base64url'),
    },
    admin: {
      email: `admin-${config.runId}@example.test`,
      password: randomBytes(32).toString('base64url'),
    },
  };
  for (const value of [
    config.serverKey, config.publishableKey, config.projectUrl,
    credentials.member.email, credentials.member.password,
    credentials.admin.email, credentials.admin.password,
  ]) maskValue(value, conceal);

  const clientTransport = authOnlyFetch(config.projectUrl, transport);
  const clientOptions = {
    auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    },
    global: { fetch: clientTransport.fetch },
  };
  const statuses = [
    { role: 'member', status: 'not-attempted' },
    { role: 'admin', status: 'not-attempted' },
  ];
  let phase = 'client-construction';
  let factorId;
  let payload;
  let failed = false;
  let client;
  try {
    let makeClient = factory;
    if (!makeClient) {
      const { createClient } = await import('@supabase/supabase-js');
      makeClient = createClient;
    }
    const serverClient = makeClient(config.projectUrl, config.serverKey, clientOptions);
    client = makeClient(config.projectUrl, config.publishableKey, clientOptions);

    phase = 'create-member';
    statuses[0].status = 'create-requested';
    const memberResult = await serverClient.auth.admin.createUser({
      email: credentials.member.email,
      password: credentials.member.password,
      email_confirm: true,
      app_metadata: { staging_admin_smoke_run: config.runId },
    });
    const member = resultUser(memberResult, credentials.member.email, config.runId);
    statuses[0] = { role: 'member', userId: member.id, status: 'created-and-verified' };

    phase = 'create-admin';
    statuses[1].status = 'create-requested';
    const adminResult = await serverClient.auth.admin.createUser({
      email: credentials.admin.email,
      password: credentials.admin.password,
      email_confirm: true,
      app_metadata: { staging_admin_smoke_run: config.runId },
    });
    const admin = resultUser(adminResult, credentials.admin.email, config.runId);
    statuses[1] = { role: 'admin', userId: admin.id, status: 'created-and-verified' };
    if (member.id.toLowerCase() === admin.id.toLowerCase())
      throw new Error('Created Auth user verification failed');

    phase = 'admin-password-session';
    const login = checked(await client.auth.signInWithPassword({
      email: credentials.admin.email, password: credentials.admin.password,
    }));
    maskValue(login.session?.access_token, conceal);
    maskValue(login.session?.refresh_token, conceal);
    if (login.session?.user?.id !== admin.id) throw new Error('Admin session verification failed');
    const loggedInUser = checked(await client.auth.getUser())?.user;
    if (loggedInUser?.id !== admin.id ||
        loggedInUser.email?.toLowerCase() !== credentials.admin.email.toLowerCase() ||
        loggedInUser.app_metadata?.staging_admin_smoke_run !== config.runId)
      throw new Error('Admin session verification failed');
    if (checked(await client.auth.mfa.getAuthenticatorAssuranceLevel())?.currentLevel !== 'aal1')
      throw new Error('Admin initial assurance verification failed');

    phase = 'admin-totp-enrollment';
    const enrollment = checked(await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `BrickCircle staging ${config.runId}`,
    }));
    factorId = enrollment?.id;
    const seed = enrollment?.totp?.secret;
    maskValue(seed, conceal);
    if (!isUuid(factorId) || typeof seed !== 'string' || !/^[A-Z2-7]{16,}=*$/i.test(seed))
      throw new Error('TOTP setup response invalid');
    const code = totp(seed, now());
    maskValue(code, conceal);

    phase = 'admin-totp-verification';
    const verified = checked(await client.auth.mfa.challengeAndVerify({ factorId, code }));
    maskValue(verified?.access_token, conceal);
    maskValue(verified?.refresh_token, conceal);
    maskValue(verified?.session?.access_token, conceal);
    maskValue(verified?.session?.refresh_token, conceal);
    const factors = checked(await client.auth.mfa.listFactors())?.totp;
    if (!Array.isArray(factors) || factors.length !== 1 ||
        factors[0].id !== factorId || factors[0].status !== 'verified')
      throw new Error('Verified TOTP factor validation failed');
    if (checked(await client.auth.mfa.getAuthenticatorAssuranceLevel())?.currentLevel !== 'aal2')
      throw new Error('Admin AAL2 verification failed');
    const session = checked(await client.auth.getSession())?.session;
    maskValue(session?.access_token, conceal);
    maskValue(session?.refresh_token, conceal);
    if (session?.user?.id !== admin.id || !session.access_token ||
        checked(await client.auth.getUser())?.user?.id !== admin.id)
      throw new Error('Admin AAL2 session validation failed');
    if (clientTransport.getAdminCreateRequestCount() > 2)
      throw new Error('Create-only Auth request limit exceeded');

    payload = {
      version: 1,
      runId: config.runId,
      member: {
        userId: member.id, email: credentials.member.email, password: credentials.member.password,
      },
      admin: {
        userId: admin.id, email: credentials.admin.email, password: credentials.admin.password,
        totpSecret: seed, factorId,
      },
    };
  } catch {
    failed = true;
    if (statuses[0].status === 'create-requested') statuses[0].status = 'create-outcome-unknown';
    if (statuses[1].status === 'create-requested') statuses[1].status = 'create-outcome-unknown';
  } finally {
    if (client) {
      try {
        checked(await client.auth.signOut({ scope: 'local' }));
      } catch {
        failed = true;
        phase = 'session-signout-failed';
      }
    }
  }

  if (clientTransport.getAdminCreateRequestCount() !== 2) failed = true;
  let metadata;
  let envelope;
  if (!failed && payload) {
    try {
      metadata = buildMetadata(config, statuses[0].userId, statuses[1].userId, factorId);
      envelope = encryptFixturePayload(payload, config.publicKeyDerBase64, metadata);
    } catch {
      failed = true;
      phase = 'encryption-failed';
    }
  }
  const report = publicReport(config, statuses, factorId, phase, !failed && Boolean(envelope));
  return { passed: !failed && Boolean(envelope), report, metadata, envelope };
}

export async function writeProvisioningArtifacts(result, directory = 'artifacts') {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(`${directory}/admin-mfa-fixture-ownership.json`,
    `${JSON.stringify(result.report, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  if (result.passed && result.metadata && result.envelope) {
    await writeFile(`${directory}/admin-mfa-fixtures.encrypted.json`,
      `${JSON.stringify(result.envelope, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
}

function inputFromProcess(env) {
  return provisioningInputFromEnv(env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = inputFromProcess(process.env);
    const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    validateProvisioningInput({ ...input, actualDispatchSha: actualSha });
    if (process.argv.includes('--preflight')) {
      console.log('Staging fixture provisioning inputs validated.');
    } else {
      const result = await runProvisioning(input, { actualDispatchSha: actualSha });
      await writeProvisioningArtifacts(result);
      console.log(result.passed
        ? 'Staging Auth fixtures provisioned; only encrypted credentials and ownership metadata were written.'
        : 'Staging Auth fixture provisioning incomplete; inspect the bounded ownership report.');
      if (!result.passed) process.exitCode = 1;
    }
  } catch {
    console.error('Staging fixture provisioning rejected or failed; details withheld.');
    process.exitCode = 1;
  }
}
