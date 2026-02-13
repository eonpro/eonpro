/**
 * SMS Configuration Check (Development Only)
 *
 * GET /api/auth/check-sms-config
 * Returns the status of Twilio/SMS configuration
 */

import { NextResponse } from 'next/server';
import { isTwilioConfigured } from '@/lib/integrations/twilio/config';
import { isFeatureEnabled } from '@/lib/features';

export async function GET(): Promise<Response> {
  const config = {
    twilioConfigured: isTwilioConfigured(),
    twilioFeatureEnabled: isFeatureEnabled('TWILIO_SMS'),
    hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
    hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
    hasPhoneNumber: !!process.env.TWILIO_PHONE_NUMBER,
    phoneNumberPrefix: process.env.TWILIO_PHONE_NUMBER?.substring(0, 5) || 'not set',
    useMock: !isTwilioConfigured() || process.env.TWILIO_USE_MOCK === 'true',
    featureFlagValue: process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS,
    nodeEnv: process.env.NODE_ENV,
  };

  return NextResponse.json({
    status: 'ok',
    config,
    recommendation: !config.twilioConfigured
      ? 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in Vercel environment variables'
      : !config.twilioFeatureEnabled
        ? 'Set NEXT_PUBLIC_ENABLE_TWILIO_SMS=true in Vercel environment variables'
        : 'Twilio is fully configured!',
  });
}
