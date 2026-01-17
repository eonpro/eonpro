/**
 * AWS SES Quota API Endpoint
 * 
 * Returns current send quota and usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSendQuota, mockSESService } from '@/lib/integrations/aws/sesService';
import { isSESEnabled } from '@/lib/integrations/aws/sesConfig';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_SES_EMAIL')) {
      // Use mock service
      const mockQuota = await mockSESService.getSendQuota();
      return NextResponse.json({
        ...mockQuota,
        message: 'Using mock SES service (feature not enabled)',
      });
    }

    // Check if SES is configured
    if (!isSESEnabled()) {
      return NextResponse.json({
        max24HourSend: 0,
        maxSendRate: 0,
        sentLast24Hours: 0,
        message: 'SES is not configured',
      });
    }

    // Get real quota
    const quota = await getSendQuota();

    return NextResponse.json(quota);
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SES Quota] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to get quota' },
      { status: 500 }
    );
  }
}
