/**
 * Shipment Notification Service
 * =============================
 * 
 * Handles SMS and notification delivery for multi-shipment scheduling.
 * Sends reminders to patients about upcoming shipments based on BUD (Beyond Use Date) constraints.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import twilio from 'twilio';

// ============================================================================
// Types
// ============================================================================

export interface ShipmentReminderSMSInput {
  patientId: number;
  phone: string;
  patientFirstName: string;
  shipmentNumber: number;
  totalShipments: number;
  dueDate: Date;
  daysUntilDue: number;
  medicationName: string;
}

export interface ShipmentConfirmationSMSInput {
  patientId: number;
  phone: string;
  patientFirstName: string;
  shipmentNumber: number;
  totalShipments: number;
  medicationName: string;
  trackingNumber?: string;
  carrier?: string;
}

// ============================================================================
// SMS Templates
// ============================================================================

const SMS_TEMPLATES = {
  /**
   * Advance reminder sent 7 days before shipment is due
   */
  SHIPMENT_REMINDER: (input: ShipmentReminderSMSInput): string => {
    const dateStr = input.dueDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    // Single shipment
    if (input.totalShipments === 1) {
      return `Hi ${input.patientFirstName}! Your ${input.medicationName} refill is scheduled for ${dateStr}. We'll process it automatically - no action needed. Questions? Reply to this message.`;
    }

    // Multi-shipment
    return `Hi ${input.patientFirstName}! Your ${input.medicationName} shipment ${input.shipmentNumber} of ${input.totalShipments} is scheduled for ${dateStr}. We'll process it automatically - no action needed. Questions? Reply to this message.`;
  },

  /**
   * Confirmation when shipment is being processed
   */
  SHIPMENT_PROCESSING: (input: {
    patientFirstName: string;
    shipmentNumber: number;
    totalShipments: number;
    medicationName: string;
  }): string => {
    if (input.totalShipments === 1) {
      return `Hi ${input.patientFirstName}! Your ${input.medicationName} refill is being processed. We'll send you tracking info once it ships.`;
    }

    return `Hi ${input.patientFirstName}! Shipment ${input.shipmentNumber} of ${input.totalShipments} for your ${input.medicationName} is being processed. We'll send tracking info once it ships.`;
  },

  /**
   * Notification when shipment has shipped with tracking
   */
  SHIPMENT_SHIPPED: (input: ShipmentConfirmationSMSInput): string => {
    const trackingInfo = input.trackingNumber
      ? ` Track your package: ${getTrackingUrl(input.carrier || 'usps', input.trackingNumber)}`
      : '';

    if (input.totalShipments === 1) {
      return `${input.patientFirstName}, your ${input.medicationName} has shipped!${trackingInfo}`;
    }

    return `${input.patientFirstName}, shipment ${input.shipmentNumber} of ${input.totalShipments} for your ${input.medicationName} has shipped!${trackingInfo}`;
  },

  /**
   * Notification for next scheduled shipment after one completes
   */
  NEXT_SHIPMENT_SCHEDULED: (input: {
    patientFirstName: string;
    shipmentNumber: number;
    totalShipments: number;
    medicationName: string;
    nextShipmentDate: Date;
  }): string => {
    const dateStr = input.nextShipmentDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });

    return `${input.patientFirstName}, your next ${input.medicationName} shipment (${input.shipmentNumber} of ${input.totalShipments}) is scheduled for ${dateStr}. We'll remind you before it ships.`;
  },

  /**
   * Final shipment notification
   */
  FINAL_SHIPMENT_REMINDER: (input: ShipmentReminderSMSInput): string => {
    const dateStr = input.dueDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    return `Hi ${input.patientFirstName}! Your final ${input.medicationName} shipment (${input.shipmentNumber} of ${input.totalShipments}) is scheduled for ${dateStr}. After this, you may want to renew your plan. Questions? Reply to this message.`;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate tracking URL based on carrier
 */
function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const carriers: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  };

  return carriers[carrier.toLowerCase()] || `https://www.google.com/search?q=${trackingNumber}+tracking`;
}

/**
 * Format phone number for Twilio
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Add country code if not present
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (phone.startsWith('+')) {
    return phone;
  }
  
  return `+1${digits}`;
}

// ============================================================================
// SMS Sending Functions
// ============================================================================

/**
 * Send SMS via Twilio
 */
async function sendSMS(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Check Twilio configuration
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    logger.info('[Shipment SMS] Twilio not configured, logging message instead', { phone, message });
    return { success: true, messageId: 'demo-mode' };
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const formattedPhone = formatPhoneNumber(phone);

    const twilioMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });

    logger.info('[Shipment SMS] Sent successfully', {
      to: formattedPhone,
      messageId: twilioMessage.sid,
    });

    return { success: true, messageId: twilioMessage.sid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Shipment SMS] Failed to send', { phone, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Send advance shipment reminder SMS to patient
 */
