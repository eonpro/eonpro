/**
 * Sales Rep Patients API
 * =======================
 *
 * Get patients assigned to a specific sales representative.
 *
 * @module api/admin/sales-reps/[id]/patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
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
  context: RouteContext
): Promise<Response> {
  try {
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

    const patientIds = assignments.map((a) => a.patientId);
    const assignmentMap = new Map(assignments.map((a) => [a.patientId, a.assignedAt]));

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
    const whereClause: Record<string, unknown> = {
      id: { in: patientIds },
    };

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { patientId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get patients with pagination
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where: whereClause,
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
            },
          },
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { paidAt: 'desc' },
            take: 1,
            select: {
              paidAt: true,
              amount: true,
            },
          },
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              createdAt: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.patient.count({ where: whereClause }),
    ]);

    // Transform response
    const patientsData = patients.map((patient) => {
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

export const GET = withAdminAuth(handleGet);
