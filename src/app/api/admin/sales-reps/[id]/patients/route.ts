/**
 * Sales Rep Patients API
 * =======================
 *
 * Get patients assigned to a specific sales representative.
 *
 * @module api/admin/sales-reps/[id]/patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AGGREGATION_TAKE } from '@/lib/pagination';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { normalizeSearch, splitSearchTerms } from '@/lib/utils/search';
import {
  handleApiError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '@/domains/shared/errors';

const PAGE_SIZE = 25;

// Helper to safely decrypt a field
const safeDecrypt = (value: string | null): string | null => {
  if (!value) return value;
  try {
    const parts = value.split(':');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return decryptPHI(value);
    }
    return value;
  } catch {
    return null;
  }
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/sales-reps/[id]/patients
 * Get patients assigned to a sales rep with pagination
 */
async function handleGet(
  req: NextRequest,
  user: AuthUser,
  context?: RouteContext
): Promise<Response> {
  try {
    if (!context?.params) {
      throw new BadRequestError('Missing route parameters');
    }

    const { id } = await context.params;
    const salesRepId = parseInt(id, 10);

    if (isNaN(salesRepId)) {
      throw new BadRequestError('Invalid sales rep ID');
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = (searchParams.get('search') || '').trim();

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify sales rep exists
    const salesRep = await prisma.user.findUnique({
      where: { id: salesRepId },
      select: { id: true, firstName: true, lastName: true, role: true, clinicId: true },
    });

    if (!salesRep) {
      throw new NotFoundError('Sales rep not found');
    }

    if (salesRep.role !== 'SALES_REP') {
      throw new BadRequestError('User is not a sales representative');
    }

    // Verify clinic access
    if (clinicId && salesRep.clinicId !== clinicId) {
      throw new ForbiddenError('Access denied');
    }

    // Get assigned patient IDs
    const assignments = await prisma.patientSalesRepAssignment.findMany({
      where: {
        salesRepId,
        isActive: true,
        ...(clinicId && { clinicId }),
      },
      select: { patientId: true, assignedAt: true },
      orderBy: { assignedAt: 'desc' },
      take: AGGREGATION_TAKE,
    });

    const patientIds = assignments.map((a: { patientId: number }) => a.patientId);
    const assignmentMap = new Map(
      assignments.map((a: { patientId: number; assignedAt: Date }) => [a.patientId, a.assignedAt])
    );

    if (patientIds.length === 0) {
      return NextResponse.json({
        salesRep: {
          id: salesRep.id,
          firstName: salesRep.firstName,
          lastName: salesRep.lastName,
        },
        patients: [],
        meta: {
          count: 0,
          total: 0,
          hasMore: false,
        },
      });
    }

    // Build where clause
    // NOTE: Search is handled in-memory after decryption because PHI fields are encrypted
    const whereClause: Record<string, unknown> = {
      id: { in: patientIds },
    };

    // NOTE: Patient PHI (firstName, lastName, email) is ENCRYPTED in the database.
    // SQL-level search on encrypted fields won't work.
    // For search: fetch all assigned patients, decrypt, filter in memory, then paginate.

    // Fetch all assigned patients first (for potential search filtering)
    const allPatients = await prisma.patient.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: AGGREGATION_TAKE,
      include: {
        clinic: {
          select: { id: true, name: true },
        },
        payments: {
          where: { status: 'SUCCEEDED' },
          orderBy: { paidAt: 'desc' },
          take: 1,
          select: { paidAt: true, amount: true },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true, status: true },
        },
      },
    });

    // Decrypt all patient data for potential filtering
    const decryptedPatients = allPatients.map((patient: (typeof allPatients)[number]) => {
      const lastPayment = patient.payments?.[0];
      const lastOrder = patient.orders?.[0];

      return {
        id: patient.id,
        patientId: patient.patientId,
        firstName: safeDecrypt(patient.firstName),
        lastName: safeDecrypt(patient.lastName),
        email: safeDecrypt(patient.email),
        phone: safeDecrypt(patient.phone),
        createdAt: patient.createdAt,
        clinicId: patient.clinicId,
        clinicName: patient.clinic?.name || null,
        assignedAt: assignmentMap.get(patient.id),
        hasPayment: !!lastPayment,
        hasOrder: !!lastOrder,
        lastPaymentAmount: lastPayment?.amount ? (lastPayment.amount / 100).toFixed(2) : null,
        lastOrderStatus: lastOrder?.status || null,
      };
    });

    // Filter by search term if provided (in-memory filtering on decrypted data)
    let filteredPatients = decryptedPatients;
    if (search) {
      const searchNormalized = normalizeSearch(search);
      const terms = splitSearchTerms(search);
      filteredPatients = decryptedPatients.filter((patient: (typeof decryptedPatients)[number]) => {
        const firstName = patient.firstName?.toLowerCase() || '';
        const lastName = patient.lastName?.toLowerCase() || '';
        const email = patient.email?.toLowerCase() || '';
        const patientIdStr = patient.patientId?.toLowerCase() || '';

        // Single term: match any field
        if (terms.length <= 1) {
          return (
            firstName.includes(searchNormalized) ||
            lastName.includes(searchNormalized) ||
            email.includes(searchNormalized) ||
            patientIdStr.includes(searchNormalized)
          );
        }

        // Multi-term: match full name or all terms somewhere
        return (
          `${firstName} ${lastName}`.includes(searchNormalized) ||
          `${lastName} ${firstName}`.includes(searchNormalized) ||
          terms.every(
            (term) =>
              firstName.includes(term) ||
              lastName.includes(term) ||
              email.includes(term) ||
              patientIdStr.includes(term)
          )
        );
      });
    }

    // Apply pagination to (filtered) results
    const total = filteredPatients.length;
    const patientsData = filteredPatients.slice(offset, offset + limit);

    logger.info('[SALES-REP-PATIENTS] Listed patients for sales rep', {
      userId: user.id,
      salesRepId,
      count: patientsData.length,
      total,
    });

    return NextResponse.json({
      salesRep: {
        id: salesRep.id,
        firstName: salesRep.firstName,
        lastName: salesRep.lastName,
      },
      patients: patientsData,
      meta: {
        count: patientsData.length,
        total,
        hasMore: offset + patientsData.length < total,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/sales-reps/[id]/patients' });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
