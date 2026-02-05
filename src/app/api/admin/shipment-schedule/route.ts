/**
 * Shipment Schedule Admin API
 * ===========================
 * 
 * GET /api/admin/shipment-schedule - List all scheduled shipments with filters
 * POST /api/admin/shipment-schedule - Create a manual shipment schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  getShipmentScheduleSummary,
  createShipmentSchedule,
  DEFAULT_BUD_DAYS,
} from '@/lib/shipment-schedule';

// Query params schema
const querySchema = z.object({
  status: z.enum(['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER', 'PRESCRIBED', 'COMPLETED', 'CANCELLED']).optional(),
  patientId: z.coerce.number().optional(),
  dueWithinDays: z.coerce.number().min(1).max(365).optional(),
  multiShipmentOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Create shipment schedule schema
const createScheduleSchema = z.object({
  patientId: z.number().positive(),
  subscriptionId: z.number().positive().optional(),
  packageMonths: z.number().min(1).max(24),
  budDays: z.number().min(30).max(180).optional(),
  medicationName: z.string().optional(),
  medicationStrength: z.string().optional(),
  medicationForm: z.string().optional(),
  planName: z.string().optional(),
  vialCount: z.number().min(1).max(12).optional(),
  startDate: z.string().datetime().optional(),
});

/**
 * GET /api/admin/shipment-schedule
 * List shipment schedules with filters and pagination
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const params = querySchema.parse({
      status: searchParams.get('status') || undefined,
      patientId: searchParams.get('patientId') || undefined,
      dueWithinDays: searchParams.get('dueWithinDays') || undefined,
      multiShipmentOnly: searchParams.get('multiShipmentOnly') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
    });

    // Build where clause
    const where: any = {};

    // Clinic isolation (unless super admin)
    if (user.role !== 'super_admin' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.patientId) {
      where.patientId = params.patientId;
    }

    if (params.dueWithinDays) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + params.dueWithinDays);
      where.nextRefillDate = {
        lte: futureDate,
        gte: new Date(),
      };
    }

    if (params.multiShipmentOnly) {
      where.totalShipments = { gt: 1 };
    }

    // Get shipments with pagination
    const [shipments, total] = await Promise.all([
      prisma.refillQueue.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          subscription: {
            select: {
              id: true,
              planName: true,
              status: true,
            },
          },
          clinic: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { nextRefillDate: 'asc' },
          { shipmentNumber: 'asc' },
        ],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.refillQueue.count({ where }),
    ]);

    // Get summary stats
    const clinicId = user.role !== 'super_admin' ? user.clinicId : undefined;
    const summary = clinicId ? await getShipmentScheduleSummary(clinicId) : null;

    return NextResponse.json({
      success: true,
      data: {
        shipments,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
        summary,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Shipment Schedule API] GET failed', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/shipment-schedule
 * Create a manual shipment schedule for a patient
 */
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const validated = createScheduleSchema.parse(body);

    // Get patient to verify clinic access
    const patient = await prisma.patient.findUnique({
      where: { id: validated.patientId },
      select: { clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Verify clinic access
    if (user.role !== 'super_admin' && patient.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create shipment schedule
    const result = await createShipmentSchedule({
      clinicId: patient.clinicId,
      patientId: validated.patientId,
      subscriptionId: validated.subscriptionId,
      packageMonths: validated.packageMonths,
      budDays: validated.budDays || DEFAULT_BUD_DAYS,
      medicationName: validated.medicationName,
      medicationStrength: validated.medicationStrength,
      medicationForm: validated.medicationForm,
      planName: validated.planName,
      vialCount: validated.vialCount,
      startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    });

    logger.info('[Shipment Schedule API] Created schedule', {
      userId: user.id,
      patientId: validated.patientId,
      totalShipments: result.totalShipments,
    });

    return NextResponse.json({
      success: true,
      data: {
        shipments: result.shipments,
        totalShipments: result.totalShipments,
        scheduleInterval: result.scheduleInterval,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Shipment Schedule API] POST failed', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { roles: ['admin', 'super_admin'] });
export const POST = withAuth(handlePost, { roles: ['admin', 'super_admin'] });
