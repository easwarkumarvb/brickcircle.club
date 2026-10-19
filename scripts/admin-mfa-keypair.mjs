#!/usr/bin/env node
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WINDOWS_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$path = $env:BRICKCIRCLE_PRIVATE_KEY_ACL_PATH
if ([string]::IsNullOrWhiteSpace($path)) { throw 'ACL path missing' }
$acl = Get-Acl -LiteralPath $path
if ($env:BRICKCIRCLE_PRIVATE_KEY_ACL_MODE -eq 'restrict') {
  $acl.SetAccessRuleProtection($true, $false)
  @($acl.Access) | ForEach-Object { [void]$acl.RemoveAccessRuleSpecific($_) }
  $ownerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
  $access = [System.Security.AccessControl.AccessControlType]::Allow
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  if ($env:BRICKCIRCLE_PRIVATE_KEY_ACL_DIRECTORY -eq 'true') {
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
      [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  }
  $propagation = [System.Security.AccessControl.PropagationFlags]::None
  $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $ownerSid, $rights, $inheritance, $propagation, $access))
  $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $systemSid, $rights, $inheritance, $propagation, $access))
  Set-Acl -LiteralPath $path -AclObject $acl
  $acl = Get-Acl -LiteralPath $path
}
$ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$fullControl = [int][System.Security.AccessControl.FileSystemRights]::FullControl
$rules = @($acl.GetAccessRules(
  $true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
    [ordered]@{
      sid = $_.IdentityReference.Value
      type = $_.AccessControlType.ToString()
      rights = [int]$_.FileSystemRights
      inherited = [bool]$_.IsInherited
      inheritanceFlags = [int]$_.InheritanceFlags
      propagationFlags = [int]$_.PropagationFlags
    }
  })
[ordered]@{
  ownerSid = $ownerSid
  currentSid = $currentSid
  fullControlRights = $fullControl
  rules = [object[]]$rules
} | ConvertTo-Json -Depth 5 -Compress
`;
const WINDOWS_FULL_CONTROL_RIGHTS = 2032127;

function validateWindowsAclResult(output, { directory }) {
  let acl;
  try {
    acl = JSON.parse(output);
  } catch {
    throw new Error('Owner-only Windows ACL could not be established');
  }
  const ownerSid = acl?.ownerSid;
  const currentSid = acl?.currentSid;
  const fullControlRights = acl?.fullControlRights;
  const expectedInheritance = directory ? 3 : 0;
  const rules = acl?.rules;
  if (typeof ownerSid !== 'string' || ownerSid !== currentSid ||
      typeof currentSid !== 'string' || !/^S-\d-(?:\d+-)+\d+$/.test(currentSid) ||
      !Array.isArray(rules) || rules.length !== 2 ||
      fullControlRights !== WINDOWS_FULL_CONTROL_RIGHTS)
    throw new Error('Owner-only Windows ACL could not be established');
  const expectedSids = new Set([currentSid, 'S-1-5-18']);
  if (rules.some(rule => !rule || !expectedSids.has(rule.sid) ||
      rule.type !== 'Allow' || rule.rights !== fullControlRights ||
      rule.inherited !== false || rule.inheritanceFlags !== expectedInheritance ||
      rule.propagationFlags !== 0) ||
      new Set(rules.map(rule => rule.sid)).size !== 2)
    throw new Error('Owner-only Windows ACL could not be established');
}

function runWindowsAcl(path, { directory, mode, run = execFileSync } = {}) {
  let output;
  try {
    output = run('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_ACL_SCRIPT,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        BRICKCIRCLE_PRIVATE_KEY_ACL_PATH: path,
        BRICKCIRCLE_PRIVATE_KEY_ACL_MODE: mode,
        BRICKCIRCLE_PRIVATE_KEY_ACL_DIRECTORY: String(directory),
      },
    });
  } catch {
    throw new Error('Owner-only Windows ACL could not be established');
  }
  validateWindowsAclResult(String(output).trim(), { directory });
}

export function validateWindowsAclOutput(output, options) {
  validateWindowsAclResult(output, options);
}

function restrictWindowsAcl(path, options) {
  runWindowsAcl(path, { ...options, mode: 'restrict' });
}

function validateWindowsAcl(path, options) {
  runWindowsAcl(path, { ...options, mode: 'verify' });
}

async function assertPosixMode(path, mode, description) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || (stat.mode & 0o777) !== mode)
    throw new Error(`${description} permissions are not owner-only`);
}

export async function assertPrivateKeyPermissions(privateKeyPath, {
  platform = process.platform, run = execFileSync,
} = {}) {
  const keyInfo = await lstat(privateKeyPath);
  const directory = dirname(resolve(privateKeyPath));
  const directoryInfo = await lstat(directory);
  if (keyInfo.isSymbolicLink() || !keyInfo.isFile() ||
      directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory())
    throw new Error('Private key path must be a regular file in a real directory');
  if (platform === 'win32') {
    validateWindowsAcl(directory, { directory: true, run });
    validateWindowsAcl(privateKeyPath, { directory: false, run });
  } else {
    if ((directoryInfo.mode & 0o777) !== 0o700 || (keyInfo.mode & 0o777) !== 0o600)
      throw new Error('Private key permissions must be POSIX 0700/0600');
  }
}

async function writeExclusive(path, contents, mode) {
  const handle = await open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, mode);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function generateFixtureKeypair(directory, {
  platform = process.platform, run = execFileSync,
} = {}) {
  const target = resolve(directory);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 });
  const targetInfo = await lstat(target);
  if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory())
    throw new Error('Key directory must be a new local directory');
  if (platform === 'win32') restrictWindowsAcl(target, { directory: true, run });
  else {
    await chmod(target, 0o700);
    await assertPosixMode(target, 0o700, 'Key directory');
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const privateKeyPath = join(target, 'private-key.pem');
  const publicKeyPath = join(target, 'public-key.der.b64');
  await writeExclusive(privateKeyPath, privateKey, 0o600);
  if (platform === 'win32') restrictWindowsAcl(privateKeyPath, { directory: false, run });
  else {
    await chmod(privateKeyPath, 0o600);
    await assertPosixMode(privateKeyPath, 0o600, 'Private key');
  }
  await writeExclusive(publicKeyPath, `${publicKey.toString('base64')}\n`, 0o600);
  await assertPrivateKeyPermissions(privateKeyPath, { platform, run });
  return {
    directory: target,
    privateKeyPath,
    publicKeyPath,
    publicKeyDerBase64: publicKey.toString('base64'),
  };
}

export async function loadPrivateKey(privateKeyPath, options) {
  await assertPrivateKeyPermissions(privateKeyPath, options);
  return readFile(privateKeyPath, 'utf8');
}

async function main(argv) {
  let directory;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--dir' && argv[index + 1]) {
      directory = argv[++index];
    } else {
      throw new Error('Use --dir with a new local key directory');
    }
  }
  directory ??= join(homedir(), '.brickcircle', 'admin-mfa-fixtures', randomUUID());
  const result = await generateFixtureKeypair(directory);
  console.error(`Private key saved locally with owner-only permissions: ${result.privateKeyPath}`);
  console.log(result.publicKeyDerBase64);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    console.error('RSA fixture keypair creation failed closed; no public key emitted.');
    process.exitCode = 1;
  });
}
