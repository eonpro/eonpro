/**
 * Prescription Queue Count API
 * Returns the count of pending prescriptions for sidebar badge.
 * Multi-clinic: counts invoices, refills, and queued orders across all provider's clinics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService } from '@/domains/provider';
import { logger } from '@/lib/logger';

/**
 * GET /api/provider/prescription-queue/count
 * Get count of pending prescriptions (all clinics for this provider)
 */
async function handleGet(_req: NextRequest, user: AuthUser) {
  try {
    const clinicIds = await providerService.getClinicIdsForProviderUser(user.id, user.providerId);
    if (clinicIds.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const [invoiceCount, refillCount, queuedOrderCount] = await Promise.all([
      prisma.invoice.count({
        where: {
          clinicId: { in: clinicIds },
          status: 'PAID',
          prescriptionProcessed: false,
          // Exclude patients with incomplete profiles (awaiting admin completion)
          patient: {
            profileStatus: { not: 'PENDING_COMPLETION' },
          },
        },
      }),
      prisma.refillQueue.count({
        where: {
          clinicId: { in: clinicIds },
          status: { in: ['APPROVED', 'PENDING_PROVIDER'] },
        },
      }),
      prisma.order.count({
        where: {
          clinicId: { in: clinicIds },
          status: 'queued_for_provider',
        },
      }),
    ]);

    const count = invoiceCount + refillCount + queuedOrderCount;
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
