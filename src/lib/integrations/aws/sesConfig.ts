/**
 * AWS SES (Simple Email Service) Configuration
 * 
 * Handles email sending configuration and templates
 */

import { isFeatureEnabled } from '@/lib/features';

// AWS SES Configuration Interface
export interface AWSSESConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  configurationSet?: string;
  maxSendRate?: number;
}

// Load configuration from environment
export const sesConfig: AWSSESConfig = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  fromEmail: process.env.AWS_SES_FROM_EMAIL || 'noreply@lifefile.com',
  fromName: process.env.AWS_SES_FROM_NAME || 'Lifefile Health',
  replyToEmail: process.env.AWS_SES_REPLY_TO_EMAIL,
  configurationSet: process.env.AWS_SES_CONFIGURATION_SET,
  maxSendRate: parseInt(process.env.AWS_SES_MAX_SEND_RATE || '14'),
};

// Validate SES configuration
export function isSESConfigured(): boolean {
  return !!(
    sesConfig.accessKeyId &&
    sesConfig.secretAccessKey &&
    sesConfig.fromEmail &&
    sesConfig.region
  );
}

// Check if SES is enabled and configured
export function isSESEnabled(): boolean {
  return isFeatureEnabled('AWS_SES_EMAIL') && isSESConfigured();
}

// Email Template Types
export enum EmailTemplate {
  // Patient Communications
  WELCOME = 'welcome',
  PATIENT_WELCOME_VERIFICATION = 'patient_welcome_verification',
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  APPOINTMENT_RESCHEDULED = 'appointment_rescheduled',
  
  // Order & Prescription
  ORDER_CONFIRMATION = 'order_confirmation',
  ORDER_SHIPPED = 'order_shipped',
  ORDER_DELIVERED = 'order_delivered',
  PRESCRIPTION_READY = 'prescription_ready',
  PRESCRIPTION_EXPIRING = 'prescription_expiring',
  REFILL_REMINDER = 'refill_reminder',
  
  // Account & Security
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFICATION = 'email_verification',
  TWO_FACTOR_CODE = 'two_factor_code',
  ACCOUNT_LOCKED = 'account_locked',
  
  // Billing
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
  INVOICE = 'invoice',
  
  // Provider Communications
  PROVIDER_WELCOME = 'provider_welcome',
  NEW_PATIENT_ASSIGNED = 'new_patient_assigned',
  DOCUMENT_RECEIVED = 'document_received',
  SIGNATURE_REQUIRED = 'signature_required',
  
  // Custom
  CUSTOM = 'custom',
}

// Email Priority Levels
export enum EmailPriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

// Email Status
export enum EmailStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  BOUNCED = 'bounced',
  COMPLAINED = 'complained',
  FAILED = 'failed',
}

// Email Configuration
export const EMAIL_CONFIG = {
  // Retry settings
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 1000, // 1 second
    MAX_DELAY: 30000, // 30 seconds
    MULTIPLIER: 2,
  },
  
  // Rate limiting
  RATE_LIMIT: {
    MAX_PER_SECOND: sesConfig.maxSendRate || 14,
    MAX_PER_DAY: 50000, // SES sandbox limit
  },
  
  // Batch settings
  BATCH: {
    SIZE: 50,
    DELAY: 100, // ms between batches
  },
  
  // Bounce handling
  BOUNCE: {
    SOFT_BOUNCE_RETRY: true,
    HARD_BOUNCE_BLACKLIST: true,
    COMPLAINT_BLACKLIST: true,
  },
  
  // Template defaults
  TEMPLATE_DEFAULTS: {
    COMPANY_NAME: 'Lifefile Health',
    COMPANY_ADDRESS: '123 Health St, Medical City, MC 12345',
    SUPPORT_EMAIL: 'support@lifefile.com',
    SUPPORT_PHONE: '1-800-LIFEFILE',
    WEBSITE_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://lifefile.com',
    LOGO_URL: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
    UNSUBSCRIBE_URL: `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe`,
  },
};

