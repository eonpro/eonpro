/**
 * Care Plan Progress API
 * 
 * Record and manage patient progress on care plans
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  recordProgress,
  completeGoal,
  addGoalToCarePlan,
  getGoalProgressHistory,
} from '@/lib/care-plans/care-plan.service';

const recordProgressSchema = z.object({
  carePlanId: z.number(),
  goalId: z.number().optional(),
  activityId: z.number().optional(),
  value: z.string().optional(),
  notes: z.string().optional(),
  recordedByPatient: z.boolean().optional(),
});

const addGoalSchema = z.object({
  carePlanId: z.number(),
  title: z.string().min(3),
  description: z.string().optional(),
  targetValue: z.string().optional(),
  unit: z.string().optional(),
  targetDate: z.string().datetime().optional(),
});

/**
 * GET /api/care-plans/progress
 * Get progress history for a goal
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const goalId = searchParams.get('goalId');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      if (!goalId) {
        return NextResponse.json(
          { error: 'goalId is required' },
          { status: 400 }
        );
      }

      const history = await getGoalProgressHistory(parseInt(goalId), {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      return NextResponse.json({ history });
    } catch (error) {
      logger.error('Failed to fetch progress history', { error });
      return NextResponse.json(
        { error: 'Failed to fetch progress history' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/care-plans/progress
 * Record progress entry
 */
export const POST = withAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = recordProgressSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const result = await recordProgress({
        carePlanId: parsed.data.carePlanId,
        goalId: parsed.data.goalId,
        activityId: parsed.data.activityId,
        value: parsed.data.value,
        notes: parsed.data.notes,
        recordedById: user.id,
        recordedByPatient: parsed.data.recordedByPatient || user.role === 'patient',
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ progress: result.progress }, { status: 201 });
    } catch (error) {
      logger.error('Failed to record progress', { error });
      return NextResponse.json(
        { error: 'Failed to record progress' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/care-plans/progress
 * Complete a goal or add a new goal
 */
export const PATCH = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const { action, goalId, carePlanId, goal } = body;

      if (!action) {
        return NextResponse.json(
          { error: 'action is required' },
          { status: 400 }
        );
      }

      switch (action) {
        case 'completeGoal':
          if (!goalId) {
            return NextResponse.json(
              { error: 'goalId is required for completeGoal action' },
              { status: 400 }
            );
          }
          const completeResult = await completeGoal(goalId);
          if (!completeResult.success) {
            return NextResponse.json(
              { error: completeResult.error },
              { status: 400 }
            );
          }
          return NextResponse.json({ goal: completeResult.goal });

        case 'addGoal':
          const addGoalParsed = addGoalSchema.safeParse({ carePlanId, ...goal });
          if (!addGoalParsed.success) {
            return NextResponse.json(
              { error: 'Invalid goal data', details: addGoalParsed.error.issues },
              { status: 400 }
            );
          }
          const addResult = await addGoalToCarePlan(carePlanId, {
            title: addGoalParsed.data.title,
            description: addGoalParsed.data.description,
            targetValue: addGoalParsed.data.targetValue,
            unit: addGoalParsed.data.unit,
            targetDate: addGoalParsed.data.targetDate ? new Date(addGoalParsed.data.targetDate) : undefined,
          });
          if (!addResult.success) {
            return NextResponse.json(
              { error: addResult.error },
              { status: 400 }
            );
          }
          return NextResponse.json({ goal: addResult.goal }, { status: 201 });

        default:
          return NextResponse.json(
            { error: 'Invalid action. Use "completeGoal" or "addGoal"' },
            { status: 400 }
          );
      }
    } catch (error) {
      logger.error('Failed to update progress', { error });
      return NextResponse.json(
        { error: 'Failed to update progress' },
        { status: 500 }
      );
    }
  }
);
