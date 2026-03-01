/**
 * Refill Queue Service
 * ====================
 *
 * Manages prescription refill scheduling and approval workflow.
 *
 * Flow: Patient subscription → Scheduled refill → Payment check → Admin approval → Provider queue → Lifefile
 *
 * Key concepts:
 * - Vial count determines refill interval (1 vial = 30 days, 3 vials = 90 days, 6 vials = 180 days)
 * - Refills are scheduled automatically based on subscription plan
 * - Payment must be verified before admin approval (auto-match for Stripe clinics)
 * - Admin must approve before provider can prescribe
 * - Provider submits prescription to Lifefile, then next refill is scheduled
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type {
  RefillQueue,
  RefillStatus,
  PaymentVerificationMethod,
  Subscription,
  Patient,
  Clinic,
  Invoice,
  Order,
} from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface ScheduleRefillInput {
  clinicId: number;
  patientId: number;
  subscriptionId?: number;
  vialCount: number;
  lastOrderId?: number;
  medicationName?: string;
  medicationStrength?: string;
  medicationForm?: string;
  planName?: string;
  nextRefillDate?: Date;
  // Multi-shipment tracking (BUD)
  shipmentNumber?: number;
  totalShipments?: number;
  parentRefillId?: number;
  budDays?: number;
}

export interface RefillQueueWithRelations extends RefillQueue {
  patient?: Patient;
  subscription?: Subscription | null;
  clinic?: Clinic;
  lastOrder?: Order | null;
  order?: Order | null;
  invoice?: Invoice | null;
}

export interface RefillQueueFilters {
  clinicId?: number;
  patientId?: number;
  status?: RefillStatus | RefillStatus[];
  dueBefore?: Date;
  dueAfter?: Date;
}

export interface PaymentVerificationInput {
  refillId: number;
  method: PaymentVerificationMethod;
  verifiedBy: number;
  paymentReference?: string;
  stripePaymentId?: string;
  invoiceId?: number;
}

export interface AdminApprovalInput {
  refillId: number;
  approved: boolean;
  adminUserId: number;
  notes?: string;
}

export interface EarlyRefillRequestInput {
  patientId: number;
  subscriptionId?: number;
  notes?: string;
  clinicId: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Map vial count to refill interval in days */
export const VIAL_TO_INTERVAL_DAYS: Record<number, number> = {
  1: 30, // Monthly
  3: 90, // Quarterly (3 months)
  6: 180, // Semi-annual (6 months)
};

/** Default vial count if not specified */
export const DEFAULT_VIAL_COUNT = 1;

/** Default refill interval in days */
export const DEFAULT_REFILL_INTERVAL_DAYS = 30;

/** Status that indicate refill is in an active/pending state */
export const ACTIVE_REFILL_STATUSES: RefillStatus[] = [
  'SCHEDULED',
  'PENDING_PAYMENT',
  'PENDING_ADMIN',
  'APPROVED',
  'PENDING_PROVIDER',
];

/** Status that allow payment verification */
export const PAYMENT_VERIFIABLE_STATUSES: RefillStatus[] = ['PENDING_PAYMENT'];

/** Status that allow admin approval */
export const ADMIN_APPROVABLE_STATUSES: RefillStatus[] = ['PENDING_ADMIN'];

/** Status that indicate refill is ready for provider */
export const PROVIDER_QUEUE_STATUSES: RefillStatus[] = ['APPROVED', 'PENDING_PROVIDER'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate refill interval days from vial count
 */
export function calculateIntervalDays(vialCount: number): number {
  return VIAL_TO_INTERVAL_DAYS[vialCount] || DEFAULT_REFILL_INTERVAL_DAYS;
}

/**
 * Calculate vial count from billing plan category
 */
export function vialCountFromPlanCategory(category: string | null | undefined): number {
  if (!category) return DEFAULT_VIAL_COUNT;
  if (category.includes('_6month')) return 6;
  if (category.includes('_3month')) return 3;
  return 1; // Monthly or single
}

/**
 * Calculate next refill date based on interval
 */
export function calculateNextRefillDate(fromDate: Date, intervalDays: number): Date {
  const next = new Date(fromDate);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

// ============================================================================
// Core Service Functions
// ============================================================================

/**
 * Schedule a new refill for a patient
 */
export async function scheduleRefill(input: ScheduleRefillInput): Promise<RefillQueue> {
  const {
    clinicId,
    patientId,
    subscriptionId,
    vialCount,
    lastOrderId,
    medicationName,
    medicationStrength,
    medicationForm,
    planName,
    nextRefillDate,
    // Multi-shipment tracking
    shipmentNumber,
    totalShipments,
    parentRefillId,
    budDays,
  } = input;

  const intervalDays = calculateIntervalDays(vialCount);
  const refillDate = nextRefillDate || calculateNextRefillDate(new Date(), intervalDays);

  const refill = await prisma.refillQueue.create({
    data: {
      clinicId,
      patientId,
      subscriptionId,
      lastOrderId,
      vialCount,
      refillIntervalDays: intervalDays,
      nextRefillDate: refillDate,
      status: 'SCHEDULED',
      medicationName,
      medicationStrength,
      medicationForm,
      planName,
      // Multi-shipment tracking (BUD)
      shipmentNumber: shipmentNumber ?? 1,
      totalShipments: totalShipments ?? 1,
      parentRefillId,
      budDays: budDays ?? 90,
    },
  });

  // Update subscription with last refill queue ID
  if (subscriptionId) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        lastRefillQueueId: refill.id,
        vialCount,
        refillIntervalDays: intervalDays,
      },
    });
  }

  logger.info('[RefillQueue] Scheduled new refill', {
    refillId: refill.id,
    patientId,
    subscriptionId,
    vialCount,
    nextRefillDate: refillDate,
    shipmentNumber: shipmentNumber ?? 1,
    totalShipments: totalShipments ?? 1,
  });

  return refill;
}

