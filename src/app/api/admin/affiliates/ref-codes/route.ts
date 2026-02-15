/**
 * GET /api/admin/affiliates/ref-codes
 *
 * Returns active affiliate ref codes for the authenticated user's clinic.
 * Used by the manual attribution dropdown on the patient sidebar.
 *
 * CRITICAL: Scoped to user's clinicId for multi-tenant isolation.
 *
 * Query params:
 *   ?search=TEAM  — optional filter by ref code or affiliate name
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { serverError } from '@/lib/api/error-response';

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const search = req.nextUrl.searchParams.get('search')?.trim() || '';
    const clinicId = user.clinicId;

    // Clinic isolation is mandatory — never return cross-clinic data
    if (!clinicId) {
      return NextResponse.json({ refCodes: [] });
    }

    const refCodes = await prisma.affiliateRefCode.findMany({
      where: {
        isActive: true,
        clinicId, // MULTI-TENANT: only this clinic's codes
        ...(search
          ? {
              OR: [
                { refCode: { contains: search, mode: 'insensitive' } },
                { affiliate: { displayName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        refCode: true,
        affiliate: {
          select: {
            id: true,
            displayName: true,
            status: true,
          },
        },
      },
      orderBy: { refCode: 'asc' },
      take: 50,
    });

    return NextResponse.json({
      refCodes: refCodes.map((rc) => ({
        id: rc.id,
        code: rc.refCode,
        affiliateId: rc.affiliate.id,
        affiliateName: rc.affiliate.displayName,
        affiliateStatus: rc.affiliate.status,
      })),
    });
  } catch (error) {
    return serverError('Failed to fetch ref codes');
  }
}

export const GET = withAdminAuth(handler);
