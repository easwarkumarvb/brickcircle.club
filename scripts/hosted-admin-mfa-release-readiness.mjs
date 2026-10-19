#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runSmoke, validateFixtureConfig } from './hosted-admin-smoke.mjs';
import {
  assertRunnerCheckout, CONFIRMATION, HEAD_SHA, MERGE_SHA, PULL_REQUEST_NUMBER,
} from './validate-admin-mfa-release.mjs';

export const REQUIRED_ENV = Object.freeze([
  'BC_STAGING_SUPABASE_URL',
  'BC_STAGING_SUPABASE_PUBLISHABLE_KEY',
  'BC_STAGING_NOTIFICATION_MODE',
  'BC_ADMIN_MFA_CONFIRMATION',
  'BC_ADMIN_MFA_PULL_REQUEST_NUMBER',
  'BC_ADMIN_MFA_RELEASE_HEAD_SHA',
  'BC_ADMIN_MFA_RELEASE_MERGE_SHA',
  'BC_ADMIN_MFA_RUNNER_SHA',
  'BC_ADMIN_MFA_MEMBER_EMAIL',
  'BC_ADMIN_MFA_MEMBER_PASSWORD',
  'BC_ADMIN_MFA_ADMIN_EMAIL',
  'BC_ADMIN_MFA_ADMIN_PASSWORD',
  'BC_ADMIN_MFA_ADMIN_TOTP_SECRET',
  'BC_ADMIN_MFA_RUN_ID',
  'BC_ADMIN_MFA_CASE_ID',
  'BC_ADMIN_MFA_SUPPORT_ID',
]);

export class MissingPrerequisitesError extends Error {
  constructor(names) {
    super(`Missing protected prerequisites: ${names.join(', ')}`);
    this.name = 'MissingPrerequisitesError';
  }
}

const PRIVILEGED_CREDENTIAL_ENV = /^(?:SUPABASE|BC_STAGING_SUPABASE)_(?:SECRET_KEY|SERVICE_ROLE_KEY)$/i;
export function assertNoPrivilegedCredentialEnv(env) {
  if (Object.entries(env).some(([name, value]) =>
    PRIVILEGED_CREDENTIAL_ENV.test(name) && typeof value === 'string' && value.trim() !== ''))
    throw new Error('Privileged Supabase credential environment variable is forbidden');
}

export function assertPublishableKey(key) {
  if (typeof key !== 'string') throw new Error('Supabase public API key required');
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return key;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)))
      throw new Error();
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload && payload.role === 'anon') return key;
  } catch {
    throw new Error('Supabase public API key required');
  }
  throw new Error('Supabase public API key required');
}

export function configFromEnv(env) {
  assertNoPrivilegedCredentialEnv(env);
  const missing = REQUIRED_ENV.filter(name => typeof env[name] !== 'string' || env[name].trim() === '');
  if (missing.length) throw new MissingPrerequisitesError(missing);
  return {
    url: env.BC_STAGING_SUPABASE_URL,
    key: assertPublishableKey(env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY),
    notificationMode: env.BC_STAGING_NOTIFICATION_MODE,
    confirmation: env.BC_ADMIN_MFA_CONFIRMATION,
    pr: env.BC_ADMIN_MFA_PULL_REQUEST_NUMBER,
    sha: env.BC_ADMIN_MFA_RELEASE_MERGE_SHA,
    releaseHeadSha: env.BC_ADMIN_MFA_RELEASE_HEAD_SHA,
    runnerSha: env.BC_ADMIN_MFA_RUNNER_SHA,
    run: env.BC_ADMIN_MFA_RUN_ID,
    caseId: env.BC_ADMIN_MFA_CASE_ID,
    supportId: env.BC_ADMIN_MFA_SUPPORT_ID,
    totpSecret: env.BC_ADMIN_MFA_ADMIN_TOTP_SECRET,
    credentials: ['MEMBER', 'ADMIN'].map(role => ({
      email: env[`BC_ADMIN_MFA_${role}_EMAIL`],
      password: env[`BC_ADMIN_MFA_${role}_PASSWORD`],
    })),
  };
}

export function validateAdminMfaConfig(config) {
  validateFixtureConfig(config);
  assertPublishableKey(config.key);
  assert.equal(new Set([config.run, config.caseId, config.supportId].map(id => id.toLowerCase())).size, 3);
  assert.equal(config.confirmation, CONFIRMATION);
  assert.equal(config.notificationMode, 'outbox-only');
  assert.equal(config.pr, String(PULL_REQUEST_NUMBER));
  assert.equal(config.releaseHeadSha, HEAD_SHA);
  assert.equal(config.sha, MERGE_SHA);
  assert.match(config.runnerSha, /^[0-9a-f]{40}$/);
  return config;
}

export async function runFromEnv(env, { actualRunnerSha, factory, transport, conceal } = {}) {
  assertRunnerCheckout(env.BC_ADMIN_MFA_RUNNER_SHA, actualRunnerSha);
  const config = configFromEnv(env);
  validateAdminMfaConfig(config);
  const report = await runSmoke(config, { factory, transport, conceal, validate: validateAdminMfaConfig });
  return {
    ...report,
    releaseReference: {
      repository: 'easwarkumarvb/brickcircle.club',
      pullRequest: PULL_REQUEST_NUMBER,
      headBranch: 'dev/beta-feedback-20261019',
      headSha: HEAD_SHA,
      mergeSha: MERGE_SHA,
      baseBranch: 'main',
    },
    harnessSource: { sha: actualRunnerSha, workflowRef: 'refs/heads/main' },
    evidenceScope: 'server-only Supabase Auth and API evidence; no browser, deployment, or physical UI proof',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const actualRunnerSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const report = await runFromEnv(process.env, { actualRunnerSha });
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/hosted-admin-mfa-release-readiness.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    if (error instanceof MissingPrerequisitesError) console.error(error.message);
    else console.error('Admin MFA staging runner rejected its checkout or configuration; details withheld.');
    process.exitCode = 1;
  }
}
