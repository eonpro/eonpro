/**
 * Super Admin Affiliates API
 *
 * GET - List all affiliates across all clinics
 * POST - Create a new affiliate for a specific clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { superAdminRateLimit } from '@/lib/rateLimit';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/affiliates
 */
export const GET = superAdminRateLimit(withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Parse pagination params
    const searchParams = req.nextUrl.searchParams;
    const take = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);
    const skip = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch affiliates WITHOUT the unbounded commissionEvents include.
    // Previously: commissionEvents loaded ALL events per affiliate (could be 1000s each).
    // Now: We use a separate groupBy aggregation for stats (1 query instead of N×M rows).
    const [affiliates, plans, totalCount] = await Promise.all([
      basePrisma.affiliate.findMany({
        select: {
          id: true,
          displayName: true,
          status: true,
          createdAt: true,
          clinicId: true,
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              lastLogin: true,
              status: true,
            },
          },
          refCodes: {
            where: { isActive: true },
            select: {
              id: true,
              refCode: true,
              isActive: true,
            },
          },
          planAssignments: {
            where: { effectiveTo: null },
            select: {
              commissionPlan: {
                select: {
                  id: true,
                  name: true,
                  planType: true,
                  flatAmountCents: true,
                  percentBps: true,
                  initialPercentBps: true,
                  initialFlatAmountCents: true,
                  recurringPercentBps: true,
                  recurringFlatAmountCents: true,
                },
              },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      basePrisma.affiliateCommissionPlan.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          planType: true,
          flatAmountCents: true,
          percentBps: true,
          initialPercentBps: true,
          initialFlatAmountCents: true,
          recurringPercentBps: true,
          recurringFlatAmountCents: true,
          recurringEnabled: true,
          isActive: true,
          clinicId: true,
        },
      }),
      basePrisma.affiliate.count(),
    ]);

    // Get aggregated commission stats per affiliate in a single query
    const affiliateIds = affiliates.map(a => a.id);
    const commissionStats = affiliateIds.length > 0
      ? await basePrisma.affiliateCommissionEvent.groupBy({
          by: ['affiliateId'],
          where: { affiliateId: { in: affiliateIds } },
          _sum: {
            eventAmountCents: true,
            commissionAmountCents: true,
          },
          _count: true,
        })
      : [];

    // Also get paid/approved commission totals
    const paidCommissionStats = affiliateIds.length > 0
      ? await basePrisma.affiliateCommissionEvent.groupBy({
          by: ['affiliateId'],
          where: {
            affiliateId: { in: affiliateIds },
            status: { in: ['PAID', 'APPROVED'] },
          },
          _sum: { commissionAmountCents: true },
        })
      : [];

    const statsMap = new Map(commissionStats.map(s => [s.affiliateId, s]));
    const paidMap = new Map(paidCommissionStats.map(s => [s.affiliateId, s._sum.commissionAmountCents || 0]));

    // Transform data using aggregated stats
    const transformedAffiliates = affiliates.map((affiliate) => {
      const aggStats = statsMap.get(affiliate.id);
      return {
        id: affiliate.id,
        displayName: affiliate.displayName,
        status: affiliate.status,
        createdAt: affiliate.createdAt.toISOString(),
        clinicId: affiliate.clinicId,
        clinic: affiliate.clinic,
        user: affiliate.user,
        refCodes: affiliate.refCodes,
        currentPlan: affiliate.planAssignments[0]?.commissionPlan || null,
        stats: {
          totalConversions: aggStats?._count || 0,
          totalRevenueCents: aggStats?._sum.eventAmountCents || 0,
          totalCommissionCents: paidMap.get(affiliate.id) || 0,
        },
      };
    });

    return NextResponse.json({
      affiliates: transformedAffiliates,
      plans,
      pagination: {
        total: totalCount,
        limit: take,
        offset: skip,
        hasMore: skip + affiliates.length < totalCount,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.constructor.name : 'Unknown';
    const errorStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : '';

    logger.error('Failed to fetch affiliates', {
      error: errorMessage,
      errorName,
      errorStack,
    });

    // Check if this is a Prisma error indicating missing tables/columns
    const isPrismaSchemaError =
      errorMessage.includes('does not exist') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('P2021') ||
      errorMessage.includes('P2022') ||
      errorMessage.includes('P2025') ||
      errorMessage.includes('Unknown field') ||
      errorMessage.includes('Unknown arg') ||
      errorName === 'PrismaClientValidationError';

    if (isPrismaSchemaError) {
      return NextResponse.json(
        {
          error: 'Database schema mismatch. Please run migrations.',
          details: `Run: npx prisma migrate deploy (${errorMessage.substring(0, 200)})`,
          affiliates: [],
          plans: [],
        },
        { status: 200 }
      ); // Return 200 with empty data so UI doesn't break
    }

    return NextResponse.json(
      { error: 'Failed to fetch affiliates', details: errorMessage.substring(0, 500) },
      { status: 500 }
    );
  }
}));

