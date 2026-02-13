/**
 * Bulk Sales Rep Reassignment API
 * ================================
 *
 * Transfer all patients from one sales rep to another.
 * Used when replacing a sales representative.
 *
 * @module api/admin/sales-reps/bulk-reassign
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AGGREGATION_TAKE } from '@/lib/pagination';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  handleApiError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '@/domains/shared/errors';

const bulkReassignSchema = z.object({
  fromSalesRepId: z.number().positive('Source sales rep ID is required'),
  toSalesRepId: z.number().positive('Target sales rep ID is required'),
  note: z.string().optional(),
});

/**
 * POST /api/admin/sales-reps/bulk-reassign
 * Transfer all active patient assignments from one sales rep to another
 */
async function handlePost(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const result = bulkReassignSchema.safeParse(body);

    if (!result.success) {
      throw result.error;
    }

    const { fromSalesRepId, toSalesRepId, note } = result.data;

    if (fromSalesRepId === toSalesRepId) {
      throw new BadRequestError('Source and target sales reps must be different');
    }

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify source sales rep exists and is a sales rep
    const fromSalesRep = await prisma.user.findUnique({
      where: { id: fromSalesRepId },
      select: { id: true, role: true, clinicId: true, firstName: true, lastName: true },
    });

    if (!fromSalesRep) {
      throw new NotFoundError('Source sales rep not found');
    }

    if (fromSalesRep.role !== 'SALES_REP') {
      throw new BadRequestError('Source user is not a sales representative');
    }

    // Verify clinic access
    if (clinicId && fromSalesRep.clinicId !== clinicId) {
      throw new ForbiddenError('Access denied');
    }

    // Verify target sales rep exists and is a sales rep
    const toSalesRep = await prisma.user.findUnique({
      where: { id: toSalesRepId },
      select: { id: true, role: true, clinicId: true, firstName: true, lastName: true },
    });

    if (!toSalesRep) {
      throw new NotFoundError('Target sales rep not found');
    }

    if (toSalesRep.role !== 'SALES_REP') {
      throw new BadRequestError('Target user is not a sales representative');
    }

    // Verify both sales reps are in the same clinic
    if (fromSalesRep.clinicId !== toSalesRep.clinicId) {
      throw new BadRequestError('Both sales reps must belong to the same clinic');
    }

    // Get all active assignments for the source sales rep
    const activeAssignments = await prisma.patientSalesRepAssignment.findMany({
      where: {
        salesRepId: fromSalesRepId,
        isActive: true,
        ...(clinicId && { clinicId }),
      },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
      },
      orderBy: { id: 'asc' },
      take: AGGREGATION_TAKE,
    });

    if (activeAssignments.length === 0) {
      throw new BadRequestError('Source sales rep has no active patient assignments');
    }

    const reassignmentNote =
      note ||
      `Bulk reassigned from ${fromSalesRep.firstName} ${fromSalesRep.lastName} to ${toSalesRep.firstName} ${toSalesRep.lastName}`;

    // Perform bulk reassignment in a transaction
    const reassignedCount = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let count = 0;

        for (const assignment of activeAssignments) {
          // Deactivate the old assignment
          await tx.patientSalesRepAssignment.update({
            where: { id: assignment.id },
            data: {
              isActive: false,
              removedAt: new Date(),
              removedById: user.id,
              removalNote: reassignmentNote,
            },
          });

          // Create new assignment for target sales rep
          await tx.patientSalesRepAssignment.create({
            data: {
              patientId: assignment.patientId,
              salesRepId: toSalesRepId,
              clinicId: assignment.clinicId,
              assignedById: user.id,
            },
          });

          count++;
        }

        return count;
      },
      {
        timeout: 60000, // 60 seconds for large reassignments
      }
    );

    logger.info('[SALES-REPS] Bulk reassignment completed', {
      fromSalesRepId,
      toSalesRepId,
      reassignedCount,
      performedBy: user.id,
      clinicId: fromSalesRep.clinicId,
    });

    return NextResponse.json({
      success: true,
      reassignedCount,
      fromSalesRep: {
        id: fromSalesRep.id,
        name: `${fromSalesRep.firstName} ${fromSalesRep.lastName}`,
      },
      toSalesRep: {
        id: toSalesRep.id,
        name: `${toSalesRep.firstName} ${toSalesRep.lastName}`,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/admin/sales-reps/bulk-reassign' });
  }
}

/**
 * GET /api/admin/sales-reps/bulk-reassign
 * Get preview of bulk reassignment (how many patients will be transferred)
 */
async function handleGet(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const fromSalesRepId = searchParams.get('fromSalesRepId');

    if (!fromSalesRepId) {
      throw new BadRequestError('fromSalesRepId is required');
    }

    const fromId = parseInt(fromSalesRepId, 10);
    if (isNaN(fromId)) {
      throw new BadRequestError('Invalid fromSalesRepId');
    }

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Get count of active assignments
    const count = await prisma.patientSalesRepAssignment.count({
      where: {
        salesRepId: fromId,
        isActive: true,
        ...(clinicId && { clinicId }),
      },
    });

    // Get sales rep info
    const salesRep = await prisma.user.findUnique({
      where: { id: fromId },
      select: { id: true, firstName: true, lastName: true },
    });

    return NextResponse.json({
      fromSalesRep: salesRep
        ? {
            id: salesRep.id,
            name: `${salesRep.firstName} ${salesRep.lastName}`,
          }
        : null,
      patientCount: count,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/sales-reps/bulk-reassign' });
  }
}

export const POST = withAdminAuth(handlePost);
export const GET = withAdminAuth(handleGet);
