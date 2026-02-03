/**
 * AWS SES Bounce/Complaint Webhook
 * ==================================
 *
 * Receives bounce and complaint notifications from AWS SES via SNS.
 *
 * Setup:
 * 1. Create SNS topics for bounces and complaints in AWS
 * 2. Subscribe this endpoint to those topics
 * 3. Configure SES to send bounce/complaint notifications to the topics
 *
 * Security:
 * - Verifies SNS message signatures
 * - Handles subscription confirmation automatically
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { emailLogService } from '@/services/email/emailLogService';
import crypto from 'crypto';

// SNS Message Types
type SNSMessageType = 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';

interface SNSMessage {
  Type: SNSMessageType;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
}

interface SESBounceNotification {
  notificationType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
    feedbackId: string;
  };
  mail: {
    messageId: string;
    source: string;
    timestamp: string;
    destination: string[];
  };
}

interface SESComplaintNotification {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    complaintFeedbackType?: string;
    timestamp: string;
    feedbackId: string;
  };
  mail: {
    messageId: string;
    source: string;
    timestamp: string;
    destination: string[];
  };
}

interface SESDeliveryNotification {
  notificationType: 'Delivery';
  delivery: {
    timestamp: string;
    recipients: string[];
    processingTimeMillis: number;
    smtpResponse: string;
  };
  mail: {
    messageId: string;
    source: string;
    timestamp: string;
    destination: string[];
  };
}

type SESNotification = SESBounceNotification | SESComplaintNotification | SESDeliveryNotification;

/**
 * POST /api/webhooks/ses-bounce
 * Handle SNS notifications for SES bounces and complaints
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse the SNS message
    const body = await req.text();
    let snsMessage: SNSMessage;

    try {
      snsMessage = JSON.parse(body);
    } catch {
      logger.error('[SES Webhook] Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    logger.info('[SES Webhook] Received message', {
      type: snsMessage.Type,
      topicArn: snsMessage.TopicArn,
      messageId: snsMessage.MessageId,
    });

    // Verify SNS signature (production only)
    if (process.env.NODE_ENV === 'production') {
      const isValid = await verifySNSSignature(snsMessage);
      if (!isValid) {
        logger.error('[SES Webhook] Invalid SNS signature', {
          messageId: snsMessage.MessageId,
        });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Handle different message types
    switch (snsMessage.Type) {
      case 'SubscriptionConfirmation': {
        // Automatically confirm SNS subscription
        if (snsMessage.SubscribeURL) {
          await confirmSubscription(snsMessage.SubscribeURL);
          logger.info('[SES Webhook] Subscription confirmed', {
            topicArn: snsMessage.TopicArn,
          });
        }
        return NextResponse.json({ status: 'subscription_confirmed' });
      }

      case 'UnsubscribeConfirmation': {
        logger.info('[SES Webhook] Unsubscribe confirmation received', {
          topicArn: snsMessage.TopicArn,
        });
        return NextResponse.json({ status: 'unsubscribe_confirmed' });
      }

      case 'Notification': {
        // Parse the SES notification
        let sesNotification: SESNotification;
        try {
          sesNotification = JSON.parse(snsMessage.Message);
        } catch {
          logger.error('[SES Webhook] Invalid SES notification payload');
          return NextResponse.json({ error: 'Invalid notification payload' }, { status: 400 });
        }

        await processNotification(sesNotification);
        
        const elapsedMs = Date.now() - startTime;
        return NextResponse.json({
          status: 'processed',
          type: sesNotification.notificationType,
          elapsedMs,
        });
      }

      default:
        logger.warn('[SES Webhook] Unknown message type', {
          type: snsMessage.Type,
        });
        return NextResponse.json({ status: 'ignored', reason: 'unknown_type' });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SES Webhook] Error processing message', {
      error: errorMessage,
      elapsedMs: Date.now() - startTime,
    });

    // Return 200 to prevent SNS retries for processing errors
    return NextResponse.json({
      status: 'error',
      error: errorMessage,
    });
  }
}

/**
 * Verify SNS message signature
 */
