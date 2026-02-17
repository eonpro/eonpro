/**
 * Admin Affiliates API
 *
 * GET  /api/admin/affiliates - List affiliates for clinic
 * POST /api/admin/affiliates - Create new affiliate
 *
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, Prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

const createAffiliateSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: z.string().min(1, 'Display name is required').max(200),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  initialRefCode: z
    .string()
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Ref code may only contain letters, numbers, hyphens, and underscores')
    .optional(),
  commissionPlanId: z.number().int().positive().optional(),
  clinicId: z.number().int().positive().optional(),
});

// GET - List affiliates for clinic
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    // HIPAA audit: log admin access to affiliate list
    logger.security('[AffiliateAudit] Admin accessed affiliate list', {
      adminUserId: user.id,
      adminRole: user.role,
      route: '/api/admin/affiliates',
      clinicId: user.clinicId,
    });

    try {
      const { searchParams } = new URL(req.url);
      const clinicId =
        user.role === 'super_admin'
          ? searchParams.get('clinicId')
            ? parseInt(searchParams.get('clinicId')!)
            : undefined
          : user.clinicId;

      if (!clinicId && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
      }

      const affiliates = await prisma.affiliate.findMany({
        where: clinicId ? { clinicId } : {},
        include: {
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
            select: {
              id: true,
              refCode: true,
              isActive: true,
            },
          },
          planAssignments: {
            where: {
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
            },
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
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              commissionEvents: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get aggregated stats for each affiliate (clicks, intakes, conversions, revenue)
      const affiliatesWithStats = await Promise.all(
        affiliates.map(async (affiliate: (typeof affiliates)[number]) => {
          const refCodeStrings = affiliate.refCodes.map((rc) => rc.refCode);

          // Run all stat queries in parallel
          const [commissionStats, intakeCount, clickCount] = await Promise.all([
            prisma.affiliateCommissionEvent.aggregate({
              where: { affiliateId: affiliate.id, status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
              _sum: {
                commissionAmountCents: true,
                eventAmountCents: true,
              },
              _count: true,
            }),
            prisma.patient.count({
              where: { attributionAffiliateId: affiliate.id },
            }),
            refCodeStrings.length > 0
              ? prisma.affiliateTouch.count({
                  where: {
                    refCode: { in: refCodeStrings },
                    touchType: 'CLICK',
                  },
                })
              : Promise.resolve(0),
          ]);

          return {
            id: affiliate.id,
            displayName: affiliate.displayName,
            status: affiliate.status,
            createdAt: affiliate.createdAt,
            user: affiliate.user,
            refCodes: affiliate.refCodes,
            currentPlan: affiliate.planAssignments[0]?.commissionPlan || null,
            stats: {
              totalClicks: clickCount,
              totalIntakes: intakeCount,
              totalPaymentConversions: commissionStats._count,
              totalRevenueCents: commissionStats._sum.eventAmountCents || 0,
              totalCommissionCents: commissionStats._sum.commissionAmountCents || 0,
            },
          };
        })
      );

      return NextResponse.json({
        affiliates: affiliatesWithStats,
        total: affiliatesWithStats.length,
      });
    } catch (error) {
      logger.error('[Admin Affiliates] Error listing affiliates', error);
      return NextResponse.json({ error: 'Failed to list affiliates' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// POST - Create new affiliate
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const body = await req.json();
      const parsed = createAffiliateSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Invalid input', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const {
        clinicId: bodyClinicId,
        email,
        password,
        firstName,
        lastName,
        displayName,
        initialRefCode,
        commissionPlanId,
      } = parsed.data;

      // Determine clinic ID
      const clinicId = user.role === 'super_admin' && bodyClinicId ? bodyClinicId : user.clinicId;

      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
      }

      // Check if user with email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return NextResponse.json(
          {
            error: 'User with this email already exists',
          },
          { status: 409 }
        );
      }

      // Check if ref code is unique in clinic (if provided)
      if (initialRefCode) {
        const existingRefCode = await prisma.affiliateRefCode.findUnique({
          where: {
            clinicId_refCode: {
              clinicId,
              refCode: initialRefCode.toUpperCase(),
            },
          },
        });

        if (existingRefCode) {
          return NextResponse.json(
            {
              error: 'Ref code already exists in this clinic',
            },
            { status: 409 }
          );
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user and affiliate in transaction
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Create user account
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash,
            firstName: firstName || displayName.split(' ')[0] || 'Affiliate',
            lastName: lastName || displayName.split(' ').slice(1).join(' ') || '',
            role: 'AFFILIATE',
            clinicId,
            status: 'ACTIVE',
          },
        });

        // Create affiliate profile
        const newAffiliate = await tx.affiliate.create({
          data: {
            clinicId,
            userId: newUser.id,
            displayName,
            status: 'ACTIVE',
          },
        });

        // Create initial ref code if provided
        if (initialRefCode) {
          await tx.affiliateRefCode.create({
            data: {
              clinicId,
              affiliateId: newAffiliate.id,
              refCode: initialRefCode.toUpperCase(),
              isActive: true,
            },
          });
        }

        // Assign commission plan if provided
        if (commissionPlanId) {
          await tx.affiliatePlanAssignment.create({
            data: {
              clinicId,
              affiliateId: newAffiliate.id,
              commissionPlanId,
              effectiveFrom: new Date(),
            },
          });
        }

        return { user: newUser, affiliate: newAffiliate };
      }, { timeout: 15000 });

      logger.info('[Admin Affiliates] Created new affiliate', {
        affiliateId: result.affiliate.id,
        userId: result.user.id,
        clinicId,
        createdBy: user.id,
      });

      return NextResponse.json(
        {
          success: true,
          affiliate: {
            id: result.affiliate.id,
            displayName: result.affiliate.displayName,
            email: result.user.email,
            status: result.affiliate.status,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error('[Admin Affiliates] Error creating affiliate', error);
      return NextResponse.json({ error: 'Failed to create affiliate' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
