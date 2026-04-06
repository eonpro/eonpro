import crypto from 'crypto';

interface EncryptedCacheEnvelope {
  __lfEncV: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

function getEncryptionKey(): Buffer | null {
  const raw = process.env.REDIS_CACHE_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) return null;
  // Deterministic 32-byte key derivation so operators can rotate source secret.
  return crypto.createHash('sha256').update(raw).digest();
}

function isEnvelope(value: unknown): value is EncryptedCacheEnvelope {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<EncryptedCacheEnvelope>;
  return (
    maybe.__lfEncV === 1 &&
    maybe.alg === 'aes-256-gcm' &&
    typeof maybe.iv === 'string' &&
    typeof maybe.tag === 'string' &&
    typeof maybe.data === 'string'
  );
}

export function encodeSensitiveCacheValue(value: unknown): unknown {
  const key = getEncryptionKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    __lfEncV: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  } satisfies EncryptedCacheEnvelope;
}

export function decodeSensitiveCacheValue<T>(value: unknown): T | null {
  if (!isEnvelope(value)) {
    return value as T;
  }

  const key = getEncryptionKey();
  if (!key) return null;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}
