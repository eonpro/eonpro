/**
 * Email Service
 *
 * Unified email service that delegates to AWS SES for production
 * and provides mock functionality for development/testing.
 *
 * @see src/lib/integrations/aws/sesService.ts for full SES implementation
 * @see docs/EMAIL_ARCHITECTURE.md for architecture overview
 */

import { logger } from '@/lib/logger';
import {
  sendEmail as sesSendEmail,
  sendBulkEmails as sesSendBulkEmails,
  renderTemplate,
  type SendEmailParams,
  type EmailResponse,
} from '@/lib/integrations/aws/sesService';
import {
  EmailTemplate,
  EmailPriority,
  EmailStatus,
  isSESEnabled,
  validateEmail,
} from '@/lib/integrations/aws/sesConfig';

// Re-export types and enums for convenience
export { EmailTemplate, EmailPriority, EmailStatus };
export type { SendEmailParams, EmailResponse };

/**
 * Simple email options for basic use cases
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

/**
 * Templated email options
 */
export interface TemplatedEmailOptions {
  to: string | string[];
  template: EmailTemplate;
  data: Record<string, unknown>;
  subject?: string;
  priority?: EmailPriority;
  replyTo?: string;
}

/**
 * Email service result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email using AWS SES
 *
 * @example
 * // Simple email
 * await sendEmail({
 *   to: 'patient@example.com',
 *   subject: 'Your Appointment',
 *   html: '<p>Your appointment is confirmed.</p>'
 * });
 *
 * @example
 * // Multiple recipients
 * await sendEmail({
 *   to: ['user1@example.com', 'user2@example.com'],
 *   subject: 'Team Update',
 *   text: 'Hello team!'
 * });
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, replyTo } = options;

  // Validate recipients
  const recipients = Array.isArray(to) ? to : [to];
  for (const email of recipients) {
    if (!validateEmail(email)) {
      logger.error('Invalid email address', { email });
      return {
        success: false,
        error: `Invalid email address: ${email}`,
      };
    }
  }

  try {
    // Use AWS SES service
    const response = await sesSendEmail({
      to: recipients,
      subject,
      html,
      text,
      replyTo,
    });

    if (response.status === EmailStatus.SENT) {
      logger.info('Email sent successfully', {
        to: recipients,
        subject,
        messageId: response.messageId,
        provider: isSESEnabled() ? 'aws-ses' : 'mock',
      });

      return {
        success: true,
        messageId: response.messageId,
      };
    } else {
      logger.error('Email send failed', {
        to: recipients,
        subject,
        error: response.error,
      });

      return {
        success: false,
        error: response.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Email send exception', {
      to: recipients,
      subject,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send a templated email using predefined templates
 *
 * @example
 * // Appointment reminder
 * await sendTemplatedEmail({
 *   to: 'patient@example.com',
 *   template: EmailTemplate.APPOINTMENT_REMINDER,
 *   data: {
 *     patientName: 'John Doe',
 *     appointmentDate: 'January 25, 2026',
 *     appointmentTime: '2:00 PM',
 *     providerName: 'Dr. Smith',
 *     location: 'Main Clinic'
 *   }
 * });
 *
 * @example
 * // Password reset
 * await sendTemplatedEmail({
 *   to: 'user@example.com',
 *   template: EmailTemplate.PASSWORD_RESET,
 *   data: {
 *     firstName: 'John',
 *     resetLink: 'https://app.lifefile.com/reset?token=abc123'
 *   },
 *   priority: EmailPriority.HIGH
 * });
 */
export async function sendTemplatedEmail(options: TemplatedEmailOptions): Promise<EmailResult> {
  const { to, template, data, subject, priority, replyTo } = options;

  // Validate recipients
  const recipients = Array.isArray(to) ? to : [to];
  for (const email of recipients) {
    if (!validateEmail(email)) {
      logger.error('Invalid email address', { email });
      return {
        success: false,
        error: `Invalid email address: ${email}`,
      };
    }
  }

  try {
    const response = await sesSendEmail({
      to: recipients,
      subject,
      template,
      templateData: data,
      priority,
      replyTo,
    });

    if (response.status === EmailStatus.SENT) {
      logger.info('Templated email sent successfully', {
        to: recipients,
        template,
        messageId: response.messageId,
        provider: isSESEnabled() ? 'aws-ses' : 'mock',
      });

      return {
        success: true,
        messageId: response.messageId,
      };
    } else {
      logger.error('Templated email send failed', {
        to: recipients,
        template,
        error: response.error,
      });

      return {
        success: false,
        error: response.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Templated email send exception', {
      to: recipients,
      template,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send bulk emails to multiple recipients
 * Handles batching and rate limiting automatically
 *
 * @example
 * // Send newsletter to all subscribers
 * await sendBulkEmail(
 *   ['user1@example.com', 'user2@example.com', 'user3@example.com'],
 *   'Monthly Newsletter',
 *   '<h1>Welcome to our newsletter!</h1>'
 * );
 */
export async function sendBulkEmail(
  recipients: string[],
  subject: string,
  content: string,
  options?: { from?: string; batchSize?: number }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  const batchSize = options?.batchSize || 50;

  // Split recipients into batches
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    // Send to each recipient in the batch
    const batchResults = await Promise.all(
      batch.map(async (to) => {
        const result = await sendEmail({
          to,
          subject,
          html: content,
        });

        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`${to}: ${result.error}`);
        }

        return result;
      })
    );

    // Add delay between batches to avoid rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.info('Bulk email complete', {
    total: recipients.length,
    sent: results.sent,
    failed: results.failed,
  });

  return results;
}

/**
 * Send bulk templated emails with individual data per recipient
 *
 * @example
 * // Send personalized appointment reminders
 * await sendBulkTemplatedEmail(
 *   [
 *     { email: 'patient1@example.com', data: { patientName: 'John', appointmentDate: 'Jan 25' } },
 *     { email: 'patient2@example.com', data: { patientName: 'Jane', appointmentDate: 'Jan 26' } },
 *   ],
 *   EmailTemplate.APPOINTMENT_REMINDER,
 *   { clinicName: 'Main Clinic' }
 * );
 */
export async function sendBulkTemplatedEmail(
  recipients: Array<{ email: string; data?: Record<string, unknown> }>,
  template: EmailTemplate,
  defaultData?: Record<string, unknown>
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const responses = await sesSendBulkEmails(recipients, template, defaultData);

    for (const response of responses) {
      if (response.status === EmailStatus.SENT) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push(`${response.to.join(', ')}: ${response.error}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.failed = recipients.length;
    results.errors.push(errorMessage);
  }

  logger.info('Bulk templated email complete', {
    template,
    total: recipients.length,
    sent: results.sent,
    failed: results.failed,
  });

  return results;
}

/**
 * Preview an email template with sample data
 * Useful for testing and debugging templates
 *
 * @example
 * const preview = await previewTemplate(
 *   EmailTemplate.WELCOME,
 *   { firstName: 'John' }
 * );
 * console.log(preview.html);
 */
export async function previewTemplate(
  template: EmailTemplate,
  data: Record<string, unknown>
): Promise<{ html: string; text: string; subject?: string }> {
  return renderTemplate(template, data);
}

/**
 * Check if email service is properly configured
 */
export function isEmailConfigured(): boolean {
  return isSESEnabled();
}

/**
 * Get email service status
 */
export function getEmailServiceStatus(): {
  configured: boolean;
  provider: string;
  mode: 'production' | 'mock';
} {
  const configured = isSESEnabled();
  return {
    configured,
    provider: configured ? 'aws-ses' : 'mock',
    mode: configured ? 'production' : 'mock',
  };
}
