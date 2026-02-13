/**
 * API endpoint for generating Twilio Chat access tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/features';
import { generateChatToken } from '@/lib/integrations/twilio/chatTokenService';
import { isTwilioChatConfigured } from '@/lib/integrations/twilio/chatConfig';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled('TWILIO_CHAT')) {
      return NextResponse.json({ error: 'Twilio Chat feature is not enabled' }, { status: 403 });
    }

    // Parse request body
    const { identity, userType } = await req.json();

    if (!identity) {
      return NextResponse.json({ error: 'Identity is required' }, { status: 400 });
    }

    // Check if mock mode
    const useMock = !isTwilioChatConfigured() || process.env.TWILIO_USE_MOCK === 'true';

    if (useMock) {
      // Return mock token for development
      const mockToken = Buffer.from(
        JSON.stringify({
          identity,
          userType,
          mock: true,
          exp: Date.now() + 3600000, // 1 hour
        })
      ).toString('base64');

      logger.debug('[CHAT_TOKEN] Generated mock token for:', { value: identity });

      return NextResponse.json({
        success: true,
        token: `mock.${mockToken}`,
        identity,
        mock: true,
      });
    }

    // Generate real Twilio token
    try {
      const token = await generateChatToken(identity, userType);

      return NextResponse.json({
        success: true,
        token,
        identity,
        mock: false,
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('[CHAT_TOKEN] Failed to generate token:', error);

      // Fallback to mock token if generation fails
      const mockToken = Buffer.from(
        JSON.stringify({
          identity,
          userType,
          mock: true,
          exp: Date.now() + 3600000,
        })
      ).toString('base64');

      return NextResponse.json({
        success: true,
        token: `mock.${mockToken}`,
        identity,
        mock: true,
        fallback: true,
      });
    }
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CHAT_TOKEN] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate chat token', details: errorMessage },
      { status: 500 }
    );
  }
}
