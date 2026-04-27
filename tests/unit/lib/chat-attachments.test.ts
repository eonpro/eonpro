/**
 * Chat attachments helper module — unit tests
 *
 * Locks in the security-critical contracts that everything else relies on:
 *   1. s3Keys for chat attachments live under
 *      `chat-attachments/{clinicId}/{patientId}/...` so a malicious client
 *      cannot point at another patient's file by submitting a forged key.
 *   2. The MIME / size / count caps match the values approved by the user
 *      (HIPAA scope sign-off — see scratchpad).
 *   3. Signed URL TTL is 3600s.
 *
 * These constants are imported by the upload presign route, the chat POST
 * handler, and both client UIs, so any drift will be caught here first.
 */

import { describe, it, expect } from 'vitest';
import {
  CHAT_ATTACHMENT_PATH_PREFIX,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES,
  MMS_ALLOWED_MIME_TYPES,
  MMS_MAX_BYTES,
  MMS_MAX_PER_MESSAGE,
  MMS_SIGNED_URL_TTL_SECONDS,
  buildAttachmentOnlyPreview,
  buildChatAttachmentS3Key,
  validateChatAttachmentS3Key,
  getExtensionForChatMime,
  isAcceptedChatAttachmentMime,
  isMmsCompatibleAttachment,
} from '@/lib/chat-attachments';

describe('chat-attachments constants', () => {
  it('uses the dedicated path prefix', () => {
    expect(CHAT_ATTACHMENT_PATH_PREFIX).toBe('chat-attachments');
  });

  it('caps individual file size at 15 MB', () => {
    expect(CHAT_ATTACHMENT_MAX_BYTES).toBe(15 * 1024 * 1024);
  });

  it('caps attachments per message at 5', () => {
    expect(CHAT_ATTACHMENT_MAX_PER_MESSAGE).toBe(5);
  });

  it('signs read URLs for 1 hour', () => {
    expect(CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS).toBe(3600);
  });

  it('accepts the locked MIME allowlist (images + PDF)', () => {
    expect(CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
    ]);
  });
});

