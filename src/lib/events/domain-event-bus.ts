/**
 * Domain Event Bus
 * ================
 *
 * Simple in-process event bus for decoupled cross-domain communication.
 * Events are dispatched asynchronously and handler failures are isolated
 * (one handler's failure doesn't prevent others from executing).
 *
 * This is intentionally NOT Kafka/RabbitMQ — it's proportional to the
 * current scale. The interface is designed so that a message broker can
 * be swapped in later without changing publisher or subscriber code.
 *
 * Usage:
 *   // Publishing (in a domain service):
 *   import { domainEvents } from '@/lib/events/domain-event-bus';
 *   await domainEvents.publish({
 *     type: 'OrderCreated',
 *     payload: { orderId: 123, patientId: 456 },
 *     metadata: { userId: '1', clinicId: '2', correlationId: requestId },
 *   });
 *
 *   // Subscribing (in app initialization or domain module):
 *   domainEvents.subscribe('OrderCreated', async (event) => {
 *     await notificationService.sendOrderConfirmation(event.payload.orderId);
 *   });
 *
 * @module events/domain-event-bus
 */

import { logger } from '@/lib/logger';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface DomainEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  payload: T;
  metadata: EventMetadata;
}

export interface EventMetadata {
  userId: string;
  clinicId: string;
  correlationId: string;
  timestamp?: Date;
  source?: string;
}

export type EventHandler<T extends Record<string, unknown> = Record<string, unknown>> = (
  event: DomainEvent<T>
) => Promise<void>;

export interface DomainEventBus {
  publish(event: Omit<DomainEvent, 'metadata'> & { metadata: Partial<EventMetadata> & { userId: string; clinicId: string } }): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): () => void;
  unsubscribeAll(eventType?: string): void;
}

// ============================================================================
// Known Event Types
// ============================================================================

export const DOMAIN_EVENTS = {
  // Order lifecycle
  ORDER_CREATED: 'OrderCreated',
  ORDER_SUBMITTED: 'OrderSubmitted',
  ORDER_COMPLETED: 'OrderCompleted',
  ORDER_FAILED: 'OrderFailed',

  // Prescription workflow
  PRESCRIPTION_SUBMITTED: 'PrescriptionSubmitted',
  PRESCRIPTION_QUEUED: 'PrescriptionQueued',
  PRESCRIPTION_APPROVED: 'PrescriptionApproved',
  PRESCRIPTION_DECLINED: 'PrescriptionDeclined',

  // Patient lifecycle
  PATIENT_CREATED: 'PatientCreated',
  PATIENT_UPDATED: 'PatientUpdated',

  // Intake
  INTAKE_COMPLETED: 'IntakeCompleted',

  // Payment
  PAYMENT_RECEIVED: 'PaymentReceived',
  PAYMENT_FAILED: 'PaymentFailed',

  // Appointment
  APPOINTMENT_SCHEDULED: 'AppointmentScheduled',
  APPOINTMENT_CANCELLED: 'AppointmentCancelled',

  // Subscription
  SUBSCRIPTION_CREATED: 'SubscriptionCreated',
  SUBSCRIPTION_CANCELLED: 'SubscriptionCancelled',
  SUBSCRIPTION_PAUSED: 'SubscriptionPaused',
  SUBSCRIPTION_RESUMED: 'SubscriptionResumed',
} as const;

// ============================================================================
// Implementation
// ============================================================================

class InProcessEventBus implements DomainEventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private eventLog: Array<{ event: DomainEvent; timestamp: Date }> = [];
  private maxLogSize = 1000;

  async publish(
    event: Omit<DomainEvent, 'metadata'> & { metadata: Partial<EventMetadata> & { userId: string; clinicId: string } }
  ): Promise<void> {
    const fullEvent: DomainEvent = {
      type: event.type,
      payload: event.payload,
      metadata: {
        userId: event.metadata.userId,
        clinicId: event.metadata.clinicId,
        correlationId: event.metadata.correlationId ?? crypto.randomUUID(),
        timestamp: event.metadata.timestamp ?? new Date(),
        source: event.metadata.source ?? 'domain-service',
      },
    };

    // Append to in-memory event log (for debugging and audit)
    this.eventLog.push({ event: fullEvent, timestamp: new Date() });
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    logger.info('[EventBus] Publishing event', {
      type: fullEvent.type,
      correlationId: fullEvent.metadata.correlationId,
      clinicId: fullEvent.metadata.clinicId,
    });

    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) {
      logger.debug('[EventBus] No handlers for event type', { type: event.type });
      return;
    }

    // Execute all handlers in parallel, isolating failures
    const results = await Promise.allSettled(
      Array.from(handlers).map((handler) => handler(fullEvent))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('[EventBus] Handler failed', {
          type: event.type,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          correlationId: fullEvent.metadata.correlationId,
        });
      }
    }
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    logger.debug('[EventBus] Handler subscribed', {
      type: eventType,
      totalHandlers: this.handlers.get(eventType)!.size,
    });

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  unsubscribeAll(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  getRecentEvents(limit = 50): Array<{ event: DomainEvent; timestamp: Date }> {
    return this.eventLog.slice(-limit);
  }

  getHandlerCount(eventType?: string): number {
    if (eventType) {
      return this.handlers.get(eventType)?.size ?? 0;
    }
    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return total;
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const domainEvents: DomainEventBus & {
  getRecentEvents: (limit?: number) => Array<{ event: DomainEvent; timestamp: Date }>;
  getHandlerCount: (eventType?: string) => number;
} = new InProcessEventBus();
