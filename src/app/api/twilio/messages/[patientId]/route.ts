/**
 * API Route for Twilio Message History
 * GET: Retrieve message history for a patient
 * Works in demo mode without authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import twilio from 'twilio';

// Note: PHI decryption removed - phone numbers are stored unencrypted for Twilio integration

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
  let patientId: number;

  try {
    const resolvedParams = await context.params;
    patientId = parseInt(resolvedParams.patientId);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID', messages: [] }, { status: 400 });
    }
  } catch (paramError: any) {
    logger.error('[Messages] Failed to parse params', { error: paramError.message });
    return NextResponse.json(
      { error: 'Invalid request parameters', messages: [] },
      { status: 400 }
    );
  }

  try {
    // Get patient to verify phone number
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        phone: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found', messages: [] }, { status: 404 });
    }

    // Use phone directly - no encryption for this field
    const patientPhone = patient.phone;
    logger.info('[Messages] Phone from DB:', { phone: patientPhone, patientId });

    if (!patientPhone) {
      logger.warn('[Messages] No phone number found for patient', { patientId });
      return NextResponse.json({
        messages: [],
        message: 'Patient has no phone number',
      });
    }

    // If Twilio is configured, get real messages
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        // Format phone number for Twilio (ensure it has country code)
        // Remove any existing formatting and ensure +1 prefix
        const digitsOnly = patientPhone.replace(/\D/g, '');
        const formattedPhone =
          digitsOnly.startsWith('1') && digitsOnly.length === 11
            ? `+${digitsOnly}`
            : `+1${digitsOnly}`;

        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

        logger.info('[Messages] Fetching Twilio messages', {
          patientPhone: formattedPhone,
          twilioPhone,
          originalPhone: patientPhone,
          twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        });

        // Get OUTBOUND messages (sent TO patient FROM our Twilio number)
        let outboundMessages: any[] = [];
        let inboundMessages: any[] = [];

        try {
          outboundMessages = await client.messages.list({
            from: twilioPhone,
            to: formattedPhone,
            limit: 50,
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
            limit: 50,
          });
          logger.info('[Messages] Inbound fetch success', { count: inboundMessages.length });
        } catch (inErr: any) {
          logger.error('[Messages] Inbound fetch failed', { error: inErr.message });
        }

        logger.info('[Messages] Twilio messages fetched', {
          outbound: outboundMessages.length,
          inbound: inboundMessages.length,
          patientPhone: formattedPhone,
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
            to: msg.to,
          }));

        // Also get messages from local database
        const localMessages = await prisma.smsLog.findMany({
          where: { patientId },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });

        // Merge Twilio messages with local ones (prefer Twilio for real-time status)
        const twilioSids = new Set(allMessages.map((m: { sid: string }) => m.sid));
        const localOnly = localMessages
          .filter(
            (m: { messageSid: string | null }) => m.messageSid && !twilioSids.has(m.messageSid)
          )
          .map(
            (m: {
              messageSid: string | null;
              id: number;
              body: string;
              direction: string;
              status: string;
              createdAt: Date;
              fromPhone: string;
              toPhone: string;
            }) => ({
              sid: m.messageSid || `local-${m.id}`,
              body: m.body,
              direction: m.direction === 'inbound' ? 'inbound' : 'outbound-api',
              status: m.status,
              dateCreated: m.createdAt,
              from: m.fromPhone,
              to: m.toPhone,
            })
          );

        const combinedMessages = [...allMessages, ...localOnly].sort(
          (a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()
        );

        return NextResponse.json({
          messages: combinedMessages,
          source: 'twilio+local',
          debug: {
            patientPhone: formattedPhone,
            twilioPhone,
            twilioCount: allMessages.length,
            localCount: localMessages.length,
          },
        });
      } catch (twilioError: any) {
        logger.error('Twilio error fetching messages', {
          error: twilioError.message,
          code: twilioError.code,
          patientPhone,
        });

        // Fall back to local database only
        const localMessages = await prisma.smsLog.findMany({
          where: { patientId },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });

        if (localMessages.length > 0) {
          return NextResponse.json({
            messages: localMessages.map(
              (m: {
                messageSid: string | null;
                id: number;
                body: string;
                direction: string;
                status: string;
                createdAt: Date;
                fromPhone: string;
                toPhone: string;
              }) => ({
                sid: m.messageSid || `local-${m.id}`,
                body: m.body,
                direction: m.direction === 'inbound' ? 'inbound' : 'outbound-api',
                status: m.status,
                dateCreated: m.createdAt,
                from: m.fromPhone,
                to: m.toPhone,
              })
            ),
            source: 'local',
            twilioError: twilioError.message,
          });
        }

        // Return empty with error info
        return NextResponse.json({
          messages: [],
          error: twilioError.message,
          code: twilioError.code,
        });
      }
    }

    // Twilio not configured - read from local database (smsLog)
    logger.info('[Messages] Twilio not configured, trying local database', { patientId });

    try {
      const localMessages = await prisma.smsLog.findMany({
        where: { patientId },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      logger.info('[Messages] Local messages found:', { count: localMessages.length });

      if (localMessages.length > 0) {
        return NextResponse.json({
          messages: localMessages.map(
            (m: {
              messageSid: string | null;
              id: number;
              body: string;
              direction: string;
              status: string | null;
              createdAt: Date;
              fromPhone: string;
              toPhone: string;
            }) => ({
              sid: m.messageSid || `local-${m.id}`,
              body: m.body,
              direction: m.direction === 'inbound' ? 'inbound' : 'outbound-api',
              status: m.status || 'delivered',
              dateCreated: m.createdAt,
              from: m.fromPhone,
              to: m.toPhone,
            })
          ),
          source: 'local-db',
          twilioConfigured: false,
        });
      }
    } catch (dbError: any) {
      logger.error('[Messages] Database query failed', { error: dbError.message });
      // Continue to return empty
    }

    // Return empty if no messages in database (new patient)
    return NextResponse.json({
      messages: [],
      source: 'none',
      twilioConfigured: false,
      message: 'No messages yet - send your first message!',
    });
  } catch (error: any) {
    logger.error('[Messages] Fatal error getting message history', {
      error: error.message,
    });

    // Return empty messages with actual error info
    return NextResponse.json({
      messages: [],
      error: error.message || 'Unknown error occurred',
      errorType: error.name,
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
