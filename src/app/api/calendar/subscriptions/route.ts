/**
 * Calendar Subscriptions API
 *
 * Manage iCal subscription feeds for providers.
 * These subscriptions allow syncing appointments to Apple Calendar,
 * Google Calendar (via URL), and other iCal-compatible apps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  createCalendarSubscription,
  deleteCalendarSubscription,
  generateSubscriptionToken,
} from '@/lib/calendar-sync/ical.service';

const createSubscriptionSchema = z.object({
  name: z.string().max(100).optional(),
  includePatientNames: z.boolean().optional().default(false),
  includeMeetingLinks: z.boolean().optional().default(true),
  syncRangeDays: z.number().min(7).max(365).optional().default(90),
});

const updateSubscriptionSchema = z.object({
  subscriptionId: z.number(),
  name: z.string().max(100).optional(),
  includePatientNames: z.boolean().optional(),
  includeMeetingLinks: z.boolean().optional(),
  syncRangeDays: z.number().min(7).max(365).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/calendar/subscriptions
 * List all calendar subscriptions for the authenticated provider
 */
export const GET = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Get provider ID from user
    const provider = await prisma.provider.findFirst({
      where: {
        OR: [{ email: user.email }, { user: { id: user.id } }],
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const subscriptions = await prisma.calendarSubscription.findMany({
      where: {
        providerId: provider.id,
        ...(user.clinicId && { clinicId: user.clinicId }),
      },
      take: 100,
      select: {
        id: true,
        name: true,
        token: true,
        isActive: true,
        includePatientNames: true,
        includeMeetingLinks: true,
        syncRangeDays: true,
        lastAccessedAt: true,
        accessCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Generate subscription URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const subscriptionsWithUrls = subscriptions.map((sub: any) => ({
      ...sub,
      feedUrl: `${baseUrl}/api/calendar/ical/${sub.token}`,
      webcalUrl: `webcal://${new URL(baseUrl).host}/api/calendar/ical/${sub.token}`,
    }));

    return NextResponse.json({
      subscriptions: subscriptionsWithUrls,
      instructions: {
        apple: 'Use the webcal:// URL to subscribe in Apple Calendar',
        google: 'Use the https:// URL when adding "From URL" in Google Calendar',
        outlook: 'Use the https:// URL when subscribing from web',
      },
    });
  } catch (error) {
    logger.error('Failed to list calendar subscriptions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to list subscriptions' }, { status: 500 });
  }
});

/**
 * POST /api/calendar/subscriptions
 * Create a new calendar subscription
 */
export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = createSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Get provider ID from user
    const provider = await prisma.provider.findFirst({
      where: {
        OR: [{ email: user.email }, { user: { id: user.id } }],
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Check subscription limit (max 5 per provider)
    const existingCount = await prisma.calendarSubscription.count({
      where: { providerId: provider.id },
    });

    if (existingCount >= 5) {
      return NextResponse.json(
        { error: 'Maximum subscription limit reached (5)' },
        { status: 400 }
      );
    }

    const subscription = await createCalendarSubscription(provider.id, user.clinicId || undefined, {
      name: parsed.data.name,
      includePatientNames: parsed.data.includePatientNames,
      includeMeetingLinks: parsed.data.includeMeetingLinks,
      syncRangeDays: parsed.data.syncRangeDays,
    });

    // Generate URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const feedUrl = `${baseUrl}/api/calendar/ical/${subscription.token}`;
    const webcalUrl = `webcal://${new URL(baseUrl).host}/api/calendar/ical/${subscription.token}`;

    return NextResponse.json(
      {
        subscription: {
          ...subscription,
          feedUrl,
          webcalUrl,
        },
        instructions: {
          apple: `Open this URL in Safari or click "Add to Calendar" on macOS/iOS: ${webcalUrl}`,
          google: `In Google Calendar, go to Settings > Add Calendar > From URL, and paste: ${feedUrl}`,
          outlook: `In Outlook Calendar, go to Add Calendar > Subscribe from web, and paste: ${feedUrl}`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Failed to create calendar subscription', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
});

/**
 * PATCH /api/calendar/subscriptions
 * Update a calendar subscription
 */
export const PATCH = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = updateSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Get provider ID from user
    const provider = await prisma.provider.findFirst({
      where: {
        OR: [{ email: user.email }, { user: { id: user.id } }],
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Verify ownership
    const existingSubscription = await prisma.calendarSubscription.findFirst({
      where: {
        id: parsed.data.subscriptionId,
        providerId: provider.id,
      },
    });

    if (!existingSubscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const { subscriptionId, ...updateData } = parsed.data;

    const subscription = await prisma.calendarSubscription.update({
      where: { id: subscriptionId },
      data: updateData,
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    logger.error('Failed to update calendar subscription', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
});

/**
 * DELETE /api/calendar/subscriptions
 * Delete a calendar subscription
 */
export const DELETE = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const subscriptionId = req.nextUrl.searchParams.get('subscriptionId');

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
    }

    // Get provider ID from user
    const provider = await prisma.provider.findFirst({
      where: {
        OR: [{ email: user.email }, { user: { id: user.id } }],
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Verify ownership
    const existingSubscription = await prisma.calendarSubscription.findFirst({
      where: {
        id: parseInt(subscriptionId),
        providerId: provider.id,
      },
    });

    if (!existingSubscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    await deleteCalendarSubscription(parseInt(subscriptionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete calendar subscription', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
});
