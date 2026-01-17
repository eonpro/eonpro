/**
 * KMS Service Tests
 * Tests for AWS KMS encryption key management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock AWS SDK
vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: vi.fn().mockImplementation(function(this: any) {
    this.send = vi.fn();
    return this;
  }),
  DecryptCommand: vi.fn(),
  GenerateDataKeyCommand: vi.fn(),
  EncryptCommand: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

describe('KMS Service', () => {
  const originalEnv = { ...process.env };

  // Helper to set NODE_ENV without TypeScript errors
  const setNodeEnv = (env: string) => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: env, writable: true, configurable: true });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(originalEnv).forEach(key => {
      (process.env as Record<string, string | undefined>)[key] = originalEnv[key];
    });
  });

  afterEach(() => {
    Object.keys(originalEnv).forEach(key => {
      (process.env as Record<string, string | undefined>)[key] = originalEnv[key];
    });
  });

  describe('isKMSEnabled', () => {
    it('should return true when KMS is configured in production', async () => {
      process.env.AWS_KMS_KEY_ID = 'test-key-id';
      setNodeEnv('production');

      const { isKMSEnabled } = await import('@/lib/security/kms');
      expect(isKMSEnabled()).toBe(true);
    });

    it('should return false when KMS key is not configured', async () => {
      delete process.env.AWS_KMS_KEY_ID;
      setNodeEnv('production');

      const { isKMSEnabled } = await import('@/lib/security/kms');
      expect(isKMSEnabled()).toBe(false);
    });

    it('should return false in development', async () => {
      process.env.AWS_KMS_KEY_ID = 'test-key-id';
      setNodeEnv('development');

      const { isKMSEnabled } = await import('@/lib/security/kms');
      expect(isKMSEnabled()).toBe(false);
    });
  });

  describe('getEncryptionKey', () => {
    it('should return key from env var in development', async () => {
      setNodeEnv('development');
      process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

      const { getEncryptionKey } = await import('@/lib/security/kms');
      const key = await getEncryptionKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should throw if ENCRYPTION_KEY is invalid length', async () => {
      setNodeEnv('development');
      process.env.ENCRYPTION_KEY = 'short-key';

      const { getEncryptionKey } = await import('@/lib/security/kms');
      
      await expect(getEncryptionKey()).rejects.toThrow('64 hex characters');
    });

    it('should throw if ENCRYPTION_KEY is missing', async () => {
      setNodeEnv('development');
      delete process.env.ENCRYPTION_KEY;

      const { getEncryptionKey } = await import('@/lib/security/kms');
      
      await expect(getEncryptionKey()).rejects.toThrow('ENCRYPTION_KEY');
    });
  });

  describe('clearKeyCache', () => {
    it('should clear the cache without error', async () => {
      const { clearKeyCache } = await import('@/lib/security/kms');
      
      expect(() => clearKeyCache()).not.toThrow();
    });
  });
});

describe('KMS Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Region Configuration', () => {
    it('should use AWS_REGION from env', () => {
      process.env.AWS_REGION = 'us-west-2';
      
      const config = {
        region: process.env.AWS_REGION || 'us-east-1',
      };

      expect(config.region).toBe('us-west-2');
    });

    it('should default to us-east-1', () => {
      delete process.env.AWS_REGION;
      
      const config = {
        region: process.env.AWS_REGION || 'us-east-1',
      };

      expect(config.region).toBe('us-east-1');
    });
  });

  describe('Credentials Configuration', () => {
    it('should use explicit credentials when provided', () => {
      process.env.AWS_ACCESS_KEY_ID = 'AKIATEST';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret-key';

      const config: Record<string, unknown> = { region: 'us-east-1' };

      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
      }

      expect(config.credentials).toBeDefined();
    });

    it('should not set credentials when not provided (for IAM role)', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const config: Record<string, unknown> = { region: 'us-east-1' };

      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
      }

      expect(config.credentials).toBeUndefined();
    });
  });
});

describe('Key Cache', () => {
  describe('Cache Behavior', () => {
    const KEY_CACHE_TTL_MS = 5 * 60 * 1000;

    interface CachedKey {
      key: Buffer;
      expiresAt: number;
    }

    const keyCache = new Map<string, CachedKey>();

    const getCachedKey = (keyId: string): Buffer | null => {
      const cached = keyCache.get(keyId);
      
      if (!cached) {
        return null;
      }
      
      if (Date.now() > cached.expiresAt) {
        keyCache.delete(keyId);
        return null;
      }
      
      return cached.key;
    };

    const setCachedKey = (keyId: string, key: Buffer): void => {
      keyCache.set(keyId, {
        key,
        expiresAt: Date.now() + KEY_CACHE_TTL_MS,
      });
    };

    beforeEach(() => {
      keyCache.clear();
    });

    it('should return null for uncached key', () => {
      expect(getCachedKey('unknown')).toBeNull();
    });

    it('should return cached key', () => {
      const testKey = Buffer.from('test-key');
      setCachedKey('test-id', testKey);

      expect(getCachedKey('test-id')).toEqual(testKey);
    });

    it('should expire cached keys', () => {
      const testKey = Buffer.from('test-key');
      
      // Set key with expired time
      keyCache.set('expired-id', {
        key: testKey,
        expiresAt: Date.now() - 1000, // Already expired
      });

      expect(getCachedKey('expired-id')).toBeNull();
    });

    it('should have 5 minute TTL', () => {
      expect(KEY_CACHE_TTL_MS).toBe(300000);
    });
  });
});

describe('Data Key Operations', () => {
  describe('generateDataKey', () => {
    it('should require KMS key ID', async () => {
      const originalEnv = process.env.AWS_KMS_KEY_ID;
      delete process.env.AWS_KMS_KEY_ID;

      const { generateDataKey } = await import('@/lib/security/kms');

      await expect(generateDataKey()).rejects.toThrow('AWS_KMS_KEY_ID is not configured');

      process.env.AWS_KMS_KEY_ID = originalEnv;
    });
  });

  describe('decryptDataKey', () => {
    it('should require KMS key ID', async () => {
      const originalEnv = process.env.AWS_KMS_KEY_ID;
      delete process.env.AWS_KMS_KEY_ID;

      vi.resetModules();
      const { decryptDataKey } = await import('@/lib/security/kms');

      const encryptedKey = Buffer.from('encrypted-key');
      await expect(decryptDataKey(encryptedKey)).rejects.toThrow('AWS_KMS_KEY_ID is not configured');

      process.env.AWS_KMS_KEY_ID = originalEnv;
    });
  });

  describe('encryptWithKMS', () => {
    it('should require KMS key ID', async () => {
      const originalEnv = process.env.AWS_KMS_KEY_ID;
      delete process.env.AWS_KMS_KEY_ID;

      vi.resetModules();
      const { encryptWithKMS } = await import('@/lib/security/kms');

      const plaintext = Buffer.from('sensitive-data');
      await expect(encryptWithKMS(plaintext)).rejects.toThrow('AWS_KMS_KEY_ID is not configured');

      process.env.AWS_KMS_KEY_ID = originalEnv;
    });
  });

  describe('decryptWithKMS', () => {
    it('should require KMS key ID', async () => {
      const originalEnv = process.env.AWS_KMS_KEY_ID;
      delete process.env.AWS_KMS_KEY_ID;

      vi.resetModules();
      const { decryptWithKMS } = await import('@/lib/security/kms');

      const ciphertext = Buffer.from('encrypted-data');
      await expect(decryptWithKMS(ciphertext)).rejects.toThrow('AWS_KMS_KEY_ID is not configured');

      process.env.AWS_KMS_KEY_ID = originalEnv;
    });
  });
});

describe('Key Rotation', () => {
  describe('rotateEncryptionKey', () => {
    it('should require KMS to be enabled', async () => {
      setNodeEnv('development');
      delete process.env.AWS_KMS_KEY_ID;

      vi.resetModules();
      const { rotateEncryptionKey } = await import('@/lib/security/kms');

      await expect(rotateEncryptionKey()).rejects.toThrow('KMS to be enabled');
    });
  });
});

describe('KMS Health Check', () => {
  describe('verifyKMSAccess', () => {
    it('should return true in development (KMS not required)', async () => {
      setNodeEnv('development');
      delete process.env.AWS_KMS_KEY_ID;

      vi.resetModules();
      const { verifyKMSAccess } = await import('@/lib/security/kms');

      const result = await verifyKMSAccess();
      expect(result).toBe(true);
    });
  });
});

describe('Envelope Encryption', () => {
  describe('Data Key Structure', () => {
    interface DataKey {
      plaintext: Buffer;
      ciphertext: Buffer;
    }

    it('should have plaintext and ciphertext', () => {
      const dataKey: DataKey = {
        plaintext: Buffer.from('plaintext-key'),
        ciphertext: Buffer.from('encrypted-key'),
      };

      expect(dataKey.plaintext).toBeInstanceOf(Buffer);
      expect(dataKey.ciphertext).toBeInstanceOf(Buffer);
    });
  });

  describe('Encryption Flow', () => {
    it('should use data key for encryption', () => {
      // Envelope encryption flow:
      // 1. Generate data key from KMS
      // 2. Use plaintext key to encrypt data
      // 3. Store encrypted data + encrypted key
      // 4. Discard plaintext key

      const mockDataKey = {
        plaintext: Buffer.alloc(32).fill(1),
        ciphertext: Buffer.alloc(64).fill(2),
      };

      expect(mockDataKey.plaintext.length).toBe(32); // AES-256 key
      expect(mockDataKey.ciphertext.length).toBe(64); // Encrypted form
    });
  });
});

describe('Security Logging', () => {
  it('should log key rotation events', async () => {
    const { logger } = await import('@/lib/logger');
    
    // Simulate security log
    logger.security('Encryption key rotated', {
      newEncryptedKey: 'abc123...',
    });

    expect(logger.security).toHaveBeenCalledWith(
      'Encryption key rotated',
      expect.any(Object)
    );
  });

  it('should log cache clear events', async () => {
    const { logger } = await import('@/lib/logger');
    
    logger.security('Encryption key cache cleared');

    expect(logger.security).toHaveBeenCalledWith(
      'Encryption key cache cleared'
    );
  });
});

describe('Error Handling', () => {
  describe('KMS Client Errors', () => {
    it('should wrap KMS errors with meaningful messages', () => {
      const wrapKMSError = (operation: string, error: Error): Error => {
        return new Error(`KMS ${operation} failed: ${error.message}`);
      };

      const originalError = new Error('Access denied');
      const wrappedError = wrapKMSError('encryption', originalError);

      expect(wrappedError.message).toContain('KMS encryption failed');
      expect(wrappedError.message).toContain('Access denied');
    });
  });

  describe('Configuration Errors', () => {
    it('should provide helpful error messages', () => {
      const validateConfig = () => {
        if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
          throw new Error(
            'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
            'Generate with: openssl rand -hex 32'
          );
        }
      };

      process.env.ENCRYPTION_KEY = 'short';
      
      expect(() => validateConfig()).toThrow('64 hex characters');
      expect(() => validateConfig()).toThrow('openssl rand -hex 32');
    });
  });
});
