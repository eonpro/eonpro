import { NextRequest, NextResponse } from 'next/server';
import { processIncomingSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { isFeatureEnabled } from '@/lib/features';
import { basePrisma, prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

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
    let patientFound = false;
    try {
      const normalizedPhone = from.replace(/^\+1/, '').replace(/\D/g, '');
      const formattedPhone = formatPhoneNumber(from);

      const patient = await basePrisma.patient.findFirst({
        where: {
          OR: [
            { phone: from },
            { phone: formattedPhone },
            { phone: `+1${normalizedPhone}` },
            { phone: normalizedPhone },
            { phone: { contains: normalizedPhone } },
          ],
        },
        select: { id: true, clinicId: true, firstName: true, lastName: true },
      });

      // Save to SmsLog for audit trail
      await basePrisma.smsLog.create({
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

      // Create PatientChatMessage so the reply appears in the chat UI
      if (patient) {
        patientFound = true;
        try {
          const decryptedFirst = safeDecrypt(patient.firstName) || 'Patient';
          const decryptedLast = safeDecrypt(patient.lastName) || '';
          const senderName = `${decryptedFirst} ${decryptedLast}`.trim();

          await runWithClinicContext(patient.clinicId, async () => {
            const existingThread = await prisma.patientChatMessage.findFirst({
              where: { patientId: patient.id, channel: 'SMS' },
              orderBy: { createdAt: 'desc' },
              select: { threadId: true },
            });
            const threadId = existingThread?.threadId || `sms_${patient.id}_${Date.now()}`;

            await prisma.patientChatMessage.create({
              data: {
                patientId: patient.id,
                clinicId: patient.clinicId,
                message: (body || '').trim(),
                direction: 'INBOUND',
                channel: 'SMS',
                senderType: 'PATIENT',
                senderId: null,
                senderName: senderName,
                status: 'DELIVERED',
                externalId: messageSid,
                deliveredAt: new Date(),
                threadId,
              },
            });
          });

          logger.info('[TWILIO_WEBHOOK] Created chat message from incoming SMS', {
            messageSid,
            patientId: patient.id,
          });
        } catch (chatError: any) {
          logger.error('[TWILIO_WEBHOOK] Failed to create PatientChatMessage', {
            error: chatError.message,
            patientId: patient.id,
          });
        }
      }

      logger.info('[TWILIO_WEBHOOK] Saved incoming SMS', {
        messageSid,
        patientId: patient?.id,
        patientFound,
      });
    } catch (dbError: any) {
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
