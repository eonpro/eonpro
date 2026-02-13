/**
 * Email Automation Service
 *
 * Configure and trigger automated emails based on platform events.
 * Supports scheduling, triggers, and admin configuration.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendTemplatedEmail, EmailTemplate, EmailPriority } from '@/lib/email';
import { emailLogService } from '@/services/email/emailLogService';

// ============================================
// AUTOMATION TRIGGER TYPES
// ============================================

export enum AutomationTrigger {
  // Patient Events
  PATIENT_CREATED = 'patient_created',
  PATIENT_WELCOME = 'patient_welcome',

  // Appointment Events
  APPOINTMENT_BOOKED = 'appointment_booked',
  APPOINTMENT_REMINDER_24H = 'appointment_reminder_24h',
  APPOINTMENT_REMINDER_2H = 'appointment_reminder_2h',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  APPOINTMENT_RESCHEDULED = 'appointment_rescheduled',
  APPOINTMENT_COMPLETED = 'appointment_completed',

  // Order Events
  ORDER_CREATED = 'order_created',
  ORDER_CONFIRMED = 'order_confirmed',
  ORDER_SHIPPED = 'order_shipped',
  ORDER_DELIVERED = 'order_delivered',

  // Prescription Events
  PRESCRIPTION_READY = 'prescription_ready',
  PRESCRIPTION_EXPIRING = 'prescription_expiring',
  REFILL_REMINDER = 'refill_reminder',

  // Billing Events
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
  INVOICE_SENT = 'invoice_sent',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',

  // Account Events
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFICATION = 'email_verification',

  // Provider Events
  NEW_PATIENT_ASSIGNED = 'new_patient_assigned',
  DOCUMENT_RECEIVED = 'document_received',
}

// Map triggers to email templates
const TRIGGER_TEMPLATE_MAP: Record<AutomationTrigger, EmailTemplate> = {
  [AutomationTrigger.PATIENT_CREATED]: EmailTemplate.WELCOME,
  [AutomationTrigger.PATIENT_WELCOME]: EmailTemplate.WELCOME,
  [AutomationTrigger.APPOINTMENT_BOOKED]: EmailTemplate.APPOINTMENT_CONFIRMATION,
  [AutomationTrigger.APPOINTMENT_REMINDER_24H]: EmailTemplate.APPOINTMENT_REMINDER,
  [AutomationTrigger.APPOINTMENT_REMINDER_2H]: EmailTemplate.APPOINTMENT_REMINDER,
  [AutomationTrigger.APPOINTMENT_CANCELLED]: EmailTemplate.APPOINTMENT_CANCELLED,
  [AutomationTrigger.APPOINTMENT_RESCHEDULED]: EmailTemplate.APPOINTMENT_RESCHEDULED,
  [AutomationTrigger.APPOINTMENT_COMPLETED]: EmailTemplate.CUSTOM,
  [AutomationTrigger.ORDER_CREATED]: EmailTemplate.ORDER_CONFIRMATION,
  [AutomationTrigger.ORDER_CONFIRMED]: EmailTemplate.ORDER_CONFIRMATION,
  [AutomationTrigger.ORDER_SHIPPED]: EmailTemplate.ORDER_SHIPPED,
  [AutomationTrigger.ORDER_DELIVERED]: EmailTemplate.ORDER_DELIVERED,
  [AutomationTrigger.PRESCRIPTION_READY]: EmailTemplate.PRESCRIPTION_READY,
  [AutomationTrigger.PRESCRIPTION_EXPIRING]: EmailTemplate.PRESCRIPTION_EXPIRING,
  [AutomationTrigger.REFILL_REMINDER]: EmailTemplate.REFILL_REMINDER,
  [AutomationTrigger.PAYMENT_RECEIVED]: EmailTemplate.PAYMENT_RECEIVED,
  [AutomationTrigger.PAYMENT_FAILED]: EmailTemplate.PAYMENT_FAILED,
  [AutomationTrigger.INVOICE_SENT]: EmailTemplate.INVOICE,
  [AutomationTrigger.SUBSCRIPTION_RENEWED]: EmailTemplate.SUBSCRIPTION_RENEWED,
  [AutomationTrigger.SUBSCRIPTION_EXPIRING]: EmailTemplate.CUSTOM,
  [AutomationTrigger.PASSWORD_RESET]: EmailTemplate.PASSWORD_RESET,
  [AutomationTrigger.EMAIL_VERIFICATION]: EmailTemplate.EMAIL_VERIFICATION,
  [AutomationTrigger.NEW_PATIENT_ASSIGNED]: EmailTemplate.NEW_PATIENT_ASSIGNED,
  [AutomationTrigger.DOCUMENT_RECEIVED]: EmailTemplate.DOCUMENT_RECEIVED,
};

// ============================================
// AUTOMATION CONFIG
// ============================================

export interface AutomationConfig {
  trigger: AutomationTrigger;
  enabled: boolean;
  delayMinutes?: number; // Delay before sending (0 = immediate)
  template?: EmailTemplate;
  customSubject?: string;
  recipientType: 'patient' | 'provider' | 'admin' | 'custom';
  customRecipient?: string;
}

// Default automation configurations
const DEFAULT_AUTOMATIONS: AutomationConfig[] = [
  {
    trigger: AutomationTrigger.PATIENT_WELCOME,
    enabled: true,
    delayMinutes: 0,
    recipientType: 'patient',
  },
  {
    trigger: AutomationTrigger.APPOINTMENT_BOOKED,
    enabled: true,
    delayMinutes: 0,
    recipientType: 'patient',
  },
  {
    trigger: AutomationTrigger.ORDER_CONFIRMED,
    enabled: true,
    delayMinutes: 0,
    recipientType: 'patient',
  },
  {
    trigger: AutomationTrigger.PAYMENT_RECEIVED,
    enabled: true,
    delayMinutes: 0,
    recipientType: 'patient',
  },
  {
    trigger: AutomationTrigger.PASSWORD_RESET,
    enabled: true,
    delayMinutes: 0,
    recipientType: 'patient',
    template: EmailTemplate.PASSWORD_RESET,
  },
];

// ============================================
// AUTOMATION EXECUTION
// ============================================

export interface TriggerEmailParams {
  trigger: AutomationTrigger;
  recipientEmail: string;
  recipientUserId?: number;
  clinicId?: number;
  data: Record<string, unknown>;
  priority?: EmailPriority;
}

/**
 * Trigger an automated email
 */
