/**
 * Twilio SMS Service
 *
 * Enterprise-grade SMS service with:
 * - TCPA compliance (opt-out handling, quiet hours)
 * - Rate limiting
 * - Delivery tracking
 * - Circuit breaker resilience
 * - Comprehensive audit logging
 */

import { getTwilioClientDirect, SMS_TEMPLATES, SMS_KEYWORDS, TWILIO_ERRORS, isTwilioConfigured, twilioConfig } from './config';
import { prisma } from '@/lib/db';
import { mockSendSMS, mockProcessIncomingSMS } from './mockService';
import { logger } from '@/lib/logger';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';
import { decryptPHI } from '@/lib/security/phi-encryption';

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface SMSMessage {
  to: string;
  body: string;
  from?: string;
  statusCallback?: string;
  mediaUrl?: string[];
  // Optional metadata for logging
  patientId?: number;
  clinicId?: number;
  templateType?: string;
}

export interface SMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  details?: any;
  blocked?: boolean; // If blocked by opt-out, quiet hours, or rate limit
  blockReason?: string;
}

interface SMSLogData {
  to: string;
  from: string;
  body: string;
  messageId?: string;
  status: string;
  error?: string;
  errorCode?: string;
  patientId?: number;
  clinicId?: number;
  templateType?: string;
  isOptOutResponse?: boolean;
  price?: number;
  priceUnit?: string;
}

// Opt-out keywords per TCPA guidelines
const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];
const OPT_IN_KEYWORDS = ['start', 'yes', 'unstop', 'subscribe'];

// Rate limiting configuration
const RATE_LIMIT = {
  PER_MINUTE: 10,    // Max messages per phone per minute
  PER_DAY: 50,       // Max messages per phone per day
  BLOCK_DURATION: 60 * 60 * 1000, // 1 hour block for abuse
};

// ============================================================================
// Phone Number Utilities
// ============================================================================

/**
 * Validate phone number (E.164 format)
 */
export function validatePhoneNumber(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Format phone number to E.164
 */
export function formatPhoneNumber(phone: string, defaultCountryCode = '+1'): string {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');

  // If it starts with 1 and is 11 digits (US/Canada), add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }

  // If it's 10 digits (US/Canada without country code), add default country code
  if (cleaned.length === 10) {
    return `${defaultCountryCode}${cleaned}`;
  }

  // If it already has + at the beginning, return as is
  if (phone.startsWith('+')) {
    return phone;
  }

  // Otherwise, add + to the beginning
  return `+${cleaned}`;
}

// ============================================================================
// Opt-Out Management (TCPA Compliance)
// ============================================================================

/**
 * Check if a keyword is an opt-out request
 */
export function isOptOutKeyword(message: string): boolean {
  return OPT_OUT_KEYWORDS.includes(message.toLowerCase().trim());
}

/**
 * Check if a keyword is an opt-in request
 */
export function isOptInKeyword(message: string): boolean {
  return OPT_IN_KEYWORDS.includes(message.toLowerCase().trim());
}

/**
 * Check if a phone number has opted out of SMS
 */
export async function isOptedOut(phone: string, clinicId?: number | null): Promise<boolean> {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    const optOut = await prisma.smsOptOut.findFirst({
      where: {
        phone: formattedPhone,
        isActive: true,
        ...(clinicId ? { clinicId } : {}),
      },
    });

    return !!optOut;
  } catch (error) {
    logger.error('[SMS_OPT_OUT_CHECK_ERROR]', { phone, error });
    // Fail safe - don't block sending on database errors
    return false;
  }
}

/**
 * Process opt-out request
 */