/**
 * Schedule refill from subscription (called when subscription is created/renewed)
 *
 * For multi-month packages (6+months), this creates a multi-shipment schedule
 * based on medication Beyond Use Date (BUD) constraints.
 *
 * @param subscriptionOrId - Either a Subscription object or a subscription ID
 * @param options - Optional configuration
 */
export async function scheduleRefillFromSubscription(
  subscriptionOrId: (Subscription & { patient?: Patient }) | number,
  options?: {
    /** Override the default BUD (Beyond Use Date) in days */
    budDays?: number;
    /** Force multi-shipment even for shorter packages */
    forceMultiShipment?: boolean;
  }
): Promise<RefillQueue | null> {
  // Fetch subscription if ID was passed
  let subscription: Subscription & { patient?: Patient };

  if (typeof subscriptionOrId === 'number') {
    const fetched = await prisma.subscription.findUnique({
      where: { id: subscriptionOrId },
      include: { patient: true },
    });

    if (!fetched) {
      logger.warn('[RefillQueue] Cannot schedule refill: subscription not found', {
        subscriptionId: subscriptionOrId,
      });
      return null;
    }
    subscription = fetched;
  } else {
    subscription = subscriptionOrId;
  }

  // Determine vial count from plan category or subscription field
  const vialCount =
    subscription.vialCount || vialCountFromPlanCategory(subscription.planId) || DEFAULT_VIAL_COUNT;

  if (!subscription.clinicId) {
    logger.warn('[RefillQueue] Cannot schedule refill: subscription has no clinicId', {
      subscriptionId: subscription.id,
    });
    return null;
  }

  // Import shipment schedule service dynamically to avoid circular dependencies
  const {
    createShipmentScheduleForSubscription,
    getPackageMonthsFromSubscription,
    requiresMultiShipment,
    DEFAULT_BUD_DAYS,
  } = await import('@/lib/shipment-schedule');

  // Check if this is a multi-month package that needs multi-shipment scheduling
  const packageMonths = getPackageMonthsFromSubscription(subscription);
  const budDays = options?.budDays ?? DEFAULT_BUD_DAYS;
  const needsMultiShipment =
    options?.forceMultiShipment || requiresMultiShipment(packageMonths, budDays);

  if (needsMultiShipment) {
    logger.info('[RefillQueue] Detected multi-month package, creating shipment schedule', {
      subscriptionId: subscription.id,
      packageMonths,
      budDays,
    });

    try {
      const { shipments, totalShipments } = await createShipmentScheduleForSubscription(
        subscription.id,
        options?.budDays
      );

      logger.info('[RefillQueue] Created multi-shipment schedule', {
        subscriptionId: subscription.id,
        totalShipments,
        firstShipmentId: shipments[0]?.id,
      });

      // Return the first shipment (immediate one)
      return shipments[0] || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        '[RefillQueue] Failed to create multi-shipment schedule, falling back to single refill',
        {
          subscriptionId: subscription.id,
          error: message,
        }
      );
      // Fall through to single refill scheduling
    }
  }

  // Standard single refill scheduling
  return scheduleRefill({
    clinicId: subscription.clinicId,
    patientId: subscription.patientId,
    subscriptionId: subscription.id,
    vialCount,
    planName: subscription.planName,
    // Schedule first refill at end of current period
    nextRefillDate: subscription.currentPeriodEnd,
  });
}

/**
 * Get refills that are due for processing (status = SCHEDULED and nextRefillDate <= today)
 */