async function verifySNSSignature(message: SNSMessage): Promise<boolean> {
  try {
    // Build the string to sign
    const stringToSign = buildStringToSign(message);

    // Fetch the signing certificate
    const certResponse = await fetch(message.SigningCertURL);
    if (!certResponse.ok) {
      return false;
    }
    const cert = await certResponse.text();

    // Verify the signature
    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(stringToSign);

    return verifier.verify(cert, message.Signature, 'base64');
  } catch (error) {
    logger.error('[SES Webhook] Signature verification error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Build the canonical string to sign for SNS verification
 */
function buildStringToSign(message: SNSMessage): string {
  const fields: string[] = [];

  if (message.Type === 'Notification') {
    fields.push('Message', message.Message);
    fields.push('MessageId', message.MessageId);
    if (message.Subject) {
      fields.push('Subject', message.Subject);
    }
    fields.push('Timestamp', message.Timestamp);
    fields.push('TopicArn', message.TopicArn);
    fields.push('Type', message.Type);
  } else if (message.Type === 'SubscriptionConfirmation' || message.Type === 'UnsubscribeConfirmation') {
    fields.push('Message', message.Message);
    fields.push('MessageId', message.MessageId);
    fields.push('SubscribeURL', message.SubscribeURL || '');
    fields.push('Timestamp', message.Timestamp);
    fields.push('Token', ''); // Token is in the SubscribeURL for these types
    fields.push('TopicArn', message.TopicArn);
    fields.push('Type', message.Type);
  }

  return fields.join('\n') + '\n';
}

/**
 * Confirm SNS subscription by visiting the SubscribeURL
 */
async function confirmSubscription(subscribeUrl: string): Promise<void> {
  const response = await fetch(subscribeUrl);
  if (!response.ok) {
    throw new Error(`Failed to confirm subscription: ${response.status}`);
  }
}

/**
 * Process SES notification (bounce, complaint, or delivery)
 */
async function processNotification(notification: SESNotification): Promise<void> {
  switch (notification.notificationType) {
    case 'Bounce':
      await processBounce(notification);
      break;
    case 'Complaint':
      await processComplaint(notification);
      break;
    case 'Delivery':
      await processDelivery(notification);
      break;
  }
}

/**
 * Process bounce notification
 */
async function processBounce(notification: SESBounceNotification): Promise<void> {
  const { bounce, mail } = notification;

  logger.info('[SES Webhook] Processing bounce', {
    messageId: mail.messageId,
    bounceType: bounce.bounceType,
    bounceSubType: bounce.bounceSubType,
    recipients: bounce.bouncedRecipients.map((r) => r.emailAddress),
  });

  // Update email log
  await emailLogService.updateDeliveryStatus({
    messageId: mail.messageId,
    status: 'BOUNCED',
    bouncedAt: new Date(bounce.timestamp),
    bounceType: bounce.bounceType,
    bounceSubType: bounce.bounceSubType,
    errorMessage: bounce.bouncedRecipients[0]?.diagnosticCode || 'Bounced',
    errorCode: bounce.bouncedRecipients[0]?.status,
  });

  // For permanent bounces, we might want to suppress the email address
  if (bounce.bounceType === 'Permanent') {
    for (const recipient of bounce.bouncedRecipients) {
      logger.warn('[SES Webhook] Permanent bounce - email address may be suppressed', {
        email: recipient.emailAddress,
        diagnosticCode: recipient.diagnosticCode,
      });
    }
  }
}

/**
 * Process complaint notification
 */
async function processComplaint(notification: SESComplaintNotification): Promise<void> {
  const { complaint, mail } = notification;

  logger.warn('[SES Webhook] Processing complaint', {
    messageId: mail.messageId,
    complaintType: complaint.complaintFeedbackType,
    recipients: complaint.complainedRecipients.map((r) => r.emailAddress),
  });

  // Update email log
  await emailLogService.updateDeliveryStatus({
    messageId: mail.messageId,
    status: 'COMPLAINED',
    complainedAt: new Date(complaint.timestamp),
    complaintType: complaint.complaintFeedbackType,
    errorMessage: `Complaint: ${complaint.complaintFeedbackType || 'unknown'}`,
  });

  // Complaints should result in suppression
  for (const recipient of complaint.complainedRecipients) {
    logger.warn('[SES Webhook] Email address complained - should be suppressed', {
      email: recipient.emailAddress,
    });
  }
}

/**
 * Process delivery notification (successful delivery)
 */
async function processDelivery(notification: SESDeliveryNotification): Promise<void> {
  const { delivery, mail } = notification;

  logger.info('[SES Webhook] Processing delivery', {
    messageId: mail.messageId,
    recipients: delivery.recipients,
    processingTimeMs: delivery.processingTimeMillis,
  });

  // Update email log
  await emailLogService.updateDeliveryStatus({
    messageId: mail.messageId,
    status: 'DELIVERED',
    deliveredAt: new Date(delivery.timestamp),
  });
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'ses-bounce-webhook',
    timestamp: new Date().toISOString(),
  });
}