export async function processOptOut(
  phone: string,
  clinicId?: number | null,
  patientId?: number | null,
  messageSid?: string
): Promise<void> {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    // Find patient if not provided
    let resolvedPatientId = patientId;
    let resolvedClinicId = clinicId;

    if (!resolvedPatientId) {
      const patient = await prisma.patient.findFirst({
        where: {
          OR: [
            { phone: formattedPhone },
            { phone: phone },
            { phone: phone.replace(/^\+1/, '') },
          ],
        },
        select: { id: true, clinicId: true },
      });

      if (patient) {
        resolvedPatientId = patient.id;
        resolvedClinicId = resolvedClinicId || patient.clinicId;
      }
    }

    // Create or update opt-out record
    const existingOptOut = await prisma.smsOptOut.findFirst({
      where: {
        phone: formattedPhone,
        clinicId: resolvedClinicId ?? null,
        isActive: true,
      },
    });

    if (existingOptOut) {
      await prisma.smsOptOut.update({
        where: { id: existingOptOut.id },
        data: {
          optedOutAt: new Date(),
          optedInAt: null,
          reason: 'STOP',
          lastMessageSid: messageSid,
        },
      });
    } else {
      await prisma.smsOptOut.create({
        data: {
          phone: formattedPhone,
          clinicId: resolvedClinicId,
          patientId: resolvedPatientId,
          reason: 'STOP',
          source: 'sms',
          lastMessageSid: messageSid,
          isActive: true,
        },
      });
    }

    // Update patient's SMS consent
    if (resolvedPatientId) {
      await prisma.patient.update({
        where: { id: resolvedPatientId },
        data: {
          smsConsent: false,
          smsConsentAt: new Date(),
          smsConsentSource: 'sms_opt_out',
        },
      });
    }

    logger.info('[SMS_OPT_OUT_PROCESSED]', {
      phone: formattedPhone,
      clinicId: resolvedClinicId,
      patientId: resolvedPatientId,
    });
  } catch (error) {
    logger.error('[SMS_OPT_OUT_ERROR]', { phone, error });
    throw error;
  }
}

/**
 * Process opt-in request (re-subscribe)
 */
export async function processOptIn(
  phone: string,
  clinicId?: number | null,
  patientId?: number | null
): Promise<void> {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    // Find and deactivate existing opt-out
    await prisma.smsOptOut.updateMany({
      where: {
        phone: formattedPhone,
        isActive: true,
        ...(clinicId ? { clinicId } : {}),
      },
      data: {
        isActive: false,
        optedInAt: new Date(),
      },
    });

    // Update patient's SMS consent
    if (patientId) {
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          smsConsent: true,
          smsConsentAt: new Date(),
          smsConsentSource: 'sms_opt_in',
        },
      });
    }

    logger.info('[SMS_OPT_IN_PROCESSED]', { phone: formattedPhone, clinicId, patientId });
  } catch (error) {
    logger.error('[SMS_OPT_IN_ERROR]', { phone, error });
    throw error;
  }
}

// ============================================================================
// Quiet Hours Enforcement
// ============================================================================

/**
 * Check if current time is within quiet hours for a clinic
 */
export async function isQuietHours(clinicId?: number | null): Promise<boolean> {
  if (!clinicId) return false;

  try {
    const quietHours = await prisma.smsQuietHours.findFirst({
      where: {
        clinicId,
        isActive: true,
      },
    });

    if (!quietHours) return false;

    // Get current time in clinic timezone
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: quietHours.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = hour * 60 + minute;

    // Check day of week
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: quietHours.timezone,
      weekday: 'short',
    });
    const dayOfWeek = new Date().getDay();
    if (!quietHours.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }

    const startMinutes = quietHours.startHour * 60 + quietHours.startMinute;
    const endMinutes = quietHours.endHour * 60 + quietHours.endMinute;

    // Handle overnight quiet hours (e.g., 9 PM to 8 AM)
    if (startMinutes > endMinutes) {
      // Quiet hours span midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Quiet hours within same day
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  } catch (error) {
    logger.error('[SMS_QUIET_HOURS_CHECK_ERROR]', { clinicId, error });
    return false;
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Check and update rate limit for a phone number
 * Returns true if the message should be blocked
 */
export async function checkRateLimit(phone: string, clinicId?: number | null): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Get or create rate limit record
    let rateLimit = await prisma.smsRateLimit.findFirst({
      where: {
        phone: formattedPhone,
        clinicId: clinicId ?? null,
      },
    });

    if (!rateLimit) {
      // Create new rate limit record
      await prisma.smsRateLimit.create({
        data: {
          phone: formattedPhone,
          clinicId,
          messageCount: 1,
          windowStart: now,
          dailyCount: 1,
          dailyWindowStart: startOfDay,
          lastMessageAt: now,
        },
      });
      return { blocked: false };
    }

    // Check if blocked
    if (rateLimit.isBlocked && rateLimit.blockedUntil && rateLimit.blockedUntil > now) {
      return {
        blocked: true,
        reason: `Rate limited: ${rateLimit.blockReason || 'Too many messages'}`,
      };
    }

    // Reset minute window if needed
    if (rateLimit.windowStart < oneMinuteAgo) {
      rateLimit.messageCount = 0;
      rateLimit.windowStart = now;
    }

    // Reset daily window if needed
    if (rateLimit.dailyWindowStart < startOfDay) {
      rateLimit.dailyCount = 0;
      rateLimit.dailyWindowStart = startOfDay;
    }

    // Check limits
    if (rateLimit.messageCount >= RATE_LIMIT.PER_MINUTE) {
      // Block for 1 hour
      await prisma.smsRateLimit.update({
        where: { id: rateLimit.id },
        data: {
          isBlocked: true,
          blockedUntil: new Date(now.getTime() + RATE_LIMIT.BLOCK_DURATION),
          blockReason: 'Exceeded per-minute limit',
        },
      });

      return {
        blocked: true,
        reason: 'Rate limit exceeded: Too many messages per minute',
      };
    }

    if (rateLimit.dailyCount >= RATE_LIMIT.PER_DAY) {
      return {
        blocked: true,
        reason: 'Rate limit exceeded: Daily message limit reached',
      };
    }

    // Update counts
    await prisma.smsRateLimit.update({
      where: { id: rateLimit.id },
      data: {
        messageCount: rateLimit.messageCount + 1,
        dailyCount: rateLimit.dailyCount + 1,
        lastMessageAt: now,
        windowStart: rateLimit.windowStart < oneMinuteAgo ? now : rateLimit.windowStart,
        dailyWindowStart: rateLimit.dailyWindowStart < startOfDay ? startOfDay : rateLimit.dailyWindowStart,
        // Clear any block if it expired
        isBlocked: false,
        blockedUntil: null,
        blockReason: null,
      },
    });

    return { blocked: false };
  } catch (error) {
    logger.error('[SMS_RATE_LIMIT_CHECK_ERROR]', { phone, error });
    // Don't block on database errors
    return { blocked: false };
  }
}

