/**
 * Twilio SMS Status Callback Webhook
 *
 * Receives delivery status updates from Twilio and updates our SMS log records.
 * This enables tracking of message delivery status (delivered, failed, undelivered).
 *
 * Status flow: queued -> sent -> delivered (or failed/undelivered)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { updateSMSStatus } from '@/lib/integrations/twilio/smsService';

// Validate Twilio webhook signature
async function validateTwilioWebhook(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  // Skip validation in development/testing
  if (process.env.NODE_ENV === 'development' || process.env.TWILIO_USE_MOCK === 'true') {
    return true;
  }

  try {
    const { default: twilio } = await import('twilio');
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error) {
    logger.error('[TWILIO_STATUS_CALLBACK] Failed to validate signature', { error });
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse the form data from Twilio
    const formData = await req.formData();

    const messageSid = formData.get('MessageSid') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const errorCode = formData.get('ErrorCode') as string | null;
    const errorMessage = formData.get('ErrorMessage') as string | null;

    // Optional fields
    const to = formData.get('To') as string | null;
    const from = formData.get('From') as string | null;

    logger.info('[TWILIO_STATUS_CALLBACK] Received status update', {
      messageSid,
      status: messageStatus,
      errorCode,
    });

    // Validate webhook signature in production
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV === 'production') {
      const twilioSignature = req.headers.get('X-Twilio-Signature') || '';
      const url = req.url;

      // Convert FormData to object for validation
      const params: Record<string, string> = {};
      formData.forEach((value, key) => {
        params[key] = value.toString();
      });

      const isValid = await validateTwilioWebhook(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        params
      );

      if (!isValid) {
        logger.warn('[TWILIO_STATUS_CALLBACK] Invalid signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Update SMS status in database
    if (messageSid && messageStatus) {
      await updateSMSStatus(
        messageSid,
        messageStatus,
        errorCode || undefined,
        errorMessage || undefined
      );
    }

    // Return success (Twilio expects 200 OK)
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    logger.error('[TWILIO_STATUS_CALLBACK_ERROR]', { error });

    // Return 200 even on error to prevent Twilio retries
    // We log the error for debugging but don't want webhook failures
    return new NextResponse('OK', { status: 200 });
  }
}

// Twilio may also send GET requests for URL validation
export async function GET() {
  return new NextResponse('Twilio Status Callback Endpoint', { status: 200 });
}
