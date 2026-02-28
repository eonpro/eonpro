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
        const sigBuf = Buffer.from(options.signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
      }

      if (options.algorithm === 'hmac-sha1') {
        const expected = crypto
          .createHmac('sha1', options.secret)
          .update(options.rawBody)
          .digest('hex');
        const sigBuf = Buffer.from(options.signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
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

      // Step 2: Persist raw payload for audit trail and replay capability
      const delivery = await basePrisma.webhookDelivery.create({
        data: {
          source: options.source,
          eventType: options.eventType,
          payload: options.payload as any,
          rawBody: options.rawBody,
          signature: options.signature ?? null,
          idempotencyKey,
          status: 'RECEIVED' as any,
          receivedAt: new Date(),
        },
      });

      // Step 3: Record idempotency key (7-day TTL)
      await basePrisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          response: JSON.stringify({ deliveryId: delivery.id }),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        } as any,
      });

      // Step 4: Enqueue for async processing via BullMQ
      try {
        const { jobQueue } = await import('@/lib/queue/jobQueue');
        await jobQueue.deliverWebhook({
          url: `internal://webhook/${options.source}`,
          method: 'POST',
          headers: options.headers ?? {},
          body: JSON.stringify({
            deliveryId: delivery.id,
            source: options.source,
            eventType: options.eventType,
            payload: options.payload,
          }),
          retryCount: 3,
        });
      } catch (err) {
        logger.warn('[WebhookService] BullMQ enqueue failed, processing synchronously', {
          deliveryId: delivery.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });

        // Fallback: process synchronously if queue unavailable
        const handler = getWebhookHandler(options.source);
        if (handler) {
          try {
            await handler(delivery.id, options.payload);
          } catch (handlerErr) {
            logger.error('[WebhookService] Synchronous handler failed', {
              deliveryId: delivery.id,
              source: options.source,
              error: handlerErr instanceof Error ? handlerErr.message : 'Unknown',
            });
          }
        }
      }

      // Step 5: Mark as processing
      await basePrisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'PROCESSING' as any },
      });

      logger.info('[WebhookService] Webhook accepted', {
        source: options.source,
        eventType: options.eventType,
        deliveryId: delivery.id,
      });

      return { id: delivery.id, status: 'accepted', deliveryId: delivery.id };
    },
  };
}

export const webhookService = createWebhookService();