export async function sendShipmentReminderSMS(input: ShipmentReminderSMSInput): Promise<void> {
  const isFinalShipment = input.shipmentNumber === input.totalShipments;
  
  const message = isFinalShipment
    ? SMS_TEMPLATES.FINAL_SHIPMENT_REMINDER(input)
    : SMS_TEMPLATES.SHIPMENT_REMINDER(input);

  const result = await sendSMS(input.phone, message);

  if (!result.success) {
    throw new Error(result.error || 'Failed to send SMS');
  }

  // Log the notification in the database for audit
  try {
    await prisma.smsLog.create({
      data: {
        patientId: input.patientId,
        phone: input.phone,
        message,
        status: 'SENT',
        twilioSid: result.messageId,
        templateType: 'SHIPMENT_REMINDER',
      },
    });
  } catch (logError) {
    // Non-fatal, just log the error
    logger.warn('[Shipment SMS] Failed to log SMS to database', {
      patientId: input.patientId,
      error: logError instanceof Error ? logError.message : 'Unknown error',
    });
  }
}

/**
 * Send shipment processing notification
 */
export async function sendShipmentProcessingSMS(input: {
  patientId: number;
  phone: string;
  patientFirstName: string;
  shipmentNumber: number;
  totalShipments: number;
  medicationName: string;
}): Promise<void> {
  const message = SMS_TEMPLATES.SHIPMENT_PROCESSING(input);
  const result = await sendSMS(input.phone, message);

  if (!result.success) {
    throw new Error(result.error || 'Failed to send SMS');
  }

  // Log the notification
  try {
    await prisma.smsLog.create({
      data: {
        patientId: input.patientId,
        phone: input.phone,
        message,
        status: 'SENT',
        twilioSid: result.messageId,
        templateType: 'SHIPMENT_PROCESSING',
      },
    });
  } catch (logError) {
    logger.warn('[Shipment SMS] Failed to log SMS to database', {
      patientId: input.patientId,
    });
  }
}

/**
 * Send shipment shipped notification with tracking
 */
export async function sendShipmentShippedSMS(input: ShipmentConfirmationSMSInput): Promise<void> {
  const message = SMS_TEMPLATES.SHIPMENT_SHIPPED(input);
  const result = await sendSMS(input.phone, message);

  if (!result.success) {
    throw new Error(result.error || 'Failed to send SMS');
  }

  // Log the notification
  try {
    await prisma.smsLog.create({
      data: {
        patientId: input.patientId,
        phone: input.phone,
        message,
        status: 'SENT',
        twilioSid: result.messageId,
        templateType: 'SHIPMENT_SHIPPED',
      },
    });
  } catch (logError) {
    logger.warn('[Shipment SMS] Failed to log SMS to database', {
      patientId: input.patientId,
    });
  }
}

/**
 * Send next shipment scheduled notification
 */
export async function sendNextShipmentScheduledSMS(input: {
  patientId: number;
  phone: string;
  patientFirstName: string;
  shipmentNumber: number;
  totalShipments: number;
  medicationName: string;
  nextShipmentDate: Date;
}): Promise<void> {
  const message = SMS_TEMPLATES.NEXT_SHIPMENT_SCHEDULED(input);
  const result = await sendSMS(input.phone, message);

  if (!result.success) {
    throw new Error(result.error || 'Failed to send SMS');
  }

  // Log the notification
  try {
    await prisma.smsLog.create({
      data: {
        patientId: input.patientId,
        phone: input.phone,
        message,
        status: 'SENT',
        twilioSid: result.messageId,
        templateType: 'NEXT_SHIPMENT_SCHEDULED',
      },
    });
  } catch (logError) {
    logger.warn('[Shipment SMS] Failed to log SMS to database', {
      patientId: input.patientId,
    });
  }
}

/**
 * Get all SMS templates (for admin preview/editing)
 */
export function getShipmentSMSTemplates(): Record<string, string> {
  return {
    SHIPMENT_REMINDER: 'Hi {firstName}! Your {medication} shipment {shipmentNumber} of {totalShipments} is scheduled for {date}. We\'ll process it automatically - no action needed.',
    SHIPMENT_PROCESSING: 'Hi {firstName}! Shipment {shipmentNumber} of {totalShipments} for your {medication} is being processed. We\'ll send tracking info once it ships.',
    SHIPMENT_SHIPPED: '{firstName}, shipment {shipmentNumber} of {totalShipments} for your {medication} has shipped! Track your package: {trackingUrl}',
    NEXT_SHIPMENT_SCHEDULED: '{firstName}, your next {medication} shipment ({shipmentNumber} of {totalShipments}) is scheduled for {date}. We\'ll remind you before it ships.',
    FINAL_SHIPMENT_REMINDER: 'Hi {firstName}! Your final {medication} shipment ({shipmentNumber} of {totalShipments}) is scheduled for {date}. After this, you may want to renew your plan.',
  };
}
