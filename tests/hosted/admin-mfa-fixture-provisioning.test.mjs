import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp, readFile, readdir, rm, stat, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import {
  ENVIRONMENT, IMPORT_CONFIRMATION, PROJECT_REF, PROJECT_URL, PROVISION_CONFIRMATION,
  REPOSITORY, WORKFLOW_REF, decryptFixtureEnvelope, encryptFixturePayload,
  parsePublicKeyDerBase64, validateOwnershipMetadata,
} from '../../scripts/admin-mfa-fixture-crypto.mjs';
import {
  assertPrivateKeyPermissions, generateFixtureKeypair, loadPrivateKey,
  validateWindowsAclOutput,
} from '../../scripts/admin-mfa-keypair.mjs';
import {
  importFixtures,
} from '../../scripts/import-admin-mfa-fixtures.mjs';
import {
  authOnlyFetch, runProvisioning, totp, validateProvisioningInput,
  writeProvisioningArtifacts,
} from '../../scripts/provision-admin-mfa-fixtures.mjs';

const root = await mkdtemp(join(tmpdir(), 'brickcircle-admin-mfa-'));
const keys = await generateFixtureKeypair(join(root, 'local-keys'));
const privateKey = await loadPrivateKey(keys.privateKeyPath);
const runId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const factorId = '44444444-4444-4444-8444-444444444444';
const dispatchSha = 'a'.repeat(40);
const totpSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const serverKey = `eyJhbGciOiJub25lIn0.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`;
const publishableKey = 'sb_publishable_offline-test-key';

after(async () => rm(root, { recursive: true, force: true }));

function input(overrides = {}) {
  return {
    repository: REPOSITORY,
    ref: 'refs/heads/main',
    eventName: 'workflow_dispatch',
    workflowRef: WORKFLOW_REF,
    expectedDispatchSha: dispatchSha,
    actualDispatchSha: dispatchSha,
    projectUrl: PROJECT_URL,
    confirmation: PROVISION_CONFIRMATION,
    runId,
    publicKeyDerBase64: keys.publicKeyDerBase64,
    serverKey,
    publishableKey,
    ...overrides,
  };
}

function metadata(overrides = {}) {
  const fingerprint = parsePublicKeyDerBase64(keys.publicKeyDerBase64).fingerprint;
  return {
    schema: 'brickcircle.admin-mfa-fixtures.v1',
    repository: REPOSITORY,
    environment: ENVIRONMENT,
    workflowRef: WORKFLOW_REF,
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
    dispatchSha,
    projectRef: PROJECT_REF,
    runId,
    publicKeyFingerprint: fingerprint,
    result: 'provisioned',
    member: { userId: memberId },
    admin: { userId: adminId, factorId, verified: true },
    ...overrides,
  };
}

function payload() {
  return {
    version: 1,
    runId,
    member: {
      userId: memberId, email: `member-${runId}@example.test`,
      password: 'member-password-not-for-output-123456',
    },
    admin: {
      userId: adminId, email: `admin-${runId}@example.test`,
      password: 'admin-password-not-for-output-123456',
      totpSecret, factorId,
    },
  };
}

function windowsAclOutput({ directory = false, ownerSid = 'S-1-5-21-100-200-300-1001',
  currentSid = 'S-1-5-21-100-200-300-1001', rules } = {}) {
  const fullControlRights = 2032127;
  return JSON.stringify({
    ownerSid, currentSid, fullControlRights,
    rules: rules ?? [
      {
        sid: ownerSid, type: 'Allow', rights: fullControlRights, inherited: false,
        inheritanceFlags: directory ? 3 : 0, propagationFlags: 0,
      },
      {
        sid: 'S-1-5-18', type: 'Allow', rights: fullControlRights, inherited: false,
        inheritanceFlags: directory ? 3 : 0, propagationFlags: 0,
      },
    ],
  });
}

