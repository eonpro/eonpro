import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mocks = vi.hoisted(() => ({
  idempotencyFindFirst: vi.fn(),
  idempotencyCreate: vi.fn(),
  webhookLogCreate: vi.fn(),
  webhookLogUpdate: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  deliverWebhook: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  basePrisma: {
    idempotencyRecord: {
      findFirst: (...args: unknown[]) => mocks.idempotencyFindFirst(...args),
      create: (...args: unknown[]) => mocks.idempotencyCreate(...args),
    },
    webhookLog: {
      create: (...args: unknown[]) => mocks.webhookLogCreate(...args),
      update: (...args: unknown[]) => mocks.webhookLogUpdate(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    warn: (...args: unknown[]) => mocks.loggerWarn(...args),
    error: (...args: unknown[]) => mocks.loggerError(...args),
    debug: (...args: unknown[]) => mocks.loggerDebug(...args),
  },
}));

vi.mock('@/lib/queue/jobQueue', () => ({
  jobQueue: {
    deliverWebhook: (...args: unknown[]) => mocks.deliverWebhook(...args),
  },
}));

import {
  createWebhookService,
  registerWebhookHandler,
  getWebhookHandler,
} from '@/domains/webhook/services/webhook.service';

describe('WebhookService', () => {
  let service: ReturnType<typeof createWebhookService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createWebhookService();
    mocks.webhookLogCreate.mockResolvedValue({ id: 1 });
    mocks.idempotencyCreate.mockResolvedValue({ id: 1 });
    mocks.deliverWebhook.mockResolvedValue(undefined);
  });

  describe('verifySignature', () => {
    it('returns true for algorithm "none"', () => {
      const result = service.verifySignature({
        algorithm: 'none',
        rawBody: 'any',
        signature: 'any',
        secret: 'any',
      });
      expect(result).toBe(true);
    });

    it('returns true for valid HMAC-SHA256 signature', () => {
      const rawBody = '{"event":"test"}';
      const secret = 'my-secret';
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const result = service.verifySignature({
        algorithm: 'hmac-sha256',
        rawBody,
        signature: expected,
        secret,
      });
      expect(result).toBe(true);
    });

    it('returns false for invalid HMAC-SHA256 signature', () => {
      const rawBody = '{"event":"test"}';
      const secret = 'my-secret';
      const validLength = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').length;
      const invalidSignature = '0'.repeat(validLength);

      const result = service.verifySignature({
        algorithm: 'hmac-sha256',
        rawBody,
        signature: invalidSignature,
        secret,
      });
      expect(result).toBe(false);
    });
  });

  describe('ingest', () => {
    it('returns "duplicate" when idempotencyRecord exists', async () => {
      mocks.idempotencyFindFirst.mockResolvedValue({ id: 1 });

      const result = await service.ingest({
        source: 'stripe',
        eventType: 'invoice.paid',
        payload: { id: 'ev_1' },
        rawBody: '{"id":"ev_1"}',
      });

      expect(result).toEqual({ id: 0, status: 'duplicate' });
      expect(mocks.webhookLogCreate).not.toHaveBeenCalled();
      expect(mocks.idempotencyCreate).not.toHaveBeenCalled();
      expect(mocks.deliverWebhook).not.toHaveBeenCalled();
    });

    it('creates webhookLog entry on new webhook', async () => {
      mocks.idempotencyFindFirst.mockResolvedValue(null);

      await service.ingest({
        source: 'stripe',
        eventType: 'invoice.paid',
        payload: { id: 'ev_1' },
        rawBody: '{"id":"ev_1"}',
      });

      expect(mocks.webhookLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'stripe',
          eventType: 'invoice.paid',
          payload: { id: 'ev_1' },
          status: 'SUCCESS',
          metadata: expect.objectContaining({
            rawBody: '{"id":"ev_1"}',
            signature: null,
          }),
        }),
      });
    });

    it('creates idempotencyRecord with correct fields (key, resource, responseStatus, responseBody)', async () => {
      mocks.idempotencyFindFirst.mockResolvedValue(null);
      mocks.webhookLogCreate.mockResolvedValue({ id: 42 });

      await service.ingest({
        source: 'lifefile',
        eventType: 'order.updated',
        payload: {},
        rawBody: '{}',
        idempotencyKey: 'my-custom-key',
      });

      expect(mocks.idempotencyCreate).toHaveBeenCalledWith({
        data: {
          key: 'my-custom-key',
          resource: 'webhook_lifefile',
          responseStatus: 200,
          responseBody: { logId: 42 },
        },
      });
    });

    it('enqueues via BullMQ jobQueue.deliverWebhook', async () => {
      mocks.idempotencyFindFirst.mockResolvedValue(null);
      mocks.webhookLogCreate.mockResolvedValue({ id: 99 });

      await service.ingest({
        source: 'stripe',
        eventType: 'invoice.paid',
        payload: { id: 'ev_1' },
        rawBody: '{"id":"ev_1"}',
        headers: { 'x-request-id': 'req-123' },
      });

      expect(mocks.deliverWebhook).toHaveBeenCalledWith({
        url: 'internal://webhook/stripe',
        method: 'POST',
        headers: { 'x-request-id': 'req-123' },
        body: JSON.stringify({
          logId: 99,
          source: 'stripe',
          eventType: 'invoice.paid',
          payload: { id: 'ev_1' },
        }),
        retryCount: 3,
      });
    });

    it('includes clinicId in webhookLog when provided', async () => {
      mocks.idempotencyFindFirst.mockResolvedValue(null);

      await service.ingest({
        source: 'stripe',
        eventType: 'invoice.paid',
        payload: {},
        rawBody: '{}',
        clinicId: 5,
      });

      expect(mocks.webhookLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId: 5,
        }),
      });
    });

    it('returns accepted result with deliveryId on success', async () => {
      mocks.idempotencyFindFirst.mockResolvedValue(null);
      mocks.webhookLogCreate.mockResolvedValue({ id: 7 });

      const result = await service.ingest({
        source: 'stripe',
        eventType: 'invoice.paid',
        payload: {},
        rawBody: '{}',
      });

      expect(result).toEqual({ id: 7, status: 'accepted', deliveryId: 7 });
    });
  });

  describe('registerWebhookHandler and getWebhookHandler', () => {
    it('registers and retrieves handler correctly', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerWebhookHandler('custom-source', handler);

      const retrieved = getWebhookHandler('custom-source');
      expect(retrieved).toBe(handler);

      const other = getWebhookHandler('unknown-source');
      expect(other).toBeUndefined();
    });
  });
});
