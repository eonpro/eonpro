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
      logger.info('[Messages] Raw phone from DB:', { rawPhone: patient.phone, patientId });
      
      try {
        const decrypted = decryptPatientPHI(patient, ['phone']);
        patientPhone = decrypted.phone || patient.phone;
        logger.info('[Messages] After decryption:', { decryptedPhone: patientPhone });
      } catch (e: any) {
        // Phone might not be encrypted, use as-is
        logger.info('[Messages] Phone not encrypted, using raw value', { error: e.message });
      }
      
      if (!patientPhone) {
        logger.warn('[Messages] No phone number found for patient', { patientId });
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

          logger.info('[Messages] Fetching Twilio messages', { 
            patientPhone: formattedPhone, 
            twilioPhone,
            originalPhone: patientPhone,
            twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
          });

          // Get OUTBOUND messages (sent TO patient FROM our Twilio number)
          let outboundMessages: any[] = [];
          let inboundMessages: any[] = [];
          
          try {
            outboundMessages = await client.messages.list({
              from: twilioPhone,
              to: formattedPhone,
              limit: 50
            });
            logger.info('[Messages] Outbound fetch success', { count: outboundMessages.length });
          } catch (outErr: any) {
            logger.error('[Messages] Outbound fetch failed', { error: outErr.message });
          }

          try {
            // Get INBOUND messages (sent FROM patient TO our Twilio number)
            inboundMessages = await client.messages.list({
              from: formattedPhone,
              to: twilioPhone,
              limit: 50
            });
            logger.info('[Messages] Inbound fetch success', { count: inboundMessages.length });
          } catch (inErr: any) {
            logger.error('[Messages] Inbound fetch failed', { error: inErr.message });
          }

          logger.info('[Messages] Twilio messages fetched', { 
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

          // Also get messages from local database
          const localMessages = await prisma.smsLog.findMany({
            where: { patientId },
            orderBy: { createdAt: 'asc' },
            take: 100,
          });

          // Merge Twilio messages with local ones (prefer Twilio for real-time status)
          const twilioSids = new Set(allMessages.map(m => m.sid));
          const localOnly = localMessages
            .filter(m => m.messageSid && !twilioSids.has(m.messageSid))
            .map(m => ({
              sid: m.messageSid || `local-${m.id}`,
              body: m.body,
              direction: m.direction === 'inbound' ? 'inbound' : 'outbound-api',
              status: m.status,
              dateCreated: m.createdAt,
              from: m.fromPhone,
              to: m.toPhone
            }));

          const combinedMessages = [...allMessages, ...localOnly]
            .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime());

          return NextResponse.json({
            messages: combinedMessages,
            source: 'twilio+local',
            debug: {
              patientPhone: formattedPhone,
              twilioPhone,
              twilioCount: allMessages.length,
              localCount: localMessages.length
            }
          });
        } catch (twilioError: any) {
          logger.error('Twilio error fetching messages', { 
            error: twilioError.message,
            code: twilioError.code,
            patientPhone 
          });
          
          // Fall back to local database only
          const localMessages = await prisma.smsLog.findMany({
            where: { patientId },
            orderBy: { createdAt: 'asc' },
            take: 100,
          });

          if (localMessages.length > 0) {
            return NextResponse.json({
              messages: localMessages.map(m => ({
                sid: m.messageSid || `local-${m.id}`,
                body: m.body,
                direction: m.direction === 'inbound' ? 'inbound' : 'outbound-api',
                status: m.status,
                dateCreated: m.createdAt,
                from: m.fromPhone,
                to: m.toPhone
              })),
              source: 'local',
              twilioError: twilioError.message
            });
          }
          
          // Return empty with error info
          return NextResponse.json({
            messages: [],
            error: twilioError.message,
            code: twilioError.code
          });
        }
      }

      // Twilio not configured - read from local database (smsLog)
      // This ensures sent messages persist even in demo mode
      const localMessages = await prisma.smsLog.findMany({
        where: { patientId },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      if (localMessages.length > 0) {
        return NextResponse.json({
          messages: localMessages.map(m => ({
            sid: m.messageSid || `local-${m.id}`,
            body: m.body,
            direction: m.direction === 'inbound' ? 'inbound' : 'outbound-api',
            status: m.status || 'delivered',
            dateCreated: m.createdAt,
            from: m.fromPhone,
            to: m.toPhone
          })),
          source: 'local',
          demo: true
        });
      }

      // Return empty if no messages in database (new patient)
      return NextResponse.json({
        messages: [],
        source: 'local',
        demo: true,
        message: 'No messages yet'
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
