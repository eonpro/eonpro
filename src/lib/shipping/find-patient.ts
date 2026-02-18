/**
 * Shared Patient/Order Matching for Lifefile Shipping Webhooks
 * =============================================================
 *
 * Centralized matching logic used by all clinic-specific shipping webhooks
 * (eonmeds, wellmedr, ot). Replaces the per-webhook findPatient function
 * with a more robust, multi-strategy approach.
 *
 * Matching strategies (in priority order):
 * 1. Exact match by lifefileOrderId or referenceId
 * 2. Patient lookup by email or patientId
 * 3. Fuzzy match: recent untracked Lifefile orders in the clinic
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface FindPatientResult {
  patient: any;
  order: any;
  matchStrategy: string;
}

/**
 * Find patient and order by Lifefile order ID, patient identifiers, or fuzzy matching.
 *
 * Returns null ONLY when absolutely no patient can be found in the clinic.
 */
export async function findPatientForShipping(
  clinicId: number,
  lifefileOrderId: string,
  webhookTag: string,
  patientEmail?: string,
  patientId?: string
): Promise<FindPatientResult | null> {
  // ── Strategy 1: Exact match by lifefileOrderId or referenceId ──────────
  const order = await prisma.order.findFirst({
    where: {
      clinicId,
      OR: [{ lifefileOrderId }, { referenceId: lifefileOrderId }],
    },
    include: { patient: true },
  });

  if (order) {
    logger.info(`[${webhookTag}] Matched by lifefileOrderId/referenceId → order ${order.id}`);
    return { patient: order.patient, order, matchStrategy: 'lifefileOrderId' };
  }

  // ── Strategy 2: Patient lookup by email or external patientId ──────────
  let patient = null;

  if (patientEmail) {
    patient = await prisma.patient.findFirst({
      where: { clinicId, email: patientEmail.toLowerCase() },
    });
    if (patient) {
      logger.info(`[${webhookTag}] Matched patient by email → patient ${patient.id}`);
    }
  }

  if (!patient && patientId) {
    patient = await prisma.patient.findFirst({
      where: { clinicId, patientId },
    });
    if (patient) {
      logger.info(`[${webhookTag}] Matched patient by patientId → patient ${patient.id}`);
    }
  }

  if (patient) {
    // Try to find the best order for this patient
    const bestOrder = await findBestOrderForPatient(clinicId, patient.id, webhookTag);
    return { patient, order: bestOrder, matchStrategy: 'patientLookup' };
  }

  // ── Strategy 3: Recent untracked Lifefile order in the clinic ──────────
  // Look for orders that were sent to Lifefile but don't have tracking yet.
  // If there's exactly ONE such order, it's very likely the match.
  const untrackedLifefileOrders = await prisma.order.findMany({
    where: {
      clinicId,
      lifefileOrderId: { not: null },
      trackingNumber: null,
      status: { in: ['sent', 'approved', 'processing'] },
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, // 14 days
    },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (untrackedLifefileOrders.length === 1) {
    const match = untrackedLifefileOrders[0];
    logger.info(
      `[${webhookTag}] Fuzzy match: single untracked Lifefile order ${match.id} for patient ${match.patientId}`
    );
    return { patient: match.patient, order: match, matchStrategy: 'fuzzy_single_untracked' };
  }

  if (untrackedLifefileOrders.length > 1) {
    // Multiple untracked orders -- pick the most recent one
    const match = untrackedLifefileOrders[0];
    logger.info(
      `[${webhookTag}] Fuzzy match: most recent of ${untrackedLifefileOrders.length} untracked orders → order ${match.id}`
    );
    return { patient: match.patient, order: match, matchStrategy: 'fuzzy_most_recent' };
  }

  // ── Strategy 4: Any recent order without tracking in the clinic ────────
  // Broadest fallback -- any order created recently without tracking
  const anyRecentOrder = await prisma.order.findFirst({
    where: {
      clinicId,
      trackingNumber: null,
      status: { notIn: ['cancelled', 'error', 'draft'] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // 7 days
    },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
  });

  if (anyRecentOrder) {
    logger.warn(
      `[${webhookTag}] Broad fallback: matched to most recent untracked order ${anyRecentOrder.id} ` +
        `(patient ${anyRecentOrder.patientId}). Verify this is correct.`
    );
    return { patient: anyRecentOrder.patient, order: anyRecentOrder, matchStrategy: 'broad_fallback' };
  }

  // ── No match at all ────────────────────────────────────────────────────
  logger.warn(`[${webhookTag}] No patient/order match found for lifefileOrderId=${lifefileOrderId}`);
  return null;
}

/**
 * Find the best order for a known patient (used when patient was found by email/id).
 */
async function findBestOrderForPatient(
  clinicId: number,
  patientId: number,
  webhookTag: string
): Promise<any> {
  // Prefer an order without tracking (most likely the one being shipped)
  const untrackedOrder = await prisma.order.findFirst({
    where: {
      clinicId,
      patientId,
      OR: [{ lifefileOrderId: null }, { lifefileOrderId: '' }, { trackingNumber: null }],
    },
    orderBy: { createdAt: 'desc' },
    include: { patient: true },
  });

  if (untrackedOrder) {
    logger.info(`[${webhookTag}] Found untracked order ${untrackedOrder.id} for patient ${patientId}`);
    return untrackedOrder;
  }

  // Fall back to any recent order
  const recentOrder = await prisma.order.findFirst({
    where: {
      clinicId,
      patientId,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    include: { patient: true },
  });

  if (recentOrder) {
    logger.info(`[${webhookTag}] Found recent order ${recentOrder.id} for patient ${patientId}`);
    return recentOrder;
  }

  return null;
}
