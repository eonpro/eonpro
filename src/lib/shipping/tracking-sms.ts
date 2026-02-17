/**
 * Shipping Tracking SMS Notification
 * ===================================
 *
 * Sends an SMS to the patient when a new tracking number is received
 * from Lifefile via the shipping webhook.
 *
 * Uses the centralized SMS service for TCPA compliance:
 * - Opt-out checking
 * - Quiet hours enforcement
 * - Rate limiting
 * - Audit logging
 * - Circuit breaker resilience
 */

import { sendSMS, SMSResponse } from '@/lib/integrations/twilio/smsService';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { notificationService } from '@/services/notification/notificationService';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface TrackingNotificationInput {
  patientId: number;
  /** Encrypted patient phone (PHI) */
  patientPhone: string | null;
  /** Encrypted patient first name (PHI) */
  patientFirstName: string | null;
  /** Encrypted patient last name (PHI) - used for admin notification */
  patientLastName: string | null;
  clinicId: number;
  /** Clinic display name (e.g. "Wellmedr", "EonMeds") */
  clinicName: string;
  trackingNumber: string;
  /** Carrier / delivery service name (e.g. "UPS", "USPS", "FedEx") */
  carrier: string;
  /** Order ID if available - used for linking in admin notification */
  orderId?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safely decrypt a PHI field, returning null if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

/**
 * Generate a carrier-specific tracking URL
 */
function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const carriers: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  };

  return (
    carriers[carrier.toLowerCase()] ||
    `https://www.google.com/search?q=${trackingNumber}+tracking`
  );
}

/**
 * Build the SMS message body for a tracking notification
 */
function buildTrackingMessage(
  firstName: string,
  clinicName: string,
  trackingNumber: string,
  carrier: string
): string {
  const trackingUrl = getTrackingUrl(carrier, trackingNumber);

  return (
    `Hello ${firstName}, your prescription from ${clinicName} has been processed and shipped! ` +
    `Here is your tracking number: ${trackingNumber}. ` +
    `Track your package: ${trackingUrl}`
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Send a tracking notification SMS to a patient.
 *
 * - Decrypts patient phone and first name (PHI)
 * - Builds a tracking message with a clickable URL
 * - Sends via the centralized SMS service (TCPA-compliant)
 * - Returns the SMS result without throwing
 *
 * Callers should invoke this with fire-and-forget (.catch()) so it never
 * blocks the webhook response.
 */
export async function sendTrackingNotificationSMS(
  input: TrackingNotificationInput
): Promise<SMSResponse> {
  const { patientId, patientPhone, patientFirstName, clinicId, clinicName, trackingNumber, carrier } = input;
  const patientLastName = input.patientLastName;
  const orderId = input.orderId;

  // Decrypt patient phone
  const phone = safeDecrypt(patientPhone);
  if (!phone) {
    logger.warn('[TRACKING SMS] No phone number available for patient', { patientId, clinicId });
    return {
      success: false,
      error: 'No phone number available',
      errorCode: 'NO_PHONE',
    };
  }

  // Decrypt patient first name (fallback to generic greeting)
  const firstName = safeDecrypt(patientFirstName) || 'there';

  // Build the message
  const message = buildTrackingMessage(firstName, clinicName, trackingNumber, carrier);

  // Send via centralized SMS service (handles opt-out, quiet hours, rate limiting)
  const result = await sendSMS({
    to: phone,
    body: message,
    patientId,
    clinicId,
    templateType: 'SHIPPING_TRACKING',
  });

  // Log outcome (no PHI)
  if (result.success) {
    logger.info('[TRACKING SMS] Sent successfully', {
      patientId,
      clinicId,
      messageId: result.messageId,
      trackingNumber,
    });

    // Record in PatientChatMessage so it appears on the patient profile chat tab
    try {
      await prisma.patientChatMessage.create({
        data: {
          clinicId,
          patientId,
          message,
          direction: 'OUTBOUND',
          channel: 'SMS',
          senderType: 'SYSTEM',
          senderName: clinicName,
          status: 'SENT',
          externalId: result.messageId || null,
        },
      });
      logger.info('[TRACKING SMS] Chat message recorded', { patientId, clinicId });
    } catch (chatErr) {
      logger.warn('[TRACKING SMS] Failed to record chat message (non-critical)', {
        error: chatErr instanceof Error ? chatErr.message : String(chatErr),
        patientId,
        clinicId,
      });
    }
  } else if (result.blocked) {
    logger.info('[TRACKING SMS] Blocked by compliance', {
      patientId,
      clinicId,
      reason: result.blockReason,
    });
  } else {
    logger.error('[TRACKING SMS] Failed to send', {
      patientId,
      clinicId,
      error: result.error,
      errorCode: result.errorCode,
    });
  }

  // Send internal admin notification regardless of SMS outcome
  const lastName = safeDecrypt(patientLastName) || '';
  const patientDisplayName = `${firstName} ${lastName}`.trim();
  await notifyAdminsOfTracking({
    clinicId,
    clinicName,
    patientId,
    patientName: patientDisplayName,
    trackingNumber,
    carrier,
    orderId,
  }).catch((err) => {
    logger.warn('[TRACKING SMS] Admin notification failed (non-critical)', {
      error: err instanceof Error ? err.message : String(err),
      clinicId,
    });
  });

  return result;
}

// ============================================================================
// Internal Admin Notification
// ============================================================================

interface AdminTrackingNotificationInput {
  clinicId: number;
  clinicName: string;
  patientId: number;
  patientName: string;
  trackingNumber: string;
  carrier: string;
  orderId?: number;
}

/**
 * Send an in-app notification to clinic admins when tracking is received from Lifefile.
 */
async function notifyAdminsOfTracking(input: AdminTrackingNotificationInput): Promise<void> {
  const { clinicId, clinicName, patientId, patientName, trackingNumber, carrier, orderId } = input;

  const title = 'Tracking Received from Lifefile';
  const message = `Tracking for ${patientName} (${carrier}: ${trackingNumber}) has been received and the patient has been notified.`;
  const actionUrl = orderId
    ? `/patients/${patientId}?tab=prescriptions`
    : `/patients/${patientId}`;

  try {
    const count = await notificationService.notifyAdmins({
      clinicId,
      category: 'ORDER',
      priority: 'NORMAL',
      title,
      message,
      actionUrl,
      metadata: {
        trackingNumber,
        carrier,
        patientId,
        orderId: orderId || null,
        source: 'lifefile',
      },
      sourceType: 'webhook',
      sourceId: `tracking-${trackingNumber}`,
    });

    logger.info('[TRACKING NOTIFICATION] Admin notification sent', {
      clinicId,
      adminCount: count,
      trackingNumber,
    });
  } catch (err) {
    logger.error('[TRACKING NOTIFICATION] Failed to notify admins', {
      error: err instanceof Error ? err.message : String(err),
      clinicId,
      trackingNumber,
    });
    throw err;
  }
}
