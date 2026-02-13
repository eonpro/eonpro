/**
 * iCal Subscription Feed Endpoint
 *
 * Serves iCal (ICS) feeds for calendar subscriptions.
 * Supports Apple Calendar, Google Calendar, and other iCal-compatible apps.
 *
 * Usage:
 * 1. Create a subscription via /api/calendar/subscriptions
 * 2. Subscribe to the feed URL in your calendar app
 * 3. Your calendar will auto-refresh based on the feed settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateProviderICalFeed, getSubscriptionByToken } from '@/lib/calendar-sync/ical.service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/calendar/ical/[token]
 * Serve iCal feed for a subscription token
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return new NextResponse('Invalid token', { status: 400 });
    }

    // Check if subscription exists and is active
    const subscription = await getSubscriptionByToken(token);
    if (!subscription) {
      return new NextResponse('Subscription not found', { status: 404 });
    }

    if (!subscription.isActive) {
      return new NextResponse('Subscription is inactive', { status: 403 });
    }

    // Generate the feed
    const result = await generateProviderICalFeed(token);

    if (!result) {
      return new NextResponse('Failed to generate feed', { status: 500 });
    }

    // Return iCal response with proper headers
    return new NextResponse(result.feed, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="appointments.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        // Allow calendar apps to fetch
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    });
  } catch (error) {
    logger.error('iCal feed error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return new NextResponse('Internal server error', { status: 500 });
  }
}

/**
 * HEAD /api/calendar/ical/[token]
 * Support HEAD requests (some calendar apps check this first)
 */
export async function HEAD(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const subscription = await getSubscriptionByToken(token);
    if (!subscription || !subscription.isActive) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