/**
 * POST /api/super-admin/affiliates
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const {
      clinicId,
      email,
      password,
      displayName,
      firstName,
      lastName,
      initialRefCode,
      commissionPlanId,
    } = body;

    // Validate required fields
    if (!clinicId || !email || !password || !displayName) {
      return NextResponse.json(
        { error: 'Clinic, email, password, and display name are required' },
        { status: 400 }
      );
    }

    // Check if clinic exists
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Check if user already exists
    const existingUser = await basePrisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Create user and affiliate in a transaction
    const result = await basePrisma.$transaction(async (tx) => {
      // Create user
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          firstName: firstName || displayName.split(' ')[0],
          lastName: lastName || displayName.split(' ').slice(1).join(' ') || '',
          role: 'AFFILIATE',
          clinicId,
          status: 'ACTIVE',
        },
      });

      // Create affiliate
      const affiliate = await tx.affiliate.create({
        data: {
          clinicId,
          userId: user.id,
          displayName,
          status: 'ACTIVE',
        },
      });

      // Create initial ref code if provided
      if (initialRefCode) {
        await tx.affiliateRefCode.create({
          data: {
            clinicId,
            affiliateId: affiliate.id,
            refCode: initialRefCode.toUpperCase(),
            isActive: true,
          },
        });
      } else {
        // Generate a ref code based on display name
        const baseCode = displayName
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .substring(0, 8);
        const refCode = `${baseCode}${Math.floor(Math.random() * 1000)}`;

        await tx.affiliateRefCode.create({
          data: {
            clinicId,
            affiliateId: affiliate.id,
            refCode,
            isActive: true,
          },
        });
      }

      // Assign commission plan if provided
      if (commissionPlanId) {
        await tx.affiliatePlanAssignment.create({
          data: {
            clinicId,
            affiliateId: affiliate.id,
            commissionPlanId,
            effectiveFrom: new Date(),
          },
        });
      }

      return { user, affiliate };
    });

    return NextResponse.json({
      success: true,
      affiliateId: result.affiliate.id,
      userId: result.user.id,
    });
  } catch (error) {
    logger.error('Failed to create affiliate', { error: error instanceof Error ? error.message : String(error) });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isPrismaTableError =
      errorMessage.includes('does not exist') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('P2021') ||
      errorMessage.includes('P2025') ||
      errorMessage.includes('P2003');

    if (isPrismaTableError) {
      return NextResponse.json(
        {
          error: 'Database tables not found. Please run migrations first.',
          details: 'Run: npx prisma migrate deploy',
        },
        { status: 500 }
      );
    }

    // Check for unique constraint violations
    if (errorMessage.includes('P2002') || errorMessage.includes('Unique constraint')) {
      return NextResponse.json(
        {
          error: 'An affiliate with this email or ref code already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create affiliate', details: errorMessage },
      { status: 500 }
    );
  }
});