function fakeFactory({ events = [], failAt, userIds = [memberId, adminId] } = {}) {
  const created = [];
  let aal = 'aal1';
  let userIndex = 0;
  let sessionUser;
  let session;
  const transport = async (inputUrl, options = {}) => {
    events.push(['transport', String(inputUrl), options.method, options.redirect]);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return new Response('{}', { status: 200 });
  };
  const factory = (url, key, options) => {
    events.push(['client', url, key]);
    assert.equal(url, PROJECT_URL);
    const request = (path, method) => options.global.fetch(`${PROJECT_URL}${path}`, { method });
    if (key === serverKey) {
      return {
        auth: {
          admin: {
            async createUser(args) {
              events.push(['createUser', args]);
              created.push(args);
              const role = args.email.startsWith('member-') ? 'member' : 'admin';
              await request('/auth/v1/admin/users', 'POST');
              if (failAt === `create-${role}`) throw new Error('PROVIDER_ERROR_SECRET');
              return {
                data: { user: {
                  id: userIds[userIndex++], email: args.email,
                  email_confirmed_at: '2026-10-19T09:00:00.000Z',
                  app_metadata: { ...args.app_metadata },
                } },
                error: null,
              };
            },
          },
        },
      };
    }
    return {
      auth: {
        async signInWithPassword(args) {
          events.push(['signInWithPassword', args]);
          await request('/auth/v1/token?grant_type=password', 'POST');
          sessionUser = {
            id: adminId, email: args.email,
            app_metadata: { staging_admin_smoke_run: runId },
          };
          session = { user: sessionUser, access_token: 'SESSION_ACCESS_SECRET', refresh_token: 'SESSION_REFRESH_SECRET' };
          if (failAt === 'password-session') throw new Error('PROVIDER_ERROR_SECRET');
          return { data: { session }, error: null };
        },
        async getUser() {
          events.push(['getUser']);
          await request('/auth/v1/user', 'GET');
          return { data: { user: sessionUser }, error: null };
        },
        async getSession() {
          events.push(['getSession']);
          return { data: { session }, error: null };
        },
        async signOut(args) {
          events.push(['signOut', args]);
          await request('/auth/v1/logout', 'POST');
          return { data: {}, error: null };
        },
        mfa: {
          async getAuthenticatorAssuranceLevel() {
            events.push(['aal', aal]);
            await request('/auth/v1/user', 'GET');
            return { data: { currentLevel: aal }, error: null };
          },
          async enroll(args) {
            events.push(['enroll', args]);
            await request('/auth/v1/factors', 'POST');
            if (failAt === 'enroll') throw new Error('PROVIDER_ERROR_SECRET');
            return { data: { id: factorId, totp: { secret: totpSecret } }, error: null };
          },
          async challengeAndVerify(args) {
            events.push(['challengeAndVerify', args]);
            await request(`/auth/v1/factors/${factorId}/challenge`, 'POST');
            await request(`/auth/v1/factors/${factorId}/verify`, 'POST');
            aal = 'aal2';
            if (failAt === 'challengeAndVerify') throw new Error('PROVIDER_ERROR_SECRET');
            return {
              data: { access_token: 'VERIFIED_ACCESS_SECRET', refresh_token: 'VERIFIED_REFRESH_SECRET' },
              error: null,
            };
          },
          async listFactors() {
            events.push(['listFactors']);
            await request('/auth/v1/factors', 'GET');
            return { data: { totp: [{ id: factorId, status: 'verified' }] }, error: null };
          },
        },
      },
    };
  };
  return { factory, transport, created, events };
}

