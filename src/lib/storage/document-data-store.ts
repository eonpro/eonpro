/**
 * DOCUMENT DATA STORE — S3 Externalization Abstraction
 * =====================================================
 *
 * Unified read/write layer for PatientDocument intake data.
 * Transparently stores and retrieves JSON intake data from S3
 * (when enabled) or falls back to the DB `data` column.
 *
 * Phase 3.3 of the Enterprise Remediation Roadmap.
 *
 * Design:
 *   - Dual-write: S3 + DB `data` column (for instant rollback)
 *   - Feature flag: `S3_INTAKE_DATA_ENABLED` controls read path
 *   - S3 path: `intake-data/{clinicId}/{patientId}/{documentId}.json`
 *   - AES256 encryption via existing S3 service config
 *
 * @module storage/document-data-store
 */

import { logger } from '@/lib/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Feature flag for S3 intake data reads.
 * When false, reads always use the DB `data` column (original behavior).
 * When true, reads prefer S3 (via `s3DataKey`) and fall back to DB.
 */
function isS3IntakeDataEnabled(): boolean {
  return process.env.S3_INTAKE_DATA_ENABLED === 'true';
}

// =============================================================================
// LAZY S3 IMPORT
// =============================================================================

/**
 * Lazy-import S3 service to avoid import-time side effects
 * and to gracefully degrade if S3 is not configured.
 */
async function getS3Service() {
  try {
    const { uploadToS3, downloadFromS3 } = await import(
      '@/lib/integrations/aws/s3Service'
    );
    const { isS3Enabled, FileCategory } = await import('@/lib/integrations/aws/s3Config');
    if (!isS3Enabled()) return null;
    return { uploadToS3, downloadFromS3, FileCategory };
  } catch {
    return null;
  }
}

// =============================================================================
// TYPES
// =============================================================================

/** Minimal document shape needed by the read path */
export interface DocumentForRead {
  id: number;
  patientId: number;
  clinicId?: number | null;
  s3DataKey?: string | null;
  data?: Buffer | Uint8Array | null;
}

export interface StoreIntakeDataResult {
  s3DataKey: string | null;
  dataBuffer: Buffer;
}

// =============================================================================
// WRITE — storeIntakeData
// =============================================================================

/**
 * Prepare intake data for dual-write (S3 + DB).
 *
 * Returns:
 *   - `dataBuffer`: Always set — the JSON buffer for the DB `data` column
 *   - `s3DataKey`:  Set only if S3 upload succeeded; null otherwise
 *
 * The caller should write BOTH to the Prisma record:
 *   `data: result.dataBuffer, s3DataKey: result.s3DataKey`
 *
 * If S3 is unavailable, this gracefully returns `s3DataKey: null`
 * and the DB `data` column is the sole store (original behavior).
 */
export async function storeIntakeData(
  intakeDataToStore: unknown,
  context: {
    documentId?: number;
    patientId: number;
    clinicId: number | null | undefined;
  }
): Promise<StoreIntakeDataResult> {
  const jsonStr = JSON.stringify(intakeDataToStore);
  const dataBuffer = Buffer.from(jsonStr, 'utf8');

  // Attempt S3 upload with deterministic key (fire-and-succeed or gracefully fail)
  let s3DataKey: string | null = null;

  try {
    const s3 = await getS3Service();
    if (s3) {
      const cId = context.clinicId ?? 0;
      const pId = context.patientId;
      const dId = context.documentId ?? Date.now();
      const key = `intake-data/${cId}/${pId}/${dId}.json`;

      const { getS3Client } = await import('@/lib/integrations/aws/s3Service');
      const { s3Config } = await import('@/lib/integrations/aws/s3Config');
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      const client = getS3Client();
      await client.send(
        new PutObjectCommand({
          Bucket: s3Config.bucketName,
          Key: key,
          Body: dataBuffer,
          ContentType: 'application/json',
          ServerSideEncryption: 'AES256',
          Metadata: {
            clinicId: String(cId),
            patientId: String(pId),
            documentId: String(dId),
            type: 'intake-json-data',
          },
        })
      );

      s3DataKey = key;

      logger.info('[DocumentDataStore] Intake data uploaded to S3', {
        s3DataKey: key,
        patientId: pId,
        sizeBytes: dataBuffer.length,
      });
    }
  } catch (err) {
    // S3 failure is non-fatal — DB `data` column is the fallback
    logger.warn('[DocumentDataStore] S3 upload failed, DB-only write', {
      error: err instanceof Error ? err.message : String(err),
      patientId: context.patientId,
    });
    s3DataKey = null;
  }

  return { s3DataKey, dataBuffer };
}

