/**
 * API Route for Sending Twilio Messages
 * POST: Send a message to a patient
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import twilio from 'twilio';
import { z } from 'zod';

const sendMessageSchema = z.object({
  to: z.string(),
  message: z.string(),
  patientId: z.number(),
});

/**
 * POST /api/twilio/send
 * Send a message to a patient
 * Allowed roles: super_admin, admin, provider, staff
 */
async function handleSend(req: NextRequest, user: AuthUser) {
    try {
      const body = await req.json();
      const parsed = sendMessageSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const { to, message, patientId } = parsed.data;

      // If Twilio is configured, send real message
      if (process.env.TWILIO_ACCOUNT_SID && 
          process.env.TWILIO_AUTH_TOKEN && 
          process.env.TWILIO_PHONE_NUMBER) {
        try {
          const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );

          // Format phone number for Twilio (ensure it has country code)
          const formattedPhone = to.startsWith('+') 
            ? to 
            : `+1${to.replace(/\D/g, '')}`;

          const twilioMessage = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone
          });

          logger.info('Twilio message sent', { 
            messageSid: twilioMessage.sid, 
            patientId,
            to: formattedPhone 
          });

          return NextResponse.json({
            success: true,
            messageSid: twilioMessage.sid,
            status: twilioMessage.status,
            dateCreated: twilioMessage.dateCreated
          });
        } catch (twilioError: any) {
          logger.error('Twilio error sending message', { value: twilioError });
          
          // Return specific Twilio error
          return NextResponse.json(
            { 
              error: 'Failed to send message via Twilio',
              details: twilioError.message 
            },
            { status: 500 }
          );
        }
      }

      // If Twilio not configured, return demo response
      const demoMessageId = `demo-${Date.now()}`;
      
      logger.info('Demo message (Twilio not configured)', { 
        messageSid: demoMessageId, 
        patientId,
        to,
        message 
      });

      return NextResponse.json({
        success: true,
        messageSid: demoMessageId,
        status: 'sent',
        dateCreated: new Date(),
        demo: true,
        notice: 'Twilio not configured - this is a demo message'
      });

    } catch (error: any) {
      logger.error('Failed to send message', { error: error.message });
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      );
    }
}

// Allow admins, providers, and staff to send messages
export const POST = withAuth(handleSend, { 
  roles: ['super_admin', 'admin', 'provider', 'staff'] 
});