export async function getDueRefills(clinicId?: number): Promise<RefillQueue[]> {
  const now = new Date();

  const where: any = {
    status: 'SCHEDULED',
    nextRefillDate: { lte: now },
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  return prisma.refillQueue.findMany({
    where,
    include: {
      patient: true,
      subscription: true,
      clinic: true,
    },
    orderBy: { nextRefillDate: 'asc' },
  });
}

/**
 * Move due refills from SCHEDULED to PENDING_PAYMENT
 */
export async function processDueRefills(
  clinicId?: number
): Promise<{ processed: number; errors: string[] }> {
  const dueRefills = await getDueRefills(clinicId);
  const errors: string[] = [];
  let processed = 0;

  for (const refill of dueRefills) {
    try {
      await prisma.refillQueue.update({
        where: { id: refill.id },
        data: { status: 'PENDING_PAYMENT' },
      });
      processed++;

      logger.info('[RefillQueue] Moved refill to PENDING_PAYMENT', {
        refillId: refill.id,
        patientId: refill.patientId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Refill ${refill.id}: ${message}`);
      logger.error('[RefillQueue] Error processing due refill', {
        refillId: refill.id,
        error: message,
      });
    }
  }

  return { processed, errors };
}

/**
 * Verify payment for a refill
 */
export async function verifyPayment(input: PaymentVerificationInput): Promise<RefillQueue> {
  const { refillId, method, verifiedBy, paymentReference, stripePaymentId, invoiceId } = input;

  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
  });

  if (!refill) {
    throw new Error(`Refill not found: ${refillId}`);
  }

  if (!PAYMENT_VERIFIABLE_STATUSES.includes(refill.status)) {
    throw new Error(`Refill ${refillId} is not in a verifiable status: ${refill.status}`);
  }

  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      paymentVerified: true,
      paymentVerifiedAt: new Date(),
      paymentVerifiedBy: verifiedBy,
      paymentMethod: method,
      paymentReference,
      stripePaymentId,
      invoiceId,
      status: 'PENDING_ADMIN',
    },
  });

  logger.info('[RefillQueue] Payment verified', {
    refillId,
    method,
    verifiedBy,
    stripePaymentId,
  });

  return updated;
}

/**
 * Auto-match payment for refills in Stripe-enabled clinics
 */
export async function autoMatchPaymentForRefill(refillId: number): Promise<boolean> {
  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
    include: {
      patient: true,
      clinic: true,
      subscription: true,
    },
  });

  if (!refill || !refill.patient) {
    logger.warn('[RefillQueue] Cannot auto-match: refill or patient not found', { refillId });
    return false;
  }

  // Check if clinic has Stripe enabled
  if (!refill.clinic?.stripeAccountId && !refill.clinic?.stripePlatformAccount) {
    logger.debug('[RefillQueue] Clinic does not have Stripe, skipping auto-match', {
      refillId,
      clinicId: refill.clinicId,
    });
    return false;
  }

  // Find recent payments for this patient after the refill date
  const recentPayment = await prisma.payment.findFirst({
    where: {
      patientId: refill.patientId,
      clinicId: refill.clinicId,
      status: 'SUCCEEDED',
      createdAt: {
        gte: new Date(refill.nextRefillDate.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before
      },
    },
    include: {
      invoice: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentPayment) {
    await verifyPayment({
      refillId,
      method: 'STRIPE_AUTO',
      verifiedBy: 0, // System
      stripePaymentId: recentPayment.stripePaymentIntentId || undefined,
      invoiceId: recentPayment.invoiceId || undefined,
    });

    logger.info('[RefillQueue] Auto-matched payment', {
      refillId,
      paymentId: recentPayment.id,
      patientId: refill.patientId,
    });

    return true;
  }

  return false;
}

/**
 * Approve or reject a refill (admin action)
 */
export async function processAdminApproval(input: AdminApprovalInput): Promise<RefillQueue> {
  const { refillId, approved, adminUserId, notes } = input;

  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
  });

  if (!refill) {
    throw new Error(`Refill not found: ${refillId}`);
  }

  if (!ADMIN_APPROVABLE_STATUSES.includes(refill.status)) {
    throw new Error(`Refill ${refillId} is not ready for admin approval: ${refill.status}`);
  }

  const newStatus: RefillStatus = approved ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      adminApproved: approved,
      adminApprovedAt: new Date(),
      adminApprovedBy: adminUserId,
      adminNotes: notes,
      status: newStatus,
      providerQueuedAt: approved ? new Date() : undefined,
    },
  });

  logger.info('[RefillQueue] Admin processed refill', {
    refillId,
    approved,
    adminUserId,
    newStatus,
  });

  // Notify providers when refill is approved (non-blocking)
  if (approved) {
    notifyRefillApproved(updated).catch(() => {});
  }

  return updated;
}

/**
 * Approve refill and move to provider queue
 */
export async function approveRefill(
  refillId: number,
  adminUserId: number,
  notes?: string
): Promise<RefillQueue> {
  return processAdminApproval({
    refillId,
    approved: true,
    adminUserId,
    notes,
  });
}

/**
 * Reject refill
 */
export async function rejectRefill(
  refillId: number,
  adminUserId: number,
  reason: string
): Promise<RefillQueue> {
  return processAdminApproval({
    refillId,
    approved: false,
    adminUserId,
    notes: reason,
  });
}

/**
 * Move refill to PENDING_PROVIDER status (for provider queue)
 */
export async function queueForProvider(refillId: number): Promise<RefillQueue> {
  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
  });

  if (!refill) {
    throw new Error(`Refill not found: ${refillId}`);
  }

  if (refill.status !== 'APPROVED') {
    throw new Error(`Refill ${refillId} must be approved before queuing for provider`);
  }

  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      status: 'PENDING_PROVIDER',
      providerQueuedAt: new Date(),
    },
  });

  logger.info('[RefillQueue] Queued for provider', { refillId });

  return updated;
}

/**
 * Mark refill as prescribed and schedule next refill
 */
export async function markPrescribed(
  refillId: number,
  providerId: number,
  orderId: number
): Promise<{ current: RefillQueue; next: RefillQueue | null }> {
  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
    include: { subscription: true },
  });

  if (!refill) {
    throw new Error(`Refill not found: ${refillId}`);
  }

  // Update current refill
  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      status: 'PRESCRIBED',
      prescribedAt: new Date(),
      prescribedBy: providerId,
      orderId,
    },
  });

  logger.info('[RefillQueue] Marked as prescribed', {
    refillId,
    providerId,
    orderId,
  });

  // Schedule next refill if subscription is active
  let nextRefill: RefillQueue | null = null;

  if (refill.subscription && refill.subscription.status === 'ACTIVE') {
    const nextRefillDate = calculateNextRefillDate(new Date(), refill.refillIntervalDays);

    nextRefill = await scheduleRefill({
      clinicId: refill.clinicId,
      patientId: refill.patientId,
      subscriptionId: refill.subscriptionId || undefined,
      vialCount: refill.vialCount,
      lastOrderId: orderId,
      medicationName: refill.medicationName || undefined,
      medicationStrength: refill.medicationStrength || undefined,
      medicationForm: refill.medicationForm || undefined,
      planName: refill.planName || undefined,
      nextRefillDate,
    });

    logger.info('[RefillQueue] Scheduled next refill', {
      currentRefillId: refillId,
      nextRefillId: nextRefill.id,
      nextRefillDate,
    });
  }

  return { current: updated, next: nextRefill };
}

/**
 * Mark refill as completed (after delivery confirmation)
 */
export async function markCompleted(refillId: number): Promise<RefillQueue> {
  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      status: 'COMPLETED',
      lastRefillDate: new Date(),
    },
  });

  logger.info('[RefillQueue] Marked as completed', { refillId });

  return updated;
}

/**
 * Request early refill (patient-initiated)
 */
export async function requestEarlyRefill(input: EarlyRefillRequestInput): Promise<RefillQueue> {
  const { patientId, subscriptionId, notes, clinicId } = input;

  // Check for existing active refill
  const existingRefill = await prisma.refillQueue.findFirst({
    where: {
      patientId,
      subscriptionId,
      status: { in: ACTIVE_REFILL_STATUSES },
    },
  });

  if (existingRefill) {
    // Update existing refill as early request
    const updated = await prisma.refillQueue.update({
      where: { id: existingRefill.id },
      data: {
        requestedEarly: true,
        patientNotes: notes,
        status: 'PENDING_PAYMENT', // Move to payment verification immediately
      },
    });

    logger.info('[RefillQueue] Marked existing refill as early request', {
      refillId: existingRefill.id,
      patientId,
    });

    return updated;
  }

  // Get subscription info for medication details
  let subscription: Subscription | null = null;
  if (subscriptionId) {
    subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
  }

  // Create new early refill request
  const vialCount = subscription?.vialCount || DEFAULT_VIAL_COUNT;
  const intervalDays = calculateIntervalDays(vialCount);

  const refill = await prisma.refillQueue.create({
    data: {
      clinicId,
      patientId,
      subscriptionId,
      vialCount,
      refillIntervalDays: intervalDays,
      nextRefillDate: new Date(), // Due immediately
      status: 'PENDING_PAYMENT',
      requestedEarly: true,
      patientNotes: notes,
      planName: subscription?.planName,
    },
  });

  logger.info('[RefillQueue] Created early refill request', {
    refillId: refill.id,
    patientId,
    subscriptionId,
  });

  return refill;
}

/**
 * Cancel a refill
 */
export async function cancelRefill(refillId: number, reason?: string): Promise<RefillQueue> {
  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      status: 'CANCELLED',
      adminNotes: reason,
    },
  });

  logger.info('[RefillQueue] Cancelled refill', { refillId, reason });

  return updated;
}

/**
 * Put refill on hold
 */
export async function holdRefill(refillId: number, reason?: string): Promise<RefillQueue> {
  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      status: 'ON_HOLD',
      adminNotes: reason,
    },
  });

  logger.info('[RefillQueue] Put refill on hold', { refillId, reason });

  return updated;
}

/**
 * Resume a held refill
 */
export async function resumeRefill(refillId: number): Promise<RefillQueue> {
  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
  });

  if (!refill || refill.status !== 'ON_HOLD') {
    throw new Error(`Refill ${refillId} is not on hold`);
  }

  // Determine what status to return to
  let newStatus: RefillStatus = 'PENDING_PAYMENT';
  if (refill.paymentVerified) {
    newStatus = refill.adminApproved ? 'APPROVED' : 'PENDING_ADMIN';
  }

  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: { status: newStatus },
  });

  logger.info('[RefillQueue] Resumed refill', { refillId, newStatus });

  return updated;
}

/**
 * Update refill fields (e.g. next refill date, plan/medication name).
 * Used when editing a prepaid shipment from the patient billing view.
 */
export interface UpdateRefillInput {
  nextRefillDate?: Date;
  planName?: string;
  medicationName?: string;
  medicationStrength?: string;
  medicationForm?: string;
}

export async function updateRefill(
  refillId: number,
  data: UpdateRefillInput
): Promise<RefillQueue> {
  const payload: Record<string, unknown> = {};
  if (data.nextRefillDate != null) payload.nextRefillDate = data.nextRefillDate;
  if (data.planName != null) payload.planName = data.planName;
  if (data.medicationName != null) payload.medicationName = data.medicationName;
  if (data.medicationStrength != null) payload.medicationStrength = data.medicationStrength;
  if (data.medicationForm != null) payload.medicationForm = data.medicationForm;

  if (Object.keys(payload).length === 0) {
    const existing = await prisma.refillQueue.findUnique({ where: { id: refillId } });
    if (!existing) throw new Error('Refill not found');
    return existing;
  }

  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: payload as any,
  });

  logger.info('[RefillQueue] Updated refill', { refillId, fields: Object.keys(payload) });
  return updated;

  return updated;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get refill queue for admin dashboard
 */
export async function getAdminRefillQueue(
  filters: RefillQueueFilters
): Promise<RefillQueueWithRelations[]> {
  const where: any = {};

  if (filters.clinicId) {
    where.clinicId = filters.clinicId;
  }

  if (filters.patientId) {
    where.patientId = filters.patientId;
  }

  if (filters.status) {
    where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
  }

  if (filters.dueBefore) {
    where.nextRefillDate = { ...where.nextRefillDate, lte: filters.dueBefore };
  }

  if (filters.dueAfter) {
    where.nextRefillDate = { ...where.nextRefillDate, gte: filters.dueAfter };
  }

  return prisma.refillQueue.findMany({
    where,
    include: {
      patient: true,
      subscription: true,
      clinic: true,
      lastOrder: true,
      order: true,
      invoice: true,
    },
    orderBy: [{ status: 'asc' }, { nextRefillDate: 'asc' }],
  });
}

/**
 * Get refills pending admin approval
 */
export async function getPendingAdminApproval(
  clinicId: number
): Promise<RefillQueueWithRelations[]> {
  return getAdminRefillQueue({
    clinicId,
    status: 'PENDING_ADMIN',
  });
}

/**
 * Get refills pending payment verification
 */
export async function getPendingPayment(clinicId: number): Promise<RefillQueueWithRelations[]> {
  return getAdminRefillQueue({
    clinicId,
    status: 'PENDING_PAYMENT',
  });
}

/**
 * Get refills approved and ready for provider
 */
export async function getProviderQueue(clinicId: number): Promise<RefillQueueWithRelations[]> {
  return getAdminRefillQueue({
    clinicId,
    status: ['APPROVED', 'PENDING_PROVIDER'],
  });
}

/**
 * Get refill statistics for admin dashboard
 */
export async function getRefillQueueStats(clinicId: number): Promise<{
  scheduled: number;
  pendingPayment: number;
  pendingAdmin: number;
  approved: number;
  pendingProvider: number;
  prescribed: number;
  total: number;
}> {
  const counts = await prisma.refillQueue.groupBy({
    by: ['status'],
    where: {
      clinicId,
      status: { in: [...ACTIVE_REFILL_STATUSES, 'PRESCRIBED'] },
    },
    _count: true,
  });

  const stats = {
    scheduled: 0,
    pendingPayment: 0,
    pendingAdmin: 0,
    approved: 0,
    pendingProvider: 0,
    prescribed: 0,
    total: 0,
  };

  for (const item of counts) {
    const count = item._count;
    stats.total += count;

    switch (item.status) {
      case 'SCHEDULED':
        stats.scheduled = count;
        break;
      case 'PENDING_PAYMENT':
        stats.pendingPayment = count;
        break;
      case 'PENDING_ADMIN':
        stats.pendingAdmin = count;
        break;
      case 'APPROVED':
        stats.approved = count;
        break;
      case 'PENDING_PROVIDER':
        stats.pendingProvider = count;
        break;
      case 'PRESCRIBED':
        stats.prescribed = count;
        break;
    }
  }

  return stats;
}

/**
 * Get a single refill by ID
 */
export async function getRefillById(refillId: number): Promise<RefillQueueWithRelations | null> {
  return prisma.refillQueue.findUnique({
    where: { id: refillId },
    include: {
      patient: true,
      subscription: true,
      clinic: true,
      lastOrder: true,
      order: true,
      invoice: true,
    },
  });
}

/**
 * Get refill history for a patient
 */
export async function getPatientRefillHistory(
  patientId: number,
  limit = 20
): Promise<RefillQueue[]> {
  return prisma.refillQueue.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      order: true,
      subscription: true,
    },
  });
}

// ============================================================================
// Stripe Payment Auto-Match Integration
// ============================================================================

/**
 * Auto-match pending refills for a patient when a Stripe payment is received.
 * Called by Stripe webhook after successful payment processing.
 *
 * @param patientId - The patient ID
 * @param clinicId - The clinic ID
 * @param stripePaymentId - The Stripe payment intent or charge ID
 * @param invoiceId - Optional invoice ID if payment is linked to an invoice
 * @returns Array of refill IDs that were auto-matched
 */
export async function autoMatchPendingRefillsForPatient(
  patientId: number,
  clinicId: number,
  stripePaymentId?: string,
  invoiceId?: number
): Promise<number[]> {
  try {
    // Find pending refills for this patient
    const pendingRefills = await prisma.refillQueue.findMany({
      where: {
        patientId,
        clinicId,
        status: 'PENDING_PAYMENT',
        paymentVerified: false,
      },
      orderBy: { nextRefillDate: 'asc' },
    });

    if (pendingRefills.length === 0) {
      logger.debug('[RefillQueue] No pending refills to auto-match', {
        patientId,
        clinicId,
      });
      return [];
    }

    const matchedIds: number[] = [];

    // Auto-verify payment for the oldest pending refill
    // (only verify one at a time to match one payment to one refill)
    const refillToMatch = pendingRefills[0];

    const updated = await prisma.refillQueue.update({
      where: { id: refillToMatch.id },
      data: {
        paymentVerified: true,
        paymentVerifiedAt: new Date(),
        paymentVerifiedBy: 0, // System
        paymentMethod: 'STRIPE_AUTO',
        stripePaymentId: stripePaymentId || undefined,
        invoiceId: invoiceId || undefined,
        status: 'PENDING_ADMIN', // Move to admin approval queue
      },
    });

    matchedIds.push(updated.id);

    logger.info('[RefillQueue] Auto-matched payment to refill', {
      refillId: refillToMatch.id,
      patientId,
      clinicId,
      stripePaymentId,
      invoiceId,
    });

    return matchedIds;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[RefillQueue] Error auto-matching refills', {
      error: message,
      patientId,
      clinicId,
    });
    return [];
  }
}

/**
 * Check if a patient has any pending refills awaiting payment verification.
 * Useful for determining if a payment should be auto-matched.
 */
export async function hasPendingRefillsAwaitingPayment(
  patientId: number,
  clinicId: number
): Promise<boolean> {
  const count = await prisma.refillQueue.count({
    where: {
      patientId,
      clinicId,
      status: 'PENDING_PAYMENT',
      paymentVerified: false,
    },
  });
  return count > 0;
}

// ============================================================================
// Subscription Payment → Refill Trigger (Auto-skip to Provider Queue)
// ============================================================================

/**
 * Trigger a refill entry when a subscription payment is confirmed (or manually enrolled).
 *
 * For Stripe-verified subscription renewals (paymentMethod = STRIPE_AUTO), the refill
 * is auto-approved and goes directly to the provider queue — no admin bottleneck.
 * For manual/other payment methods, it stays at PENDING_ADMIN for review.
 *
 * Called by:
 * - Stripe webhook on invoice.payment_succeeded (for subscription renewals)
 * - SubscriptionLifecycleService on subscription creation (first refill)
 * - SubscriptionLifecycleService on subscription resume
 * - Manual enrollment API (with paymentMethod='MANUAL_VERIFIED')
 *
 * @param subscriptionId - The local Subscription ID
 * @param stripePaymentId - Optional Stripe payment intent/charge ID
 * @param invoiceId - Optional local Invoice ID
 * @param paymentMethodOverride - Override payment method label (defaults to 'STRIPE_AUTO')
 * @returns The created RefillQueue entry, or null if skipped
 */
export async function triggerRefillForSubscriptionPayment(
  subscriptionId: number,
  stripePaymentId?: string,
  invoiceId?: number,
  paymentMethodOverride?: string
): Promise<RefillQueue | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { patient: true },
  });

  if (!subscription) {
    logger.warn('[RefillQueue] Cannot trigger refill: subscription not found', {
      subscriptionId,
    });
    return null;
  }

  if (!subscription.clinicId) {
    logger.warn('[RefillQueue] Cannot trigger refill: subscription has no clinicId', {
      subscriptionId,
    });
    return null;
  }

  // Guard: don't create a duplicate if there's already an active refill
  const existingActive = await prisma.refillQueue.findFirst({
    where: {
      subscriptionId,
      status: { in: ACTIVE_REFILL_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingActive) {
    logger.info('[RefillQueue] Active refill already exists for subscription, skipping', {
      subscriptionId,
      existingRefillId: existingActive.id,
      existingStatus: existingActive.status,
    });
    return existingActive;
  }

  const vialCount =
    subscription.vialCount || vialCountFromPlanCategory(subscription.planId) || DEFAULT_VIAL_COUNT;
  const intervalDays = calculateIntervalDays(vialCount);
  const now = new Date();
  const paymentMethod = (paymentMethodOverride || 'STRIPE_AUTO') as any;

  // Auto-approve for Stripe-verified renewals — skip admin bottleneck
  const isStripeVerified = paymentMethod === 'STRIPE_AUTO';
  const initialStatus: RefillStatus = isStripeVerified ? 'APPROVED' : 'PENDING_ADMIN';

  const refill = await prisma.refillQueue.create({
    data: {
      clinicId: subscription.clinicId,
      patientId: subscription.patientId,
      subscriptionId: subscription.id,
      vialCount,
      refillIntervalDays: intervalDays,
      nextRefillDate: now,
      status: initialStatus,
      paymentVerified: true,
      paymentVerifiedAt: now,
      paymentVerifiedBy: 0,
      paymentMethod,
      stripePaymentId: stripePaymentId || undefined,
      invoiceId: invoiceId || undefined,
      adminApproved: isStripeVerified,
      adminApprovedAt: isStripeVerified ? now : undefined,
      adminApprovedBy: isStripeVerified ? 0 : undefined,
      adminNotes: isStripeVerified ? 'Auto-approved: Stripe payment verified' : undefined,
      providerQueuedAt: isStripeVerified ? now : undefined,
      planName: subscription.planName,
      medicationName: extractMedicationName(subscription.planName),
    },
  });

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      lastRefillQueueId: refill.id,
      vialCount,
      refillIntervalDays: intervalDays,
    },
  });

  if (isStripeVerified) {
    logger.info('[RefillQueue] Triggered refill for subscription payment (→ auto-approved → provider queue)', {
      refillId: refill.id,
      subscriptionId,
      patientId: subscription.patientId,
      clinicId: subscription.clinicId,
      stripePaymentId,
    });

    // Notify providers directly — prescription is ready for them
    notifyRefillApproved(refill).catch(() => {});
    // Also notify admins for visibility
    notifyRefillDue(subscription, refill).catch(() => {});
  } else {
    logger.info('[RefillQueue] Triggered refill for subscription payment (→ pending admin review)', {
      refillId: refill.id,
      subscriptionId,
      patientId: subscription.patientId,
      clinicId: subscription.clinicId,
      stripePaymentId,
    });

    // Notify admins that a refill is due
    notifyRefillDue(subscription, refill).catch(() => {});
  }

  return refill;
}

/** Refill frequency in months for manual enrollment (monthly, quarterly, semester, annual) */
export const REFILL_FREQUENCY_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMESTER: 6,
  ANNUAL: 12,
};

export type { RefillFrequencyKey, RefillDefaultsForPlan } from './refillPlanDefaults';
export { getRefillDefaultsForPlanDuration } from './refillPlanDefaults';

/**
 * Create multiple refill queue entries for manual enrollment (e.g. 3 refills on a 12‑month plan).
 * Each refill is PENDING_ADMIN so admin/provider can approve when the pharmacy sends.
 * Refills are scheduled on the given frequency (startDate, startDate+interval, …) unless the
 * subscription is later cancelled or paused.
 * Bypasses the single-active-refill guard; used only for manual enrollment with refillCount > 1.
 *
 * @param subscriptionId - The local Subscription ID
 * @param refillCount - Number of refills to queue (e.g. 4 for 12‑month plan quarterly)
 * @param startDate - Plan start date; first refill = startDate, then startDate + interval, etc.
 * @param refillIntervalMonths - Optional. 1=monthly, 3=quarterly, 6=semester, 12=annual. If omitted, derived from planMonths/refillCount.
 * @returns Array of created RefillQueue entries
 */
export async function createManualRefillsForSubscription(
  subscriptionId: number,
  refillCount: number,
  startDate: Date,
  refillIntervalMonths?: number
): Promise<RefillQueue[]> {
  if (refillCount < 1) return [];

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { patient: true },
  });

  if (!subscription || !subscription.clinicId) {
    logger.warn('[RefillQueue] Cannot create manual refills: subscription not found or no clinic', {
      subscriptionId,
    });
    return [];
  }

  const vialCount =
    subscription.vialCount ||
    vialCountFromPlanCategory(subscription.planId) ||
    DEFAULT_VIAL_COUNT;
  const intervalDays = calculateIntervalDays(vialCount);
  const planMonths = subscription.intervalCount || 1;
  const intervalMonths =
    refillIntervalMonths != null && refillIntervalMonths >= 1
      ? Math.min(refillIntervalMonths, 12)
      : Math.max(1, Math.floor(planMonths / refillCount));
  const medicationName = extractMedicationName(subscription.planName);
  const now = new Date();

  const refills: RefillQueue[] = [];
  for (let i = 0; i < refillCount; i++) {
    const nextRefillDate = new Date(startDate);
    nextRefillDate.setMonth(nextRefillDate.getMonth() + i * intervalMonths);

    const refill = await prisma.refillQueue.create({
      data: {
        clinicId: subscription.clinicId,
        patientId: subscription.patientId,
        subscriptionId: subscription.id,
        vialCount,
        refillIntervalDays: intervalDays,
        nextRefillDate,
        status: 'PENDING_ADMIN',
        paymentVerified: true,
        paymentVerifiedAt: now,
        paymentVerifiedBy: 0,
        paymentMethod: 'MANUAL_VERIFIED',
        adminApproved: false,
        planName: subscription.planName,
        medicationName,
        shipmentNumber: i + 1,
        totalShipments: refillCount,
      },
    });
    refills.push(refill);
  }

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      lastRefillQueueId: refills[refills.length - 1]?.id ?? undefined,
      vialCount,
      refillIntervalDays: intervalDays,
    },
  });

  logger.info('[RefillQueue] Created manual refills for subscription', {
    subscriptionId,
    refillCount: refills.length,
    refillIds: refills.map((r) => r.id),
  });

  return refills;
}

/**
 * Cancel all active refills for a subscription.
 * Used when a subscription is canceled or deleted.
 */
export async function cancelRefillsForSubscription(
  subscriptionId: number,
  reason?: string
): Promise<number> {
  const result = await prisma.refillQueue.updateMany({
    where: {
      subscriptionId,
      status: { in: ACTIVE_REFILL_STATUSES },
    },
    data: {
      status: 'CANCELLED',
      adminNotes: reason || 'Subscription canceled',
    },
  });

  if (result.count > 0) {
    logger.info('[RefillQueue] Canceled refills for subscription', {
      subscriptionId,
      canceledCount: result.count,
      reason,
    });
  }

  return result.count;
}

/**
 * Hold all active refills for a subscription.
 * Used when a subscription is paused.
 */
export async function holdRefillsForSubscription(
  subscriptionId: number,
  reason?: string
): Promise<number> {
  const result = await prisma.refillQueue.updateMany({
    where: {
      subscriptionId,
      status: { in: ACTIVE_REFILL_STATUSES },
    },
    data: {
      status: 'ON_HOLD',
      adminNotes: reason || 'Subscription paused',
    },
  });

  if (result.count > 0) {
    logger.info('[RefillQueue] Held refills for subscription pause', {
      subscriptionId,
      heldCount: result.count,
      reason,
    });
  }

  return result.count;
}

/**
 * Extract medication name from plan name string.
 * e.g., "Semaglutide 2.5mg/2mL" → "Semaglutide"
 *       "Tirzepatide 10mg/3mL"  → "Tirzepatide"
 */
function extractMedicationName(planName: string | null): string | undefined {
  if (!planName) return undefined;
  const lower = planName.toLowerCase();
  if (lower.includes('semaglutide')) return 'Semaglutide';
  if (lower.includes('tirzepatide')) return 'Tirzepatide';
  return undefined;
}

// ============================================================================
// Notification Helpers (non-blocking, fire-and-forget)
// ============================================================================

/**
 * Safe PHI decryption: returns original value if decryption fails or value is plaintext.
 */
function safeDecryptForNotification(value: string | null): string {
  if (!value) return 'Patient';
  try {
    const parts = value.split(':');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      const { decryptPHI } = require('@/lib/security/phi-encryption');
      return decryptPHI(value) || value;
    }
    return value;
  } catch {
    return value;
  }
}

/**
 * Notify admins when a subscription refill is due (PENDING_ADMIN).
 * Sent as in-app notification + WebSocket push via notificationEvents.refillDue().
 */
async function notifyRefillDue(
  subscription: Subscription & { patient?: Patient | null },
  refill: RefillQueue
): Promise<void> {
  try {
    if (!subscription.clinicId) return;

    const firstName = safeDecryptForNotification(subscription.patient?.firstName ?? null);
    const lastName = safeDecryptForNotification(subscription.patient?.lastName ?? null);
    const patientName = `${firstName} ${lastName}`.trim() || 'Patient';
    const medicationName = extractMedicationName(subscription.planName) || subscription.planName || 'Medication';

    const { notificationEvents } = await import('@/services/notification/notificationEvents');

    await notificationEvents.refillDue({
      clinicId: subscription.clinicId,
      patientId: subscription.patientId,
      patientName,
      medicationName,
      daysUntilDue: 0, // Due now — payment confirmed
    });

    logger.debug('[RefillQueue] Refill due notification sent', {
      refillId: refill.id,
      patientId: subscription.patientId,
    });
  } catch (err) {
    logger.warn('[RefillQueue] Refill due notification failed (non-blocking)', {
      refillId: refill.id,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

/**
 * Notify providers when a refill is approved and ready for prescribing.
 * Sent as in-app notification + WebSocket push via notificationEvents.newRxQueue().
 */
async function notifyRefillApproved(refill: RefillQueue): Promise<void> {
  try {
    if (!refill.clinicId) return;

    const patient = await prisma.patient.findUnique({
      where: { id: refill.patientId },
      select: { firstName: true, lastName: true },
    });

    const firstName = safeDecryptForNotification(patient?.firstName ?? null);
    const lastName = safeDecryptForNotification(patient?.lastName ?? null);
    const patientName = `${firstName} ${lastName}`.trim() || 'Patient';
    const medName = refill.medicationName || extractMedicationName(refill.planName) || 'Prescription';

    const { notificationEvents } = await import('@/services/notification/notificationEvents');

    await notificationEvents.newRxQueue({
      clinicId: refill.clinicId,
      patientId: refill.patientId,
      patientName,
      treatmentType: medName,
      isRefill: true,
      priority: 'normal',
    });

    logger.debug('[RefillQueue] Refill approved notification sent to providers', {
      refillId: refill.id,
      patientId: refill.patientId,
    });
  } catch (err) {
    logger.warn('[RefillQueue] Refill approved notification failed (non-blocking)', {
      refillId: refill.id,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}
