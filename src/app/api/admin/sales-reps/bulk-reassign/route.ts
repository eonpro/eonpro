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
import { z } from 'zod';

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
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { fromSalesRepId, toSalesRepId, note } = result.data;

    if (fromSalesRepId === toSalesRepId) {
      return NextResponse.json(
        { error: 'Source and target sales reps must be different' },
        { status: 400 }
      );
    }

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify source sales rep exists and is a sales rep
    const fromSalesRep = await prisma.user.findUnique({
      where: { id: fromSalesRepId },
      select: { id: true, role: true, clinicId: true, firstName: true, lastName: true },
    });

    if (!fromSalesRep) {
      return NextResponse.json({ error: 'Source sales rep not found' }, { status: 404 });
    }

    if (fromSalesRep.role !== 'SALES_REP') {
      return NextResponse.json(
        { error: 'Source user is not a sales representative' },
        { status: 400 }
      );
    }

    // Verify clinic access
    if (clinicId && fromSalesRep.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify target sales rep exists and is a sales rep
    const toSalesRep = await prisma.user.findUnique({
      where: { id: toSalesRepId },
      select: { id: true, role: true, clinicId: true, firstName: true, lastName: true },
    });

    if (!toSalesRep) {
      return NextResponse.json({ error: 'Target sales rep not found' }, { status: 404 });
    }

    if (toSalesRep.role !== 'SALES_REP') {
      return NextResponse.json(
        { error: 'Target user is not a sales representative' },
        { status: 400 }
      );
    }

    // Verify both sales reps are in the same clinic
    if (fromSalesRep.clinicId !== toSalesRep.clinicId) {
      return NextResponse.json(
        { error: 'Both sales reps must belong to the same clinic' },
        { status: 400 }
      );
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
    });

    if (activeAssignments.length === 0) {
      return NextResponse.json(
        { error: 'Source sales rep has no active patient assignments' },
        { status: 400 }
      );
    }

    const reassignmentNote =
      note ||
      `Bulk reassigned from ${fromSalesRep.firstName} ${fromSalesRep.lastName} to ${toSalesRep.firstName} ${toSalesRep.lastName}`;

    // Perform bulk reassignment in a transaction
    const reassignedCount = await prisma.$transaction(
      async (tx) => {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SALES-REPS] Error in bulk reassignment', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to perform bulk reassignment' }, { status: 500 });
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
      return NextResponse.json(
        { error: 'fromSalesRepId is required' },
        { status: 400 }
      );
    }

    const fromId = parseInt(fromSalesRepId, 10);
    if (isNaN(fromId)) {
      return NextResponse.json(
        { error: 'Invalid fromSalesRepId' },
        { status: 400 }
      );
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SALES-REPS] Error getting bulk reassign preview', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to get preview' }, { status: 500 });
  }
}

export const POST = withAdminAuth(handlePost);
export const GET = withAdminAuth(handleGet);
