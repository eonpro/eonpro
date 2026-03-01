/**
 * Duplicate Prescription Check
 * ============================
 *
 * Detects recent prescriptions for a patient within a configurable window
 * (default 3 days) to prevent accidental duplicate prescriptions.
 *
 * Used by:
 *   - Provider prescription queue (batch check for all queue patients)
 *   - Admin RX queue (batch check for all queue patients)
 *   - Patient profile prescription modal (single-patient check)
 *
 * @module domains/prescription/services/duplicate-rx-check
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const DUPLICATE_WINDOW_DAYS = 3;

export interface RecentPrescription {
  orderId: number;
  createdAt: Date;
  status: string | null;
  primaryMedName: string | null;
  primaryMedStrength: string | null;
  providerId: number;
  providerName?: string;
}

export interface DuplicateRxCheckResult {
  hasDuplicate: boolean;
  recentOrders: RecentPrescription[];
  windowDays: number;
}

/**
 * Check for recent prescriptions for a single patient within the last N days.
 * Excludes cancelled and declined orders.
 */
export async function checkRecentPrescriptions(
  patientId: number,
  windowDays: number = DUPLICATE_WINDOW_DAYS
): Promise<DuplicateRxCheckResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  try {
    const recentOrders = await prisma.order.findMany({
      where: {
        patientId,
        createdAt: { gte: cutoff },
        cancelledAt: null,
        status: { notIn: ['error', 'cancelled', 'declined'] },
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        primaryMedName: true,
        primaryMedStrength: true,
        providerId: true,
        provider: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      hasDuplicate: recentOrders.length > 0,
      recentOrders: recentOrders.map((o) => ({
        orderId: o.id,
        createdAt: o.createdAt,
        status: o.status,
        primaryMedName: o.primaryMedName,
        primaryMedStrength: o.primaryMedStrength,
        providerId: o.providerId,
        providerName:
          o.provider ? `${o.provider.firstName} ${o.provider.lastName}` : undefined,
      })),
      windowDays,
    };
  } catch (err) {
    logger.error('[DuplicateRxCheck] Failed to check recent prescriptions', {
      patientId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return { hasDuplicate: false, recentOrders: [], windowDays };
  }
}

/**
 * Batch check for recent prescriptions across multiple patients.
 * Returns a map of patientId -> DuplicateRxCheckResult.
 * Optimized for queue views to avoid N+1 queries.
 */
export async function batchCheckRecentPrescriptions(
  patientIds: number[],
  windowDays: number = DUPLICATE_WINDOW_DAYS
): Promise<Map<number, DuplicateRxCheckResult>> {
  const results = new Map<number, DuplicateRxCheckResult>();

  if (patientIds.length === 0) return results;

  const uniqueIds = [...new Set(patientIds)];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  try {
    const recentOrders = await prisma.order.findMany({
      where: {
        patientId: { in: uniqueIds },
        createdAt: { gte: cutoff },
        cancelledAt: null,
        status: { notIn: ['error', 'cancelled', 'declined'] },
      },
      select: {
        id: true,
        patientId: true,
        createdAt: true,
        status: true,
        primaryMedName: true,
        primaryMedStrength: true,
        providerId: true,
        provider: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by patientId
    const grouped = new Map<number, typeof recentOrders>();
    for (const order of recentOrders) {
      const existing = grouped.get(order.patientId) || [];
      existing.push(order);
      grouped.set(order.patientId, existing);
    }

    for (const pid of uniqueIds) {
      const orders = grouped.get(pid) || [];
      results.set(pid, {
        hasDuplicate: orders.length > 0,
        recentOrders: orders.map((o) => ({
          orderId: o.id,
          createdAt: o.createdAt,
          status: o.status,
          primaryMedName: o.primaryMedName,
          primaryMedStrength: o.primaryMedStrength,
          providerId: o.providerId,
          providerName:
            o.provider ? `${o.provider.firstName} ${o.provider.lastName}` : undefined,
        })),
        windowDays,
      });
    }

    logger.info('[DuplicateRxCheck] Batch check complete', {
      patientsChecked: uniqueIds.length,
      patientsWithRecent: [...results.values()].filter((r) => r.hasDuplicate).length,
    });
  } catch (err) {
    logger.error('[DuplicateRxCheck] Batch check failed', {
      patientCount: uniqueIds.length,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    for (const pid of uniqueIds) {
      results.set(pid, { hasDuplicate: false, recentOrders: [], windowDays });
    }
  }

  return results;
}