test('rejects untrusted provenance, target, confirmation, key, run ID, and server key before any client or transport', async () => {
  const weakRsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
    .export({ format: 'der', type: 'spki' }).toString('base64');
  const nonRsa = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey
    .export({ format: 'der', type: 'spki' }).toString('base64');
  const variants = [
    { repository: 'someone/else' },
    { ref: 'refs/heads/feature' },
    { eventName: 'push' },
    { workflowRef: `${REPOSITORY}/${WORKFLOW_REF.split('/').slice(-1)}@refs/heads/main` },
    { expectedDispatchSha: 'not-a-sha' },
    { actualDispatchSha: 'b'.repeat(40) },
    { projectUrl: 'https://nsxtromjdpdscknadxez.supabase.co' },
    { confirmation: 'yes' },
    { runId: 'not-a-v4-uuid' },
    { publicKeyDerBase64: 'not-a-public-key' },
    { publicKeyDerBase64: weakRsa },
    { publicKeyDerBase64: nonRsa },
    { publicKeyDerBase64: `${keys.publicKeyDerBase64}\n` },
    { serverKey: publishableKey },
    { publishableKey: serverKey },
  ];
  for (const overrides of variants) {
    const fake = fakeFactory();
    await assert.rejects(runProvisioning(input(overrides), {
      factory: fake.factory, transport: fake.transport, conceal: () => {},
    }));
    assert.equal(fake.events.filter(event => event[0] === 'client').length, 0);
    assert.equal(fake.events.filter(event => event[0] === 'transport').length, 0);
  }
  assert.throws(() => validateProvisioningInput(input({ projectUrl: 'https://production.invalid' })));
});

test('creates exactly two verified new users with server-owned run markers, then performs real mocked TOTP API flow and signs out', async () => {
  const fake = fakeFactory();
  const masked = [];
  const result = await runProvisioning(input(), {
    factory: fake.factory, transport: fake.transport,
    conceal: value => { masked.push(value); fake.events.push(['mask', value]); },
    now: () => 1_800_000_000_000,
  });
  assert.equal(result.passed, true);
  assert.equal(fake.created.length, 2);
  for (const account of fake.created) {
    assert.equal(account.email_confirm, true);
    assert.deepEqual(account.app_metadata, { staging_admin_smoke_run: runId });
    assert.match(account.email, /@example\.test$/);
    assert.ok(account.password.length >= 32);
  }
  assert.notEqual(fake.created[0].email, fake.created[1].email);
  assert.equal(fake.events.filter(event => event[0] === 'challengeAndVerify').length, 1);
  assert.equal(fake.events.filter(event => event[0] === 'listFactors').length, 1);
  assert.ok(fake.events.some(event => event[0] === 'aal' && event[1] === 'aal1'));
  assert.ok(fake.events.some(event => event[0] === 'aal' && event[1] === 'aal2'));
  assert.ok(fake.events.some(event => event[0] === 'signOut' && event[1].scope === 'local'));
  assert.equal(fake.events.filter(event => event[0] === 'transport' &&
    event[1].includes('/auth/v1/admin/users')).length, 2);
  assert.equal(result.report.member.userId, memberId);
  assert.equal(result.report.admin.userId, adminId);
  assert.equal(result.report.admin.factorId, factorId);
  assert.equal(result.report.admin.verified, true);
  assert.equal(result.envelope.keyFingerprint, result.metadata.publicKeyFingerprint);
  const artifactDirectory = join(root, 'successful-artifacts');
  await writeProvisioningArtifacts(result, artifactDirectory);
  assert.deepEqual((await readdir(artifactDirectory)).sort(), [
    'admin-mfa-fixture-ownership.json', 'admin-mfa-fixtures.encrypted.json',
  ]);
  const artifactContents = (await Promise.all(
    (await readdir(artifactDirectory)).map(name => readFile(join(artifactDirectory, name), 'utf8')),
  )).join('');
  assert.ok(!artifactContents.includes(serverKey));
  assert.ok(!artifactContents.includes(publishableKey));
  assert.ok(!artifactContents.includes(fake.created[0].password));
  assert.ok(!artifactContents.includes(fake.created[1].password));
  assert.ok(!artifactContents.includes(totpSecret));
  assert.ok(!artifactContents.includes('SESSION_ACCESS_SECRET'));
  assert.ok(!artifactContents.includes('SESSION_REFRESH_SECRET'));
  assert.ok(!artifactContents.includes('VERIFIED_ACCESS_SECRET'));
  assert.ok(!artifactContents.includes('VERIFIED_REFRESH_SECRET'));
  for (const value of [
    serverKey, publishableKey,
    fake.created[0].email, fake.created[0].password,
    fake.created[1].email, fake.created[1].password,
    totpSecret, totp(totpSecret, 1_800_000_000_000),
    'SESSION_ACCESS_SECRET', 'SESSION_REFRESH_SECRET',
    'VERIFIED_ACCESS_SECRET', 'VERIFIED_REFRESH_SECRET',
  ]) assert.ok(masked.includes(value));
  const serialized = `${JSON.stringify(result.report)}${JSON.stringify(result.metadata)}${JSON.stringify(result.envelope)}`;
  for (const secret of [
    serverKey, publishableKey, fake.created[0].email, fake.created[0].password,
    fake.created[1].email, fake.created[1].password, totpSecret,
    'SESSION_ACCESS_SECRET', 'SESSION_REFRESH_SECRET',
    'VERIFIED_ACCESS_SECRET', 'VERIFIED_REFRESH_SECRET',
  ]) assert.ok(!serialized.includes(secret));
  assert.equal(result.envelope.ciphertext.includes(fake.created[0].password), false);
});

