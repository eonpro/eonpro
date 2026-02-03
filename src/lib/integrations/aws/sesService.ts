/**
 * AWS SES Email Service
 *
 * Handles email sending with templates, retry logic, and rate limiting
 */

import { logger } from '@/lib/logger';
import {
  SESClient,
  SendEmailCommand,
  SendTemplatedEmailCommand,
  SendBulkTemplatedEmailCommand,
  GetSendQuotaCommand,
  VerifyEmailIdentityCommand,
  ListVerifiedEmailAddressesCommand,
} from '@aws-sdk/client-ses';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import nodemailer from 'nodemailer';
import handlebars from 'handlebars';
import {
  sesConfig,
  isSESEnabled,
  EmailTemplate,
  EmailPriority,
  EmailStatus,
  EMAIL_CONFIG,
  DEFAULT_SUBJECTS,
  validateEmail,
  SES_ERRORS,
} from './sesConfig';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';

// ENTERPRISE: Timeout configuration for SES client
const SES_CONNECTION_TIMEOUT = 5000; // 5 seconds
const SES_SOCKET_TIMEOUT = 10000; // 10 seconds

// Initialize SES Client
let sesClient: SESClient | null = null;
let transporter: nodemailer.Transporter | null = null;

export function getSESClient(): SESClient {
  if (!sesClient) {
    if (!isSESEnabled()) {
      throw new Error(SES_ERRORS.NOT_CONFIGURED);
    }

    // ENTERPRISE: Configure SES client with timeouts to prevent hanging requests
    sesClient = new SESClient({
      region: sesConfig.region,
      credentials: {
        accessKeyId: sesConfig.accessKeyId,
        secretAccessKey: sesConfig.secretAccessKey,
      },
      requestHandler: new NodeHttpHandler({
        connectionTimeout: SES_CONNECTION_TIMEOUT,
        socketTimeout: SES_SOCKET_TIMEOUT,
      }),
    });

    logger.info('[SES] Client initialized with timeouts', {
      connectionTimeout: SES_CONNECTION_TIMEOUT,
      socketTimeout: SES_SOCKET_TIMEOUT,
    });
  }

  return sesClient;
}

// Get Nodemailer transporter
export function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!isSESEnabled()) {
      // Use mock transporter for development
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    } else {
      // Use JSON transport for now (we'll use AWS SDK directly for sending)
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

  return transporter;
}

// Email sending parameters
export interface SendEmailParams {
  to: string | string[];
  subject?: string;
  template?: EmailTemplate;
  templateData?: Record<string, unknown>;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  priority?: EmailPriority;
  tags?: Record<string, string>;
  scheduledTime?: Date;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

// Email attachment interface
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: string;
}

// Email response interface
export interface EmailResponse {
  messageId: string;
  status: EmailStatus;
  to: string[];
  sentAt: Date;
  error?: string;
}

