/**
 * Care Plans API
 * 
 * CRUD operations for patient care plans
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  createCarePlan,
  activateCarePlan,
  archiveCarePlan,
  getCarePlanWithProgress,
  getPatientCarePlans,
  getCarePlanTemplates,
} from '@/lib/care-plans/care-plan.service';
import { CarePlanStatus } from '@prisma/client';

const createCarePlanSchema = z.object({
  clinicId: z.number().optional(),
  patientId: z.number(),
  providerId: z.number().optional(),
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  templateId: z.number().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  goals: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    targetValue: z.string().optional(),
    unit: z.string().optional(),
    targetDate: z.string().datetime().optional(),
  })).optional(),
  activities: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    frequency: z.string().optional(),
    instructions: z.string().optional(),
    goalIndex: z.number().optional(),
  })).optional(),
});

/**
 * GET /api/care-plans
 * List care plans or get a specific care plan
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const carePlanId = searchParams.get('carePlanId');
      const patientId = searchParams.get('patientId');
      const clinicId = searchParams.get('clinicId');
      const status = searchParams.get('status');
      const templates = searchParams.get('templates');

      // Get available templates
      if (templates === 'true') {
        const carePlanTemplates = await getCarePlanTemplates(
          clinicId ? parseInt(clinicId) : undefined
        );
        return NextResponse.json({ templates: carePlanTemplates });
      }

      // Get specific care plan with progress
      if (carePlanId) {
        const carePlan = await getCarePlanWithProgress(parseInt(carePlanId));

        if (!carePlan) {
          return NextResponse.json(
            { error: 'Care plan not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ carePlan });
      }

      // List patient's care plans
      if (!patientId) {
        return NextResponse.json(
          { error: 'patientId is required' },
          { status: 400 }
        );
      }

      const carePlans = await getPatientCarePlans(parseInt(patientId), {
        status: status as CarePlanStatus | undefined,
        includeArchived: status === 'ARCHIVED',
      });

      return NextResponse.json({ carePlans });
    } catch (error) {
      logger.error('Failed to fetch care plans', { error });
      return NextResponse.json(
        { error: 'Failed to fetch care plans' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/care-plans
 * Create a new care plan
 */
export const POST = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = createCarePlanSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const result = await createCarePlan({
        clinicId: parsed.data.clinicId,
        patientId: parsed.data.patientId,
        providerId: parsed.data.providerId,
        title: parsed.data.title,
        description: parsed.data.description,
        templateId: parsed.data.templateId,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
        goals: parsed.data.goals?.map(g => ({
          title: g.title,
          description: g.description,
          targetValue: g.targetValue,
          unit: g.unit,
          targetDate: g.targetDate ? new Date(g.targetDate) : undefined,
        })),
        activities: parsed.data.activities?.map(a => ({
          title: a.title,
          description: a.description,
          frequency: a.frequency,
          instructions: a.instructions,
          goalIndex: a.goalIndex,
        })),
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ carePlan: result.carePlan }, { status: 201 });
    } catch (error) {
      logger.error('Failed to create care plan', { error });
      return NextResponse.json(
        { error: 'Failed to create care plan' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/care-plans
 * Update care plan (activate, archive)
 */
export const PATCH = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const { carePlanId, action } = body;

      if (!carePlanId || !action) {
        return NextResponse.json(
          { error: 'carePlanId and action are required' },
          { status: 400 }
        );
      }

      let result;

      switch (action) {
        case 'activate':
          result = await activateCarePlan(carePlanId);
          break;
        case 'archive':
          result = await archiveCarePlan(carePlanId);
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid action. Use "activate" or "archive"' },
            { status: 400 }
          );
      }

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ carePlan: result.carePlan });
    } catch (error) {
      logger.error('Failed to update care plan', { error });
      return NextResponse.json(
        { error: 'Failed to update care plan' },
        { status: 500 }
      );
    }
  }
);
