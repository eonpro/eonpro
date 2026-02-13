import { NextRequest, NextResponse } from 'next/server';
import { processIncomingSMS } from '@/lib/integrations/twilio/smsService';
import { isFeatureEnabled } from '@/lib/features';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Validate webhook signature
async function validateTwilioWebhook(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  // Only validate in production environments
  // In development/testing, we may not have valid signatures
  if (process.env.NODE_ENV === 'development' || process.env.TWILIO_USE_MOCK === 'true') {
    return true;
  }

  try {
    // Dynamically import twilio only on the server side
    const { default: twilio } = await import('twilio');
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error: any) {
    // @ts-ignore

    logger.error('[TWILIO_WEBHOOK] Failed to validate signature:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled('TWILIO_SMS')) {
      return NextResponse.json({ error: 'Twilio SMS feature is disabled' }, { status: 403 });
    }

    // Parse the form data from Twilio
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    logger.info('[TWILIO_WEBHOOK] Incoming SMS', {
      from,
      to,
      messageSid,
      bodyLength: body?.length,
    });

    // Validate webhook signature (if auth token is available)
    if (
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.NODE_ENV !== 'development' &&
      process.env.NODE_ENV !== 'test'
    ) {
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
        logger.warn('[TWILIO_WEBHOOK] Invalid signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Try to find patient by phone number and save to database
    try {
      // Normalize phone for lookup (remove +1 prefix for comparison)
      const normalizedPhone = from.replace(/^\+1/, '').replace(/\D/g, '');

      // Look up patient by phone number
      const patient = await prisma.patient.findFirst({
        where: {
          OR: [
            { phone: from },
            { phone: `+1${normalizedPhone}` },
            { phone: normalizedPhone },
            { phone: { contains: normalizedPhone } },
          ],
        },
        select: { id: true, clinicId: true },
      });

      // Save incoming message to database
      await prisma.smsLog.create({
        data: {
          patientId: patient?.id || null,
          clinicId: patient?.clinicId || null,
          messageSid,
          fromPhone: from,
          toPhone: to || process.env.TWILIO_PHONE_NUMBER || '',
          body: body || '',
          direction: 'inbound',
          status: 'received',
        },
      });

      logger.info('[TWILIO_WEBHOOK] Saved incoming SMS', {
        messageSid,
        patientId: patient?.id,
        from,
      });
    } catch (dbError: any) {
      // Log but don't fail the webhook
      logger.warn('[TWILIO_WEBHOOK] Failed to save incoming SMS to DB', {
        error: dbError.message,
      });
    }

    // Process the incoming SMS (send auto-reply)
    const responseMessage = await processIncomingSMS(from, body, messageSid);

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${responseMessage}</Message>
    </Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[TWILIO_WEBHOOK_ERROR]', error);

    // Return empty TwiML response on error
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}