// Send single email
export async function sendEmail(params: SendEmailParams): Promise<EmailResponse> {
  // Validate recipients
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  for (const email of recipients) {
    if (!validateEmail(email)) {
      throw new Error(`${SES_ERRORS.INVALID_EMAIL}: ${email}`);
    }
  }

  // Use mock service if not enabled
  if (!isSESEnabled()) {
    return mockSendEmail(params);
  }

  try {
    // Prepare email content
    let html = params.html;
    let text = params.text;
    let subject = params.subject;

    // Apply template if specified
    if (params.template && params.templateData) {
      const rendered = await renderTemplate(params.template, params.templateData);
      html = rendered.html;
      text = rendered.text;
      subject = rendered.subject || subject || DEFAULT_SUBJECTS[params.template];
    }

    // Compile subject with handlebars if it contains variables
    if (subject && params.templateData) {
      const subjectTemplate = handlebars.compile(subject);
      subject = subjectTemplate(params.templateData);
    }

    // Send email (using AWS SDK directly for production, mock for development)
    let result;

    if (!isSESEnabled()) {
      // Use mock transporter for development
      const transporter = getTransporter();
      result = await transporter.sendMail({
        from: `${sesConfig.fromName} <${sesConfig.fromEmail}>`,
        to: recipients.join(', '),
        cc: params.cc,
        bcc: params.bcc,
        replyTo: params.replyTo || sesConfig.replyToEmail,
        subject: subject || 'No Subject',
        html,
        text,
        attachments: params.attachments,
        priority: params.priority,
        headers: {
          'X-Priority': params.priority === EmailPriority.HIGH ? '1' : '3',
          'X-Campaign': params.template || 'custom',
          ...(params.tags &&
            Object.entries(params.tags).reduce(
              (acc, [key, value]) => ({
                ...acc,
                [`X-Tag-${key}`]: value,
              }),
              {}
            )),
        },
      });
    } else {
      // Use AWS SES SDK directly
      const client = getSESClient();
      const command = new SendEmailCommand({
        Source: `${sesConfig.fromName} <${sesConfig.fromEmail}>`,
        Destination: {
          ToAddresses: recipients,
          CcAddresses: Array.isArray(params.cc) ? params.cc : params.cc ? [params.cc] : undefined,
          BccAddresses: Array.isArray(params.bcc)
            ? params.bcc
            : params.bcc
              ? [params.bcc]
              : undefined,
        },
        Message: {
          Subject: { Data: subject || 'No Subject' },
          Body: {
            Html: html ? { Data: html } : undefined,
            Text: text ? { Data: text } : undefined,
          },
        },
        ReplyToAddresses: params.replyTo
          ? [params.replyTo]
          : sesConfig.replyToEmail
            ? [sesConfig.replyToEmail]
            : undefined,
        ConfigurationSetName: sesConfig.configurationSet,
      });

      // SOC 2 Compliance: Wrapped with circuit breaker for availability
      const response = await circuitBreakers.email.execute(() => client.send(command));
      result = { messageId: response.MessageId };
    }

    return {
      messageId: result.messageId,
      status: EmailStatus.SENT,
      to: recipients,
      sentAt: new Date(),
    };
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SES] Send email failed:', error);

    return {
      messageId: '',
      status: EmailStatus.FAILED,
      to: recipients,
      sentAt: new Date(),
      error: errorMessage || SES_ERRORS.SEND_FAILED,
    };
  }
}

// Send bulk emails
export async function sendBulkEmails(
  recipients: Array<{ email: string; data?: Record<string, unknown> }>,
  template: EmailTemplate,
  defaultData?: Record<string, unknown>
): Promise<EmailResponse[]> {
  const results: EmailResponse[] = [];
  const batches = [];

  // Split into batches
  for (let i = 0; i < recipients.length; i += EMAIL_CONFIG.BATCH.SIZE) {
    batches.push(recipients.slice(i, i + EMAIL_CONFIG.BATCH.SIZE));
  }

  // Process batches
  for (const batch of batches) {
    const batchPromises = batch.map((recipient: any) =>
      sendEmail({
        to: recipient.email,
        template,
        templateData: { ...defaultData, ...recipient.data },
      })
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add delay between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, EMAIL_CONFIG.BATCH.DELAY));
    }
  }

  return results;
}

// Render email template
export async function renderTemplate(
  template: EmailTemplate,
  data: Record<string, unknown>
): Promise<{ html: string; text: string; subject?: string }> {
  // Get template content
  const templateContent = await getTemplateContent(template);

  // Merge with default data
  const templateData = {
    ...EMAIL_CONFIG.TEMPLATE_DEFAULTS,
    ...data,
    year: new Date().getFullYear(),
  };

  // Compile templates
  const htmlTemplate = handlebars.compile(templateContent.html);
  const textTemplate = handlebars.compile(templateContent.text);

  return {
    html: htmlTemplate(templateData),
    text: textTemplate(templateData),
    subject: templateContent.subject,
  };
}

