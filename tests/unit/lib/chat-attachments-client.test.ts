/**
 * Browser-side chat-attachments helpers — unit tests
 *
 * EXIF strip + XHR upload run in a real browser; here we test only the
 * pure validation gate (`classifyChatAttachmentFile`) and the presign
 * fetch wrapper. Full upload is exercised in playwright e2e (WS9).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyChatAttachmentFile,
  requestChatAttachmentPresign,
} from '@/lib/chat-attachments/client';

function makeFile(opts: { size: number; type: string; name?: string }): File {
  // Vitest runs in node; File is available via undici/node 20+.
  const bytes = new Uint8Array(opts.size);
  return new File([bytes], opts.name ?? 'x.bin', { type: opts.type });
}

describe('classifyChatAttachmentFile', () => {
  it('accepts a small JPEG', () => {
    const out = classifyChatAttachmentFile(makeFile({ size: 1024, type: 'image/jpeg' }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.mime).toBe('image/jpeg');
  });

  it('accepts a PDF', () => {
    const out = classifyChatAttachmentFile(makeFile({ size: 1024, type: 'application/pdf' }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.mime).toBe('application/pdf');
  });

  it('rejects empty files', () => {
    const out = classifyChatAttachmentFile(makeFile({ size: 0, type: 'image/png' }));
    expect(out.ok).toBe(false);
  });

  it('rejects oversized files (>15 MB)', () => {
    const out = classifyChatAttachmentFile(makeFile({ size: 16 * 1024 * 1024, type: 'image/png' }));
    expect(out.ok).toBe(false);
  });

  it('rejects unsupported MIME types', () => {
    const out = classifyChatAttachmentFile(makeFile({ size: 1024, type: 'application/zip' }));
    expect(out.ok).toBe(false);
  });

  it('rejects msword (intentionally not on chat allowlist)', () => {
    const out = classifyChatAttachmentFile(makeFile({ size: 1024, type: 'application/msword' }));
    expect(out.ok).toBe(false);
  });
});

describe('requestChatAttachmentPresign', () => {
  it('POSTs to the upload route with contentType + fileSize and returns the response body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://s3.example.com/sig',
          s3Key: 'chat-attachments/1/2/abc.png',
          expiresIn: 300,
          maxSize: 15 * 1024 * 1024,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const file = makeFile({ size: 4096, type: 'image/png', name: 'p.png' });
    const result = await requestChatAttachmentPresign(file, { fetchImpl });

    expect(result.s3Key).toBe('chat-attachments/1/2/abc.png');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/patient-chat/attachments/upload');
    const body = JSON.parse(init.body as string);
    expect(body.contentType).toBe('image/png');
    expect(body.fileSize).toBe(4096);
    expect(body.fileName).toBe('p.png');
  });

  it('forwards patientId for staff role', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://s3/x',
          s3Key: 'chat-attachments/1/2/x.png',
          expiresIn: 300,
          maxSize: 1,
        }),
        { status: 200 }
      )
    );
    const file = makeFile({ size: 1, type: 'image/png' });
    await requestChatAttachmentPresign(file, { fetchImpl, patientId: 99 });
    const init = fetchImpl.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body.patientId).toBe(99);
  });

  it('throws with the server error message when presign fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Storage unavailable' }), { status: 503 })
      );
    const file = makeFile({ size: 1, type: 'image/png' });
    await expect(requestChatAttachmentPresign(file, { fetchImpl })).rejects.toThrow(
      'Storage unavailable'
    );
  });

  it('refuses to call the server for an unsupported file', async () => {
    const fetchImpl = vi.fn();
    const file = makeFile({ size: 100, type: 'application/zip' });
    await expect(requestChatAttachmentPresign(file, { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
