/**
 * Add-on queue activity for providers.
 *
 * GET /api/provider/prescription-queue/addon-activity
 * Returns pending add-on invoices and recently processed add-on invoices
 * scoped to the provider's active clinic context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
} as const;

const DEFAULT_DAYS = 3;
const MAX_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type AddonActivityRow = {
  invoiceId: number;
  patientId: string | null;
  paidAt: string | null;
  processedAt: string | null;
  product: string | null;
  source: string | null;
  stripeSubscriptionId: string | null;
};

function getProductLabel(product: string | null): string {
  if (!product) return 'Unknown';
  return product;
}

function countElite(rows: AddonActivityRow[]): number {
  return rows.filter((r) => (r.product || '').toLowerCase().includes('elite bundle')).length;
}

function countByProduct(rows: AddonActivityRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const label = getProductLabel(row.product);
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

async function handleGet(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        {
          clinicId: null,
          clinicSubdomain: null,
          windowDays: DEFAULT_DAYS,
          pending: { total: 0, elite: 0, byProduct: {}, items: [] },
          processedRecent: { total: 0, elite: 0, byProduct: {}, items: [] },
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedDays = Number.parseInt(searchParams.get('days') || `${DEFAULT_DAYS}`, 10);
    const requestedLimit = Number.parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10);
    const windowDays = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 1), MAX_DAYS)
      : DEFAULT_DAYS;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { subdomain: true },
    });

    const baseAddonFilter = {
      clinicId: user.clinicId,
      status: 'PAID' as const,
      metadata: { path: ['medicationType'], equals: 'add-on' as const },
    };

    const [pendingRows, processedRows] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          ...baseAddonFilter,
          prescriptionProcessed: false,
          patient: { profileStatus: { not: 'PENDING_COMPLETION' as const } },
        },
        select: {
          id: true,
          paidAt: true,
          prescriptionProcessedAt: true,
          metadata: true,
          patient: {
            select: {
              patientId: true,
            },
          },
        },
        orderBy: { paidAt: 'asc' },
        take: limit,
      }),
      prisma.invoice.findMany({
        where: {
          ...baseAddonFilter,
          prescriptionProcessed: true,
          prescriptionProcessedAt: { gte: since },
        },
        select: {
          id: true,
          paidAt: true,
          prescriptionProcessedAt: true,
          metadata: true,
          patient: {
            select: {
              patientId: true,
            },
          },
        },
        orderBy: { prescriptionProcessedAt: 'desc' },
        take: limit,
      }),
    ]);

    const mapRows = (rows: typeof pendingRows): AddonActivityRow[] =>
      rows.map((row) => {
        const metadata = (row.metadata as Record<string, unknown> | null) || {};
        return {
          invoiceId: row.id,
          patientId: row.patient.patientId || null,
          paidAt: row.paidAt ? row.paidAt.toISOString() : null,
          processedAt: row.prescriptionProcessedAt
            ? row.prescriptionProcessedAt.toISOString()
            : null,
          product: typeof metadata.product === 'string' ? metadata.product : null,
          source: typeof metadata.source === 'string' ? metadata.source : null,
          stripeSubscriptionId:
            typeof metadata.stripeSubscriptionId === 'string'
              ? metadata.stripeSubscriptionId
              : null,
        };
      });

    const pendingItems = mapRows(pendingRows);
    const processedItems = mapRows(processedRows);

    const responseBody = {
      clinicId: user.clinicId,
      clinicSubdomain: clinic?.subdomain || null,
      windowDays,
      asOf: new Date().toISOString(),
      pending: {
        total: pendingItems.length,
        elite: countElite(pendingItems),
        byProduct: countByProduct(pendingItems),
        items: pendingItems,
      },
      processedRecent: {
        total: processedItems.length,
        elite: countElite(processedItems),
        byProduct: countByProduct(processedItems),
        items: processedItems,
      },
    };

    return NextResponse.json(responseBody, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    logger.error('[PRESCRIPTION-QUEUE-ADDON-ACTIVITY] Failed', {
      userId: user.id,
      clinicId: user.clinicId,
      providerId: user.providerId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return handleApiError(error, {
      route: 'GET /api/provider/prescription-queue/addon-activity',
    });
  }
}

export const GET = withProviderAuth(handleGet);
