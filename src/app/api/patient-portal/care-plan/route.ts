/**
 * Patient Care Plan API
 * Fetches patient's care plan with goals and activities
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/patient-portal/care-plan
 * Get patient's active care plan
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const carePlan = await prisma.carePlan.findFirst({
      where: {
        patientId: user.patientId,
        status: 'ACTIVE',
      },
      include: {
        goals: {
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          orderBy: { createdAt: 'asc' },
        },
        template: {
          select: { name: true },
        },
      },
    });

    if (!carePlan) {
      return NextResponse.json({ carePlan: null });
    }

    // Calculate progress for each goal
    const goalsWithProgress = carePlan.goals.map(
      (goal: any) => {
        const progress =
          goal.targetValue && goal.currentValue
            ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
            : goal.status === 'COMPLETED'
              ? 100
              : 0;

        return {
          id: goal.id,
          name: goal.name,
          description: goal.description,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          unit: goal.unit,
          targetDate: goal.targetDate,
          status: goal.status,
          progress,
        };
      }
    );

    // Determine current phase based on goals completed
    const completedGoals = goalsWithProgress.filter(
      (g: { status: string }) => g.status === 'COMPLETED'
    ).length;
    const totalGoals = goalsWithProgress.length;
    let phase = 'Getting Started';
    if (totalGoals > 0) {
      const percentComplete = completedGoals / totalGoals;
      if (percentComplete >= 0.75) phase = 'Final Phase';
      else if (percentComplete >= 0.5) phase = 'Making Progress';
      else if (percentComplete >= 0.25) phase = 'Building Momentum';
      else if (completedGoals > 0) phase = 'Early Wins';
    }

    // Find next milestone
    const nextGoal = goalsWithProgress.find((g: { status: string }) => g.status === 'IN_PROGRESS');
    const nextMilestone = nextGoal ? `Complete: ${nextGoal.name}` : null;

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'CarePlan',
        resourceId: String(carePlan.id),
        patientId: user.patientId,
        action: 'portal_care_plan',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for portal care plan', {
        patientId: user.patientId,
        userId: user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      carePlan: {
        id: carePlan.id,
        name: (carePlan as any).name || carePlan.template?.name || 'Your Care Plan',
        description: carePlan.description || 'Your personalized treatment plan',
        status: carePlan.status,
        startDate: carePlan.startDate,
        endDate: carePlan.endDate,
        phase,
        goals: goalsWithProgress,
        activities: carePlan.activities.map(
          (a: any) => ({
            id: a.id,
            name: a.title || a.name,
            description: a.description,
            frequency: a.frequency || 'As needed',
            status: a.status,
            lastCompletedAt: a.completedAt,
          })
        ),
        nextMilestone,
        providerNotes: carePlan.notes,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-portal/care-plan',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}, { roles: ['patient'] });
