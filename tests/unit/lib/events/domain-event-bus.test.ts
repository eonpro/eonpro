import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  domainEvents,
  DOMAIN_EVENTS,
} from '@/lib/events/domain-event-bus';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('domain-event-bus', () => {
  beforeEach(() => {
    domainEvents.unsubscribeAll();
  });

  describe('DOMAIN_EVENTS', () => {
    it('has expected event types', () => {
      expect(DOMAIN_EVENTS.ORDER_CREATED).toBe('OrderCreated');
      expect(DOMAIN_EVENTS.ORDER_SUBMITTED).toBe('OrderSubmitted');
      expect(DOMAIN_EVENTS.ORDER_COMPLETED).toBe('OrderCompleted');
      expect(DOMAIN_EVENTS.ORDER_FAILED).toBe('OrderFailed');
      expect(DOMAIN_EVENTS.PRESCRIPTION_SUBMITTED).toBe('PrescriptionSubmitted');
      expect(DOMAIN_EVENTS.PRESCRIPTION_QUEUED).toBe('PrescriptionQueued');
      expect(DOMAIN_EVENTS.PRESCRIPTION_APPROVED).toBe('PrescriptionApproved');
      expect(DOMAIN_EVENTS.PRESCRIPTION_DECLINED).toBe('PrescriptionDeclined');
      expect(DOMAIN_EVENTS.PATIENT_CREATED).toBe('PatientCreated');
      expect(DOMAIN_EVENTS.PATIENT_UPDATED).toBe('PatientUpdated');
      expect(DOMAIN_EVENTS.INTAKE_COMPLETED).toBe('IntakeCompleted');
      expect(DOMAIN_EVENTS.PAYMENT_RECEIVED).toBe('PaymentReceived');
      expect(DOMAIN_EVENTS.PAYMENT_FAILED).toBe('PaymentFailed');
      expect(DOMAIN_EVENTS.APPOINTMENT_SCHEDULED).toBe('AppointmentScheduled');
      expect(DOMAIN_EVENTS.APPOINTMENT_CANCELLED).toBe('AppointmentCancelled');
      expect(DOMAIN_EVENTS.SUBSCRIPTION_CREATED).toBe('SubscriptionCreated');
      expect(DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED).toBe('SubscriptionCancelled');
      expect(DOMAIN_EVENTS.SUBSCRIPTION_PAUSED).toBe('SubscriptionPaused');
      expect(DOMAIN_EVENTS.SUBSCRIPTION_RESUMED).toBe('SubscriptionResumed');
    });
  });

  describe('subscribe and publish', () => {
    it('delivers event to handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, handler);

      await domainEvents.publish({
        type: DOMAIN_EVENTS.ORDER_CREATED,
        payload: { orderId: 123, patientId: 456 },
        metadata: { userId: '1', clinicId: '2' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DOMAIN_EVENTS.ORDER_CREATED,
          payload: { orderId: 123, patientId: 456 },
          metadata: expect.objectContaining({
            userId: '1',
            clinicId: '2',
          }),
        })
      );
    });

    it('multiple subscribers all receive the same event', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, handler1);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, handler2);

      await domainEvents.publish({
        type: DOMAIN_EVENTS.ORDER_CREATED,
        payload: { orderId: 1 },
        metadata: { userId: '1', clinicId: '2' },
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler1.mock.calls[0][0]).toEqual(handler2.mock.calls[0][0]);
    });

    it('unsubscribeAll clears all handlers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, handler);
      expect(domainEvents.getHandlerCount(DOMAIN_EVENTS.ORDER_CREATED)).toBe(1);

      domainEvents.unsubscribeAll();
      expect(domainEvents.getHandlerCount()).toBe(0);

      await domainEvents.publish({
        type: DOMAIN_EVENTS.ORDER_CREATED,
        payload: {},
        metadata: { userId: '1', clinicId: '2' },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('handler that throws does not prevent other handlers from running', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      const succeedingHandler = vi.fn().mockResolvedValue(undefined);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, failingHandler);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, succeedingHandler);

      await domainEvents.publish({
        type: DOMAIN_EVENTS.ORDER_CREATED,
        payload: {},
        metadata: { userId: '1', clinicId: '2' },
      });

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(succeedingHandler).toHaveBeenCalledTimes(1);
    });

    it('event metadata includes timestamp and correlationId', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      domainEvents.subscribe(DOMAIN_EVENTS.ORDER_CREATED, handler);

      const beforePublish = Date.now();
      await domainEvents.publish({
        type: DOMAIN_EVENTS.ORDER_CREATED,
        payload: {},
        metadata: {
          userId: '1',
          clinicId: '2',
          correlationId: 'custom-correlation-123',
          timestamp: new Date(beforePublish),
        },
      });
      const afterPublish = Date.now();

      const receivedEvent = handler.mock.calls[0][0];
      expect(receivedEvent.metadata.correlationId).toBe('custom-correlation-123');
      expect(receivedEvent.metadata.timestamp).toBeInstanceOf(Date);
      expect(receivedEvent.metadata.timestamp!.getTime()).toBeGreaterThanOrEqual(beforePublish);
      expect(receivedEvent.metadata.timestamp!.getTime()).toBeLessThanOrEqual(afterPublish + 10);
    });

    it('publishing with no subscribers does not throw', async () => {
      await expect(
        domainEvents.publish({
          type: DOMAIN_EVENTS.ORDER_CREATED,
          payload: {},
          metadata: { userId: '1', clinicId: '2' },
        })
      ).resolves.toBeUndefined();
    });
  });
});
