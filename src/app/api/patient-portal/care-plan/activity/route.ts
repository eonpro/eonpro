/**
 * Care Plan Activity API
 * Mark activities as complete
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const activitySchema = z.object({
  activityId: z.number(),
  action: z.enum(['complete', 'uncomplete']),
});

/**
 * POST /api/patient-portal/care-plan/activity
 * Mark an activity as complete/incomplete
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = activitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { activityId, action } = parsed.data;

    // Verify the activity belongs to patient's care plan
    const activity = await prisma.carePlanActivity.findFirst({
      where: {
        id: activityId,
        carePlan: {
          patientId: user.patientId,
        },
      },
    });

    if (!activity) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    // Update activity status
    const updated = await prisma.carePlanActivity.update({
      where: { id: activityId },
      data: {
        status: action === 'complete' ? 'COMPLETED' : 'PENDING',
        completedAt: action === 'complete' ? new Date() : null,
      },
    });

    logger.info('Care plan activity updated', {
      patientId: user.patientId,
      activityId,
      action,
    });

    return NextResponse.json({
      success: true,
      activity: {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to update activity:', error);
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
  }
});
