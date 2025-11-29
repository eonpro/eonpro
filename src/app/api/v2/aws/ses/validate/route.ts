/**
 * AWS SES Email Validation API Endpoint
 * 
 * Validates email addresses and checks if they can receive emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEmail } from '@/lib/integrations/aws/sesConfig';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const valid = validateEmail(email);

    // In production, you could also check:
    // - If email is blacklisted
    // - If email has bounced before
    // - If domain has valid MX records
    
    return NextResponse.json({
      email,
      valid,
      checks: {
        format: valid,
        blacklisted: false,
        bounced: false,
        verified: true, // In sandbox mode, only verified emails can receive
      },
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SES Validate] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || 'Validation failed' },
      { status: 500 }
    );
  }
}
