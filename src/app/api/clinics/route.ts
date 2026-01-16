/**
 * PUBLIC CLINICS API
 * Returns a list of all active clinics for dropdowns
 * No authentication required
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Persistence Test v1 - This comment proves deployment happened

export async function GET(request: NextRequest) {
  try {
    // Fetch all active clinics (basic info only for security)
    const clinics = await prisma.clinic.findMany({
      where: {
        status: 'ACTIVE',
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
    });

    logger.info(`[/api/clinics] Returned ${clinics.length} active clinics`);

    return NextResponse.json({
      clinics,
      count: clinics.length,
    });
  } catch (error) {
    logger.error('[/api/clinics] Failed to fetch clinics', {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 }
    );
  }
}
