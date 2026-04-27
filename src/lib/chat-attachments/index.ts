/**
 * Patient ↔ Clinic chat attachments — shared helpers
 *
 * Single source of truth for the security-critical contracts shared by:
 *   - the presigned-upload route (`/api/patient-portal/chat-attachments/upload`)
 *   - the chat send/list route (`/api/patient-chat`)
 *   - the patient-portal chat UI (`/patient-portal/chat`)
 *   - the staff `PatientChatView` component
 *
 * Anything that touches an attachment s3Key MUST go through these helpers
 * rather than re-deriving the path layout — that keeps the cross-tenant
 * TOCTOU defense (`validateChatAttachmentS3Key`) and the MIME / size caps
 * in lockstep across every call site.
 *
 * Storage layout (single bucket, path-prefix isolation):
 *
 *   chat-attachments/{clinicId}/{patientId}/{timestamp}-{uuid}.{ext}
 *
 * The bucket is `AWS_S3_DOCUMENTS_BUCKET_NAME` (BAA-covered, KMS encrypted,
 * versioned, 7-year HIPAA lifecycle). See `docs/AWS_S3_INTEGRATION.md`.
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Locked policy constants (see scratchpad — "Decisions Locked 2026-04-26")
// ---------------------------------------------------------------------------

/** Top-level S3 key prefix for chat attachments. Used by validators + key builder. */
export const CHAT_ATTACHMENT_PATH_PREFIX = 'chat-attachments' as const;

/** Maximum bytes per attachment (15 MB — matches PatientPhoto cap). */
export const CHAT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

/** Maximum attachments per chat message. */
export const CHAT_ATTACHMENT_MAX_PER_MESSAGE = 5;

/** TTL for GET signed URLs handed back to clients (1 hour). */
export const CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 3600;

/** TTL for PUT presigned URLs (clients must complete upload within this window). */
export const CHAT_ATTACHMENT_UPLOAD_URL_TTL_SECONDS = 300;

// ---------------------------------------------------------------------------
// Twilio MMS sub-set of the chat-attachment allowlist
//
// US carriers (AT&T, Verizon, T-Mobile) impose stricter limits than what the
// in-app web channel supports:
//   - Only JPEG + PNG render reliably (PDFs, HEIC/HEIF, WebP, GIFs are often
//     stripped or recoded into garbage by carrier MMSC).
//   - 5 MB per file is the practical Twilio US ceiling.
//   - We extend the signed-URL TTL to 24h specifically for MMS deliveries so
//     Twilio's carrier-side retries (which can stretch out a few minutes on
//     transient failures) don't expire mid-fetch. The 24h limit is still
//     well below the file's persistence in S3.
// ---------------------------------------------------------------------------

/** MIME types that survive US-carrier MMS without being stripped/recoded. */
export const MMS_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const;

export type MmsAllowedMime = (typeof MMS_ALLOWED_MIME_TYPES)[number];

/** Per-file size cap when delivering as MMS (Twilio US carrier ceiling). */
export const MMS_MAX_BYTES = 5 * 1024 * 1024;

/** Per-message attachment cap on MMS (kept at 5 for parity with web). */
export const MMS_MAX_PER_MESSAGE = 5;

/** Signed-URL TTL specifically for Twilio media fetches. */
export const MMS_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Whitelisted MIME types for chat attachments. Order is preserved so the test
 * snapshot stays stable; do NOT add `application/msword`, `text/html`, `video/*`
 * etc. without a fresh security review.
 */
export const CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export type ChatAttachmentMime = (typeof CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES)[number];

const MIME_TO_EXT: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
});

/** Set of accepted lowercase extensions for fast prefix-validation lookup. */
const ACCEPTED_EXTENSIONS = new Set(Object.values(MIME_TO_EXT));

// ---------------------------------------------------------------------------
// Persisted shape (`PatientChatMessage.attachments` JSON column)
// ---------------------------------------------------------------------------

/**
 * The shape we persist into `PatientChatMessage.attachments`.
 * `s3Key` and `thumbnailKey` are the canonical references. We never return
 * them to clients — they are resolved into short-lived signed URLs at read
 * time by the GET handler.
 */
export interface ChatAttachmentRecord {
  /** Stable client-side id for keying / dedup; uuid v4. */
  id: string;
  /** Full S3 key (relative to bucket). Stays server-side. */
  s3Key: string;
  /** Sanitized original filename (no path components). */
  name: string;
  /** Validated MIME type (one of `CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES`). */
  mime: ChatAttachmentMime;
  /** File size in bytes. */
  size: number;
  /** ISO-8601 timestamp when the row was persisted. */
  uploadedAt: string;
  /** Optional thumbnail key (image MIMEs only). */
  thumbnailKey?: string;
}

/**
 * The shape returned to clients after the GET handler resolves signed URLs.
 * The `s3Key` and `thumbnailKey` are stripped; clients only ever see URLs.
 *
 * `url` is optional because the GET handler will return the metadata even
 * when S3 is disabled (test/dev environments) so the UI can still render a
 * placeholder rather than blow up.
 */