export async function triggerAutomation(
  params: TriggerEmailParams
): Promise<{ success: boolean; messageId?: string; scheduledId?: number; error?: string }> {
  const { trigger, recipientEmail, recipientUserId, clinicId, data, priority } = params;

  try {
    // Get automation config (from database or defaults)
    const config = await getAutomationConfig(trigger);

    if (!config || !config.enabled) {
      logger.debug('Automation disabled or not found', { trigger });
      return { success: false, error: 'Automation not enabled' };
    }

    const template = config.template || TRIGGER_TEMPLATE_MAP[trigger];

    // Handle delay if configured - use the new ScheduledEmail table
    if (config.delayMinutes && config.delayMinutes > 0) {
      const scheduledEmail = await scheduleEmail({
        trigger,
        recipientEmail,
        recipientUserId,
        clinicId,
        template,
        data,
        subject: config.customSubject,
        delayMinutes: config.delayMinutes,
        priority: priority || EmailPriority.NORMAL,
      });
      return {
        success: true,
        scheduledId: scheduledEmail.id,
        messageId: `scheduled-${scheduledEmail.id}`,
      };
    }

    // Send immediately
    const result = await sendTemplatedEmail({
      to: recipientEmail,
      template,
      data,
      subject: config.customSubject,
      priority: priority || EmailPriority.NORMAL,
      userId: recipientUserId,
      clinicId,
      sourceType: 'automation',
      sourceId: trigger,
    });

    // Log the automation (now handled by email service, but still log for analytics)
    await logAutomationSent(trigger, recipientEmail, result.success);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Automation trigger failed', { trigger, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

interface ScheduleEmailParams {
  trigger: AutomationTrigger;
  recipientEmail: string;
  recipientUserId?: number;
  clinicId?: number;
  template: EmailTemplate;
  data: Record<string, unknown>;
  subject?: string;
  delayMinutes: number;
  priority?: EmailPriority;
}

/**
 * Schedule an email for later delivery using the ScheduledEmail table
 */
async function scheduleEmail(
  params: ScheduleEmailParams
): Promise<{ id: number; scheduledFor: Date }> {
  const scheduledFor = new Date(Date.now() + params.delayMinutes * 60 * 1000);

  // Store in ScheduledEmail table for cron job to process
  const scheduledEmail = await prisma.scheduledEmail.create({
    data: {
      recipientEmail: params.recipientEmail,
      recipientUserId: params.recipientUserId,
      clinicId: params.clinicId,
      template: params.template,
      templateData: params.data,
      subject: params.subject,
      scheduledFor,
      priority: params.priority || 'NORMAL',
      automationTrigger: params.trigger,
      status: 'PENDING',
    },
  });

  logger.info('Email scheduled for later delivery', {
    id: scheduledEmail.id,
    trigger: params.trigger,
    recipientEmail: params.recipientEmail,
    scheduledFor,
    delayMinutes: params.delayMinutes,
  });

  return {
    id: scheduledEmail.id,
    scheduledFor,
  };
}

/**
 * Get automation configuration
 */
async function getAutomationConfig(trigger: AutomationTrigger): Promise<AutomationConfig | null> {
  // Try to get from database first
  // const dbConfig = await prisma.emailAutomation.findUnique({
  //   where: { trigger },
  // });
  // if (dbConfig) return dbConfig;

  // Fall back to defaults
  return (
    DEFAULT_AUTOMATIONS.find((a) => a.trigger === trigger) || {
      trigger,
      enabled: true,
      delayMinutes: 0,
      recipientType: 'patient' as const,
    }
  );
}

/**
 * Log automation sent for analytics
 */
async function logAutomationSent(
  trigger: AutomationTrigger,
  recipientEmail: string,
  success: boolean
): Promise<void> {
  logger.info('Automation email sent', {
    trigger,
    recipientEmail,
    success,
    timestamp: new Date().toISOString(),
  });

  // TODO: Store in email_logs table for analytics
  // await prisma.emailLog.create({
  //   data: {
  //     trigger,
  //     recipientEmail,
  //     success,
  //     sentAt: new Date(),
  //   },
  // });
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Send welcome email to new patient
 */
export async function sendPatientWelcomeEmail(patient: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<{ success: boolean; error?: string }> {
  return triggerAutomation({
    trigger: AutomationTrigger.PATIENT_WELCOME,
    recipientEmail: patient.email,
    data: {
      firstName: patient.firstName,
      lastName: patient.lastName,
      patientName: `${patient.firstName} ${patient.lastName}`,
    },
  });
}

/**
 * Send appointment confirmation
 */
export async function sendAppointmentConfirmationEmail(appointment: {
  patientEmail: string;
  patientName: string;
  providerName: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
}): Promise<{ success: boolean; error?: string }> {
  return triggerAutomation({
    trigger: AutomationTrigger.APPOINTMENT_BOOKED,
    recipientEmail: appointment.patientEmail,
    data: {
      patientName: appointment.patientName,
      providerName: appointment.providerName,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      location: appointment.location || 'TBD',
    },
  });
}

/**
 * Send order confirmation
 */
export async function sendOrderConfirmationEmail(order: {
  customerEmail: string;
  customerName: string;
  orderId: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  shippingAddress?: string;
}): Promise<{ success: boolean; error?: string }> {
  return triggerAutomation({
    trigger: AutomationTrigger.ORDER_CONFIRMED,
    recipientEmail: order.customerEmail,
    data: {
      customerName: order.customerName,
      orderId: order.orderId,
      items: order.items,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
    },
  });
}

/**
 * Send payment received confirmation
 */
export async function sendPaymentReceivedEmail(payment: {
  customerEmail: string;
  customerName: string;
  amount: number;
  invoiceNumber?: string;
}): Promise<{ success: boolean; error?: string }> {
  return triggerAutomation({
    trigger: AutomationTrigger.PAYMENT_RECEIVED,
    recipientEmail: payment.customerEmail,
    data: {
      customerName: payment.customerName,
      amount: payment.amount,
      invoiceNumber: payment.invoiceNumber,
    },
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(user: {
  email: string;
  firstName: string;
  resetLink: string;
}): Promise<{ success: boolean; error?: string }> {
  return triggerAutomation({
    trigger: AutomationTrigger.PASSWORD_RESET,
    recipientEmail: user.email,
    data: {
      firstName: user.firstName,
      resetLink: user.resetLink,
    },
    priority: EmailPriority.HIGH,
  });
}

/**
 * Send prescription ready notification
 */
export async function sendPrescriptionReadyEmail(prescription: {
  patientEmail: string;
  patientName: string;
  medicationName: string;
  pharmacyName?: string;
  pickupInstructions?: string;
}): Promise<{ success: boolean; error?: string }> {
  return triggerAutomation({
    trigger: AutomationTrigger.PRESCRIPTION_READY,
    recipientEmail: prescription.patientEmail,
    data: {
      patientName: prescription.patientName,
      medicationName: prescription.medicationName,
      pharmacyName: prescription.pharmacyName,
      pickupInstructions: prescription.pickupInstructions,
    },
  });
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Get all automation configurations
 */
export async function getAllAutomations(): Promise<AutomationConfig[]> {
  // TODO: Fetch from database merged with defaults
  return DEFAULT_AUTOMATIONS;
}

/**
 * Update automation configuration
 */
export async function updateAutomation(
  trigger: AutomationTrigger,
  config: Partial<AutomationConfig>
): Promise<AutomationConfig> {
  // TODO: Save to database
  logger.info('Automation config updated', { trigger, config });

  return {
    trigger,
    enabled: config.enabled ?? true,
    delayMinutes: config.delayMinutes ?? 0,
    recipientType: config.recipientType ?? 'patient',
    ...config,
  };
}

/**
 * Get automation statistics from EmailLog table
 */
export async function getAutomationStats(days: number = 30): Promise<{
  totalSent: number;
  byTrigger: Record<string, number>;
  successRate: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Query EmailLog table for automation emails
  const logs = await prisma.emailLog.findMany({
    where: {
      sourceType: 'automation',
      createdAt: { gte: startDate },
    },
    select: {
      sourceId: true,
      status: true,
    },
  });

  // Calculate statistics
  const totalSent = logs.length;
  const successCount = logs.filter((log) =>
    ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'].includes(log.status)
  ).length;

  // Group by trigger
  const byTrigger: Record<string, number> = {};
  for (const log of logs as Array<{ sourceId: string | null; status: string }>) {
    if (log.sourceId) {
      byTrigger[log.sourceId] = (byTrigger[log.sourceId] || 0) + 1;
    }
  }

  return {
    totalSent,
    byTrigger,
    successRate: totalSent > 0 ? Math.round((successCount / totalSent) * 100) : 100,
  };
}
