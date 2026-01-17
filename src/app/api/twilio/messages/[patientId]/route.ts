/**
 * API Route for Twilio Message History
 * GET: Retrieve message history for a patient
 * Works in demo mode without authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';
import twilio from 'twilio';

interface RouteParams {
  params: Promise<{
    patientId: string;
  }>;
}

/**
 * GET /api/twilio/messages/[patientId]
 * Get message history for a patient
 */
export async function GET(req: NextRequest, context: RouteParams) {
  try {
    const resolvedParams = await context.params;
    const patientId = parseInt(resolvedParams.patientId);

      if (isNaN(patientId)) {
        return NextResponse.json(
          { error: 'Invalid patient ID' },
          { status: 400 }
        );
      }

      // Get patient to verify phone number
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          phone: true,
        }
      });

      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found' },
          { status: 404 }
        );
      }

      // Decrypt phone if it's encrypted (PHI protection)
      let patientPhone = patient.phone;
      try {
        const decrypted = decryptPatientPHI(patient, ['phone']);
        patientPhone = decrypted.phone || patient.phone;
      } catch (e) {
        // Phone might not be encrypted, use as-is
        logger.debug('Phone not encrypted, using raw value');
      }
      
      if (!patientPhone) {
        return NextResponse.json({
          messages: [],
          message: 'Patient has no phone number'
        });
      }

      // If Twilio is configured, get real messages
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );

          // Format phone number for Twilio (ensure it has country code)
          // Remove any existing formatting and ensure +1 prefix
          const digitsOnly = patientPhone.replace(/\D/g, '');
          const formattedPhone = digitsOnly.startsWith('1') && digitsOnly.length === 11
            ? `+${digitsOnly}`
            : `+1${digitsOnly}`;
          
          const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

          logger.info('Fetching Twilio messages', { 
            patientPhone: formattedPhone, 
            twilioPhone,
            originalPhone: patientPhone
          });

          // Get OUTBOUND messages (sent TO patient FROM our Twilio number)
          const outboundMessages = await client.messages.list({
            from: twilioPhone,
            to: formattedPhone,
            limit: 50
          });

          // Get INBOUND messages (sent FROM patient TO our Twilio number)
          const inboundMessages = await client.messages.list({
            from: formattedPhone,
            to: twilioPhone,
            limit: 50
          });

          logger.info('Twilio messages fetched', { 
            outbound: outboundMessages.length, 
            inbound: inboundMessages.length,
            patientPhone: formattedPhone 
          });

          // Combine and sort all messages by date
          const allMessages = [...outboundMessages, ...inboundMessages]
            .sort((a, b) => a.dateCreated.getTime() - b.dateCreated.getTime())
            .map((msg: any) => ({
              sid: msg.sid,
              body: msg.body,
              direction: msg.direction, // 'inbound' or 'outbound-api'
              status: msg.status,
              dateCreated: msg.dateCreated,
              from: msg.from,
              to: msg.to
            }));

          return NextResponse.json({
            messages: allMessages,
            debug: {
              patientPhone: formattedPhone,
              twilioPhone,
              outboundCount: outboundMessages.length,
              inboundCount: inboundMessages.length
            }
          });
        } catch (twilioError: any) {
          logger.error('Twilio error fetching messages', { 
            error: twilioError.message,
            code: twilioError.code,
            patientPhone 
          });
          // Return empty with error info
          return NextResponse.json({
            messages: [],
            error: twilioError.message,
            code: twilioError.code
          });
        }
      }

      // Return demo messages if Twilio not configured
      const demoMessages = [
        {
          id: 'demo-1',
          body: 'Hi, I received the intake form link. Thank you!',
          direction: 'inbound',
          status: 'delivered',
          dateCreated: new Date(Date.now() - 3600000), // 1 hour ago
          from: patientPhone,
          to: 'clinic'
        },
        {
          id: 'demo-2',
          body: 'You\'re welcome! Please complete it at your earliest convenience.',
          direction: 'outbound',
          status: 'delivered',
          dateCreated: new Date(Date.now() - 3000000), // 50 minutes ago
          from: 'clinic',
          to: patientPhone
        },
        {
          id: 'demo-3',
          body: 'Just completed the form. When is my appointment?',
          direction: 'inbound',
          status: 'delivered',
          dateCreated: new Date(Date.now() - 1800000), // 30 minutes ago
          from: patientPhone,
          to: 'clinic'
        }
      ];

      return NextResponse.json({
        messages: demoMessages,
        demo: true
      });

  } catch (error: any) {
    logger.error('Failed to get message history', error);
    // Return empty messages on error (demo mode)
    return NextResponse.json({
      messages: [],
      demo: true,
      error: 'Using demo mode'
    });
  }
}
