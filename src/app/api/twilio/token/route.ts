/**
 * API Route for Twilio Access Token
 * POST: Generate access token for Twilio Conversations SDK
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import twilio from 'twilio';

/**
 * POST /api/twilio/token
 * Generate Twilio access token for real-time messaging
 * Uses optional auth - returns demo token if not authenticated
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId } = body;

    // Try to get authenticated user (optional)
    let userId = 'demo-user';
    try {
      const authHandler = withAuth(
        async (_, user) => {
          userId = `provider-${user.id}`;
          return NextResponse.json({ userId });
        },
        { optional: true }
      );
      await authHandler(req);
    } catch {
      // Auth failed, use demo mode
      logger.debug('Chat token: Using demo mode (auth failed)');
    }

    // If Twilio is fully configured, generate real token
    if (process.env.TWILIO_ACCOUNT_SID && 
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_API_KEY &&
        process.env.TWILIO_API_SECRET &&
        process.env.TWILIO_CHAT_SERVICE_SID) {
      
      try {
        const AccessToken = twilio.jwt.AccessToken;
        const ChatGrant = AccessToken.ChatGrant;

        const token = new AccessToken(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_API_KEY,
          process.env.TWILIO_API_SECRET,
          {
            identity: userId,
            ttl: 3600 // 1 hour
          }
        );

        const chatGrant = new ChatGrant({
          serviceSid: process.env.TWILIO_CHAT_SERVICE_SID
        });

        token.addGrant(chatGrant);

        return NextResponse.json({
          token: token.toJwt(),
          identity: userId,
          patientId: patientId
        });
      } catch (twilioError: any) {
        logger.error('Twilio error generating token', { value: twilioError });
      }
    }

    // Return demo token (Twilio not configured or auth failed)
    return NextResponse.json({
      token: 'demo-token-' + Date.now(),
      identity: userId,
      patientId: patientId,
      demo: true,
      notice: 'Using demo mode'
    });

  } catch (error: any) {
    logger.error('Failed to generate Twilio token', error);
    // Return demo token even on error
    return NextResponse.json({
      token: 'demo-token-' + Date.now(),
      identity: 'demo-user',
      demo: true,
      error: 'Fallback to demo mode'
    });
  }
}
