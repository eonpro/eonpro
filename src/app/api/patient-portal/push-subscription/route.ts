/**
 * Push Subscription API
 * Manages web push notification subscriptions for patients
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  patientId: z.number().optional(),
});

/**
 * POST /api/patient-portal/push-subscription
 * Register a push subscription
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid subscription data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { subscription } = parsed.data;
    const patientId = user.patientId;

    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    // Upsert the subscription
    await prisma.pushSubscription.upsert({
      where: {
        endpoint: subscription.endpoint,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updatedAt: new Date(),
      },
      create: {
        patientId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    logger.info('Push subscription registered', { patientId, endpoint: subscription.endpoint.slice(0, 50) });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[PUSH_SUBSCRIPTION_POST] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to register subscription', errorId, code: 'SUBSCRIPTION_REGISTER_ERROR' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/patient-portal/push-subscription
 * Unregister a push subscription
 */
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint required', code: 'ENDPOINT_REQUIRED' },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        patientId: user.patientId || undefined,
      },
    });

    logger.info('Push subscription unregistered', { patientId: user.patientId, endpoint: endpoint.slice(0, 50) });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[PUSH_SUBSCRIPTION_DELETE] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to unregister subscription', errorId, code: 'SUBSCRIPTION_UNREGISTER_ERROR' },
      { status: 500 }
    );
  }
});

/**
 * GET /api/patient-portal/push-subscription
 * Check if patient has active subscription
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const patientId = user.patientId;

    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { patientId },
      select: {
        id: true,
        endpoint: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      hasSubscription: subscriptions.length > 0,
      count: subscriptions.length,
    });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[PUSH_SUBSCRIPTION_GET] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to check subscription', errorId, code: 'SUBSCRIPTION_CHECK_ERROR' },
      { status: 500 }
    );
  }
});
