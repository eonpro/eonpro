/**
 * Email Service
 * Basic email functionality for sending intake form links
 */

import { logger } from '@/lib/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

/**
 * Send an email
 * This is a placeholder implementation - you should integrate with your preferred email service
 * (SendGrid, AWS SES, Resend, etc.)
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const { to, subject, html, text, from } = options;
  
  // Get email configuration from environment
  const emailProvider = process.env.EMAIL_PROVIDER; // 'sendgrid', 'ses', 'resend', etc.
  const fromEmail = from || process.env.EMAIL_FROM || 'noreply@lifefile.com';
  
  try {
    // Log email for development
    if (process.env.NODE_ENV === 'development') {
      logger.info('Email sent (dev mode)', {
        to,
        subject,
        from: fromEmail,
        preview: text?.substring(0, 100) || html?.substring(0, 100),
      });
      
      // In development, just log the email
      logger.info('=== EMAIL DEBUG ===');
      logger.info('Email details', {
        to,
        from: fromEmail,
        subject,
        content: html || text
      });
      logger.info('==================');
      
      return;
    }
    
    // Production email sending
    switch (emailProvider) {
      case 'sendgrid':
        await sendViaSendGrid(to, subject, html || text || '', fromEmail);
        break;
        
      case 'resend':
        await sendViaResend(to, subject, html || text || '', fromEmail);
        break;
        
      case 'ses':
        await sendViaAWSSES(to, subject, html || text || '', fromEmail);
        break;
        
      default:
        // Fallback to console logging in production if no provider configured
        logger.warn('No email provider configured', {
          to,
          subject,
          from: fromEmail,
        });
        
        if (process.env.NODE_ENV !== 'production') {
          logger.info(`Email would be sent to ${to}: ${subject}`);
        }
    }
    
    logger.info('Email sent successfully', {
      to,
      subject,
      provider: emailProvider || 'none',
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to send email', {
      error,
      to,
      subject,
    });
    throw error;
  }
}

/**
 * Send email via SendGrid
 * Requires: npm install @sendgrid/mail
 * Environment: SENDGRID_API_KEY
 */
async function sendViaSendGrid(
  to: string,
  subject: string,
  content: string,
  from: string
): Promise<void> {
  // Placeholder for SendGrid integration
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // 
  // const msg = {
  //   to,
  //   from,
  //   subject,
  //   html: content,
  // };
  // 
  // await sgMail.send(msg);
  
  throw new Error('SendGrid integration not implemented. Please install @sendgrid/mail and configure SENDGRID_API_KEY');
}

/**
 * Send email via Resend
 * Requires: npm install resend
 * Environment: RESEND_API_KEY
 */
async function sendViaResend(
  to: string,
  subject: string,
  content: string,
  from: string
): Promise<void> {
  // Placeholder for Resend integration
  // const { Resend } = require('resend');
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // 
  // await resend.emails.send({
  //   from,
  //   to,
  //   subject,
  //   html: content,
  // });
  
  throw new Error('Resend integration not implemented. Please install resend and configure RESEND_API_KEY');
}

/**
 * Send email via AWS SES
 * Requires: npm install @aws-sdk/client-ses
 * Environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */
async function sendViaAWSSES(
  to: string,
  subject: string,
  content: string,
  from: string
): Promise<void> {
  // Placeholder for AWS SES integration
  // const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
  // 
  // const client = new SESClient({
  //   region: process.env.AWS_REGION || 'us-east-1',
  // });
  // 
  // const command = new SendEmailCommand({
  //   Source: from,
  //   Destination: {
  //     ToAddresses: [to],
  //   },
  //   Message: {
  //     Subject: {
  //       Data: subject,
  //     },
  //     Body: {
  //       Html: {
  //         Data: content,
  //       },
  //     },
  //   },
  // });
  // 
  // await client.send(command);
  
  throw new Error('AWS SES integration not implemented. Please install @aws-sdk/client-ses and configure AWS credentials');
}

/**
 * Send bulk emails
 * Use this for sending the same email to multiple recipients
 */
export async function sendBulkEmail(
  recipients: string[],
  subject: string,
  content: string,
  options?: { from?: string; batchSize?: number }
): Promise<void> {
  const batchSize = options?.batchSize || 50;
  
  // Split recipients into batches
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    // Send to each recipient in the batch
    await Promise.all(
      batch.map((to: any) =>
        sendEmail({
          to,
          subject,
          html: content,
          from: options?.from,
        }).catch(error => {
          logger.error('Failed to send email to recipient', { to, error });
          // Don't throw - continue with other recipients
        })
      )
    );
    
    // Add delay between batches to avoid rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