describe('isAcceptedChatAttachmentMime', () => {
  it.each([
    ['image/jpeg'],
    ['image/JPG'],
    ['IMAGE/PNG'],
    ['image/webp'],
    ['image/heic'],
    ['image/heif'],
    ['application/pdf'],
  ])('accepts %s case-insensitively', (mime) => {
    expect(isAcceptedChatAttachmentMime(mime)).toBe(true);
  });

  it.each([
    ['application/msword'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['video/mp4'],
    ['audio/mpeg'],
    ['image/svg+xml'],
    ['application/zip'],
    ['text/html'],
    [''],
  ])('rejects %s', (mime) => {
    expect(isAcceptedChatAttachmentMime(mime)).toBe(false);
  });
});

describe('getExtensionForChatMime', () => {
  it('maps every accepted MIME to a safe lowercase extension', () => {
    expect(getExtensionForChatMime('image/jpeg')).toBe('jpg');
    expect(getExtensionForChatMime('image/jpg')).toBe('jpg');
    expect(getExtensionForChatMime('image/png')).toBe('png');
    expect(getExtensionForChatMime('image/webp')).toBe('webp');
    expect(getExtensionForChatMime('image/heic')).toBe('heic');
    expect(getExtensionForChatMime('image/heif')).toBe('heif');
    expect(getExtensionForChatMime('application/pdf')).toBe('pdf');
  });

  it('returns null for unaccepted MIMEs (no fallback to image/jpg)', () => {
    expect(getExtensionForChatMime('application/zip')).toBeNull();
    expect(getExtensionForChatMime('image/svg+xml')).toBeNull();
    expect(getExtensionForChatMime('')).toBeNull();
  });
});

describe('buildChatAttachmentS3Key', () => {
  it('produces the canonical chat-attachments path with clinic+patient scope', () => {
    const key = buildChatAttachmentS3Key({
      clinicId: 7,
      patientId: 42,
      mime: 'image/png',
    });
    expect(key).toMatch(/^chat-attachments\/7\/42\/[0-9]+-[0-9a-f-]{36}\.png$/);
  });

  it('uses the right extension for each accepted MIME', () => {
    const key = buildChatAttachmentS3Key({
      clinicId: 1,
      patientId: 2,
      mime: 'application/pdf',
    });
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('throws on rejected MIME so callers cannot bypass the allowlist', () => {
    expect(() =>
      buildChatAttachmentS3Key({
        clinicId: 1,
        patientId: 2,
        mime: 'application/zip',
      })
    ).toThrow(/Unsupported MIME/);
  });

  it('rejects non-positive clinicId or patientId', () => {
    expect(() =>
      buildChatAttachmentS3Key({ clinicId: 0, patientId: 1, mime: 'image/png' })
    ).toThrow();
    expect(() =>
      buildChatAttachmentS3Key({ clinicId: 1, patientId: -3, mime: 'image/png' })
    ).toThrow();
  });

  it('returns unique keys across calls (uuid + timestamp)', () => {
    const a = buildChatAttachmentS3Key({ clinicId: 1, patientId: 1, mime: 'image/png' });
    const b = buildChatAttachmentS3Key({ clinicId: 1, patientId: 1, mime: 'image/png' });
    expect(a).not.toEqual(b);
  });
});

describe('MMS constants (Twilio carrier limits)', () => {
  it('caps MMS files at 5 MB (Twilio US ceiling)', () => {
    expect(MMS_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(MMS_MAX_BYTES).toBeLessThan(CHAT_ATTACHMENT_MAX_BYTES);
  });

  it('caps MMS attachments per message at 5 (parity with web)', () => {
    expect(MMS_MAX_PER_MESSAGE).toBe(5);
  });

  it('uses a 24h MMS-specific signed URL TTL to absorb Twilio retries', () => {
    expect(MMS_SIGNED_URL_TTL_SECONDS).toBe(24 * 60 * 60);
    expect(MMS_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS);
  });

  it('restricts MMS to JPEG + PNG only (carriers strip everything else)', () => {
    expect(MMS_ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/jpg', 'image/png']);
  });
});

describe('isMmsCompatibleAttachment', () => {
  const baseAttachment = {
    id: 'aaa',
    s3Key: 'chat-attachments/1/2/x.png',
    name: 'x.png',
    mime: 'image/png' as const,
    size: 1024,
    uploadedAt: '2026-04-27T00:00:00.000Z',
  };

  it('accepts an in-spec PNG', () => {
    const out = isMmsCompatibleAttachment(baseAttachment);
    expect(out.ok).toBe(true);
  });

  it('accepts an in-spec JPEG', () => {
    const out = isMmsCompatibleAttachment({ ...baseAttachment, mime: 'image/jpeg' });
    expect(out.ok).toBe(true);
  });

  it('rejects a PDF with a "switch to Web" reason string', () => {
    const out = isMmsCompatibleAttachment({
      ...baseAttachment,
      mime: 'application/pdf',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toMatch(/PDF/i);
      expect(out.reason).toMatch(/Web/i);
    }
  });

  it('rejects HEIC over MMS (carriers strip)', () => {
    const out = isMmsCompatibleAttachment({
      ...baseAttachment,
      mime: 'image/heic' as never,
    });
    expect(out.ok).toBe(false);
  });

  it('rejects WebP over MMS (carriers strip)', () => {
    const out = isMmsCompatibleAttachment({
      ...baseAttachment,
      mime: 'image/webp' as never,
    });
    expect(out.ok).toBe(false);
  });

  it('rejects an attachment over 5 MB even if MIME is allowed', () => {
    const out = isMmsCompatibleAttachment({
      ...baseAttachment,
      size: 6 * 1024 * 1024,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/5\s*MB/i);
  });

  it('rejects 0 / negative size as malformed', () => {
    const out = isMmsCompatibleAttachment({ ...baseAttachment, size: 0 });
    expect(out.ok).toBe(false);
  });
});

describe('buildAttachmentOnlyPreview', () => {
  it('returns empty string for no attachments', () => {
    expect(buildAttachmentOnlyPreview([])).toBe('');
  });

  it('formats a single image attachment', () => {
    expect(buildAttachmentOnlyPreview([{ mime: 'image/png' }])).toBe('📎 Photo');
    expect(buildAttachmentOnlyPreview([{ mime: 'image/jpeg' }])).toBe('📎 Photo');
    expect(buildAttachmentOnlyPreview([{ mime: 'IMAGE/HEIC' }])).toBe('📎 Photo');
  });

  it('formats a single PDF', () => {
    expect(buildAttachmentOnlyPreview([{ mime: 'application/pdf' }])).toBe('📎 PDF');
  });

  it('formats multiple attachments with a count', () => {
    expect(buildAttachmentOnlyPreview([{ mime: 'image/png' }, { mime: 'application/pdf' }])).toBe(
      '📎 2 attachments'
    );
    expect(
      buildAttachmentOnlyPreview([
        { mime: 'image/png' },
        { mime: 'image/png' },
        { mime: 'image/png' },
      ])
    ).toBe('📎 3 attachments');
  });

  it('falls back to generic copy for unknown MIMEs', () => {
    expect(buildAttachmentOnlyPreview([{ mime: 'foo/bar' }])).toBe('📎 Attachment');
  });
});

describe('validateChatAttachmentS3Key (cross-tenant TOCTOU defense)', () => {
  const goodKey = 'chat-attachments/7/42/1700000000000-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';

  it('accepts a key for the matching clinic+patient', () => {
    expect(validateChatAttachmentS3Key(goodKey, { clinicId: 7, patientId: 42 })).toBe(true);
  });

  it('rejects a key from another patient in the same clinic', () => {
    expect(validateChatAttachmentS3Key(goodKey, { clinicId: 7, patientId: 99 })).toBe(false);
  });

  it('rejects a key from another clinic', () => {
    expect(validateChatAttachmentS3Key(goodKey, { clinicId: 8, patientId: 42 })).toBe(false);
  });

  it('rejects a key outside the chat-attachments prefix', () => {
    expect(
      validateChatAttachmentS3Key('patient-photos/7/42/foo.png', { clinicId: 7, patientId: 42 })
    ).toBe(false);
  });

  it('rejects a key that uses path traversal to escape the prefix', () => {
    expect(
      validateChatAttachmentS3Key('chat-attachments/7/42/../../99/evil.png', {
        clinicId: 7,
        patientId: 42,
      })
    ).toBe(false);
  });

  it('rejects a key with a leading slash (not normalized)', () => {
    expect(validateChatAttachmentS3Key('/' + goodKey, { clinicId: 7, patientId: 42 })).toBe(false);
  });

  it('rejects keys with unexpected extensions', () => {
    expect(
      validateChatAttachmentS3Key('chat-attachments/7/42/x.exe', { clinicId: 7, patientId: 42 })
    ).toBe(false);
  });

  it('rejects empty / non-string input', () => {
    // @ts-expect-error - testing runtime guard
    expect(validateChatAttachmentS3Key(undefined, { clinicId: 7, patientId: 42 })).toBe(false);
    expect(validateChatAttachmentS3Key('', { clinicId: 7, patientId: 42 })).toBe(false);
  });
});