export interface ChatAttachmentResolved {
  id: string;
  url?: string;
  thumbnailUrl?: string;
  name: string;
  mime: ChatAttachmentMime;
  size: number;
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// MIME helpers
// ---------------------------------------------------------------------------

export function isAcceptedChatAttachmentMime(mime: string): mime is ChatAttachmentMime {
  if (typeof mime !== 'string' || mime.length === 0) return false;
  const lower = mime.toLowerCase();
  return (CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(lower);
}

/**
 * Returns whether a persisted attachment can safely be sent over Twilio
 * MMS (US carriers). Returns a structured `{ ok, reason }` so the route
 * handler can surface a helpful, user-facing error string when staff try
 * to text a PDF or an oversized image.
 */
export function isMmsCompatibleAttachment(
  attachment: Pick<ChatAttachmentRecord, 'mime' | 'size' | 'name'>
): { ok: true } | { ok: false; reason: string } {
  if (!attachment || typeof attachment.size !== 'number' || attachment.size <= 0) {
    return { ok: false, reason: 'Attachment is empty or malformed' };
  }
  if (attachment.size > MMS_MAX_BYTES) {
    return {
      ok: false,
      reason: `Photos texted over SMS must be under ${MMS_MAX_BYTES / 1024 / 1024} MB. For larger files, send via Web instead.`,
    };
  }
  const mime = (attachment.mime || '').toLowerCase();
  if (!(MMS_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    if (mime === 'application/pdf') {
      return {
        ok: false,
        reason: "PDFs can't be texted reliably — most carriers strip them. Send via Web instead.",
      };
    }
    return {
      ok: false,
      reason: 'Only JPEG and PNG photos can be texted (SMS). Send other formats via Web.',
    };
  }
  return { ok: true };
}

/**
 * Builds the human-readable preview snippet for an attachment-only chat
 * message (used for admin notifications and push titles). Mirrors the
 * iMessage / WhatsApp convention.
 */
export function buildAttachmentOnlyPreview(attachments: ReadonlyArray<{ mime: string }>): string {
  if (!attachments || attachments.length === 0) return '';
  if (attachments.length > 1) return `📎 ${attachments.length} attachments`;
  const mime = attachments[0]?.mime?.toLowerCase() ?? '';
  if (mime === 'application/pdf') return '📎 PDF';
  if (mime.startsWith('image/')) return '📎 Photo';
  return '📎 Attachment';
}

/** Returns the canonical lowercase extension for a MIME, or null if unaccepted. */
export function getExtensionForChatMime(mime: string): string | null {
  if (typeof mime !== 'string') return null;
  return MIME_TO_EXT[mime.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Key construction + validation (security-critical)
// ---------------------------------------------------------------------------

export interface BuildChatAttachmentS3KeyInput {
  clinicId: number;
  patientId: number;
  mime: string;
}

/**
 * Builds the canonical chat-attachment s3Key. Throws if MIME is rejected or
 * either id is non-positive. The result is guaranteed to satisfy
 * `validateChatAttachmentS3Key(result, { clinicId, patientId })`.
 */
export function buildChatAttachmentS3Key({
  clinicId,
  patientId,
  mime,
}: BuildChatAttachmentS3KeyInput): string {
  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    throw new Error('buildChatAttachmentS3Key: clinicId must be a positive integer');
  }
  if (!Number.isInteger(patientId) || patientId <= 0) {
    throw new Error('buildChatAttachmentS3Key: patientId must be a positive integer');
  }

  const ext = getExtensionForChatMime(mime);
  if (!ext) {
    throw new Error(`buildChatAttachmentS3Key: Unsupported MIME type "${mime}"`);
  }

  const timestamp = Date.now();
  const uuid = uuidv4();
  return `${CHAT_ATTACHMENT_PATH_PREFIX}/${clinicId}/${patientId}/${timestamp}-${uuid}.${ext}`;
}

export interface ValidateChatAttachmentS3KeyOwner {
  clinicId: number;
  patientId: number;
}

/**
 * TOCTOU / cross-tenant defense.
 *
 * Returns true ONLY if `s3Key` is structurally a chat-attachments key for
 * the given (clinicId, patientId) tuple. Used by the chat POST handler
 * before persisting `attachments[].s3Key` to reject:
 *
 *   - keys from another patient or clinic
 *   - keys outside the `chat-attachments/` prefix
 *   - keys that try to traverse out of the prefix via `..` segments
 *   - keys with a leading slash (defense against accidental absolute paths)
 *   - keys with extensions outside our MIME-derived allowlist
 *
 * This function is deliberately strict and pure — no S3 lookups, no DB
 * queries — so it is safe to call from inside the chat-send transaction.
 */
export function validateChatAttachmentS3Key(
  s3Key: unknown,
  owner: ValidateChatAttachmentS3KeyOwner
): boolean {
  if (typeof s3Key !== 'string' || s3Key.length === 0) return false;
  if (s3Key.startsWith('/')) return false;

  const segments = s3Key.split('/');
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return false;
  }

  // Expected layout: chat-attachments / {clinicId} / {patientId} / {filename}
  if (segments.length !== 4) return false;
  const [prefix, clinicSeg, patientSeg, filename] = segments;

  if (prefix !== CHAT_ATTACHMENT_PATH_PREFIX) return false;
  if (clinicSeg !== String(owner.clinicId)) return false;
  if (patientSeg !== String(owner.patientId)) return false;

  // Filename must have one of our allowlisted extensions (case-insensitive).
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return false;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.has(ext)) return false;

  return true;
}
