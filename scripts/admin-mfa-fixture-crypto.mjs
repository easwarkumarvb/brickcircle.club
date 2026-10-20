#!/usr/bin/env node
import {
  createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey,
  privateDecrypt, publicEncrypt, randomBytes, constants as cryptoConstants,
} from 'node:crypto';

export const REPOSITORY = 'easwarkumarvb/brickcircle.club';
export const ENVIRONMENT = 'hosted-supabase-staging';
export const PROJECT_REF = 'tteyypklldgwwicrgjzt';
export const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
export const WORKFLOW_PATH = '.github/workflows/hosted-admin-mfa-fixture-provisioning.yml';
export const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;
export const PROVISION_CONFIRMATION = 'PROVISION_STAGING_ADMIN_MFA_FIXTURES';
export const IMPORT_CONFIRMATION = 'IMPORT_STAGING_ADMIN_MFA_FIXTURES';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{40}$/;
const PUBLIC_KEY_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const SECRET_KEY_RE = /^sb_secret_[A-Za-z0-9_-]{20,}$/;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parsePublicKeyDerBase64(value) {
  if (typeof value !== 'string' || value.length > 2048 || value.includes('\n') ||
      value.includes('\r') || !PUBLIC_KEY_RE.test(value))
    throw new Error('A single-line RSA public key in base64 DER format is required');
  const der = Buffer.from(value, 'base64');
  if (der.toString('base64') !== value || der.length < 300 || der.length > 1024)
    throw new Error('A valid RSA public key in base64 DER format is required');
  let key;
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    throw new Error('A valid RSA public key in base64 DER format is required');
  }
  if (key.asymmetricKeyType !== 'rsa' ||
      ![3072, 4096].includes(key.asymmetricKeyDetails?.modulusLength))
    throw new Error('RSA public key must be 3072 or 4096 bits');
  return { key, der, fingerprint: fingerprintKey(key) };
}

export function fingerprintKey(key) {
  const publicKey = key.type === 'private' ? createPublicKey(key) : key;
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return createHash('sha256').update(der).digest('hex');
}

export function validateServerKey(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 32 ||
      value.length > 8192 || value.startsWith('sb_publishable_'))
    throw new Error('A staging Supabase server credential is required');
  if (SECRET_KEY_RE.test(value)) return value;
  try {
    const pieces = value.split('.');
    const payload = pieces.length === 3
      ? JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'))
      : null;
    if (payload?.role === 'service_role') return value;
  } catch {
    throw new Error('A staging Supabase server credential is required');
  }
  throw new Error('A staging Supabase server credential is required');
}

export function validateOwnershipMetadata(metadata) {
  const exactKeys = [
    'schema', 'repository', 'environment', 'workflowRef', 'eventName', 'ref',
    'dispatchSha', 'projectRef', 'runId', 'publicKeyFingerprint', 'result',
    'member', 'admin',
  ];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      Object.keys(metadata).sort().join(',') !== exactKeys.sort().join(','))
    throw new Error('Fixture ownership metadata is invalid');
  if (metadata.schema !== 'brickcircle.admin-mfa-fixtures.v1' ||
      metadata.repository !== REPOSITORY || metadata.environment !== ENVIRONMENT ||
      metadata.workflowRef !== WORKFLOW_REF || metadata.eventName !== 'workflow_dispatch' ||
      metadata.ref !== 'refs/heads/main' || metadata.projectRef !== PROJECT_REF ||
      !SHA_RE.test(metadata.dispatchSha) || !UUID_RE.test(metadata.runId) ||
      !/^[0-9a-f]{64}$/.test(metadata.publicKeyFingerprint) ||
      metadata.result !== 'provisioned')
    throw new Error('Fixture ownership metadata is invalid');
  if (!metadata.member || Object.keys(metadata.member).sort().join(',') !== 'userId' ||
      !UUID_RE.test(metadata.member.userId) ||
      !metadata.admin || Object.keys(metadata.admin).sort().join(',') !== 'factorId,userId,verified' ||
      !UUID_RE.test(metadata.admin.userId) || !UUID_RE.test(metadata.admin.factorId) ||
      metadata.admin.verified !== true ||
      metadata.member.userId.toLowerCase() === metadata.admin.userId.toLowerCase())
    throw new Error('Fixture ownership metadata is invalid');
  return metadata;
}

