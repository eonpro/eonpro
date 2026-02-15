/**
 * Push Subscription API
 * Manages web push notification subscriptions for patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { logPHICreate, logPHIDelete, logPHIAccess } from '@/lib/audit/hipaa-audit';
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

    logger.info('Push subscription registered', {
      patientId,
      endpoint: subscription.endpoint.slice(0, 50),
    });

    await logPHICreate(req, user, 'PushSubscription', subscription.endpoint.slice(0, 50), patientId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/patient-portal/push-subscription' } });
  }
}, { roles: ['patient'] });

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

    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        patientId: user.patientId,
      },
    });

    logger.info('Push subscription unregistered', {
      patientId: user.patientId,
      endpoint: endpoint.slice(0, 50),
    });

    await logPHIDelete(req, user, 'PushSubscription', endpoint.slice(0, 50), user.patientId, 'Patient unsubscribed');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: { route: 'DELETE /api/patient-portal/push-subscription' } });
  }
}, { roles: ['patient'] });

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

    await logPHIAccess(req, user, 'PushSubscription', String(patientId), patientId, {
      subscriptionCount: subscriptions.length,
    });

    return NextResponse.json({
      hasSubscription: subscriptions.length > 0,
      count: subscriptions.length,
    });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/push-subscription' } });
  }
}, { roles: ['patient'] });
