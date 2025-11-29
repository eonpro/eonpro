/**
 * Server-side only Twilio Chat Token Service
 * 
 * This file handles token generation and should only be imported in server components/API routes
 */

import { isChatEnabled, ChatUserType } from './chatConfig';

// Generate access token for Twilio Conversations
// This function should only be called from server-side code (API routes)
export function generateChatToken(
  identity: string,
  userType: ChatUserType = ChatUserType.PATIENT
): string {
  if (!isChatEnabled()) {
    throw new Error('Twilio Chat is not enabled or configured');
  }

  // Check if mock mode
  const isMockMode = !process.env.TWILIO_API_KEY || 
                    !process.env.TWILIO_API_SECRET || 
                    process.env.TWILIO_USE_MOCK === 'true';

  if (isMockMode) {
    // Return mock token
    const mockToken = Buffer.from(JSON.stringify({
      identity,
      userType,
      mock: true,
      exp: Date.now() + 3600000, // 1 hour
    })).toString('base64');

    return `mock.${mockToken}`;
  }

  // Only import Twilio on the server side
  const AccessToken = require('twilio').jwt.AccessToken;
  const ChatGrant = AccessToken.ChatGrant;

  // Create access token
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_KEY!,
    process.env.TWILIO_API_SECRET!,
    {
      identity: identity,
      ttl: 3600, // 1 hour
    }
  );

  // Create chat grant
  const chatGrant = new ChatGrant({
    serviceSid: process.env.TWILIO_CHAT_SERVICE_SID!,
  });

  // Add grant to token
  token.addGrant(chatGrant);

  return token.toJwt();
}
