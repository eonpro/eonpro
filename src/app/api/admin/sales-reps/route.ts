/**
 * Sales Representatives API
 * ==========================
 *
 * List and manage sales representatives in a clinic.
 * Includes patient assignment counts and performance metrics.
 *
 * @module api/admin/sales-reps
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/admin/sales-reps
 * List all sales reps in the clinic with patient counts
 */
async function handleGet(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Build where clause
    const whereClause: Record<string, unknown> = {
      role: 'SALES_REP',
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
    };

    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get sales reps with patient counts
    const salesReps = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        clinicId: true,
        createdAt: true,
        lastLogin: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            salesRepAssignments: {
              where: { isActive: true },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 100,
    });

    // Transform response
    const salesRepsData = salesReps.map((rep: (typeof salesReps)[number]) => ({
      id: rep.id,
      firstName: rep.firstName,
      lastName: rep.lastName,
      email: rep.email,
      status: rep.status,
      clinicId: rep.clinicId,
      clinicName: rep.clinic?.name || null,
      createdAt: rep.createdAt,
      lastLogin: rep.lastLogin,
      patientCount: rep._count.salesRepAssignments,
    }));

    logger.info('[SALES-REPS] Listed sales representatives', {
      userId: user.id,
      clinicId,
      count: salesRepsData.length,
    });

    return NextResponse.json({
      salesReps: salesRepsData,
      meta: {
        total: salesRepsData.length,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/sales-reps' });
  }
}

export const GET = withAdminAuth(handleGet);
