/**
 * Stripe Card Sync Admin API
 * ==========================
 *
 * POST /api/admin/sync-stripe-cards
 *
 * Syncs saved payment methods from a clinic's Stripe account to matching
 * patient profiles. Super admin only.
 *
 * Body:
 *   clinicId        - number (required)
 *   dryRun          - boolean (default: true)
 *   includeExpired  - boolean (default: false)
 *   limit           - number  (default: 0 = unlimited)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncCardsForClinic } from '@/services/stripe/cardSyncService';

const SyncRequestSchema = z.object({
  clinicId: z.number().int().positive(),
  dryRun: z.boolean().optional().default(true),
  includeExpired: z.boolean().optional().default(false),
  limit: z.number().int().min(0).optional().default(0),
});

async function handler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = SyncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clinicId, dryRun, includeExpired, limit } = parsed.data;

    logger.info('[AdminSyncCards] Sync requested', {
      userId: user.id,
      clinicId,
      dryRun,
      includeExpired,
      limit,
    });

    const result = await runWithClinicContext(clinicId, () =>
      syncCardsForClinic(clinicId, {
        dryRun,
        includeExpired,
        limit: limit || undefined,
      }),
    );

    return NextResponse.json({
      success: result.success,
      clinicId: result.clinicId,
      dryRun: result.dryRun,
      summary: {
        stripeCustomersScanned: result.stats.stripeCustomersTotal,
        customersWithCards: result.stats.stripeCustomersWithCards,
        patientsMatched: result.stats.patientsMatched,
        cardsCreated: result.stats.cardsCreated,
        cardsUpdated: result.stats.cardsUpdated,
        cardsAlreadySynced: result.stats.cardsSkippedExisting,
        cardsSkippedExpired: result.stats.cardsSkippedExpired,
        stripeCustomerIdsLinked: result.stats.stripeCustomerIdsLinked,
        skippedNoEmail: result.stats.customersSkippedNoEmail,
        skippedNoPatient: result.stats.customersSkippedNoPatient,
        errors: result.stats.errors,
      },
      ...(result.stats.errorDetails.length > 0 && {
        errorDetails: result.stats.errorDetails.slice(0, 20),
      }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AdminSyncCards] Sync failed', { error: msg });
    return NextResponse.json({ error: 'Sync failed', details: msg }, { status: 500 });
  }
}

export const POST = withSuperAdminAuth(handler);
