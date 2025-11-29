/**
 * AWS SES Configuration API Endpoint
 * 
 * Returns current SES configuration status
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSESConfigured, isSESEnabled, sesConfig } from '@/lib/integrations/aws/sesConfig';
import { isFeatureEnabled } from '@/lib/features';

export async function GET(request: NextRequest) {
  const featureEnabled = isFeatureEnabled('AWS_SES_EMAIL');
  const configured = isSESConfigured();
  const enabled = isSESEnabled();

  return NextResponse.json({
    featureEnabled,
    configured,
    enabled,
    config: {
      region: sesConfig.region,
      fromEmail: sesConfig.fromEmail,
      fromName: sesConfig.fromName,
      replyToEmail: sesConfig.replyToEmail,
      hasAccessKey: !!sesConfig.accessKeyId,
      hasSecretKey: !!sesConfig.secretAccessKey,
      maxSendRate: sesConfig.maxSendRate,
    },
    message: enabled 
      ? 'SES is fully configured and enabled'
      : !featureEnabled 
        ? 'Feature flag AWS_SES_EMAIL is not enabled'
        : 'SES credentials are not fully configured',
  });
}
