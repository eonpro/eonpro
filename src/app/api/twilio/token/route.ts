/**
 * API Route for Twilio Access Token
 * POST: Generate access token for Twilio Conversations SDK
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import twilio from 'twilio';

/**
 * POST /api/twilio/token
 * Generate Twilio access token for real-time messaging
 */
export const POST = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const { patientId } = body;

      // If Twilio is configured, generate real token
      if (process.env.TWILIO_ACCOUNT_SID && 
          process.env.TWILIO_AUTH_TOKEN &&
          process.env.TWILIO_API_KEY &&
          process.env.TWILIO_API_SECRET) {
        
        try {
          const AccessToken = twilio.jwt.AccessToken;
          const ChatGrant = AccessToken.ChatGrant;

          // Create access token with identity
          const identity = `provider-${user.id}`;
          
          const token = new AccessToken(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_API_KEY,
            process.env.TWILIO_API_SECRET,
            {
              identity: identity,
              ttl: 3600 // 1 hour
            }
          );

          // Create a Chat grant
          const chatGrant = new ChatGrant({
            serviceSid: process.env.TWILIO_CHAT_SERVICE_SID
          });

          // Add grant to token
          token.addGrant(chatGrant);

          return NextResponse.json({
            token: token.toJwt(),
            identity: identity,
            patientId: patientId
          });
        } catch (twilioError: any) {
          logger.error('Twilio error generating token', { value: twilioError });
        }
      }

      // Return demo token if Twilio not configured
      return NextResponse.json({
        token: 'demo-token-' + Date.now(),
        identity: `provider-${user.id}`,
        patientId: patientId,
        demo: true,
        notice: 'Twilio not configured - using demo mode'
      });

    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Failed to generate Twilio token', error);
      return NextResponse.json(
        { error: 'Failed to generate access token' },
        { status: 500 }
      );
    }
  }
);
