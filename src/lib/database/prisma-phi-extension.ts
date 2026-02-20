/**
 * Prisma PHI Encryption Extension
 * ================================
 *
 * Automatic field-level encryption/decryption for PHI (Protected Health Information).
 * Wraps Prisma query operations so that marked fields are transparently encrypted
 * on write (create/update/upsert) and decrypted on read (find/findMany/etc.).
 *
 * Usage:
 *   import { PHI_FIELD_MAP } from './prisma-phi-extension';
 *   // The extension is applied via createPrismaPhiExtension() — see bottom of file.
 *
 * Design decisions:
 *   - Encryption is synchronous (AES-256-GCM with env key) to avoid blocking the event loop
 *     any longer than necessary. KMS-backed async encryption is handled at the repository
 *     layer for explicit key rotation workflows.
 *   - Decryption failures are graceful: fields that fail to decrypt return '[Encrypted]'
 *     so the application never exposes raw ciphertext to the UI.
 *   - The extension only processes models listed in PHI_FIELD_MAP — all other models
 *     pass through untouched with zero overhead.
 *
 * @module database/prisma-phi-extension
 * @security CRITICAL — handles all automatic PHI encryption
 */

import { encryptPHI, decryptPHI, isEncrypted } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';

// ============================================================================
// PHI Field Map — declares which fields on which models contain PHI
// ============================================================================

/**
 * Map of Prisma model names (lowercase) to the fields that must be encrypted.
 * Add new models here when they store PHI.
 */
export const PHI_FIELD_MAP: Record<string, readonly string[]> = {
  patient: [
    'firstName',
    'lastName',
    'email',
    'phone',
    'dob',
    'address1',
    'address2',
    'city',
    'state',
    'zip',
  ],
} as const;

// Pre-compute a Set of model names that have PHI for fast lookup
const PHI_MODELS = new Set(Object.keys(PHI_FIELD_MAP));

// ============================================================================
// Encryption / Decryption Helpers
// ============================================================================

/**
 * Encrypt PHI fields in a data object before writing to the database.
 * Only encrypts string values that are not already encrypted.
 */
function encryptFields(
  data: Record<string, unknown> | undefined | null,
  fields: readonly string[]
): Record<string, unknown> | undefined | null {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };
  for (const field of fields) {
    const value = result[field];
    if (value != null && typeof value === 'string' && value.length > 0) {
      if (!isEncrypted(value)) {
        result[field] = encryptPHI(value);
      }
    }
  }
  return result;
}

/**
 * Decrypt PHI fields in a result object after reading from the database.
 * Handles decryption failures gracefully with '[Encrypted]' placeholders.
 */
function decryptFields<T>(result: T, fields: readonly string[]): T {
  if (!result || typeof result !== 'object') return result;

  const obj = result as Record<string, unknown>;
  const decrypted = { ...obj };

  for (const field of fields) {
    const value = decrypted[field];
    if (value != null && typeof value === 'string' && value.length > 0) {
      try {
        decrypted[field] = decryptPHI(value);
      } catch {
        logger.warn('PHI auto-decryption failed', { field });
        decrypted[field] = '[Encrypted]';
      }
    }
  }

  return decrypted as T;
}

/**
 * Decrypt an array of results.
 */
function decryptResultArray<T>(results: T[], fields: readonly string[]): T[] {
  return results.map((r) => decryptFields(r, fields));
}

/**
 * Decrypt a single result or null.
 */
function decryptResultOrNull<T>(result: T | null, fields: readonly string[]): T | null {
  if (result == null) return result;
  return decryptFields(result, fields);
}

// ============================================================================
// Prisma Extension Factory
// ============================================================================

/**
 * Get PHI fields for a model, or null if the model has no PHI.
 */
function getPhiFields(model: string | undefined): readonly string[] | null {
  if (!model) return null;
  const key = model.toLowerCase();
  if (!PHI_MODELS.has(key)) return null;
  return PHI_FIELD_MAP[key];
}

/**
 * Creates Prisma middleware-style hooks for automatic PHI encryption/decryption.
 *
 * This returns an object of operation handlers that can be composed with
 * Prisma's $use middleware or the newer $extends API.
 *
 * Current approach: middleware ($use) for compatibility with the existing
 * PrismaWithClinicFilter wrapper. The extension intercepts before the query
 * hits the database (encrypt) and after the result comes back (decrypt).
 */
export function createPhiMiddleware() {
  return async function phiMiddleware(
    params: {
      model?: string;
      action: string;
      args: Record<string, unknown>;
    },
    next: (params: Record<string, unknown>) => Promise<unknown>
  ): Promise<unknown> {
    const fields = getPhiFields(params.model);

    // Fast path: model has no PHI fields — pass through with zero overhead
    if (!fields) {
      return next(params as unknown as Record<string, unknown>);
    }

    const action = params.action;
    const args = { ...params.args };

    // ── ENCRYPT on write operations ──────────────────────────────────────
    if (action === 'create' || action === 'createMany' || action === 'createManyAndReturn') {
      if (args.data) {
        if (Array.isArray(args.data)) {
          args.data = args.data.map((item: Record<string, unknown>) =>
            encryptFields(item, fields)
          );
        } else {
          args.data = encryptFields(args.data as Record<string, unknown>, fields);
        }
      }
    } else if (action === 'update' || action === 'updateMany') {
      if (args.data) {
        args.data = encryptFields(args.data as Record<string, unknown>, fields);
      }
    } else if (action === 'upsert') {
      if (args.create) {
        args.create = encryptFields(args.create as Record<string, unknown>, fields);
      }
      if (args.update) {
        args.update = encryptFields(args.update as Record<string, unknown>, fields);
      }
    }

    // Execute the query
    const modifiedParams = { ...params, args };
    const result = await next(modifiedParams as unknown as Record<string, unknown>);

    // ── DECRYPT on read operations ───────────────────────────────────────
    if (result == null) return result;

    const readActions = [
      'findUnique',
      'findUniqueOrThrow',
      'findFirst',
      'findFirstOrThrow',
      'create',
      'update',
      'upsert',
    ];
    const arrayActions = ['findMany', 'createManyAndReturn'];

    if (readActions.includes(action)) {
      return decryptResultOrNull(result as Record<string, unknown>, fields);
    }

    if (arrayActions.includes(action)) {
      if (Array.isArray(result)) {
        return decryptResultArray(result as Record<string, unknown>[], fields);
      }
    }

    return result;
  };
}

/**
 * Check if a model has PHI fields configured for automatic encryption.
 * Useful for repositories to know if they can skip manual encryption.
 */
export function modelHasAutoPhiEncryption(modelName: string): boolean {
  return PHI_MODELS.has(modelName.toLowerCase());
}
