/**
 * Webhook Domain
 *
 * Webhook ingestion and processing. Handles incoming webhooks from
 * external services (Stripe, Lifefile, Twilio, etc.) with signature
 * verification, idempotency, and async processing via BullMQ.
 *
 * @module domains/webhook
 */

export {
  webhookService,
  createWebhookService,
  registerWebhookHandler,
  getWebhookHandler,
} from './services/webhook.service';
export type {
  WebhookService,
  WebhookIngestOptions,
  WebhookIngestResult,
  SignatureVerifyOptions,
} from './services/webhook.service';
