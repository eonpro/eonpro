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
import { decryptPHI } from '@/lib/security/phi-encryption';

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
      return NextResponse.json({ error: 'Missing route parameters' }, { status: 400 });
    }

    const { id } = await context.params;
    const salesRepId = parseInt(id, 10);

    if (isNaN(salesRepId)) {
      return NextResponse.json({ error: 'Invalid sales rep ID' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Verify sales rep exists
    const salesRep = await prisma.user.findUnique({
      where: { id: salesRepId },
      select: { id: true, firstName: true, lastName: true, role: true, clinicId: true },
    });

    if (!salesRep) {
      return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
    }

    if (salesRep.role !== 'SALES_REP') {
      return NextResponse.json({ error: 'User is not a sales representative' }, { status: 400 });
    }

    // Verify clinic access
    if (clinicId && salesRep.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get assigned patient IDs
    const assignments = await prisma.patientSalesRepAssignment.findMany({
      where: {
        salesRepId,
        isActive: true,
        ...(clinicId && { clinicId }),
      },
      select: { patientId: true, assignedAt: true },
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
      orderBy: { createdAt: 'desc' },
    });

    // Decrypt all patient data for potential filtering
    const decryptedPatients = allPatients.map((patient: typeof allPatients[number]) => {
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
      const searchLower = search.toLowerCase();
      filteredPatients = decryptedPatients.filter((patient: typeof decryptedPatients[number]) => {
        const firstName = patient.firstName?.toLowerCase() || '';
        const lastName = patient.lastName?.toLowerCase() || '';
        const email = patient.email?.toLowerCase() || '';
        const patientIdStr = patient.patientId?.toLowerCase() || '';

        return (
          firstName.includes(searchLower) ||
          lastName.includes(searchLower) ||
          email.includes(searchLower) ||
          patientIdStr.includes(searchLower) ||
          `${firstName} ${lastName}`.includes(searchLower)
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SALES-REP-PATIENTS] Error listing patients', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch patients' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
