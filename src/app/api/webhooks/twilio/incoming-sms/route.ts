/**
 * Twilio Incoming SMS Webhook
 * Receives SMS messages from patients and creates chat messages
 */

import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { validatePhoneNumber, formatPhoneNumber } from "@/lib/integrations/twilio/smsService";
import crypto from 'crypto';
import { decryptPHI } from '@/lib/security/phi-encryption';

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// Verify Twilio signature for security
function verifyTwilioSignature(req: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn('TWILIO_AUTH_TOKEN not set, skipping signature verification');
    return process.env.NODE_ENV === 'development';
  }

  const twilioSignature = req.headers.get('x-twilio-signature');
  if (!twilioSignature) {
    return false;
  }

  // Build the URL that Twilio used
  const url = req.url;
  
  // Create HMAC using auth token
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(url + body);
  const expectedSignature = hmac.digest('base64');

  return twilioSignature === expectedSignature;
}

// Parse form-urlencoded body
function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    
    // In production, verify Twilio signature
    if (process.env.NODE_ENV === 'production') {
      const isValid = verifyTwilioSignature(request, bodyText);
      if (!isValid) {
        logger.warn('Invalid Twilio signature on incoming SMS');
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const body = parseFormBody(bodyText);
    
    const {
      From: fromPhone,
      To: toPhone,
      Body: messageBody,
      MessageSid: messageSid,
      AccountSid: accountSid,
    } = body;

    if (!fromPhone || !messageBody) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    // Log without PHI - mask phone number for HIPAA compliance
    const maskedPhone = fromPhone.replace(/\d(?=\d{4})/g, '*');
    logger.info('Incoming SMS received', { 
      from: maskedPhone, 
      messageSid,
      bodyLength: messageBody.length 
    });

    // Format phone number for lookup
    const formattedPhone = formatPhoneNumber(fromPhone);
    
    // Find patient by phone number
    // We need to search across all clinics since we don't know which clinic yet
    const patient = await basePrisma.patient.findFirst({
      where: {
        OR: [
          { phone: fromPhone },
          { phone: formattedPhone },
          { phone: fromPhone.replace(/^\+1/, '') }, // Try without country code
        ]
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        clinicId: true,
        phone: true,
      }
    });

    if (!patient) {
      logger.warn('Received SMS from unknown phone number', { from: maskedPhone });
      
      // Return TwiML response acknowledging receipt but no action
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>Thank you for your message. We couldn't find your account. Please contact support.</Message>
        </Response>`,
        { 
          status: 200,
          headers: { 'Content-Type': 'text/xml' }
        }
      );
    }

    // Find or create a thread for this patient's SMS conversations
    const existingThread = await basePrisma.patientChatMessage.findFirst({
      where: {
        patientId: patient.id,
        channel: 'SMS',
      },
      orderBy: { createdAt: 'desc' },
      select: { threadId: true }
    });

    const threadId = existingThread?.threadId || `sms_${patient.id}_${Date.now()}`;

    // Decrypt patient PHI for sender name
    const decryptedFirstName = safeDecrypt(patient.firstName) || 'Patient';
    const decryptedLastName = safeDecrypt(patient.lastName) || '';
    const patientDisplayName = `${decryptedFirstName} ${decryptedLastName}`.trim();

    // Create the inbound message
    const chatMessage = await basePrisma.patientChatMessage.create({
      data: {
        patientId: patient.id,
        clinicId: patient.clinicId,
        message: messageBody.trim(),
        direction: 'INBOUND',
        channel: 'SMS',
        senderType: 'PATIENT',
        senderId: null,
        senderName: patientDisplayName,
        status: 'DELIVERED',
        externalId: messageSid,
        deliveredAt: new Date(),
        threadId,
      }
    });

    logger.info('Created chat message from incoming SMS', {
      messageId: chatMessage.id,
      patientId: patient.id,
      messageSid,
    });

    // TODO: Trigger real-time notification to staff (WebSocket/SSE)
    // This could be done via a separate notification service

    // Return TwiML response
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>Thank you for your message. Our team will respond shortly.</Message>
      </Response>`,
      { 
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
      }
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing incoming SMS', { error: errorMsg });
    
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>We encountered an error processing your message. Please try again later.</Message>
      </Response>`,
      { 
        status: 200, // Return 200 to prevent Twilio retries
        headers: { 'Content-Type': 'text/xml' }
      }
    );
  }
}