test('partial provisioning retains created-user ownership evidence, withholds provider details, exports no payload, and signs out', async () => {
  for (const failAt of ['create-admin', 'enroll', 'challengeAndVerify']) {
    const fake = fakeFactory({ failAt });
    const result = await runProvisioning(input(), {
      factory: fake.factory, transport: fake.transport, conceal: () => {},
    });
    assert.equal(result.passed, false);
    assert.equal(result.envelope, undefined);
    assert.equal(JSON.stringify(result.report).includes('PROVIDER_ERROR_SECRET'), false);
    assert.equal(JSON.stringify(result.report).includes(serverKey), false);
    assert.ok(result.report.ownership.some(item => item.role === 'member' && item.userId === memberId));
    assert.ok(fake.events.some(event => event[0] === 'signOut'));
    assert.equal(fake.events.some(event =>
      ['deleteUser', 'updateUserById', 'inviteUserByEmail'].includes(event[0])), false);
  }
});

test('Auth transport is limited to exact staging Auth endpoints and rejects redirects before accepting response', async () => {
  let calls = 0;
  const guarded = authOnlyFetch(PROJECT_URL, async (_input, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    return new Response('{}');
  });
  for (const target of [
    'https://nsxtromjdpdscknadxez.supabase.co/auth/v1/token?grant_type=password',
    `https://untrusted@${PROJECT_REF}.supabase.co/auth/v1/user`,
    `${PROJECT_URL}/auth/v1/user#fragment`,
    `${PROJECT_URL}/storage/v1/object`,
    `${PROJECT_URL}/auth/v1/signup`,
    `${PROJECT_URL}/auth/v1/token?grant_type=password&unexpected=1`,
    `${PROJECT_URL}/auth/v1/factors?unexpected=1`,
    `${PROJECT_URL}/auth/v1/logout?scope=global`,
    `${PROJECT_URL}/auth/v1/admin/users`,
    `${PROJECT_URL}/auth/v1/admin/users`,
  ]) {
    const method = target.endsWith('/users') || target.includes('/auth/v1/user') ? 'GET' : 'POST';
    await assert.rejects(guarded.fetch(target, { method }));
  }
  assert.equal(calls, 0);
  await guarded.fetch(`${PROJECT_URL}/auth/v1/admin/users`, { method: 'POST' });
  await guarded.fetch(`${PROJECT_URL}/auth/v1/admin/users`, { method: 'POST' });
  await assert.rejects(guarded.fetch(`${PROJECT_URL}/auth/v1/admin/users`, { method: 'POST' }));
  assert.equal(calls, 2);
  const bounded = authOnlyFetch(PROJECT_URL, async () => {
    calls++;
    return new Response('{}');
  });
  await bounded.fetch(`${PROJECT_URL}/auth/v1/token?grant_type=password`, { method: 'POST' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/token?grant_type=password`, { method: 'POST' }));
  await bounded.fetch(`${PROJECT_URL}/auth/v1/factors`, { method: 'POST' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/factors`, { method: 'POST' }));
  await bounded.fetch(`${PROJECT_URL}/auth/v1/factors`, { method: 'GET' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/factors`, { method: 'GET' }));
  await bounded.fetch(`${PROJECT_URL}/auth/v1/factors/${factorId}/challenge`, { method: 'POST' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/factors/${factorId}/challenge`, { method: 'POST' }));
  await bounded.fetch(`${PROJECT_URL}/auth/v1/factors/${factorId}/verify`, { method: 'POST' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/factors/${factorId}/verify`, { method: 'POST' }));
  for (let index = 0; index < 4; index++)
    await bounded.fetch(`${PROJECT_URL}/auth/v1/user`, { method: 'GET' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/user`, { method: 'GET' }));
  await bounded.fetch(`${PROJECT_URL}/auth/v1/logout?scope=local`, { method: 'POST' });
  await assert.rejects(bounded.fetch(`${PROJECT_URL}/auth/v1/logout?scope=local`, { method: 'POST' }));
  const redirected = authOnlyFetch(PROJECT_URL, async () => {
    calls++;
    return Object.assign(new Response('{}'), { redirected: true });
  });
  await assert.rejects(redirected.fetch(`${PROJECT_URL}/auth/v1/token?grant_type=password`, { method: 'POST' }));
});

