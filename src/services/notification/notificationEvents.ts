/**
 * Notification Events Service
 * ===========================
 *
 * Provides easy-to-use functions for triggering push notifications
 * for all key platform events:
 *
 * - New Intakes (Patient submissions)
 * - New Payments (Stripe payments received)
 * - New Chats (Messages from patients)
 * - New RX Queue (Prescription requests)
 * - Order Updates (Shipping, tracking)
 * - Appointment Reminders
 * - System Alerts
 *
 * @example
 * ```typescript
 * import { notificationEvents } from '@/services/notification';
 *
 * // New intake submitted
 * await notificationEvents.newIntake({
 *   clinicId: 1,
 *   patientId: 123,
 *   patientName: 'John Doe',
 *   treatmentType: 'Weight Loss',
 *   isComplete: true,
 * });
 *
 * // Payment received
 * await notificationEvents.paymentReceived({
 *   clinicId: 1,
 *   patientId: 123,
 *   patientName: 'John Doe',
 *   amount: 299.00,
 *   orderId: 456,
 * });
 * ```
 */

import { notificationService } from './notificationService';
import { logger } from '@/lib/logger';
import type { NotificationCategory, NotificationPriority } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

interface BaseEventInput {
  clinicId: number;
}

interface PatientEventInput extends BaseEventInput {
  patientId: number;
  patientName: string;
}

interface NewIntakeInput extends PatientEventInput {
  treatmentType: string;
  isComplete?: boolean;
  submissionId?: string | number;
}

interface PaymentReceivedInput extends PatientEventInput {
  amount: number;
  orderId?: number;
  invoiceNumber?: string;
  paymentMethod?: string;
}

interface NewChatInput extends PatientEventInput {
  messagePreview: string;
  isUrgent?: boolean;
}

interface NewRxQueueInput extends PatientEventInput {
  treatmentType?: string;
  isRefill?: boolean;
  priority?: 'normal' | 'high' | 'urgent';
}

interface OrderUpdateInput extends PatientEventInput {
  orderId: number;
  status: string;
  trackingNumber?: string;
  carrier?: string;
}

interface AppointmentInput extends PatientEventInput {
  appointmentId: number;
  appointmentTime: Date;
  providerName?: string;
  appointmentType?: string;
}

interface RefillDueInput extends PatientEventInput {
  medicationName: string;
  daysUntilDue: number;
  shipmentNumber?: number;
  totalShipments?: number;
}

interface SystemAlertInput extends BaseEventInput {
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
}

// ============================================================================
// Notification Events Service
// ============================================================================

class NotificationEventsService {

