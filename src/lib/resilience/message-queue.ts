/**
 * FAILED MESSAGE QUEUE
 * ====================
 *
 * When circuit breakers trip for email/SMS services, messages are queued
 * to this database-backed queue for retry instead of being dropped.
 *
 * Messages are persisted to the database and processed by a cron job
 * when the service recovers.
 *
 * Usage:
 *   import { queueFailedMessage, processFailedMessages } from '@/lib/resilience/message-queue';
 *
 *   // Queue a failed email
 *   await queueFailedMessage({
 *     service: 'email',
 *     operation: 'send',
 *     payload: { to, subject, body },
 *     error: 'SES circuit breaker open',
 *   });
 *
 *   // Process queued messages (from cron)
 *   await processFailedMessages('email', processFn);
 *
 * @module resilience/message-queue
 */

import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface QueuedMessage {
  id: string;
  service: 'email' | 'sms' | 'webhook' | 'notification';
  operation: string;
  payload: Record<string, unknown>;
  error: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  nextRetryAt: string;
}

// ============================================================================
// Constants
// ============================================================================

const QUEUE_NAMESPACE = 'msg-queue';
const MAX_RETRY_ATTEMPTS = 5;
const MAX_QUEUE_SIZE = 1000;
const MESSAGE_TTL_SECONDS = 86400; // 24 hours

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Queue a failed message for later retry.
 * Messages are stored in Redis with a 24-hour TTL.
 */
export async function queueFailedMessage(data: {
  service: QueuedMessage['service'];
  operation: string;
  payload: Record<string, unknown>;
  error: string;
}): Promise<{ queued: boolean; messageId: string }> {
  const messageId = `${data.service}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const message: QueuedMessage = {
    id: messageId,
    service: data.service,
    operation: data.operation,
    payload: data.payload,
    error: data.error,
    attempts: 0,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    createdAt: new Date().toISOString(),
    nextRetryAt: new Date(Date.now() + 60000).toISOString(), // Retry in 1 minute
  };

  try {
    if (!cache.isReady()) {
      logger.warn('[MessageQueue] Redis not available, message will be lost', {
        service: data.service,
        operation: data.operation,
      });
      return { queued: false, messageId };
    }

    // Store the message
    await cache.set(`${data.service}:${messageId}`, message, {
      namespace: QUEUE_NAMESPACE,
      ttl: MESSAGE_TTL_SECONDS,
    });

    // Add to the service's queue index
    const indexKey = `${data.service}:index`;
    const existingIndex = await cache.get<string[]>(indexKey, { namespace: QUEUE_NAMESPACE });
    const index = existingIndex || [];

    // Enforce max queue size
    if (index.length >= MAX_QUEUE_SIZE) {
      logger.warn('[MessageQueue] Queue full, dropping oldest message', {
        service: data.service,
        size: index.length,
      });
      const droppedId = index.shift();
      if (droppedId) {
        await cache.delete(`${data.service}:${droppedId}`, { namespace: QUEUE_NAMESPACE });
      }
    }

    index.push(messageId);
    await cache.set(indexKey, index, {
      namespace: QUEUE_NAMESPACE,
      ttl: MESSAGE_TTL_SECONDS,
    });

    logger.info('[MessageQueue] Message queued for retry', {
      messageId,
      service: data.service,
      operation: data.operation,
    });

    return { queued: true, messageId };
  } catch (error) {
    logger.error('[MessageQueue] Failed to queue message', undefined, {
      error: error instanceof Error ? error.message : 'Unknown',
      service: data.service,
    });
    return { queued: false, messageId };
  }
}

/**
 * Process queued messages for a service.
 * Called by cron job when service is available again.
 *
 * @param service - Service type to process
 * @param processor - Function to process each message
 * @returns Number of successfully processed messages
 */
export async function processFailedMessages(
  service: QueuedMessage['service'],
  processor: (payload: Record<string, unknown>, operation: string) => Promise<boolean>
): Promise<{ processed: number; failed: number; remaining: number }> {
  let processed = 0;
  let failed = 0;

  try {
    if (!cache.isReady()) {
      return { processed: 0, failed: 0, remaining: 0 };
    }

    const indexKey = `${service}:index`;
    const index = await cache.get<string[]>(indexKey, { namespace: QUEUE_NAMESPACE });

    if (!index || index.length === 0) {
      return { processed: 0, failed: 0, remaining: 0 };
    }

    const remainingIds: string[] = [];

    for (const messageId of index) {
      const message = await cache.get<QueuedMessage>(`${service}:${messageId}`, {
        namespace: QUEUE_NAMESPACE,
      });

      if (!message) {
        continue; // Message expired or already processed
      }

      // Check if it's time to retry
      if (new Date(message.nextRetryAt) > new Date()) {
        remainingIds.push(messageId);
        continue;
      }

      try {
        const success = await processor(message.payload, message.operation);

        if (success) {
          // Remove from queue
          await cache.delete(`${service}:${messageId}`, { namespace: QUEUE_NAMESPACE });
          processed++;

          logger.info('[MessageQueue] Message processed successfully', {
            messageId,
            service,
            attempts: message.attempts + 1,
          });
        } else {
          throw new Error('Processor returned false');
        }
      } catch (error) {
        message.attempts++;

        if (message.attempts >= message.maxAttempts) {
          // Dead letter — remove from queue and log
          await cache.delete(`${service}:${messageId}`, { namespace: QUEUE_NAMESPACE });
          failed++;

          logger.error('[MessageQueue] Message exhausted retries (DLQ)', undefined, {
            messageId,
            service,
            operation: message.operation,
            attempts: message.attempts,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        } else {
          // Exponential backoff for next retry
          const backoffMs = Math.min(
            60000 * Math.pow(2, message.attempts),
            3600000 // Max 1 hour
          );
          message.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

          await cache.set(`${service}:${messageId}`, message, {
            namespace: QUEUE_NAMESPACE,
            ttl: MESSAGE_TTL_SECONDS,
          });
          remainingIds.push(messageId);

          logger.warn('[MessageQueue] Message retry failed, will retry later', {
            messageId,
            service,
            attempts: message.attempts,
            nextRetryAt: message.nextRetryAt,
          });
        }
      }
    }

    // Update index
    await cache.set(indexKey, remainingIds, {
      namespace: QUEUE_NAMESPACE,
      ttl: MESSAGE_TTL_SECONDS,
    });

    return { processed, failed, remaining: remainingIds.length };
  } catch (error) {
    logger.error('[MessageQueue] Processing failed', undefined, {
      service,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return { processed, failed, remaining: 0 };
  }
}

/**
 * Get queue statistics for monitoring.
 */
export async function getQueueStats(): Promise<
  Record<string, { pending: number; oldest?: string }>
> {
  const services: QueuedMessage['service'][] = ['email', 'sms', 'webhook', 'notification'];
  const stats: Record<string, { pending: number; oldest?: string }> = {};

  for (const service of services) {
    try {
      const indexKey = `${service}:index`;
      const index = await cache.get<string[]>(indexKey, { namespace: QUEUE_NAMESPACE });
      stats[service] = { pending: index?.length || 0 };

      // Get oldest message timestamp
      if (index && index.length > 0) {
        const oldest = await cache.get<QueuedMessage>(`${service}:${index[0]}`, {
          namespace: QUEUE_NAMESPACE,
        });
        if (oldest) {
          stats[service].oldest = oldest.createdAt;
        }
      }
    } catch {
      stats[service] = { pending: 0 };
    }
  }

  return stats;
}