test('RSA-OAEP/AES-GCM envelope round-trips and rejects wrong key, tampering, metadata, and run binding changes', () => {
  const meta = metadata();
  validateOwnershipMetadata(meta);
  const encrypted = encryptFixturePayload(payload(), keys.publicKeyDerBase64, meta);
  const decrypted = decryptFixtureEnvelope(encrypted, privateKey, meta);
  assert.ok(decrypted.member.userId === payload().member.userId);
  assert.ok(decrypted.admin.totpSecret === payload().admin.totpSecret);
  const otherPair = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  assert.throws(() => decryptFixtureEnvelope(encrypted, otherPair.privateKey, meta));
  assert.throws(() => decryptFixtureEnvelope({
    ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA`,
  }, privateKey, meta));
  assert.throws(() => decryptFixtureEnvelope(encrypted, privateKey, metadata({
    dispatchSha: 'b'.repeat(40),
  })));
  assert.throws(() => decryptFixtureEnvelope(encrypted, privateKey, metadata({
    runId: '55555555-5555-4555-8555-555555555555',
  })));
});

test('keypair generation and import enforce private-key permissions and stdin-only fixed-destination no-overwrite behavior', async () => {
  await assertPrivateKeyPermissions(keys.privateKeyPath);
  assert.equal((await stat(keys.directory)).mode & 0o777, 0o700);
  assert.equal((await stat(keys.privateKeyPath)).mode & 0o777, 0o600);
  assert.equal((await readFile(keys.publicKeyPath, 'utf8')).trim(), keys.publicKeyDerBase64);
  const failedWindowsDirectory = join(root, 'windows-acl-failure');
  let windowsCommands = 0;
  await assert.rejects(generateFixtureKeypair(failedWindowsDirectory, {
    platform: 'win32',
    run: (file, args, options) => {
      windowsCommands++;
      assert.equal(file, 'powershell.exe');
      assert.ok(args.includes('-Command'));
      assert.ok(!args.some(arg => arg.includes(failedWindowsDirectory)));
      assert.equal(options.env.BRICKCIRCLE_PRIVATE_KEY_ACL_PATH, failedWindowsDirectory);
      assert.match(args.at(-1), /Get-Acl -LiteralPath \$path/);
      assert.doesNotMatch(args.at(-1), /icacls|whoami/);
      throw new Error('PowerShell ACL command failed closed');
    },
  }));
  assert.equal(windowsCommands, 1);
  assert.deepEqual(await readdir(failedWindowsDirectory), []);
  const windowsAclDirectory = join(root, 'windows-acl-valid');
  let validWindowsCalls = 0;
  const windowsKeys = await generateFixtureKeypair(windowsAclDirectory, {
    platform: 'win32',
    run: (_file, _args, options) => {
      validWindowsCalls++;
      return windowsAclOutput({
        directory: options.env.BRICKCIRCLE_PRIVATE_KEY_ACL_DIRECTORY === 'true',
      });
    },
  });
  assert.equal(validWindowsCalls, 4);
  assert.ok(await readFile(windowsKeys.privateKeyPath, 'utf8'));
  assert.equal((await readdir(windowsAclDirectory)).length, 2);
  const validFileAcl = JSON.parse(windowsAclOutput());
  assert.doesNotThrow(() => validateWindowsAclOutput(JSON.stringify(validFileAcl), { directory: false }));
  for (const override of [
    { rules: [...JSON.parse(windowsAclOutput()).rules, {
      sid: 'S-1-1-0', type: 'Allow', rights: 2032127, inherited: false,
      inheritanceFlags: 0, propagationFlags: 0,
    }] },
    { rules: JSON.parse(windowsAclOutput()).rules.map((rule, index) =>
      index === 1 ? { ...rule, type: 'Deny' } : rule) },
    { rules: JSON.parse(windowsAclOutput()).rules.map((rule, index) =>
      index === 0 ? { ...rule, inherited: true } : rule) },
    { rules: JSON.parse(windowsAclOutput()).rules.map((rule, index) =>
      index === 0 ? { ...rule, rights: 1179785 } : rule) },
    { ownerSid: 'S-1-5-21-100-200-300-2002' },
  ]) assert.throws(() => validateWindowsAclOutput(
    windowsAclOutput(override), { directory: false },
  ));

  const meta = metadata();
  const encrypted = encryptFixturePayload(payload(), keys.publicKeyDerBase64, meta);
  const metadataPath = join(root, 'metadata.json');
  const envelopePath = join(root, 'encrypted.json');
  await writeFile(metadataPath, JSON.stringify(meta));
  await writeFile(envelopePath, JSON.stringify(encrypted));
  const ghCalls = [];
  const gh = (file, args, options = {}) => {
    assert.equal(file, 'gh');
    ghCalls.push({ args, input: options.input });
    if (args[0] === 'secret' && args[1] === 'list')
      return JSON.stringify([]);
    if (args[0] === 'variable' && args[1] === 'list')
      return JSON.stringify([]);
    return '';
  };
  const imported = await importFixtures({
    envelopePath, metadataPath, privateKeyPath: keys.privateKeyPath,
    expectedDispatchSha: dispatchSha, expectedRunId: runId,
    confirmation: IMPORT_CONFIRMATION, gh,
  });
  assert.equal(imported.importedSecretNames.length, 5);
  const writes = ghCalls.filter(call => call.args[1] === 'set');
  assert.equal(writes.length, 6);
  const secretWrites = writes.filter(call => call.args[0] === 'secret');
  assert.equal(secretWrites.length, 5);
  assert.deepEqual(secretWrites.map(call => call.args[2]), [
    'BC_ADMIN_MFA_MEMBER_EMAIL', 'BC_ADMIN_MFA_MEMBER_PASSWORD',
    'BC_ADMIN_MFA_ADMIN_EMAIL', 'BC_ADMIN_MFA_ADMIN_PASSWORD',
    'BC_ADMIN_MFA_ADMIN_TOTP_SECRET',
  ]);
  assert.ok(secretWrites.every(call => typeof call.input === 'string' && call.input.length > 0));
  const expectedSecretInputs = [
    payload().member.email, payload().member.password, payload().admin.email,
    payload().admin.password, payload().admin.totpSecret,
  ];
  assert.ok(secretWrites.every((call, index) => call.input === expectedSecretInputs[index]));
  assert.ok(secretWrites.every(call => call.args.join(' ').includes(`--repo ${REPOSITORY}`) &&
    call.args.join(' ').includes(`--env ${ENVIRONMENT}`)));
  assert.ok(secretWrites.every(call => !call.args.some(arg =>
    [payload().member.password, payload().admin.password, totpSecret].includes(arg))));
  assert.ok(ghCalls.some(call => call.args[0] === 'variable' && call.args[1] === 'set' &&
    call.args.includes(runId)));

  const beforeMismatch = ghCalls.length;
  await assert.rejects(importFixtures({
    envelopePath, metadataPath, privateKeyPath: keys.privateKeyPath,
    expectedDispatchSha: 'f'.repeat(40), expectedRunId: runId,
    confirmation: IMPORT_CONFIRMATION, gh,
  }));
  assert.equal(ghCalls.length, beforeMismatch);
  await assert.rejects(importFixtures({
    envelopePath, metadataPath, privateKeyPath: keys.privateKeyPath,
    expectedDispatchSha: dispatchSha, expectedRunId: runId,
    confirmation: 'wrong-confirmation', gh,
  }));
  assert.equal(ghCalls.length, beforeMismatch);

  const existing = (file, args) => {
    if (args[0] === 'secret' && args[1] === 'list')
      return JSON.stringify([{ name: 'bc_admin_mfa_admin_password' }]);
    return JSON.stringify([]);
  };
  await assert.rejects(importFixtures({
    envelopePath, metadataPath, privateKeyPath: keys.privateKeyPath,
    expectedDispatchSha: dispatchSha, expectedRunId: runId,
    confirmation: IMPORT_CONFIRMATION, gh: existing,
  }), { message: 'Protected MFA fixture names already exist; refusing to overwrite' });
  const existingRunVariable = (file, args) => {
    if (args[0] === 'secret' && args[1] === 'list') return JSON.stringify([]);
    if (args[0] === 'variable' && args[1] === 'list')
      return JSON.stringify([{ name: 'BC_ADMIN_MFA_RUN_ID' }]);
    throw new Error('Unexpected write');
  };
  await assert.rejects(importFixtures({
    envelopePath, metadataPath, privateKeyPath: keys.privateKeyPath,
    expectedDispatchSha: dispatchSha, expectedRunId: runId,
    confirmation: IMPORT_CONFIRMATION, gh: existingRunVariable,
  }), { message: 'Protected MFA fixture names already exist; refusing to overwrite' });
});

test('manual workflow is main-only, environment-protected, read-only, pinned, and artifact-bounded', async () => {
  const workflow = await readFile('.github/workflows/hosted-admin-mfa-fixture-provisioning.yml', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const ci = await readFile('.github/workflows/ci-hardening.yml', 'utf8');
  const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.match(workflow, /on:\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request(?:_target)?\s*:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.workflow_ref == 'easwarkumarvb\/brickcircle\.club\/\.github\/workflows\/hosted-admin-mfa-fixture-provisioning\.yml@refs\/heads\/main'/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /environment: hosted-supabase-staging/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/);
  assert.ok(workflow.indexOf('Validate dispatch, project, run marker, and RSA key') <
    workflow.indexOf('BC_STAGING_SUPABASE_SECRET_KEY:'));
  assert.doesNotMatch(workflow, /GITHUB_(?:REPOSITORY|REF|EVENT_NAME|WORKFLOW_REF|SHA):/);
  assert.match(workflow, /uses: actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /uses: actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(workflow, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(workflow, /retention-days: 3/);
  assert.match(workflow, /admin-mfa-fixtures\.encrypted\.json/);
  assert.doesNotMatch(workflow, /service_role|pull_request_target|persist-credentials:\s*true|contents:\s*write/);
  assert.match(packageJson.scripts['test:hosted:admin-mfa'], /admin-mfa-fixture-provisioning\.test\.mjs/);
  assert.match(ci, /npm run test:hosted:admin-mfa/);
  assert.equal(vercel.git.deploymentEnabled.main, false);
  assert.equal(vercel.git.deploymentEnabled['dev/admin-mfa-fixtures-20261019'], false);
});
