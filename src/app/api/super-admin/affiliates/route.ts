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

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/affiliates
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {

    // Get all affiliates with their clinic, user, ref codes, and stats
    const affiliates = await basePrisma.affiliate.findMany({
      include: {
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
          include: {
            commissionPlan: {
              select: {
                id: true,
                name: true,
                planType: true,
                flatAmountCents: true,
                percentBps: true,
                // Separate initial/recurring rates
                initialPercentBps: true,
                initialFlatAmountCents: true,
                recurringPercentBps: true,
                recurringFlatAmountCents: true,
              },
            },
          },
          take: 1,
        },
        commissionEvents: {
          select: {
            eventAmountCents: true,
            commissionAmountCents: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all commission plans
    const plans = await basePrisma.affiliateCommissionPlan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        planType: true,
        flatAmountCents: true,
        percentBps: true,
        // Separate initial/recurring rates
        initialPercentBps: true,
        initialFlatAmountCents: true,
        recurringPercentBps: true,
        recurringFlatAmountCents: true,
        recurringEnabled: true,
        isActive: true,
        clinicId: true,
      },
    });

    // Transform data
    const transformedAffiliates = affiliates.map((affiliate) => {
      const events = affiliate.commissionEvents || [];
      const paidEvents = events.filter(e => e.status === 'PAID' || e.status === 'APPROVED');
      
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
          totalConversions: events.length,
          totalRevenueCents: events.reduce((sum, e) => sum + (e.eventAmountCents || 0), 0),
          totalCommissionCents: paidEvents.reduce((sum, e) => sum + (e.commissionAmountCents || 0), 0),
        },
      };
    });

    return NextResponse.json({
      affiliates: transformedAffiliates,
      plans,
    });
  } catch (error) {
    console.error('Failed to fetch affiliates:', error);

    // Check if this is a Prisma error indicating missing tables
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isPrismaTableError = errorMessage.includes('does not exist') ||
                               errorMessage.includes('relation') ||
                               errorMessage.includes('P2021') ||
                               errorMessage.includes('P2025');

    if (isPrismaTableError) {
      return NextResponse.json({
        error: 'Database tables not found. Please run migrations.',
        details: 'The affiliate system tables have not been created yet. Run: npx prisma migrate deploy',
        affiliates: [],
        plans: [],
      }, { status: 200 }); // Return 200 with empty data so UI doesn't break
    }

    return NextResponse.json(
      { error: 'Failed to fetch affiliates', details: errorMessage },
      { status: 500 }
    );
  }
});

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
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      );
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
    console.error('Failed to create affiliate:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isPrismaTableError = errorMessage.includes('does not exist') ||
                               errorMessage.includes('relation') ||
                               errorMessage.includes('P2021') ||
                               errorMessage.includes('P2025') ||
                               errorMessage.includes('P2003');

    if (isPrismaTableError) {
      return NextResponse.json({
        error: 'Database tables not found. Please run migrations first.',
        details: 'Run: npx prisma migrate deploy',
      }, { status: 500 });
    }

    // Check for unique constraint violations
    if (errorMessage.includes('P2002') || errorMessage.includes('Unique constraint')) {
      return NextResponse.json({
        error: 'An affiliate with this email or ref code already exists',
      }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to create affiliate', details: errorMessage },
      { status: 500 }
    );
  }
});