// ============================================================================
// SMS Logging (Audit Trail)
// ============================================================================

/**
 * Log SMS message to database for audit trail
 */
async function logSMSMessage(data: SMSLogData): Promise<void> {
  try {
    const formattedTo = formatPhoneNumber(data.to);

    // Try to find patient by phone if not provided
    let patientId = data.patientId;
    let clinicId = data.clinicId;

    if (!patientId) {
      const patient = await prisma.patient.findFirst({
        where: {
          OR: [
            { phone: formattedTo },
            { phone: data.to },
            { phone: data.to.replace(/^\+1/, '') },
            { phone: { contains: data.to.replace(/\D/g, '').slice(-10) } },
          ],
        },
        select: { id: true, clinicId: true },
      });

      if (patient) {
        patientId = patient.id;
        clinicId = clinicId || patient.clinicId;
      }
    }

    await prisma.smsLog.create({
      data: {
        fromPhone: data.from,
        toPhone: formattedTo,
        body: data.body,
        messageSid: data.messageId,
        direction: 'outbound',
        status: data.status,
        error: data.error,
        errorCode: data.errorCode,
        patientId,
        clinicId,
        templateType: data.templateType,
        isOptOutResponse: data.isOptOutResponse || false,
        price: data.price ? new (require('@prisma/client').Prisma.Decimal)(data.price) : null,
        priceUnit: data.priceUnit,
      },
    });

    logger.debug('[SMS_LOGGED]', {
      messageId: data.messageId,
      patientId,
      clinicId,
      status: data.status,
    });
  } catch (error) {
    // Log error but don't fail the SMS operation
    logger.error('[SMS_LOG_ERROR]', { error, data: { to: data.to, status: data.status } });
  }
}

// ============================================================================
// Core SMS Sending
// ============================================================================

/**
 * Send SMS message with all compliance checks
 */
