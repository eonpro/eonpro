/**
 * Patient ↔ Clinic chat attachments — browser-side helpers
 *
 * Used by both the patient portal `/patient-portal/chat` page and the staff
 * `PatientChatView` component.
 *
 * Responsibilities:
 *   1. **Strip EXIF (incl. GPS) from images** before they leave the device.
 *      We re-encode JPEG/PNG/WebP to JPEG via canvas, which fundamentally
 *      drops all metadata. HEIC/HEIF passes through unchanged because most
 *      browsers cannot decode it; we still cap size and rely on the
 *      server-side strip follow-up. PDFs pass through.
 *   2. **Mint a presigned URL** via `POST /api/patient-chat/attachments/upload`.
 *   3. **Upload directly to S3** with progress reporting via XHR.
 *   4. Return a `ChatAttachmentSendable` that the chat POST consumes.
 *
 * Anything that is not a "happy path" upload throws an `Error` whose message
 * is safe to surface to the user.
 */

import type { ChatAttachmentMime } from './index';
import {
  CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
} from './index';

/**
 * The shape the chat POST body expects for each attachment. Mirrors the
 * server-side `attachmentInputSchema` in `/api/patient-chat/route.ts`.
 */
export interface ChatAttachmentSendable {
  s3Key: string;
  name: string;
  mime: ChatAttachmentMime;
  size: number;
}

export type ChatAttachmentUploadProgress = (loaded: number, total: number) => void;

/** Re-export of the constant tuple for convenience in `<input accept>` values. */
export const CHAT_ATTACHMENT_ACCEPT_ATTR = CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES.join(',');

/** Constants re-exported so client code only imports from one place. */
export {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES,
};

const REENCODE_QUALITY = 0.92;
const REENCODE_MAX_DIMENSION = 2400;
const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

// ---------------------------------------------------------------------------
// MIME validation (mirrors server-side guard)
// ---------------------------------------------------------------------------

export function classifyChatAttachmentFile(
  file: File
): { ok: true; mime: ChatAttachmentMime } | { ok: false; reason: string } {
  if (file.size <= 0) return { ok: false, reason: 'File is empty' };
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: `File exceeds ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB limit`,
    };
  }
  const mime = (file.type || '').toLowerCase();
  if (!mime || !(CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime)) {
    return {
      ok: false,
      reason: 'Unsupported file type. Allowed: images (JPG/PNG/WebP/HEIC) or PDF',
    };
  }
  return { ok: true, mime: mime as ChatAttachmentMime };
}

// ---------------------------------------------------------------------------
// EXIF strip (image re-encode via canvas)
// ---------------------------------------------------------------------------

/**
 * Re-encode an image File via canvas to drop all metadata (incl. GPS EXIF).
 *
 * - JPEG/PNG/WebP → re-encoded to JPEG (smaller, EXIF-free)
 * - HEIC/HEIF → returned unchanged (browser can't decode; rely on server-side
 *   follow-up + the BAA-covered bucket — see scratchpad WS5 trade-off)
 * - PDF or any non-image → returned unchanged
 *
 * Always resolves; never rejects. Falls back to the original file on any
 * canvas / decode failure so the user can still send.
 */
export async function stripExifIfImage(file: File): Promise<File> {
  const mime = (file.type || '').toLowerCase();
  if (!mime.startsWith('image/')) return file;
  if (HEIC_TYPES.has(mime)) return file;

  // Browsers without document/Image (e.g. SSR) — bail.
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return file;
  }

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > REENCODE_MAX_DIMENSION || height > REENCODE_MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height / width) * REENCODE_MAX_DIMENSION);
            width = REENCODE_MAX_DIMENSION;
          } else {
            width = Math.round((width / height) * REENCODE_MAX_DIMENSION);
            height = REENCODE_MAX_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            // Standardize the output filename extension to .jpg so the
            // server's MIME-derived extension check passes cleanly.
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
            const safeName = `${baseName}.jpg`;
            resolve(new File([blob], safeName, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          REENCODE_QUALITY
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Upload pipeline
// ---------------------------------------------------------------------------

interface PresignResponse {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
  maxSize: number;
  metadata?: { contentType?: string; fileSize?: number; fileName?: string };
}

interface UploadOptions {
  /** When provided, the presign route is asked to mint for this patient.
   *  Patients omit this — server forces it from the auth context. */
  patientId?: number;
  onProgress?: ChatAttachmentUploadProgress;
  signal?: AbortSignal;
  /** Override the default fetch (used in tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Mint a presigned PUT URL for a given file. Uses `fetch` and returns the
 * full presign response so the caller can decide how to upload (fetch vs
 * XHR for progress).
 */
export async function requestChatAttachmentPresign(
  file: File,
  opts: UploadOptions = {}
): Promise<PresignResponse> {
  const cls = classifyChatAttachmentFile(file);
  if (!cls.ok) throw new Error(cls.reason);

  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl('/api/patient-chat/attachments/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: opts.signal,
    body: JSON.stringify({
      contentType: cls.mime,
      fileSize: file.size,
      fileName: file.name,
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
    }),
  });

  if (!res.ok) {
    let message = 'Could not start upload';
    try {
      const body = await res.json();
      if (body?.error && typeof body.error === 'string') message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as PresignResponse;
}

/**
 * Upload a Blob to a presigned PUT URL using XHR so we can report progress.
 * Used by both the patient portal and the staff chat UI.
 */
export function putToPresignedUrl(
  file: File,
  uploadUrl: string,
  contentType: string,
  onProgress?: ChatAttachmentUploadProgress,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    if (signal) {
      const onAbort = () => {
        try {
          xhr.abort();
        } catch {
          /* noop */
        }
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.upload.onprogress = (evt) => {
      if (onProgress && evt.lengthComputable) onProgress(evt.loaded, evt.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    xhr.send(file);
  });
}

/**
 * High-level convenience: strip EXIF (if applicable), mint a presigned URL,
 * and PUT the file. Returns the `ChatAttachmentSendable` payload that the
 * chat POST body expects.
 */
export async function uploadChatAttachment(
  rawFile: File,
  opts: UploadOptions = {}
): Promise<ChatAttachmentSendable> {
  const file = await stripExifIfImage(rawFile);
  const cls = classifyChatAttachmentFile(file);
  if (!cls.ok) throw new Error(cls.reason);

  const presign = await requestChatAttachmentPresign(file, opts);
  await putToPresignedUrl(file, presign.uploadUrl, cls.mime, opts.onProgress, opts.signal);

  return {
    s3Key: presign.s3Key,
    name: file.name,
    mime: cls.mime,
    size: file.size,
  };
}