// Get template content (in production, these would be stored in database or files)
async function getTemplateContent(template: EmailTemplate): Promise<{
  html: string;
  text: string;
  subject?: string;
}> {
  // Default templates
  const templates: Record<EmailTemplate, { html: string; text: string }> = {
    [EmailTemplate.WELCOME]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; background: #efece7; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #059669; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #ffffff; }
              .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background: #059669; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px; 
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to {{COMPANY_NAME}}!</h1>
              </div>
              <div class="content">
                <h2>Hello {{firstName}},</h2>
                <p>Thank you for joining {{COMPANY_NAME}}. We're excited to have you on board!</p>
                <p>Your account has been created successfully. You can now access all our services.</p>
                <p style="text-align: center;">
                  <a href="{{WEBSITE_URL}}/dashboard" class="button">Go to Dashboard</a>
                </p>
                <p>If you have any questions, please don't hesitate to contact our support team.</p>
                <p>Best regards,<br>The {{COMPANY_NAME}} Team</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Welcome to {{COMPANY_NAME}}!
        
        Hello {{firstName}},
        
        Thank you for joining {{COMPANY_NAME}}. We're excited to have you on board!
        
        Your account has been created successfully. You can now access all our services.
        
        Go to Dashboard: {{WEBSITE_URL}}/dashboard
        
        If you have any questions, please don't hesitate to contact our support team.
        
        Best regards,
        The {{COMPANY_NAME}} Team
      `,
    },

    [EmailTemplate.PATIENT_WELCOME_VERIFICATION]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #efece7; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #059669; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .header h1 { margin: 0; font-size: 24px; }
              .content { padding: 30px 20px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
              .verify-button { 
                display: inline-block; 
                padding: 14px 32px; 
                background: #059669; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600;
                margin: 20px 0;
              }
              .verify-button:hover { opacity: 0.9; }
              .info-box { 
                background: #efece7; 
                border-radius: 8px; 
                padding: 16px; 
                margin: 20px 0;
              }
              .footer { text-align: center; padding: 20px; color: #6B7280; font-size: 12px; }
              .warning { color: #DC2626; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to {{clinicName}}!</h1>
              </div>
              <div class="content">
                <h2>Hello {{firstName}},</h2>
                <p>Thank you for registering with <strong>{{clinicName}}</strong>. We're excited to have you as a patient!</p>
                
                <p>To complete your registration and access your patient portal, please verify your email address by clicking the button below:</p>
                
                <p style="text-align: center;">
                  <a href="{{verificationLink}}" class="verify-button">Verify My Email</a>
                </p>
                
                <div class="info-box">
                  <p style="margin: 0;"><strong>This link will expire in {{expiresIn}}.</strong></p>
                </div>
                
                <p>Once verified, you'll be able to:</p>
                <ul>
                  <li>View your health records and medications</li>
                  <li>Schedule and manage appointments</li>
                  <li>Communicate with your care team</li>
                  <li>Track shipments and orders</li>
                </ul>
                
                <p class="warning">If you didn't create this account, please ignore this email or contact our support team.</p>
                
                <p>If the button above doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #059669; font-size: 12px;">{{verificationLink}}</p>
                
                <p>Best regards,<br>The {{clinicName}} Team</p>
              </div>
              <div class="footer">
                <p>This email was sent by {{COMPANY_NAME}} on behalf of {{clinicName}}.</p>
                <p>{{COMPANY_ADDRESS}}</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
Welcome to {{clinicName}}!

Hello {{firstName}},

Thank you for registering with {{clinicName}}. We're excited to have you as a patient!

To complete your registration and access your patient portal, please verify your email address by clicking the link below:

{{verificationLink}}

This link will expire in {{expiresIn}}.

Once verified, you'll be able to:
- View your health records and medications
- Schedule and manage appointments
- Communicate with your care team
- Track shipments and orders

If you didn't create this account, please ignore this email or contact our support team.

Best regards,
The {{clinicName}} Team

---
This email was sent by {{COMPANY_NAME}} on behalf of {{clinicName}}.
      `,
    },

    [EmailTemplate.APPOINTMENT_REMINDER]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .appointment-box { 
                background: #EFF6FF; 
                border: 2px solid #3B82F6; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 20px 0; 
              }
              .info-row { margin: 10px 0; }
              .label { font-weight: bold; color: #6B7280; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Appointment Reminder</h2>
              <p>Hello {{patientName}},</p>
              <p>This is a reminder about your upcoming appointment:</p>
              
              <div class="appointment-box">
                <div class="info-row">
                  <span class="label">Date:</span> {{appointmentDate}}
                </div>
                <div class="info-row">
                  <span class="label">Time:</span> {{appointmentTime}}
                </div>
                <div class="info-row">
                  <span class="label">Provider:</span> {{providerName}}
                </div>
                <div class="info-row">
                  <span class="label">Location:</span> {{location}}
                </div>
                {{#if notes}}
                <div class="info-row">
                  <span class="label">Notes:</span> {{notes}}
                </div>
                {{/if}}
              </div>
              
              <p>Please arrive 15 minutes early to complete any necessary paperwork.</p>
              <p>If you need to cancel or reschedule, please call us at {{SUPPORT_PHONE}}.</p>
              
              <p>Best regards,<br>{{COMPANY_NAME}}</p>
            </div>
          </body>
        </html>
      `,
      text: `
        Appointment Reminder
        
        Hello {{patientName}},
        
        This is a reminder about your upcoming appointment:
        
        Date: {{appointmentDate}}
        Time: {{appointmentTime}}
        Provider: {{providerName}}
        Location: {{location}}
        {{#if notes}}Notes: {{notes}}{{/if}}
        
        Please arrive 15 minutes early to complete any necessary paperwork.
        
        If you need to cancel or reschedule, please call us at {{SUPPORT_PHONE}}.
        
        Best regards,
        {{COMPANY_NAME}}
      `,
    },

    [EmailTemplate.ORDER_CONFIRMATION]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .order-summary { background: #f3f4f6; padding: 20px; border-radius: 8px; }
              .item { border-bottom: 1px solid #e5e7eb; padding: 10px 0; }
              .total { font-size: 18px; font-weight: bold; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Order Confirmed!</h2>
              <p>Thank you for your order, {{customerName}}!</p>
              
              <div class="order-summary">
                <h3>Order #{{orderId}}</h3>
                {{#each items}}
                <div class="item">
                  <strong>{{this.name}}</strong><br>
                  Quantity: {{this.quantity}} | Price: \${{this.price}}
                </div>
                {{/each}}
                <div class="total">
                  Total: \${{totalAmount}}
                </div>
              </div>
              
              <p><strong>Shipping Address:</strong><br>
              {{shippingAddress}}</p>
              
              <p>You'll receive another email when your order ships.</p>
              
              <p>Thank you,<br>{{COMPANY_NAME}}</p>
            </div>
          </body>
        </html>
      `,
      text: `Order Confirmed! Order #{{orderId}} - Total: \${{totalAmount}}`,
    },

    // Invoice/Payment Templates
    [EmailTemplate.INVOICE]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .invoice-box { 
                background: #FEF3C7; 
                border: 2px solid #F59E0B; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 20px 0; 
              }
              .amount { font-size: 24px; font-weight: bold; color: #1F2937; }
              .pay-button {
                display: inline-block;
                padding: 14px 28px;
                background: #10B981;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
                margin: 20px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Invoice from {{COMPANY_NAME}}</h2>
              <p>Hello {{patientName}},</p>
              <p>You have a new invoice ready for payment:</p>
              
              <div class="invoice-box">
                <p><strong>Invoice #:</strong> {{invoiceNumber}}</p>
                <p><strong>Description:</strong> {{description}}</p>
                <p><strong>Due Date:</strong> {{dueDate}}</p>
                <p class="amount">Amount Due: \${{amount}} {{currency}}</p>
              </div>
              
              <p style="text-align: center;">
                <a href="{{paymentLink}}" class="pay-button">Pay Now - Secure Payment</a>
              </p>
              
              <p>Click the button above to pay securely online. You can also view and download your invoice from the link.</p>
              
              <p>If you have questions about this invoice, please contact us at {{SUPPORT_EMAIL}}.</p>
              
              <p>Thank you for your business,<br>{{COMPANY_NAME}}</p>
            </div>
          </body>
        </html>
      `,
      text: `Invoice from {{COMPANY_NAME}}

Hello {{patientName}},

Invoice #: {{invoiceNumber}}
Description: {{description}}
Amount Due: \${{amount}} {{currency}}
Due Date: {{dueDate}}

Pay now: {{paymentLink}}

Thank you,
{{COMPANY_NAME}}`,
    },

    [EmailTemplate.PAYMENT_RECEIVED]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .success-box { 
                background: #D1FAE5; 
                border: 2px solid #10B981; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 20px 0;
                text-align: center;
              }
              .checkmark { font-size: 48px; color: #10B981; }
              .amount { font-size: 24px; font-weight: bold; color: #1F2937; }
              .receipt-link {
                display: inline-block;
                padding: 10px 20px;
                background: #059669;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-box">
                <div class="checkmark">✓</div>
                <h2>Payment Received!</h2>
                <p class="amount">\${{amount}} {{currency}}</p>
              </div>
              
              <p>Hello {{customerName}},</p>
              <p>Thank you for your payment! This email confirms that we have received your payment.</p>
              
              <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Invoice #:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{{invoiceNumber}}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Amount Paid:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">\${{amount}} {{currency}}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{{paidAt}}</td>
                </tr>
                <tr>
                  <td style="padding: 8px;"><strong>Description:</strong></td>
                  <td style="padding: 8px;">{{description}}</td>
                </tr>
              </table>
              
              {{#if receiptUrl}}
              <p style="text-align: center;">
                <a href="{{receiptUrl}}" class="receipt-link">View/Download Receipt</a>
              </p>
              {{/if}}
              
              <p>If you have any questions about this payment, please contact us at {{SUPPORT_EMAIL}}.</p>
              
              <p>Thank you for choosing {{COMPANY_NAME}}!</p>
            </div>
          </body>
        </html>
      `,
      text: `Payment Received!

Hello {{customerName}},

Thank you for your payment!

Invoice #: {{invoiceNumber}}
Amount Paid: \${{amount}} {{currency}}
Date: {{paidAt}}
Description: {{description}}

{{#if receiptUrl}}View receipt: {{receiptUrl}}{{/if}}

Thank you for choosing {{COMPANY_NAME}}!`,
    },

    [EmailTemplate.PAYMENT_FAILED]: {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .alert-box { 
                background: #FEE2E2; 
                border: 2px solid #EF4444; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 20px 0; 
              }
              .retry-button {
                display: inline-block;
                padding: 14px 28px;
                background: #EF4444;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Payment Failed</h2>
              <p>Hello {{customerName}},</p>
              
              <div class="alert-box">
                <p><strong>We were unable to process your payment of \${{amount}}.</strong></p>
                <p>Reason: {{reason}}</p>
              </div>
              
              <p>Please update your payment method and try again to avoid any service interruption.</p>
              
              {{#if retryLink}}
              <p style="text-align: center;">
                <a href="{{retryLink}}" class="retry-button">Update Payment Method</a>
              </p>
              {{/if}}
              
              <p>If you need assistance, please contact us at {{SUPPORT_EMAIL}} or call {{SUPPORT_PHONE}}.</p>
              
              <p>Best regards,<br>{{COMPANY_NAME}}</p>
            </div>
          </body>
        </html>
      `,
      text: `Payment Failed

Hello {{customerName}},

We were unable to process your payment of \${{amount}}.
Reason: {{reason}}

{{#if retryLink}}Update payment method: {{retryLink}}{{/if}}

Please contact us at {{SUPPORT_EMAIL}} if you need assistance.

{{COMPANY_NAME}}`,
    },

    [EmailTemplate.PASSWORD_RESET]: {
      html: `
        <!DOCTYPE html>
        <html>
          <body>
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Reset Your Password</h2>
              <p>Hello {{firstName}},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <p style="text-align: center;">
                <a href="{{resetLink}}" style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
              </p>
              <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
              <p>Best regards,<br>{{COMPANY_NAME}}</p>
            </div>
          </body>
        </html>
      `,
      text: `Reset Your Password\n\nClick here: {{resetLink}}\n\nThis link expires in 1 hour.`,
    },
  } as Record<EmailTemplate, { html: string; text: string }>;

  // Provide minimal templates for any missing types
  Object.values(EmailTemplate).forEach((tmpl) => {
    const templateKey = tmpl as EmailTemplate;
    if (!templates[templateKey]) {
      templates[templateKey] = {
        html: `<html><body><h2>{{subject}}</h2><div>{{{content}}}</div></body></html>`,
        text: `{{subject}}\n\n{{content}}`,
      };
    }
  });

  return {
    ...templates[template],
    subject: DEFAULT_SUBJECTS[template],
  };
}

// Verify email address in SES
export async function verifyEmailAddress(email: string): Promise<boolean> {
  if (!isSESEnabled()) {
    return true; // Mock always returns true
  }

  try {
    const client = getSESClient();
    await client.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
    return true;
  } catch (error: any) {
    // @ts-ignore

    logger.error('[SES] Failed to verify email:', error);
    return false;
  }
}

// Get send quota
export async function getSendQuota(): Promise<{
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
}> {
  if (!isSESEnabled()) {
    return {
      max24HourSend: 200,
      maxSendRate: 1,
      sentLast24Hours: 0,
    };
  }

  try {
    const client = getSESClient();
    const response = await client.send(new GetSendQuotaCommand({}));

    return {
      max24HourSend: response.Max24HourSend || 0,
      maxSendRate: response.MaxSendRate || 0,
      sentLast24Hours: response.SentLast24Hours || 0,
    };
  } catch (error: any) {
    // @ts-ignore

    logger.error('[SES] Failed to get quota:', error);
    return {
      max24HourSend: 0,
      maxSendRate: 0,
      sentLast24Hours: 0,
    };
  }
}

// Mock email sending for development
function mockSendEmail(params: SendEmailParams): EmailResponse {
  const recipients = Array.isArray(params.to) ? params.to : [params.to];

  logger.debug('[Mock Email] Sending email:', {
    to: recipients,
    subject: params.subject || DEFAULT_SUBJECTS[params.template || EmailTemplate.CUSTOM],
    template: params.template,
    priority: params.priority,
  });

  return {
    messageId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    status: EmailStatus.SENT,
    to: recipients,
    sentAt: new Date(),
  };
}

// Export mock service for testing
export const mockSESService = {
  sendEmail: mockSendEmail,
  verifyEmailAddress: async (email: string) => true,
  getSendQuota: async () => ({
    max24HourSend: 200,
    maxSendRate: 1,
    sentLast24Hours: Math.floor(Math.random() * 100),
  }),
  renderTemplate: async (template: EmailTemplate, data: Record<string, unknown>) => {
    const content = await getTemplateContent(template);
    const htmlTemplate = handlebars.compile(content.html);
    const textTemplate = handlebars.compile(content.text);
    return {
      html: htmlTemplate({ ...EMAIL_CONFIG.TEMPLATE_DEFAULTS, ...data }),
      text: textTemplate({ ...EMAIL_CONFIG.TEMPLATE_DEFAULTS, ...data }),
      subject: content.subject,
    };
  },
};
