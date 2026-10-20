#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  ENVIRONMENT, IMPORT_CONFIRMATION, REPOSITORY, UUID_RE,
  decryptFixtureEnvelope, validateOwnershipMetadata,
} from './admin-mfa-fixture-crypto.mjs';
import { loadPrivateKey } from './admin-mfa-keypair.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const IMPORT_TARGETS = Object.freeze([
  ['BC_ADMIN_MFA_MEMBER_EMAIL', payload => payload.member.email],
  ['BC_ADMIN_MFA_MEMBER_PASSWORD', payload => payload.member.password],
  ['BC_ADMIN_MFA_ADMIN_EMAIL', payload => payload.admin.email],
  ['BC_ADMIN_MFA_ADMIN_PASSWORD', payload => payload.admin.password],
  ['BC_ADMIN_MFA_ADMIN_TOTP_SECRET', payload => payload.admin.totpSecret],
]);
const VARIABLE_NAME = 'BC_ADMIN_MFA_RUN_ID';

function commandGh(args, { input, gh = execFileSync } = {}) {
  try {
    return gh('gh', args, {
      encoding: 'utf8',
      stdio: input === undefined ? ['ignore', 'pipe', 'ignore'] : ['pipe', 'pipe', 'ignore'],
      ...(input === undefined ? {} : { input }),
    });
  } catch {
    throw new Error('GitHub protected-environment operation failed; secret values withheld');
  }
}

function listNames(output) {
  let rows;
  try {
    rows = JSON.parse(output);
  } catch {
    throw new Error('GitHub protected-environment inventory was invalid');
  }
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.name !== 'string'))
    throw new Error('GitHub protected-environment inventory was invalid');
  return new Set(rows.map(row => row.name.toUpperCase()));
}

async function readBoundedJson(path, maxBytes) {
  const info = await stat(path);
  if (!info.isFile() || info.size <= 0 || info.size > maxBytes)
    throw new Error('Fixture import file size is invalid');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('Fixture import file is invalid');
  }
}

export async function importFixtures({
  envelopePath, metadataPath, privateKeyPath, expectedDispatchSha, expectedRunId,
  confirmation, gh = execFileSync,
}) {
  if (confirmation !== IMPORT_CONFIRMATION ||
      typeof expectedDispatchSha !== 'string' || !SHA_RE.test(expectedDispatchSha) ||
      typeof expectedRunId !== 'string' || !UUID_RE.test(expectedRunId))
    throw new Error('Explicit import confirmation and independently supplied bindings required');

  const [metadata, envelope, privateKey] = await Promise.all([
    readBoundedJson(metadataPath, 64 * 1024),
    readBoundedJson(envelopePath, 1024 * 1024),
    loadPrivateKey(privateKeyPath),
  ]);
  validateOwnershipMetadata(metadata);
  if (metadata.dispatchSha !== expectedDispatchSha || metadata.runId !== expectedRunId)
    throw new Error('Fixture import provenance does not match the independent bindings');
  const payload = decryptFixtureEnvelope(envelope, privateKey, metadata);
  if (payload.runId !== expectedRunId)
    throw new Error('Fixture run binding mismatch');

  const destination = ['--repo', REPOSITORY, '--env', ENVIRONMENT];
  const secretOutput = commandGh(['secret', 'list', ...destination, '--json', 'name'], { gh });
  const variableOutput = commandGh(['variable', 'list', ...destination, '--json', 'name'], { gh });
  const existingSecrets = listNames(secretOutput);
  const existingVariables = listNames(variableOutput);
  if (IMPORT_TARGETS.some(([name]) => existingSecrets.has(name.toUpperCase())) ||
      existingVariables.has(VARIABLE_NAME.toUpperCase()))
    throw new Error('Protected MFA fixture names already exist; refusing to overwrite');

  try {
    for (const [name, valueFor] of IMPORT_TARGETS) {
      commandGh(['secret', 'set', name, ...destination], {
        input: valueFor(payload), gh,
      });
    }
    commandGh([
      'variable', 'set', VARIABLE_NAME, '--body', expectedRunId, ...destination,
    ], { gh });
  } catch {
    throw new Error('Protected fixture import incomplete; inspect environment names before retrying');
  }
  return { importedSecretNames: IMPORT_TARGETS.map(([name]) => name), importedVariableName: VARIABLE_NAME };
}

function argsFromProcess(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || values[key])
      throw new Error('Import arguments are invalid');
    values[key] = value;
    index++;
  }
  const required = [
    '--payload', '--metadata', '--private-key', '--expected-dispatch-sha',
    '--expected-run-id', '--confirm',
  ];
  if (Object.keys(values).length !== required.length ||
      required.some(key => typeof values[key] !== 'string'))
    throw new Error('Import arguments are invalid');
  return {
    envelopePath: values['--payload'],
    metadataPath: values['--metadata'],
    privateKeyPath: values['--private-key'],
    expectedDispatchSha: values['--expected-dispatch-sha'],
    expectedRunId: values['--expected-run-id'],
    confirmation: values['--confirm'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await importFixtures(argsFromProcess(process.argv.slice(2)));
    console.log(`Imported ${result.importedSecretNames.length} protected staging secrets and one run variable.`);
  } catch (error) {
    const message = error instanceof Error && [
      'Explicit import confirmation and independently supplied bindings required',
      'Fixture import provenance does not match the independent bindings',
      'Protected MFA fixture names already exist; refusing to overwrite',
      'Protected fixture import incomplete; inspect environment names before retrying',
    ].includes(error.message) ? error.message : 'Protected staging fixture import rejected; values withheld.';
    console.error(message);
    process.exitCode = 1;
  }
}