// Email validation regex
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Validate email address
export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Default email subjects
export const DEFAULT_SUBJECTS: Record<EmailTemplate, string> = {
  [EmailTemplate.WELCOME]: 'Welcome to Lifefile Health!',
  [EmailTemplate.PATIENT_WELCOME_VERIFICATION]: 'Verify Your Email - Welcome to {{clinicName}}',
  [EmailTemplate.APPOINTMENT_CONFIRMATION]: 'Your Appointment is Confirmed',
  [EmailTemplate.APPOINTMENT_REMINDER]: 'Appointment Reminder - {{date}}',
  [EmailTemplate.APPOINTMENT_CANCELLED]: 'Appointment Cancelled',
  [EmailTemplate.APPOINTMENT_RESCHEDULED]: 'Appointment Rescheduled',
  
  [EmailTemplate.ORDER_CONFIRMATION]: 'Order Confirmed - #{{orderId}}',
  [EmailTemplate.ORDER_SHIPPED]: 'Your Order Has Shipped!',
  [EmailTemplate.ORDER_DELIVERED]: 'Your Order Was Delivered',
  [EmailTemplate.PRESCRIPTION_READY]: 'Your Prescription is Ready',
  [EmailTemplate.PRESCRIPTION_EXPIRING]: 'Prescription Expiring Soon',
  [EmailTemplate.REFILL_REMINDER]: 'Time to Refill Your Medication',
  
  [EmailTemplate.PASSWORD_RESET]: 'Reset Your Password',
  [EmailTemplate.EMAIL_VERIFICATION]: 'Verify Your Email Address',
  [EmailTemplate.TWO_FACTOR_CODE]: 'Your Security Code: {{code}}',
  [EmailTemplate.ACCOUNT_LOCKED]: 'Account Security Alert',
  
  [EmailTemplate.PAYMENT_RECEIVED]: 'Payment Received - Thank You!',
  [EmailTemplate.PAYMENT_FAILED]: 'Payment Failed - Action Required',
  [EmailTemplate.SUBSCRIPTION_RENEWED]: 'Subscription Renewed',
  [EmailTemplate.SUBSCRIPTION_CANCELLED]: 'Subscription Cancelled',
  [EmailTemplate.INVOICE]: 'Invoice #{{invoiceNumber}}',
  
  [EmailTemplate.PROVIDER_WELCOME]: 'Welcome to Lifefile Provider Portal',
  [EmailTemplate.NEW_PATIENT_ASSIGNED]: 'New Patient Assigned',
  [EmailTemplate.DOCUMENT_RECEIVED]: 'New Document Received',
  [EmailTemplate.SIGNATURE_REQUIRED]: 'Signature Required',
  
  [EmailTemplate.CUSTOM]: '{{subject}}',
};

// Error messages
export const SES_ERRORS = {
  NOT_CONFIGURED: 'AWS SES is not configured. Please add AWS credentials.',
  NOT_ENABLED: 'AWS SES Email feature is not enabled.',
  INVALID_EMAIL: 'Invalid email address format.',
  TEMPLATE_NOT_FOUND: 'Email template not found.',
  SEND_FAILED: 'Failed to send email.',
  RATE_LIMIT_EXCEEDED: 'Email rate limit exceeded. Please try again later.',
  INVALID_FROM_ADDRESS: 'From email address not verified in SES.',
  SANDBOX_RESTRICTION: 'SES is in sandbox mode. Recipient must be verified.',
  BOUNCE_DETECTED: 'Email address has bounced previously.',
  COMPLAINT_DETECTED: 'Email address has complained previously.',
  BLACKLISTED: 'Email address is blacklisted.',
  ATTACHMENT_TOO_LARGE: 'Email attachment size exceeds limit.',
  TOO_MANY_RECIPIENTS: 'Too many recipients in single email.',
};
