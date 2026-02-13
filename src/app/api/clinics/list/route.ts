import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * GET /api/clinics/list
 * Public endpoint to get list of clinics (for dropdowns)
 * Only returns basic info (id, name, subdomain)
 */
export async function GET() {
  try {
    const clinics = await prisma.clinic.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        status: true,
      },
      orderBy: {
        name: 'asc',
      },
      take: 100,
    });

    return NextResponse.json({ clinics });
  } catch (error) {
    logger.error('Failed to fetch clinics', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch clinics', clinics: [] }, { status: 500 });
  }
}
