/**
 * Twilio Configuration and Initialization
 * 
 * Handles Twilio client setup for SMS and Chat services
 */

import twilio from 'twilio';
import { isFeatureEnabled } from '@/lib/features';

// Twilio Configuration Type
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  chatServiceSid?: string;
  messagingServiceSid?: string;
  verifyServiceSid?: string;
}

// Load configuration from environment
export const twilioConfig: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  chatServiceSid: process.env.TWILIO_CHAT_SERVICE_SID || '',
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
  verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
};

// Validate Twilio configuration
export function isTwilioConfigured(): boolean {
  return !!(
    twilioConfig.accountSid && 
    twilioConfig.authToken && 
    twilioConfig.phoneNumber
  );
}

// Initialize Twilio client (singleton)
let twilioClient: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  if (!isFeatureEnabled('TWILIO_SMS')) {
    throw new Error('Twilio SMS feature is not enabled');
  }

  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not properly configured. Please check your environment variables.');
  }

  if (!twilioClient) {
    twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
  }

  return twilioClient;
}

/**
 * Get Twilio client directly - bypasses feature flag check
 * Use for critical authentication flows like OTP that should always work
 * when credentials are configured, regardless of feature flag
 */
export function getTwilioClientDirect() {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not properly configured. Please check your environment variables.');
  }

  if (!twilioClient) {
    twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
  }

  return twilioClient;
}

// SMS Templates
export const SMS_TEMPLATES = {
  APPOINTMENT_REMINDER: (patientName: string, appointmentDate: string, doctorName: string) =>
    `Hi ${patientName}, this is a reminder of your appointment with Dr. ${doctorName} on ${appointmentDate}. Reply CONFIRM to confirm or CANCEL to cancel.`,
  
  APPOINTMENT_CONFIRMATION: (patientName: string, appointmentDate: string) =>
    `Hi ${patientName}, your appointment on ${appointmentDate} has been confirmed. We look forward to seeing you!`,
  
  PRESCRIPTION_READY: (patientName: string, prescriptionId: string) =>
    `Hi ${patientName}, your prescription #${prescriptionId} is ready for pickup. Please visit us at your earliest convenience.`,
  
  LAB_RESULTS_READY: (patientName: string) =>
    `Hi ${patientName}, your lab results are now available. Please log in to your patient portal to view them or contact us for details.`,
  
  PAYMENT_REMINDER: (patientName: string, amount: string, dueDate: string) =>
    `Hi ${patientName}, this is a reminder that your payment of $${amount} is due on ${dueDate}. Please log in to your patient portal to pay.`,
  
  CUSTOM: (message: string) => message,
};

// Response Keywords
export const SMS_KEYWORDS = {
  CONFIRM: ['confirm', 'yes', 'y', 'ok', 'confirmed'],
  CANCEL: ['cancel', 'no', 'n', 'stop', 'cancelled'],
  RESCHEDULE: ['reschedule', 'change', 'modify'],
  HELP: ['help', 'info', 'information', 'options'],
};

// Error messages
export const TWILIO_ERRORS = {
  NOT_CONFIGURED: 'Twilio is not configured. Please add your Twilio credentials to environment variables.',
  FEATURE_DISABLED: 'Twilio SMS feature is disabled. Enable it in feature flags.',
  INVALID_PHONE: 'Invalid phone number format. Please use E.164 format (+1234567890).',
  MESSAGE_FAILED: 'Failed to send SMS message. Please try again later.',
  RATE_LIMIT: 'Too many messages sent. Please wait before sending more.',
};
