/**
 * Patient Sales Rep Assignment API
 * =================================
 *
 * Assign or reassign a sales representative to a patient.
 * Maintains full assignment history for audit trail.
 *
 * @module api/admin/patients/[id]/sales-rep
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const assignSchema = z.object({
  salesRepId: z.number().positive('Sales rep ID must be a positive number'),
  note: z.string().optional(),
});

const unassignSchema = z.object({
  note: z.string().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/patients/[id]/sales-rep
 * Get the current sales rep assignment for a patient
 */
async function handleGet(
  req: NextRequest,
  user: AuthUser,
  context?: RouteContext
): Promise<Response> {
  try {
    if (!context?.params) {
      return NextResponse.json({ error: 'Missing route parameters' }, { status: 400 });
    }

    const { id } = await context.params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify patient exists and user has access
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (clinicId && patient.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get active assignment
    const assignment = await prisma.patientSalesRepAssignment.findFirst({
      where: {
        patientId,
        isActive: true,
      },
      include: {
        salesRep: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Get assignment history
    const history = await prisma.patientSalesRepAssignment.findMany({
      where: {
        patientId,
        isActive: false,
      },
      include: {
        salesRep: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        removedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { removedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      assignment: assignment
        ? {
            id: assignment.id,
            salesRep: assignment.salesRep,
            assignedAt: assignment.assignedAt,
            assignedBy: assignment.assignedBy,
          }
        : null,
      history: history.map((h: typeof history[number]) => ({
        id: h.id,
        salesRep: h.salesRep,
        assignedAt: h.assignedAt,
        assignedBy: h.assignedBy,
        removedAt: h.removedAt,
        removedBy: h.removedBy,
        removalNote: h.removalNote,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PATIENT-SALES-REP] Error getting assignment', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to get assignment' }, { status: 500 });
  }
}

/**
 * POST /api/admin/patients/[id]/sales-rep
 * Assign or reassign a sales rep to a patient
 */
async function handlePost(
  req: NextRequest,
  user: AuthUser,
  context?: RouteContext
): Promise<Response> {
  try {
    if (!context?.params) {
      return NextResponse.json({ error: 'Missing route parameters' }, { status: 400 });
    }

    const { id } = await context.params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    const body = await req.json();
    const result = assignSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { salesRepId, note } = result.data;

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify patient exists and user has access
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (clinicId && patient.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify sales rep exists and has SALES_REP role
    const salesRep = await prisma.user.findUnique({
      where: { id: salesRepId },
      select: { id: true, role: true, clinicId: true, firstName: true, lastName: true },
    });

    if (!salesRep) {
      return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
    }

    if (salesRep.role !== 'SALES_REP') {
      return NextResponse.json(
        { error: 'User is not a sales representative' },
        { status: 400 }
      );
    }

    // Verify sales rep belongs to the same clinic
    if (salesRep.clinicId !== patient.clinicId) {
      return NextResponse.json(
        { error: 'Sales rep must belong to the same clinic as the patient' },
        { status: 400 }
      );
    }

    // Use transaction to deactivate existing assignment and create new one
    const assignment = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Deactivate any existing active assignment
      const existingAssignment = await tx.patientSalesRepAssignment.findFirst({
        where: {
          patientId,
          isActive: true,
        },
      });

      if (existingAssignment) {
        // Don't reassign if already assigned to the same sales rep
        if (existingAssignment.salesRepId === salesRepId) {
          return existingAssignment;
        }

        await tx.patientSalesRepAssignment.update({
          where: { id: existingAssignment.id },
          data: {
            isActive: false,
            removedAt: new Date(),
            removedById: user.id,
            removalNote: note || 'Reassigned to another sales rep',
          },
        });
      }

      // Create new assignment
      return tx.patientSalesRepAssignment.create({
        data: {
          patientId,
          salesRepId,
          clinicId: patient.clinicId,
          assignedById: user.id,
        },
        include: {
          salesRep: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    logger.info('[PATIENT-SALES-REP] Patient assigned to sales rep', {
      patientId,
      salesRepId,
      assignedBy: user.id,
      clinicId: patient.clinicId,
    });

    return NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        salesRep: assignment.salesRep,
        assignedAt: assignment.assignedAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PATIENT-SALES-REP] Error assigning sales rep', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to assign sales rep' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/patients/[id]/sales-rep
 * Remove sales rep assignment from a patient
 */
async function handleDelete(
  req: NextRequest,
  user: AuthUser,
  context?: RouteContext
): Promise<Response> {
  try {
    if (!context?.params) {
      return NextResponse.json({ error: 'Missing route parameters' }, { status: 400 });
    }

    const { id } = await context.params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    // Parse optional body for note
    let note: string | undefined;
    try {
      const body = await req.json();
      const result = unassignSchema.safeParse(body);
      if (result.success) {
        note = result.data.note;
      }
    } catch {
      // Body is optional for DELETE
    }

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify patient exists and user has access
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (clinicId && patient.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Find and deactivate the current assignment
    const existingAssignment = await prisma.patientSalesRepAssignment.findFirst({
      where: {
        patientId,
        isActive: true,
      },
    });

    if (!existingAssignment) {
      return NextResponse.json(
        { error: 'No active sales rep assignment found' },
        { status: 404 }
      );
    }

    await prisma.patientSalesRepAssignment.update({
      where: { id: existingAssignment.id },
      data: {
        isActive: false,
        removedAt: new Date(),
        removedById: user.id,
        removalNote: note || 'Unassigned by admin',
      },
    });

    logger.info('[PATIENT-SALES-REP] Sales rep assignment removed', {
      patientId,
      previousSalesRepId: existingAssignment.salesRepId,
      removedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PATIENT-SALES-REP] Error removing assignment', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
export const DELETE = withAuth(handleDelete, { roles: ['super_admin', 'admin'] });
