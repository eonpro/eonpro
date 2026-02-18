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

    // Resolve patient from incoming phone number
    let resolvedPatientId: number | null = null;
    let resolvedClinicId: number | null = null;
    try {
      const normalizedPhone = from.replace(/^\+1/, '').replace(/\D/g, '');
      const formattedPhone = formatPhoneNumber(from);

      // Strategy 1: Look up via SmsLog — outbound messages store raw (unencrypted) phone
      // numbers alongside patientId, so this works even when Patient.phone is encrypted.
      const previousOutbound = await basePrisma.smsLog.findFirst({
        where: {
          direction: 'outbound',
          patientId: { not: null },
          OR: [
            { toPhone: from },
            { toPhone: formattedPhone },
            { toPhone: `+1${normalizedPhone}` },
            { toPhone: normalizedPhone },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { patientId: true, clinicId: true },
      });

      if (previousOutbound?.patientId) {
        resolvedPatientId = previousOutbound.patientId;
        resolvedClinicId = previousOutbound.clinicId;
        logger.info('[TWILIO_WEBHOOK] Resolved patient via SmsLog', {
          patientId: resolvedPatientId,
          from: formattedPhone,
        });
      }

      // Strategy 2: Look up via PatientChatMessage outbound SMS records
      if (!resolvedPatientId) {
        const previousChat = await basePrisma.patientChatMessage.findFirst({
          where: {
            direction: 'OUTBOUND',
            channel: 'SMS',
            patient: {
              OR: [
                { phone: from },
                { phone: formattedPhone },
                { phone: `+1${normalizedPhone}` },
                { phone: normalizedPhone },
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          select: { patientId: true, clinicId: true },
        });

        if (previousChat?.patientId) {
          resolvedPatientId = previousChat.patientId;
          resolvedClinicId = previousChat.clinicId;
        }
      }

      // Strategy 3: Direct Patient phone lookup (works if phone is not encrypted)
      if (!resolvedPatientId) {
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
          select: { id: true, clinicId: true },
        });

        if (patient) {
          resolvedPatientId = patient.id;
          resolvedClinicId = patient.clinicId;
        }
      }

      // Save to SmsLog for audit trail
      await basePrisma.smsLog.create({
        data: {
          patientId: resolvedPatientId,
          clinicId: resolvedClinicId,
          messageSid,
          fromPhone: from,
          toPhone: to || process.env.TWILIO_PHONE_NUMBER || '',
          body: body || '',
          direction: 'inbound',
          status: 'received',
        },
      });

      // Create PatientChatMessage so the reply appears in the chat UI
      if (resolvedPatientId) {
        try {
          const patientRecord = await basePrisma.patient.findUnique({
            where: { id: resolvedPatientId },
            select: { id: true, clinicId: true, firstName: true, lastName: true },
          });

          const clinicId = patientRecord?.clinicId || resolvedClinicId;
          const decryptedFirst = safeDecrypt(patientRecord?.firstName) || 'Patient';
          const decryptedLast = safeDecrypt(patientRecord?.lastName) || '';
          const senderName = `${decryptedFirst} ${decryptedLast}`.trim();

          await runWithClinicContext(clinicId, async () => {
            const existingThread = await prisma.patientChatMessage.findFirst({
              where: { patientId: resolvedPatientId!, channel: 'SMS' },
              orderBy: { createdAt: 'desc' },
              select: { threadId: true },
            });
            const threadId = existingThread?.threadId || `sms_${resolvedPatientId}_${Date.now()}`;

            await prisma.patientChatMessage.create({
              data: {
                patientId: resolvedPatientId!,
                clinicId: clinicId,
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
            patientId: resolvedPatientId,
          });
        } catch (chatError: any) {
          logger.error('[TWILIO_WEBHOOK] Failed to create PatientChatMessage', {
            error: chatError.message,
            patientId: resolvedPatientId,
          });
        }
      } else {
        logger.warn('[TWILIO_WEBHOOK] Could not resolve patient for inbound SMS', {
          messageSid,
          from: formattedPhone,
        });
      }

      logger.info('[TWILIO_WEBHOOK] Saved incoming SMS', {
        messageSid,
        patientId: resolvedPatientId,
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