// =============================================================================
// READ — readIntakeData
// =============================================================================

/**
 * Read intake JSON data from the best available source.
 *
 * Priority:
 *   1. S3 (if `s3DataKey` is set AND feature flag is on)
 *   2. DB `data` column (always available during dual-write period)
 *
 * Returns the parsed JSON object, or null if no data is available.
 */
export async function readIntakeData(
  document: DocumentForRead
): Promise<unknown | null> {
  // Try S3 first (if enabled and key exists)
  if (isS3IntakeDataEnabled() && document.s3DataKey) {
    try {
      const s3 = await getS3Service();
      if (s3) {
        const buffer = await s3.downloadFromS3(document.s3DataKey);
        const jsonStr = buffer.toString('utf8').trim();
        if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
          return JSON.parse(jsonStr);
        }
      }
    } catch (err) {
      logger.warn('[DocumentDataStore] S3 read failed, falling back to DB', {
        s3DataKey: document.s3DataKey,
        documentId: document.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall through to DB
    }
  }

  // Fall back to DB `data` column
  return parseDataColumn(document.data);
}

/**
 * Read raw binary data (PDF or other) from the document.
 * Used by the document view/download endpoints for non-JSON content.
 *
 * This does NOT go to S3 for intake-JSON — only the `data` column
 * or `externalUrl` paths handle binary content (unchanged).
 */
export function readBinaryData(
  data: Buffer | Uint8Array | null | undefined
): Buffer | null {
  return toBuffer(data);
}

// =============================================================================
// MIGRATION — migrateDocumentData
// =============================================================================

/**
 * Migrate a single document's `data` column to S3.
 * Used by the batch migration script.
 *
 * Returns the S3 key if successful, null if skipped or failed.
 */
export async function migrateDocumentData(
  document: {
    id: number;
    patientId: number;
    clinicId: number | null;
    data: Buffer | Uint8Array | null;
    s3DataKey: string | null;
  }
): Promise<string | null> {
  // Skip if already migrated
  if (document.s3DataKey) return document.s3DataKey;

  // Skip if no data to migrate
  if (!document.data) return null;

  // Only migrate JSON data (not binary PDFs)
  const buffer = toBuffer(document.data);
  if (!buffer || buffer.length === 0) return null;

  const firstChar = buffer.toString('utf8', 0, 1);
  if (firstChar !== '{' && firstChar !== '[') {
    // Binary content (PDF etc.) — skip, these are served from externalUrl
    return null;
  }

  const cId = document.clinicId ?? 0;
  const key = `intake-data/${cId}/${document.patientId}/${document.id}.json`;

  try {
    const { getS3Client } = await import('@/lib/integrations/aws/s3Service');
    const { isS3Enabled } = await import('@/lib/integrations/aws/s3Config');
    const { s3Config } = await import('@/lib/integrations/aws/s3Config');

    if (!isS3Enabled()) {
      return null;
    }

    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = getS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
        Metadata: {
          clinicId: String(cId),
          patientId: String(document.patientId),
          documentId: String(document.id),
          type: 'intake-json-data',
          migratedAt: new Date().toISOString(),
        },
      })
    );

    return key;
  } catch (err) {
    logger.error('[DocumentDataStore] Migration failed for document', {
      documentId: document.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Parse the DB `data` column (Bytes) into a JSON object.
 * Handles Buffer, Uint8Array, and legacy `{ type: 'Buffer', data: [...] }` shapes.
 */
export function parseDataColumn(
  data: Buffer | Uint8Array | null | undefined
): unknown | null {
  const buffer = toBuffer(data);
  if (!buffer || buffer.length === 0) return null;

  try {
    let rawStr: string;
    rawStr = buffer.toString('utf8');

    const trimmed = rawStr.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
  } catch {
    // Not JSON — return null
  }

  return null;
}

/**
 * Convert various data representations to a Buffer.
 */
function toBuffer(data: unknown): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as any).type === 'Buffer' &&
    'data' in data
  ) {
    return Buffer.from((data as any).data);
  }
  return null;
}
