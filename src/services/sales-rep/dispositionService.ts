/**
 * Sales Rep Disposition Service
 *
 * Structured workflow for reps to qualify/disposition patient interactions.
 * When a disposition with outcome SALE_COMPLETED is approved, the service
 * auto-creates a PatientSalesRepAssignment for commission attribution.
 *
 * HIPAA-COMPLIANT: Never logs or stores patient-identifiable information.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  type DispositionLeadSource,
  type DispositionContactMethod,
  type DispositionOutcome,
  type DispositionStatus,
  Prisma,
} from '@prisma/client';
import { COMMISSION_ELIGIBLE_ROLES } from '@/lib/constants/commission-eligible-roles';

// ============================================================================
// Types
// ============================================================================

export interface CreateDispositionInput {
  clinicId: number;
  salesRepId: number;
  patientId: number;
  leadSource: DispositionLeadSource;
  contactMethod: DispositionContactMethod;
  outcome: DispositionOutcome;
  productInterest?: string;
  notes?: string;
  followUpDate?: Date;
  followUpNotes?: string;
  tags?: string[];
}

export interface ReviewDispositionInput {
  dispositionId: number;
  reviewerId: number;
  clinicId: number;
  status: 'APPROVED' | 'REJECTED';
  reviewNote?: string;
}

export interface ListDispositionsFilter {
  clinicId: number;
  salesRepId?: number;
  patientId?: number;
  outcome?: DispositionOutcome;
  status?: DispositionStatus;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}

export interface DispositionStats {
  total: number;
  byOutcome: Record<string, number>;
  byStatus: Record<string, number>;
  byLeadSource: Record<string, number>;
  pendingReview: number;
  autoAssigned: number;
}

// ============================================================================
// Create Disposition
// ============================================================================

export async function createDisposition(input: CreateDispositionInput) {
  const {
    clinicId,
    salesRepId,
    patientId,
    leadSource,
    contactMethod,
    outcome,
    productInterest,
    notes,
    followUpDate,
    followUpNotes,
    tags,
  } = input;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, clinicId: true },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  if (patient.clinicId !== clinicId) {
    throw new Error('Patient does not belong to this clinic');
  }

  const rep = await prisma.user.findFirst({
    where: { id: salesRepId, role: { in: [...COMMISSION_ELIGIBLE_ROLES] }, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!rep) {
    throw new Error('Employee not found, inactive, or not eligible for commissions');
  }

  const disposition = await prisma.salesRepDisposition.create({
    data: {
      clinicId,
      salesRepId,
      patientId,
      leadSource,
      contactMethod,
      outcome,
      productInterest: productInterest || null,
      notes: notes || null,
      followUpDate: followUpDate || null,
      followUpNotes: followUpNotes || null,
      tags: tags && tags.length > 0 ? tags : Prisma.JsonNull,
      status: 'PENDING_REVIEW',
    },
    include: {
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  logger.info('[Disposition] Created', {
    dispositionId: disposition.id,
    salesRepId,
    patientId,
    clinicId,
    outcome,
    leadSource,
  });

  return disposition;
}

// ============================================================================
// Review (Approve/Reject) Disposition
// ============================================================================

export async function reviewDisposition(input: ReviewDispositionInput) {
  const { dispositionId, reviewerId, clinicId, status, reviewNote } = input;

  const disposition = await prisma.salesRepDisposition.findUnique({
    where: { id: dispositionId },
    select: {
      id: true,
      clinicId: true,
      salesRepId: true,
      patientId: true,
      outcome: true,
      status: true,
    },
  });

  if (!disposition) {
    throw new Error('Disposition not found');
  }

  if (clinicId > 0 && disposition.clinicId !== clinicId) {
    throw new Error('Disposition does not belong to this clinic');
  }

  if (disposition.status !== 'PENDING_REVIEW') {
    throw new Error(`Disposition already ${disposition.status.toLowerCase()}`);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let assignmentId: number | null = null;
      let autoAssigned = false;

      // On APPROVED + SALE_COMPLETED: auto-create PatientSalesRepAssignment
      if (status === 'APPROVED' && disposition.outcome === 'SALE_COMPLETED') {
        const existingAssignment = await tx.patientSalesRepAssignment.findFirst({
          where: {
            patientId: disposition.patientId,
            clinicId: disposition.clinicId,
            isActive: true,
          },
          select: { id: true, salesRepId: true },
        });

        if (!existingAssignment) {
          const assignment = await tx.patientSalesRepAssignment.create({
            data: {
              patientId: disposition.patientId,
              salesRepId: disposition.salesRepId,
              clinicId: disposition.clinicId,
              assignedById: reviewerId,
            },
          });
          assignmentId = assignment.id;
          autoAssigned = true;
        } else if (existingAssignment.salesRepId !== disposition.salesRepId) {
          // Deactivate old assignment, create new one
          await tx.patientSalesRepAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              isActive: false,
              removedAt: new Date(),
              removedById: reviewerId,
              removalNote: `Reassigned via approved disposition #${dispositionId}`,
            },
          });

          const assignment = await tx.patientSalesRepAssignment.create({
            data: {
              patientId: disposition.patientId,
              salesRepId: disposition.salesRepId,
              clinicId: disposition.clinicId,
              assignedById: reviewerId,
            },
          });
          assignmentId = assignment.id;
          autoAssigned = true;
        } else {
          // Already assigned to the same rep
          assignmentId = existingAssignment.id;
        }
      }

      const updated = await tx.salesRepDisposition.update({
        where: { id: dispositionId },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          reviewNote: reviewNote || null,
          autoAssigned,
          assignmentId,
        },
        include: {
          salesRep: { select: { id: true, firstName: true, lastName: true } },
          patient: { select: { id: true, firstName: true, lastName: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return updated;
    },
    { timeout: 15000 }
  );

  logger.info('[Disposition] Reviewed', {
    dispositionId,
    status,
    reviewerId,
    clinicId,
    autoAssigned: result.autoAssigned,
    assignmentId: result.assignmentId,
  });

  return result;
}

// ============================================================================
// List Dispositions
// ============================================================================

export async function listDispositions(filter: ListDispositionsFilter) {
  const {
    clinicId,
    salesRepId,
    patientId,
    outcome,
    status,
    fromDate,
    toDate,
    page = 1,
    limit = 25,
  } = filter;

  const where: Prisma.SalesRepDispositionWhereInput = {
    clinicId,
    ...(salesRepId && { salesRepId }),
    ...(patientId && { patientId }),
    ...(outcome && { outcome }),
    ...(status && { status }),
    ...((fromDate || toDate) && {
      createdAt: {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      },
    }),
  };

  const [dispositions, total] = await Promise.all([
    prisma.salesRepDisposition.findMany({
      where,
      include: {
        salesRep: { select: { id: true, firstName: true, lastName: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.salesRepDisposition.count({ where }),
  ]);

  return {
    dispositions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ============================================================================
// Disposition Stats
// ============================================================================

export async function getDispositionStats(
  clinicId: number,
  salesRepId?: number,
  fromDate?: Date,
  toDate?: Date
): Promise<DispositionStats> {
  const where: Prisma.SalesRepDispositionWhereInput = {
    clinicId,
    ...(salesRepId && { salesRepId }),
    ...((fromDate || toDate) && {
      createdAt: {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      },
    }),
  };

  const [total, outcomes, statuses, sources, pendingReview, autoAssigned] = await Promise.all([
    prisma.salesRepDisposition.count({ where }),
    prisma.salesRepDisposition.groupBy({
      by: ['outcome'],
      where,
      _count: true,
    }),
    prisma.salesRepDisposition.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.salesRepDisposition.groupBy({
      by: ['leadSource'],
      where,
      _count: true,
    }),
    prisma.salesRepDisposition.count({ where: { ...where, status: 'PENDING_REVIEW' } }),
    prisma.salesRepDisposition.count({ where: { ...where, autoAssigned: true } }),
  ]);

  const byOutcome: Record<string, number> = {};
  for (const o of outcomes) {
    byOutcome[o.outcome] = o._count;
  }

  const byStatus: Record<string, number> = {};
  for (const s of statuses) {
    byStatus[s.status] = s._count;
  }

  const byLeadSource: Record<string, number> = {};
  for (const src of sources) {
    byLeadSource[src.leadSource] = src._count;
  }

  return { total, byOutcome, byStatus, byLeadSource, pendingReview, autoAssigned };
}
