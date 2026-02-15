/**
 * GET /api/admin/affiliates/ref-codes
 *
 * Returns all active affiliate ref codes with affiliate names.
 * Used by the manual attribution dropdown on the patient sidebar.
 *
 * Query params:
 *   ?search=TEAM  — optional filter by ref code or affiliate name
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { serverError } from '@/lib/api/error-response';

async function handler(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search')?.trim() || '';

    const refCodes = await prisma.affiliateRefCode.findMany({
      where: {
        isActive: true,
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
