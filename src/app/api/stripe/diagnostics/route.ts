/**
 * Stripe Diagnostics API
 * 
 * Provides detailed information about Stripe configuration status
 * for troubleshooting and monitoring purposes.
 * 
 * GET /api/stripe/diagnostics - Get full diagnostics
 * POST /api/stripe/diagnostics - Validate configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripeDiagnostics, validateStripeConfig, isStripeConfigured } from '@/lib/stripe/config';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Check for admin authorization in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      const authHeader = request.headers.get('authorization');
      const adminSecret = process.env.ADMIN_API_SECRET || process.env.CRON_SECRET;
      
      if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
        return NextResponse.json(
          { 
            error: 'Unauthorized',
            message: 'Admin authorization required for diagnostics in production',
          },
          { status: 401 }
        );
      }
    }
    
    const diagnostics = await getStripeDiagnostics();
    
    // Log the diagnostics request
    logger.info('[STRIPE DIAGNOSTICS] Retrieved', {
      isConfigured: diagnostics.config.isConfigured,
      canConnect: diagnostics.connectivity.canConnect,
      environment: diagnostics.environment.nodeEnv,
    });
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      diagnostics,
    });
    
  } catch (error: any) {
    logger.error('[STRIPE DIAGNOSTICS] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Force refresh configuration
    const config = await validateStripeConfig(true);
    
    logger.info('[STRIPE DIAGNOSTICS] Validation requested', {
      isConfigured: config.isConfigured,
      hasError: !!config.error,
    });
    
    return NextResponse.json({
      success: true,
      isConfigured: config.isConfigured,
      isTestMode: config.isTestMode,
      accountId: config.accountId,
      accountName: config.accountName,
      error: config.error,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('[STRIPE DIAGNOSTICS] Validation error:', error);
    
    return NextResponse.json({
      success: false,
      isConfigured: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
