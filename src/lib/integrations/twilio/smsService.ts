/**
 * Twilio SMS Service
 * 
 * Handles sending SMS notifications and managing SMS conversations
 */

import { getTwilioClientDirect, SMS_TEMPLATES, SMS_KEYWORDS, TWILIO_ERRORS, isTwilioConfigured, twilioConfig } from './config';
import { prisma } from '@/lib/db';
import { mockSendSMS, mockProcessIncomingSMS } from './mockService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

// SMS Message Type
export interface SMSMessage {
  to: string;
  body: string;
  from?: string;
  statusCallback?: string;
  mediaUrl?: string[];
}

// SMS Response Type
export interface SMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

// Phone number validation (E.164 format)
export function validatePhoneNumber(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

// Format phone number to E.164
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

// Send SMS message
export async function sendSMS(message: SMSMessage): Promise<SMSResponse> {
  try {
    // Check if we should use mock service
    const useMock = !isTwilioConfigured() || process.env.TWILIO_USE_MOCK === 'true';
    
    if (useMock) {
      logger.debug('[SMS_SERVICE] Using mock service for testing');
      return await mockSendSMS(message);
    }
    
    const client = getTwilioClientDirect();
    
    // Validate phone number
    if (!validatePhoneNumber(message.to)) {
      // Try to format it
      const formatted = formatPhoneNumber(message.to);
      if (!validatePhoneNumber(formatted)) {
        return {
          success: false,
          error: TWILIO_ERRORS.INVALID_PHONE,
        };
      }
      message.to = formatted;
    }
    
    // Send the message
    const result = await client.messages.create({
      body: message.body,
      to: message.to,
      from: message.from || process.env.TWILIO_PHONE_NUMBER!,
      statusCallback: message.statusCallback,
      mediaUrl: message.mediaUrl,
    });
    
    // Log the message in the database
    await logSMSMessage({
      to: message.to,
      from: result.from,
      body: message.body,
      messageId: result.sid,
      status: result.status,
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
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[TWILIO_SMS_ERROR]', error);
    
    // Log failed attempt
    await logSMSMessage({
      to: message.to,
      from: process.env.TWILIO_PHONE_NUMBER || 'unknown',
      body: message.body,
      status: "FAILED" as any,
      error: errorMessage,
    });
    
    return {
      success: false,
      error: error.message || TWILIO_ERRORS.MESSAGE_FAILED,
      details: error,
    };
  }
}

// Send appointment reminder
export async function sendAppointmentReminder(
  patientId: number,
  appointmentDate: Date,
  doctorName: string
): Promise<SMSResponse> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    
    if (!patient || !patient.phone) {
      return {
        success: false,
        error: 'Patient phone number not found',
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
      patient.firstName,
      formattedDate,
      doctorName
    );
    
    return await sendSMS({
      to: patient.phone,
      body: message,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[APPOINTMENT_REMINDER_ERROR]', error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Send prescription ready notification
export async function sendPrescriptionReady(
  patientId: number,
  prescriptionId: string
): Promise<SMSResponse> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    
    if (!patient || !patient.phone) {
      return {
        success: false,
        error: 'Patient phone number not found',
      };
    }
    
    const message = SMS_TEMPLATES.PRESCRIPTION_READY(
      patient.firstName,
      prescriptionId
    );
    
    return await sendSMS({
      to: patient.phone,
      body: message,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PRESCRIPTION_READY_ERROR]', error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Send lab results notification
export async function sendLabResultsReady(patientId: number): Promise<SMSResponse> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    
    if (!patient || !patient.phone) {
      return {
        success: false,
        error: 'Patient phone number not found',
      };
    }
    
    const message = SMS_TEMPLATES.LAB_RESULTS_READY(patient.firstName);
    
    return await sendSMS({
      to: patient.phone,
      body: message,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LAB_RESULTS_ERROR]', error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Send bulk SMS (with rate limiting)
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

// Process incoming SMS (for webhook)
export async function processIncomingSMS(
  from: string,
  body: string,
  messageSid: string
): Promise<string> {
  try {
    // Use mock service if Twilio not configured
    const useMock = !isTwilioConfigured() || process.env.TWILIO_USE_MOCK === 'true';
    
    if (useMock) {
      return await mockProcessIncomingSMS(from, body, messageSid);
    }
    
    const messageBody = body.toLowerCase().trim();
    
    // Check for keywords
    if (SMS_KEYWORDS.CONFIRM.some((keyword: any) => messageBody.includes(keyword))) {
      // Handle confirmation
      await handleAppointmentConfirmation(from, messageSid);
      return 'Thank you for confirming your appointment!';
    }
    
    if (SMS_KEYWORDS.CANCEL.some((keyword: any) => messageBody.includes(keyword))) {
      // Handle cancellation
      await handleAppointmentCancellation(from, messageSid);
      return 'Your appointment has been cancelled. Please call us to reschedule.';
    }
    
    if (SMS_KEYWORDS.RESCHEDULE.some((keyword: any) => messageBody.includes(keyword))) {
      return 'To reschedule your appointment, please log in to your patient portal or contact your clinic directly.';
    }
    
    if (SMS_KEYWORDS.HELP.some((keyword: any) => messageBody.includes(keyword))) {
      return 'Reply CONFIRM to confirm, CANCEL to cancel your appointment. For assistance, contact your clinic or visit the patient portal.';
    }
    
    // Log the incoming message (could be saved to database for chat history)
    logger.info('[INCOMING_SMS]', { from, body: messageBody, messageSid });
    
    // Default response - acknowledging receipt
    return 'Thank you for your message. Your healthcare team has been notified and will respond soon.';
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[PROCESS_INCOMING_SMS_ERROR]', error);
    return 'We received your message. Please contact your clinic directly for immediate assistance.';
  }
}

// Log SMS message to database
async function logSMSMessage(data: {
  to: string;
  from: string;
  body: string;
  messageId?: string;
  status: string;
  error?: string;
}): Promise<void> {
  try {
    // TODO: Add SMS log table to database schema
    logger.debug('[SMS_LOG]', data);
    
    // Example implementation when table is added:
    // await prisma.smsLog.create({
    //   data: {
    //     to: data.to,
    //     from: data.from,
    //     body: data.body,
    //     messageId: data.messageId,
    //     status: data.status,
    //     error: data.error,
    //   },
    // });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[SMS_LOG_ERROR]', error);
  }
}

// Handle appointment confirmation
async function handleAppointmentConfirmation(
  phoneNumber: string,
  messageSid: string
): Promise<void> {
  try {
    // Find patient by phone number
    const patient: any = await // @ts-ignore
    prisma.patient.findFirst({
      where: { phone: phoneNumber },
    });
    
    if (patient) {
      // TODO: Update appointment status in database
      logger.debug(`Appointment confirmed for patient ${patient.id}`);
    }
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[CONFIRMATION_ERROR]', error);
  }
}

// Handle appointment cancellation
async function handleAppointmentCancellation(
  phoneNumber: string,
  messageSid: string
): Promise<void> {
  try {
    // Find patient by phone number
    const patient: any = await // @ts-ignore
    prisma.patient.findFirst({
      where: { phone: phoneNumber },
    });
    
    if (patient) {
      // TODO: Update appointment status in database
      logger.debug(`Appointment cancelled for patient ${patient.id}`);
    }
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[CANCELLATION_ERROR]', error);
  }
}

// Get SMS status
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
    // @ts-ignore
   
    logger.error('[SMS_STATUS_ERROR]', error);
    throw error;
  }
}
