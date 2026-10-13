#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { STAGING_CONFIRMATION, projectRefFromUrl } from './hosted-exchange-smoke.mjs';

export const ADULT_ATTESTATION =
  'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.';
export const ADULT_VERSION = '2026-09-11';
export const FIXTURE_LABELS = ['A', 'B', 'C'];

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function normalizeRunTag(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!normalized) throw new Error('Hosted fixture run tag is required');
  return normalized.slice(0, 36);
}
export function validateBootstrapEnvironment(env = process.env) {
  const confirmation = required(env, 'BC_HOSTED_SMOKE_CONFIRMATION');
  if (confirmation !== STAGING_CONFIRMATION) throw new Error('Explicit staging-smoke confirmation is required');

  const url = required(env, 'BC_STAGING_SUPABASE_URL');
  const publishableKey = required(env, 'BC_STAGING_SUPABASE_PUBLISHABLE_KEY');
  const secretKey = required(env, 'BC_STAGING_SUPABASE_SECRET_KEY');
  const stagingProjectRef = required(env, 'BC_STAGING_SUPABASE_PROJECT_REF').toLowerCase();
  const productionProjectRef = required(env, 'BC_PRODUCTION_SUPABASE_PROJECT_REF').toLowerCase();
  const domain = required(env, 'BC_STAGING_ALLOWED_EMAIL_DOMAIN').replace(/^@/, '').toLowerCase();
  const githubEnv = required(env, 'GITHUB_ENV');
  const runId = required(env, 'GITHUB_RUN_ID');
  const runAttempt = required(env, 'GITHUB_RUN_ATTEMPT');

  if (stagingProjectRef === productionProjectRef) throw new Error('Staging project ref equals production');
  if (projectRefFromUrl(url) !== stagingProjectRef) throw new Error('Staging URL does not match the approved staging project ref');
  if (domain !== 'example.test') throw new Error('Hosted smoke fixture provisioning requires example.test');
  if (secretKey === publishableKey) throw new Error('Staging server credential must differ from the publishable key');

  return {
    url,
    publishableKey,
    secretKey,
    domain,
    githubEnv,
    runTag: normalizeRunTag(`${runId}-${runAttempt}`)
  };
}
export function buildFixtureCredentials({
  label,
  runTag,
  domain,
  emailNonce,
  passwordNonce
}) {
  if (!FIXTURE_LABELS.includes(label)) throw new Error('Fixture label must be A, B, or C');
  if (domain !== 'example.test') throw new Error('Fixture email domain must be example.test');
  if (!/^[0-9a-f]{12,}$/i.test(emailNonce)) throw new Error('Fixture email nonce is invalid');
  if (!/^[0-9a-f]{32,}$/i.test(passwordNonce)) throw new Error('Fixture password nonce is invalid');

  const safeRunTag = normalizeRunTag(runTag);
  return {
    label,
    email: `bc-smoke-${safeRunTag}-${label.toLowerCase()}-${emailNonce.slice(0, 12).toLowerCase()}@${domain}`,
    password: `Bc!1-${passwordNonce.toLowerCase()}`
  };
}

export function generateFixtureCredentials(config) {
  return FIXTURE_LABELS.map(label => buildFixtureCredentials({
    label,
    runTag: config.runTag,
    domain: config.domain,
    emailNonce: randomBytes(8).toString('hex'),
    passwordNonce: randomBytes(24).toString('hex')
  }));
}
export function githubEnvPayload(credentials) {
  return credentials.flatMap(user => [
    `BC_STAGING_USER_${user.label}_EMAIL=${user.email}`,
    `BC_STAGING_USER_${user.label}_PASSWORD=${user.password}`
  ]).join('\n') + '\n';
}

function maskForGithub(value) {
  process.stdout.write(`::add-mask::${value}\n`);
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

async function createEligibleFixtureUser(config, adminClient, credentials) {
  const created = await adminClient.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
    user_metadata: { full_name: `BrickCircle Smoke ${credentials.label}` }
  });
  if (created.error || !created.data?.user?.id) {
    throw new Error(`Could not create hosted fixture user ${credentials.label}`);
  }
  const userId = created.data.user.id;
  const profileUpdate = await adminClient
    .from('profiles')
    .update({ country: 'India', city: 'Bengaluru' })
    .eq('id', userId);
  if (profileUpdate.error) throw new Error(`Could not prepare hosted fixture profile ${credentials.label}`);

  const userClient = makeClient(config.url, config.publishableKey);
  const signIn = await userClient.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password
  });
  if (signIn.error || signIn.data?.user?.id !== userId) {
    throw new Error(`Could not authenticate hosted fixture user ${credentials.label}`);
  }

  const confirmed = await userClient.rpc('confirm_adult_status', {
    p_attestation: ADULT_ATTESTATION,
    p_version: ADULT_VERSION
  });
  if (confirmed.error) throw new Error(`Could not confirm adult status for hosted fixture user ${credentials.label}`);

  const profile = await userClient
    .from('profiles')
    .select('adult_confirmed_at,country,city')
    .eq('id', userId)
    .single();
  if (profile.error || !profile.data?.adult_confirmed_at) {
    throw new Error(`Hosted fixture user ${credentials.label} is missing adult confirmation`);
  }
  if (String(profile.data.country || '').trim().toLowerCase() !== 'india') {
    throw new Error(`Hosted fixture user ${credentials.label} has the wrong country`);
  }
  if (String(profile.data.city || '').replace(/[^a-z0-9]/gi, '').toLowerCase() !== 'bengaluru') {
    throw new Error(`Hosted fixture user ${credentials.label} has the wrong city`);
  }
}

export async function bootstrapHostedSmokeUsers(env = process.env) {
  const config = validateBootstrapEnvironment(env);
  const credentials = generateFixtureCredentials(config);
  const adminClient = makeClient(config.url, config.secretKey);

  for (const fixture of credentials) {
    await createEligibleFixtureUser(config, adminClient, fixture);
  }

  for (const fixture of credentials) {
    maskForGithub(fixture.email);
    maskForGithub(fixture.password);
  }
  await appendFile(config.githubEnv, githubEnvPayload(credentials), 'utf8');

  return { count: credentials.length };
}

export async function main(env = process.env) {
  await bootstrapHostedSmokeUsers(env);
  console.log('Provisioned three fresh hosted smoke users; prior staging evidence was retained.');
}
const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(() => {
    console.error('Hosted staging user bootstrap failed without emitting credentials or identifiers.');
    process.exitCode = 1;
  });
}