export function validateDecryptedPayload(payload, metadata) {
  const exactTopKeys = ['version', 'runId', 'member', 'admin'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).sort().join(',') !== exactTopKeys.sort().join(',') ||
      payload.version !== 1 || payload.runId !== metadata.runId ||
      !payload.member || Object.keys(payload.member).sort().join(',') !== 'email,password,userId' ||
      !payload.admin || Object.keys(payload.admin).sort().join(',') !==
        'email,factorId,password,totpSecret,userId')
    throw new Error('Encrypted fixture payload is invalid');
  if (payload.member.userId !== metadata.member.userId ||
      payload.admin.userId !== metadata.admin.userId ||
      payload.admin.factorId !== metadata.admin.factorId ||
      !validFixtureEmail(payload.member.email) || !validFixtureEmail(payload.admin.email) ||
      payload.member.email.toLowerCase() === payload.admin.email.toLowerCase() ||
      typeof payload.member.password !== 'string' || payload.member.password.length < 32 ||
      typeof payload.admin.password !== 'string' || payload.admin.password.length < 32 ||
      typeof payload.admin.totpSecret !== 'string' ||
      !/^[A-Z2-7]{16,}=*$/i.test(payload.admin.totpSecret))
    throw new Error('Encrypted fixture payload is invalid');
  return payload;
}

export function validFixtureEmail(email) {
  return typeof email === 'string' && email.length <= 254 &&
    /^[a-z0-9][a-z0-9.-]{0,62}@example\.test$/i.test(email);
}

export function encryptFixturePayload(payload, publicKeyDerBase64, metadata) {
  const { key, fingerprint } = parsePublicKeyDerBase64(publicKeyDerBase64);
  validateOwnershipMetadata(metadata);
  if (fingerprint !== metadata.publicKeyFingerprint) throw new Error('Public key binding mismatch');
  validateDecryptedPayload(payload, metadata);
  const contentKey = randomBytes(32);
  const iv = randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  try {
    const cipher = createCipheriv('aes-256-gcm', contentKey, iv);
    cipher.setAAD(Buffer.from(canonicalJson(metadata), 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      version: 1,
      algorithm: 'RSA-OAEP-SHA256+A256GCM',
      keyFingerprint: fingerprint,
      binding: metadata,
      wrappedKey: publicEncrypt({
        key, oaepHash: 'sha256', padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      }, contentKey).toString('base64'),
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  } finally {
    contentKey.fill(0);
    plaintext.fill(0);
  }
}

export function decryptFixtureEnvelope(envelope, privateKeyPem, externalMetadata) {
  validateOwnershipMetadata(externalMetadata);
  const exactKeys = [
    'version', 'algorithm', 'keyFingerprint', 'binding', 'wrappedKey', 'iv',
    'ciphertext', 'tag',
  ];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(',') !== exactKeys.sort().join(',') ||
      envelope.version !== 1 || envelope.algorithm !== 'RSA-OAEP-SHA256+A256GCM' ||
      canonicalJson(envelope.binding) !== canonicalJson(externalMetadata) ||
      !/^[0-9a-f]{64}$/.test(envelope.keyFingerprint) ||
      envelope.keyFingerprint !== externalMetadata.publicKeyFingerprint)
    throw new Error('Encrypted fixture binding is invalid');
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error('Fixture decryption key is invalid');
  }
  if (privateKey.asymmetricKeyType !== 'rsa' ||
      ![3072, 4096].includes(privateKey.asymmetricKeyDetails?.modulusLength) ||
      fingerprintKey(privateKey) !== envelope.keyFingerprint)
    throw new Error('Fixture decryption key does not match the public key');
  let contentKey;
  let plaintext;
  try {
    contentKey = privateDecrypt({
      key: privateKey, oaepHash: 'sha256',
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
    }, Buffer.from(envelope.wrappedKey, 'base64'));
    if (contentKey.length !== 32) throw new Error();
    const decipher = createDecipheriv(
      'aes-256-gcm', contentKey, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(canonicalJson(externalMetadata), 'utf8'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return validateDecryptedPayload(JSON.parse(plaintext.toString('utf8')), externalMetadata);
  } catch {
    throw new Error('Encrypted fixture failed integrity or binding validation');
  } finally {
    contentKey?.fill(0);
    plaintext?.fill(0);
  }
}