export async function sendSMS(message: SMSMessage): Promise<SMSResponse> {
  try {
    // Check if we should use mock service
    const useMock = !isTwilioConfigured() || process.env.TWILIO_USE_MOCK === 'true';

    if (useMock) {
      logger.debug('[SMS_SERVICE] Using mock service for testing');
      return await mockSendSMS(message);
    }

    // Format and validate phone number
    let formattedPhone = message.to;
    if (!validatePhoneNumber(message.to)) {
      formattedPhone = formatPhoneNumber(message.to);
      if (!validatePhoneNumber(formattedPhone)) {
        return {
          success: false,
          error: TWILIO_ERRORS.INVALID_PHONE,
          errorCode: 'INVALID_PHONE',
        };
      }
    }
    message.to = formattedPhone;

    // Check opt-out status (TCPA compliance)
    const optedOut = await isOptedOut(message.to, message.clinicId);
    if (optedOut) {
      logger.info('[SMS_BLOCKED_OPT_OUT]', { phone: message.to, clinicId: message.clinicId });
      return {
        success: false,
        blocked: true,
        blockReason: 'Recipient has opted out of SMS',
        error: 'Recipient opted out',
      };
    }

    // Check quiet hours
    const inQuietHours = await isQuietHours(message.clinicId);
    if (inQuietHours) {
      logger.info('[SMS_BLOCKED_QUIET_HOURS]', { phone: message.to, clinicId: message.clinicId });
      // Queue for later delivery instead of blocking
      return {
        success: false,
        blocked: true,
        blockReason: 'Message blocked due to quiet hours - will be sent later',
        error: 'Quiet hours active',
      };
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(message.to, message.clinicId);
    if (rateLimitResult.blocked) {
      logger.warn('[SMS_BLOCKED_RATE_LIMIT]', { phone: message.to, reason: rateLimitResult.reason });
      return {
        success: false,
        blocked: true,
        blockReason: rateLimitResult.reason,
        error: rateLimitResult.reason,
      };
    }

    // Get Twilio client and send
    const client = getTwilioClientDirect();

    // Build status callback URL
    const statusCallback = message.statusCallback ||
      (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/v2/twilio/status-callback` : undefined);

    // Send the message with circuit breaker for resilience
    const result = await circuitBreakers.sms.execute(() =>
      client.messages.create({
        body: message.body,
        to: message.to,
        from: message.from || process.env.TWILIO_PHONE_NUMBER!,
        statusCallback,
        mediaUrl: message.mediaUrl,
      })
    );

    // Log the message to database
    await logSMSMessage({
      to: message.to,
      from: result.from,
      body: message.body,
      messageId: result.sid,
      status: result.status,
      patientId: message.patientId,
      clinicId: message.clinicId,
      templateType: message.templateType,
      price: result.price ? parseFloat(result.price) : undefined,
      priceUnit: result.priceUnit || undefined,
    });

    return {
      success: true,
      messageId: result.sid,
      details: {
        status: result.status,
        dateCreated: result.dateCreated,
        price: result.price,
        priceUnit: result.priceUnit,
      },
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error.code || error.errorCode;

    logger.error('[TWILIO_SMS_ERROR]', { error: errorMessage, code: errorCode });

    // Log failed attempt
    await logSMSMessage({
      to: message.to,
      from: process.env.TWILIO_PHONE_NUMBER || 'unknown',
      body: message.body,
      status: 'failed',
      error: errorMessage,
      errorCode,
      patientId: message.patientId,
      clinicId: message.clinicId,
      templateType: message.templateType,
    });

    return {
      success: false,
      error: error.message || TWILIO_ERRORS.MESSAGE_FAILED,
      errorCode,
      details: error,
    };
  }
}

// ============================================================================
// Template-Based SMS Functions
// ============================================================================

/**
 * Send appointment reminder
 */
export async function sendAppointmentReminder(
  patientId: number,
  appointmentDate: Date,
  doctorName: string
): Promise<SMSResponse> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    // Decrypt PHI fields
    const decryptedPhone = safeDecrypt(patient?.phone);
    const decryptedFirstName = safeDecrypt(patient?.firstName);

    if (!patient || !decryptedPhone) {
      return {
        success: false,
        error: 'Patient phone number not found',
      };
    }

    // Check SMS consent
    if (patient.smsConsent === false) {
      return {
        success: false,
        blocked: true,
        blockReason: 'Patient has not consented to SMS',
        error: 'SMS consent not given',
      };
    }

    const formattedDate = appointmentDate.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const message = SMS_TEMPLATES.APPOINTMENT_REMINDER(
      decryptedFirstName || 'Patient',
      formattedDate,
      doctorName
    );

    return await sendSMS({
      to: decryptedPhone,
      body: message,
      patientId: patient.id,
      clinicId: patient.clinicId,
      templateType: 'APPOINTMENT_REMINDER',
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[APPOINTMENT_REMINDER_ERROR]', { error, patientId });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send prescription ready notification
 */
export async function sendPrescriptionReady(
  patientId: number,
  prescriptionId: string
): Promise<SMSResponse> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    // Decrypt PHI fields
    const decryptedPhone = safeDecrypt(patient?.phone);
    const decryptedFirstName = safeDecrypt(patient?.firstName);

    if (!patient || !decryptedPhone) {
      return {
        success: false,
        error: 'Patient phone number not found',
      };
    }

    if (patient.smsConsent === false) {
      return {
        success: false,
        blocked: true,
        blockReason: 'Patient has not consented to SMS',
        error: 'SMS consent not given',
      };
    }

    const message = SMS_TEMPLATES.PRESCRIPTION_READY(
      decryptedFirstName || 'Patient',
      prescriptionId
    );

    return await sendSMS({
      to: decryptedPhone,
      body: message,
      patientId: patient.id,
      clinicId: patient.clinicId,
      templateType: 'PRESCRIPTION_READY',
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PRESCRIPTION_READY_ERROR]', { error, patientId });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send lab results notification
 */
export async function sendLabResultsReady(patientId: number): Promise<SMSResponse> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    // Decrypt PHI fields
    const decryptedPhone = safeDecrypt(patient?.phone);
    const decryptedFirstName = safeDecrypt(patient?.firstName);

    if (!patient || !decryptedPhone) {
      return {
        success: false,
        error: 'Patient phone number not found',
      };
    }

    if (patient.smsConsent === false) {
      return {
        success: false,
        blocked: true,
        blockReason: 'Patient has not consented to SMS',
        error: 'SMS consent not given',
      };
    }

    const message = SMS_TEMPLATES.LAB_RESULTS_READY(decryptedFirstName || 'Patient');

    return await sendSMS({
      to: decryptedPhone,
      body: message,
      patientId: patient.id,
      clinicId: patient.clinicId,
      templateType: 'LAB_RESULTS_READY',
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LAB_RESULTS_ERROR]', { error, patientId });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send bulk SMS (with rate limiting)
 */
export async function sendBulkSMS(
  messages: SMSMessage[],
  delayMs = 1000
): Promise<SMSResponse[]> {
  const results: SMSResponse[] = [];

  for (const message of messages) {
    const result = await sendSMS(message);
    results.push(result);

    // Add delay to avoid rate limiting
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// ============================================================================
// Incoming SMS Processing
// ============================================================================

/**
 * Process incoming SMS (for webhook)
 */
export async function processIncomingSMS(
  from: string,
  body: string,
  messageSid: string
): Promise<string> {
  try {
    const messageBody = body.toLowerCase().trim();
    const formattedPhone = formatPhoneNumber(from);

    // Find patient (needed for opt-out processing)
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { phone: formattedPhone },
          { phone: from },
          { phone: from.replace(/^\+1/, '') },
        ],
      },
      select: { id: true, clinicId: true },
    });

    // TCPA Compliance: Check for opt-out keywords FIRST (highest priority, even in mock mode)
    if (isOptOutKeyword(messageBody)) {
      await processOptOut(from, patient?.clinicId, patient?.id, messageSid);
      logger.info('[SMS_OPT_OUT_RECEIVED]', { from, messageSid });
      return 'You have been unsubscribed from SMS messages. Reply START to resubscribe.';
    }

    // Check for opt-in keywords (also process in mock mode)
    if (isOptInKeyword(messageBody)) {
      await processOptIn(from, patient?.clinicId, patient?.id);
      logger.info('[SMS_OPT_IN_RECEIVED]', { from, messageSid });
      return 'You have been resubscribed to SMS messages. Reply STOP to unsubscribe anytime.';
    }

    // Use mock service for other keywords if Twilio not configured
    const useMock = !isTwilioConfigured() || process.env.TWILIO_USE_MOCK === 'true';

    if (useMock) {
      return await mockProcessIncomingSMS(from, body, messageSid);
    }

    // Check for appointment keywords
    if (SMS_KEYWORDS.CONFIRM.some((keyword: string) => messageBody.includes(keyword))) {
      await handleAppointmentConfirmation(from, messageSid);
      return 'Thank you for confirming your appointment!';
    }

    if (SMS_KEYWORDS.CANCEL.some((keyword: string) => messageBody.includes(keyword))) {
      await handleAppointmentCancellation(from, messageSid);
      return 'Your appointment has been cancelled. Please call us to reschedule.';
    }

    if (SMS_KEYWORDS.RESCHEDULE.some((keyword: string) => messageBody.includes(keyword))) {
      return 'To reschedule your appointment, please log in to your patient portal or contact your clinic directly.';
    }

    if (SMS_KEYWORDS.HELP.some((keyword: string) => messageBody.includes(keyword))) {
      return 'Reply CONFIRM to confirm, CANCEL to cancel your appointment. Reply STOP to opt-out of messages. For assistance, contact your clinic.';
    }

    // Log the incoming message
    logger.info('[INCOMING_SMS]', { from, bodyLength: body.length, messageSid });

    // Default response
    return 'Thank you for your message. Your healthcare team has been notified and will respond soon.';
  } catch (error: any) {
    logger.error('[PROCESS_INCOMING_SMS_ERROR]', { error });
    return 'We received your message. Please contact your clinic directly for immediate assistance.';
  }
}

// ============================================================================
// Appointment Handlers
// ============================================================================

/**
 * Handle appointment confirmation via SMS
 */
async function handleAppointmentConfirmation(
  phoneNumber: string,
  messageSid: string
): Promise<void> {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Find patient
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { phone: formattedPhone },
          { phone: phoneNumber },
          { phone: phoneNumber.replace(/^\+1/, '') },
        ],
      },
    });

    if (patient) {
      // Find upcoming appointment and confirm it
      const appointment = await prisma.appointment.findFirst({
        where: {
          patientId: patient.id,
          startTime: { gte: new Date() },
          status: { in: ['SCHEDULED', 'PENDING'] },
        },
        orderBy: { startTime: 'asc' },
      });

      if (appointment) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: 'CONFIRMED' },
        });

        logger.info('[APPOINTMENT_CONFIRMED_VIA_SMS]', {
          appointmentId: appointment.id,
          patientId: patient.id,
          messageSid,
        });
      }
    }
  } catch (error) {
    logger.error('[CONFIRMATION_ERROR]', { error });
  }
}

/**
 * Handle appointment cancellation via SMS
 */
async function handleAppointmentCancellation(
  phoneNumber: string,
  messageSid: string
): Promise<void> {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Find patient
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { phone: formattedPhone },
          { phone: phoneNumber },
          { phone: phoneNumber.replace(/^\+1/, '') },
        ],
      },
    });

    if (patient) {
      // Find upcoming appointment and cancel it
      const appointment = await prisma.appointment.findFirst({
        where: {
          patientId: patient.id,
          startTime: { gte: new Date() },
          status: { in: ['SCHEDULED', 'PENDING', 'CONFIRMED'] },
        },
        orderBy: { startTime: 'asc' },
      });

      if (appointment) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: 'CANCELLED' },
        });

        logger.info('[APPOINTMENT_CANCELLED_VIA_SMS]', {
          appointmentId: appointment.id,
          patientId: patient.id,
          messageSid,
        });
      }
    }
  } catch (error) {
    logger.error('[CANCELLATION_ERROR]', { error });
  }
}

// ============================================================================
// Status Tracking
// ============================================================================

/**
 * Get SMS status from Twilio
 */
export async function getSMSStatus(messageId: string): Promise<any> {
  try {
    const client = getTwilioClientDirect();
    const message = await client.messages(messageId).fetch();

    return {
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      dateSent: message.dateSent,
      dateUpdated: message.dateUpdated,
    };
  } catch (error: any) {
    logger.error('[SMS_STATUS_ERROR]', { error });
    throw error;
  }
}

/**
 * Update SMS status from webhook callback
 */
export async function updateSMSStatus(
  messageSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const smsLog = await prisma.smsLog.findUnique({
      where: { messageSid },
    });

    if (!smsLog) {
      logger.warn('[SMS_STATUS_UPDATE_NOT_FOUND]', { messageSid });
      return;
    }

    const updateData: any = {
      status,
      statusUpdatedAt: new Date(),
    };

    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    } else if (status === 'failed' || status === 'undelivered') {
      updateData.failedAt = new Date();
      updateData.error = errorMessage;
      updateData.errorCode = errorCode;
    }

    await prisma.smsLog.update({
      where: { id: smsLog.id },
      data: updateData,
    });

    logger.debug('[SMS_STATUS_UPDATED]', { messageSid, status });
  } catch (error) {
    logger.error('[SMS_STATUS_UPDATE_ERROR]', { error, messageSid });
  }
}
