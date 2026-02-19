/**
 * Shared Patient/Order Matching for Lifefile Shipping Webhooks
 * =============================================================
 *
 * Centralized matching logic used by all clinic-specific shipping webhooks
 * (eonmeds, wellmedr, ot). Uses deterministic matching only to prevent
 * cross-patient data contamination.
 *
 * Matching strategies (in priority order):
 * 1. Exact match by lifefileOrderId or referenceId
 * 2. Patient lookup by email or patientId (with order scoped to that patient)
 *
 * If neither strategy matches, returns null so the webhook is stored as
 * "unmatched" for manual admin review — never guesses.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface FindPatientResult {
  patient: any;
  order: any;
  matchStrategy: string;
}

/**
 * Find patient and order by Lifefile order ID or patient identifiers.
 *
 * Returns null when no deterministic match can be made. Callers should
 * store the webhook payload as "unmatched" so admins can review and
 * manually link it later via /api/admin/shipping/rematch.
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
    const bestOrder = await findBestOrderForPatient(clinicId, patient.id, webhookTag);
    return { patient, order: bestOrder, matchStrategy: 'patientLookup' };
  }

  // ── No deterministic match ─────────────────────────────────────────────
  // Do NOT fall back to fuzzy/broad matching. Guessing the wrong patient
  // causes cross-patient data contamination (HIPAA violation). The caller
  // stores the record as "unmatched" for manual admin review instead.
  logger.warn(
    `[${webhookTag}] No deterministic match for lifefileOrderId=${lifefileOrderId}` +
      `${patientEmail ? `, email=${patientEmail}` : ''}` +
      `${patientId ? `, patientId=${patientId}` : ''}` +
      ` — will be stored as unmatched for admin review`
  );
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
