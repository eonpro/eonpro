/**
 * Webhook Ingestion Service
 *
 * Standardized webhook ingestion pipeline for all external providers.
 * Handles signature verification, deduplication, persistence, and queuing.
 *
 * Pipeline:  Receive → Verify Signature → Deduplicate → Persist → Enqueue → ACK
 *
 * @module domains/webhook/services
 */

import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface WebhookService {
  ingest(options: WebhookIngestOptions): Promise<WebhookIngestResult>;
  verifySignature(options: SignatureVerifyOptions): boolean;
}

export interface WebhookIngestOptions {
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  rawBody: string;
  signature?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  clinicId?: number;
}

export interface WebhookIngestResult {
  id: number;
  status: 'accepted' | 'duplicate' | 'rejected';
  deliveryId?: number;
}

export interface SignatureVerifyOptions {
  algorithm: 'hmac-sha256' | 'hmac-sha1' | 'stripe' | 'none';
  rawBody: string;
  signature: string;
  secret: string;
}

type WebhookHandler = (deliveryId: number, payload: Record<string, unknown>) => Promise<void>;

// ============================================================================
// Webhook Handler Registry
// ============================================================================

const handlerRegistry = new Map<string, WebhookHandler>();

export function registerWebhookHandler(source: string, handler: WebhookHandler): void {
  handlerRegistry.set(source, handler);
  logger.info('[WebhookService] Handler registered', { source });
}

export function getWebhookHandler(source: string): WebhookHandler | undefined {
  return handlerRegistry.get(source);
}

// ============================================================================
// Service Implementation
// ============================================================================

export function createWebhookService(): WebhookService {
  return {
    verifySignature(options: SignatureVerifyOptions): boolean {
      if (options.algorithm === 'none') return true;

      if (options.algorithm === 'hmac-sha256') {
        const expected = crypto
          .createHmac('sha256', options.secret)
          .update(options.rawBody)
          .digest('hex');
        return crypto.timingSafeEqual(
          Buffer.from(options.signature),
          Buffer.from(expected),
        );
      }

      if (options.algorithm === 'hmac-sha1') {
        const expected = crypto
          .createHmac('sha1', options.secret)
          .update(options.rawBody)
          .digest('hex');
        return crypto.timingSafeEqual(
          Buffer.from(options.signature),
          Buffer.from(expected),
        );
      }

      // Stripe signature handled separately by Stripe SDK
      if (options.algorithm === 'stripe') return true;

      return false;
    },

    async ingest(options: WebhookIngestOptions): Promise<WebhookIngestResult> {
      const idempotencyKey = options.idempotencyKey ||
        crypto.createHash('sha256').update(options.rawBody).digest('hex');

      // Step 1: Deduplication check
      const existing = await basePrisma.idempotencyRecord.findFirst({
        where: { key: idempotencyKey },
      });
      if (existing) {
        logger.info('[WebhookService] Duplicate webhook detected', {
          source: options.source,
          idempotencyKey,
        });
        return { id: 0, status: 'duplicate' };
      }

      // Step 2: Persist raw payload to WebhookLog for audit trail and replay
      const logEntry = await basePrisma.webhookLog.create({
        data: {
          source: options.source,
          eventType: options.eventType,
          payload: options.payload as any,
          status: 'SUCCESS',
          metadata: { rawBody: options.rawBody, signature: options.signature ?? null },
          ...(options.clinicId ? { clinicId: options.clinicId } : {}),
        },
      });

      // Step 3: Record idempotency key
      await basePrisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          resource: `webhook_${options.source}`,
          responseStatus: 200,
          responseBody: { logId: logEntry.id } as any,
        },
      });

      // Step 4: Enqueue for async processing via BullMQ
      try {
        const { jobQueue } = await import('@/lib/queue/jobQueue');
        await jobQueue.deliverWebhook({
          url: `internal://webhook/${options.source}`,
          method: 'POST',
          headers: options.headers ?? {},
          body: JSON.stringify({
            logId: logEntry.id,
            source: options.source,
            eventType: options.eventType,
            payload: options.payload,
          }),
          retryCount: 3,
        });
      } catch (err) {
        logger.warn('[WebhookService] BullMQ enqueue failed, processing synchronously', {
          logId: logEntry.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });

        const handler = getWebhookHandler(options.source);
        if (handler) {
          try {
            await handler(logEntry.id, options.payload);
          } catch (handlerErr) {
            logger.error('[WebhookService] Synchronous handler failed', {
              logId: logEntry.id,
              source: options.source,
              error: handlerErr instanceof Error ? handlerErr.message : 'Unknown',
            });
            await basePrisma.webhookLog.update({
              where: { id: logEntry.id },
              data: { status: 'PROCESSING_ERROR', errorMessage: handlerErr instanceof Error ? handlerErr.message : 'Unknown' },
            });
          }
        }
      }

      logger.info('[WebhookService] Webhook accepted', {
        source: options.source,
        eventType: options.eventType,
        logId: logEntry.id,
      });

      return { id: logEntry.id, status: 'accepted', deliveryId: logEntry.id };
    },
  };
}

export const webhookService = createWebhookService();
