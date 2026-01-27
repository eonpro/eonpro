/**
 * Prescription Queue Count API
 * Returns the count of pending prescriptions for sidebar badge
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/provider/prescription-queue/count
 * Get count of pending prescriptions
 */
async function handleGet(_req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ count: 0 });
    }

    const count = await prisma.invoice.count({
      where: {
        clinicId: clinicId,
        status: 'PAID',
        prescriptionProcessed: false,
        // Patient must have at least one completed intake submission
        patient: {
          intakeSubmissions: {
            some: {
              status: 'completed',
            },
          },
        },
      },
    });

    return NextResponse.json({ count });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching prescription queue count', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ count: 0 });
  }
}

export const GET = withProviderAuth(handleGet);
