/**
 * Stripe Diagnostics API
 * 
 * Provides detailed information about Stripe configuration status
 * for troubleshooting and monitoring purposes.
 * 
 * GET /api/stripe/diagnostics - Get full diagnostics (basic info public, details require auth)
 * POST /api/stripe/diagnostics - Validate configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripeDiagnostics, validateStripeConfig, isStripeConfigured } from '@/lib/stripe/config';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const authHeader = request.headers.get('authorization');
    const adminSecret = process.env.ADMIN_API_SECRET || process.env.CRON_SECRET;
    const isAuthorized = !isProduction || (adminSecret && authHeader === `Bearer ${adminSecret}`);
    
    // Always allow basic status check
    const basicStatus = {
      timestamp: new Date().toISOString(),
      isConfigured: isStripeConfigured(),
      environment: process.env.NODE_ENV || 'unknown',
      vercelEnv: process.env.VERCEL_ENV || 'not-vercel',
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      featureEnabled: process.env.NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS === 'true',
    };
    
    // Log the diagnostics request
    logger.info('[STRIPE DIAGNOSTICS] Status check', basicStatus);
    
    // If not authorized, return only basic status
    if (!isAuthorized) {
      return NextResponse.json({
        success: true,
        ...basicStatus,
        message: basicStatus.isConfigured 
          ? 'Stripe is configured' 
          : 'Stripe is NOT configured - check STRIPE_SECRET_KEY env var',
        hint: basicStatus.hasSecretKey 
          ? (basicStatus.featureEnabled ? 'All good!' : 'Enable NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS=true')
          : 'Set STRIPE_SECRET_KEY in Vercel Environment Variables',
      });
    }
    
    // Full diagnostics for authorized requests
    const diagnostics = await getStripeDiagnostics();
    
    return NextResponse.json({
      success: true,
      ...basicStatus,
      diagnostics,
    });
    
  } catch (error: any) {
    logger.error('[STRIPE DIAGNOSTICS] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
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