  /**
   * NEW INTAKE - Patient submitted intake form
   * Notifies providers that a new patient is ready for review
   */
  async newIntake(input: NewIntakeInput): Promise<void> {
    try {
      const statusText = input.isComplete ? 'completed' : 'started';

      await notificationService.notifyProviders({
        clinicId: input.clinicId,
        category: 'PATIENT' as NotificationCategory,
        priority: input.isComplete ? 'HIGH' : 'NORMAL',
        title: 'New Patient Intake',
        message: `${input.patientName} ${statusText} ${input.treatmentType} intake form.`,
        actionUrl: `/patients/${input.patientId}?tab=intake`,
        sourceType: 'intake_submission',
        sourceId: input.submissionId ? `intake_${input.submissionId}` : undefined,
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          treatmentType: input.treatmentType,
          isComplete: input.isComplete,
        },
      });

      // Also notify admins for completed intakes
      if (input.isComplete) {
        await notificationService.notifyAdmins({
          clinicId: input.clinicId,
          category: 'PATIENT' as NotificationCategory,
          priority: 'NORMAL',
          title: 'New Patient Ready',
          message: `${input.patientName} completed ${input.treatmentType} intake and is ready for processing.`,
          actionUrl: `/admin/patients/${input.patientId}`,
          sourceType: 'intake_complete',
          sourceId: input.submissionId ? `intake_admin_${input.submissionId}` : undefined,
          metadata: {
            patientId: input.patientId,
            patientName: input.patientName,
            treatmentType: input.treatmentType,
          },
        });
      }

      logger.info('[NotificationEvents] New intake notification sent', {
        patientId: input.patientId,
        treatmentType: input.treatmentType,
        isComplete: input.isComplete,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send intake notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: input.patientId,
      });
    }
  }

  /**
   * PAYMENT RECEIVED - Stripe payment completed
   * Notifies admins of successful payment
   */
  async paymentReceived(input: PaymentReceivedInput): Promise<void> {
    try {
      const amountFormatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(input.amount);

      await notificationService.notifyAdmins({
        clinicId: input.clinicId,
        category: 'PAYMENT' as NotificationCategory,
        priority: 'NORMAL',
        title: 'Payment Received',
        message: `${input.patientName} paid ${amountFormatted}${input.invoiceNumber ? ` (Invoice #${input.invoiceNumber})` : ''}`,
        actionUrl: input.orderId
          ? `/admin/orders/${input.orderId}`
          : `/admin/patients/${input.patientId}?tab=billing`,
        sourceType: 'payment_received',
        sourceId: input.orderId ? `payment_${input.orderId}` : undefined,
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          amount: input.amount,
          orderId: input.orderId,
          invoiceNumber: input.invoiceNumber,
          paymentMethod: input.paymentMethod,
        },
      });

      logger.info('[NotificationEvents] Payment notification sent', {
        patientId: input.patientId,
        amount: input.amount,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send payment notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: input.patientId,
      });
    }
  }

  /**
   * NEW CHAT - Patient sent a message
   * Notifies providers of new patient message
   */
  async newChat(input: NewChatInput): Promise<void> {
    try {
      await notificationService.notifyProviders({
        clinicId: input.clinicId,
        category: 'MESSAGE' as NotificationCategory,
        priority: input.isUrgent ? 'HIGH' : 'NORMAL',
        title: 'New Message',
        message: `${input.patientName}: "${input.messagePreview.slice(0, 100)}${input.messagePreview.length > 100 ? '...' : ''}"`,
        actionUrl: `/communications/chat?patientId=${input.patientId}`,
        sourceType: 'chat_message',
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          isUrgent: input.isUrgent,
        },
      });

      // Also notify admins for urgent messages
      if (input.isUrgent) {
        await notificationService.notifyAdmins({
          clinicId: input.clinicId,
          category: 'MESSAGE' as NotificationCategory,
          priority: 'HIGH',
          title: 'Urgent Message',
          message: `${input.patientName} sent an urgent message`,
          actionUrl: `/communications/chat?patientId=${input.patientId}`,
          sourceType: 'urgent_chat',
          metadata: {
            patientId: input.patientId,
            patientName: input.patientName,
          },
        });
      }

      logger.info('[NotificationEvents] Chat notification sent', {
        patientId: input.patientId,
        isUrgent: input.isUrgent,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send chat notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: input.patientId,
      });
    }
  }

  /**
   * NEW RX QUEUE - Patient added to prescription queue
   * Notifies providers of new prescription request
   */
  async newRxQueue(input: NewRxQueueInput): Promise<void> {
    try {
      const priorityMap: Record<string, NotificationPriority> = {
        'normal': 'NORMAL',
        'high': 'HIGH',
        'urgent': 'URGENT',
      };

      const title = input.isRefill ? 'Refill Request' : 'New Rx Request';
      const typeText = input.treatmentType ? ` for ${input.treatmentType}` : '';

      await notificationService.notifyProviders({
        clinicId: input.clinicId,
        category: 'REFILL' as NotificationCategory,
        priority: priorityMap[input.priority || 'normal'],
        title,
        message: `${input.patientName}${typeText} needs prescription review.`,
        actionUrl: `/provider/prescription-queue?patientId=${input.patientId}`,
        sourceType: 'rx_queue',
        sourceId: `rx_${input.patientId}_${Date.now()}`,
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          treatmentType: input.treatmentType,
          isRefill: input.isRefill,
        },
      });

      logger.info('[NotificationEvents] RX queue notification sent', {
        patientId: input.patientId,
        isRefill: input.isRefill,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send RX queue notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: input.patientId,
      });
    }
  }

  /**
   * ORDER UPDATE - Order status changed
   * Notifies admins of order status changes (shipping, tracking, etc.)
   */
  async orderUpdate(input: OrderUpdateInput): Promise<void> {
    try {
      let title = 'Order Update';

      // Customize based on status
      const statusLower = input.status.toLowerCase();
      if (statusLower.includes('ship')) {
        title = 'Order Shipped';
      } else if (statusLower.includes('deliver')) {
        title = 'Order Delivered';
      } else if (statusLower.includes('ready')) {
        title = 'Order Ready';
      }

      const trackingText = input.trackingNumber
        ? `\nTracking: ${input.trackingNumber}${input.carrier ? ` (${input.carrier})` : ''}`
        : '';

      await notificationService.notifyAdmins({
        clinicId: input.clinicId,
        category: 'ORDER' as NotificationCategory,
        priority: 'NORMAL',
        title,
        message: `${input.patientName}'s order: ${input.status}${trackingText}`,
        actionUrl: `/admin/orders/${input.orderId}`,
        sourceType: 'order_update',
        sourceId: `order_${input.orderId}_${input.status}`,
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          orderId: input.orderId,
          status: input.status,
          trackingNumber: input.trackingNumber,
          carrier: input.carrier,
        },
      });

      logger.info('[NotificationEvents] Order update notification sent', {
        orderId: input.orderId,
        status: input.status,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send order notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId: input.orderId,
      });
    }
  }

  /**
   * APPOINTMENT REMINDER - Upcoming appointment
   * Notifies providers of upcoming appointments
   */
  async appointmentReminder(input: AppointmentInput): Promise<void> {
    try {
      const timeFormatted = input.appointmentTime.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      await notificationService.notifyProviders({
        clinicId: input.clinicId,
        category: 'APPOINTMENT' as NotificationCategory,
        priority: 'NORMAL',
        title: 'Upcoming Appointment',
        message: `${input.patientName} - ${timeFormatted}${input.appointmentType ? ` (${input.appointmentType})` : ''}`,
        actionUrl: `/provider/appointments/${input.appointmentId}`,
        sourceType: 'appointment_reminder',
        sourceId: `appt_${input.appointmentId}`,
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          appointmentId: input.appointmentId,
          appointmentTime: input.appointmentTime.toISOString(),
          providerName: input.providerName,
        },
      });

      logger.info('[NotificationEvents] Appointment reminder sent', {
        appointmentId: input.appointmentId,
        appointmentTime: input.appointmentTime,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send appointment notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        appointmentId: input.appointmentId,
      });
    }
  }

  /**
   * REFILL DUE - Patient refill coming up
   * Notifies admins about upcoming refills
   */
  async refillDue(input: RefillDueInput): Promise<void> {
    try {
      const shipmentText = input.shipmentNumber && input.totalShipments
        ? ` (${input.shipmentNumber}/${input.totalShipments})`
        : '';

      await notificationService.notifyAdmins({
        clinicId: input.clinicId,
        category: 'REFILL' as NotificationCategory,
        priority: input.daysUntilDue <= 3 ? 'HIGH' : 'NORMAL',
        title: input.daysUntilDue <= 3 ? 'Refill Due Soon' : 'Refill Due',
        message: `${input.patientName}'s ${input.medicationName}${shipmentText} due in ${input.daysUntilDue} days`,
        actionUrl: `/admin/patients/${input.patientId}?tab=refills`,
        sourceType: 'refill_due',
        sourceId: `refill_${input.patientId}_${Date.now()}`,
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          medicationName: input.medicationName,
          daysUntilDue: input.daysUntilDue,
          shipmentNumber: input.shipmentNumber,
          totalShipments: input.totalShipments,
        },
      });

      logger.info('[NotificationEvents] Refill due notification sent', {
        patientId: input.patientId,
        daysUntilDue: input.daysUntilDue,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send refill notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: input.patientId,
      });
    }
  }

  /**
   * SYSTEM ALERT - Platform-wide or clinic-wide alert
   * Notifies admins of system events
   */
  async systemAlert(input: SystemAlertInput): Promise<void> {
    try {
      await notificationService.notifyAdmins({
        clinicId: input.clinicId,
        category: 'SYSTEM' as NotificationCategory,
        priority: input.priority || 'NORMAL',
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        sourceType: 'system_alert',
        metadata: {},
      });

      logger.info('[NotificationEvents] System alert sent', {
        clinicId: input.clinicId,
        title: input.title,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send system alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        title: input.title,
      });
    }
  }

  /**
   * PRESCRIPTION READY - Rx approved and ready
   * Notifies admins that prescription is approved
   */
  async prescriptionReady(input: PatientEventInput & {
    medicationName: string;
    providerId?: number;
    providerName?: string;
  }): Promise<void> {
    try {
      await notificationService.notifyAdmins({
        clinicId: input.clinicId,
        category: 'PRESCRIPTION' as NotificationCategory,
        priority: 'NORMAL',
        title: 'Rx Approved',
        message: `${input.patientName}'s ${input.medicationName} prescription approved${input.providerName ? ` by ${input.providerName}` : ''}`,
        actionUrl: `/admin/patients/${input.patientId}?tab=prescriptions`,
        sourceType: 'rx_approved',
        metadata: {
          patientId: input.patientId,
          patientName: input.patientName,
          medicationName: input.medicationName,
          providerId: input.providerId,
          providerName: input.providerName,
        },
      });

      logger.info('[NotificationEvents] Prescription ready notification sent', {
        patientId: input.patientId,
        medicationName: input.medicationName,
      });
    } catch (error) {
      logger.error('[NotificationEvents] Failed to send prescription notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: input.patientId,
      });
    }
  }
}

// Export singleton instance
export const notificationEvents = new NotificationEventsService();
export default notificationEvents;
