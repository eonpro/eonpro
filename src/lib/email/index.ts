/**
 * Email Module
 *
 * Central export for all email functionality
 */

// Core email service
export {
  sendEmail,
  sendTemplatedEmail,
  sendBulkEmail,
  sendBulkTemplatedEmail,
  previewTemplate,
  isEmailConfigured,
  getEmailServiceStatus,
  EmailTemplate,
  EmailPriority,
  EmailStatus,
  type EmailOptions,
  type TemplatedEmailOptions,
  type EmailResult,
  type SendEmailParams,
  type EmailResponse,
} from '@/lib/email';

// Email automations
export {
  triggerAutomation,
  sendPatientWelcomeEmail,
  sendAppointmentConfirmationEmail,
  sendOrderConfirmationEmail,
  sendPaymentReceivedEmail,
  sendPasswordResetEmail,
  sendPrescriptionReadyEmail,
  getAllAutomations,
  updateAutomation,
  getAutomationStats,
  AutomationTrigger,
  type AutomationConfig,
  type TriggerEmailParams,
} from './automations';
