/**
 * Shipment Schedule Service
 * ==========================
 *
 * Manages multi-shipment scheduling for packages that exceed medication Beyond Use Date (BUD).
 *
 * Key Concepts:
 * - Medications typically have a 90-day BUD (Beyond Use Date)
 * - 6-month packages require 2 shipments (initial + 90 days)
 * - 12-month packages require 4 shipments (initial + 90, 180, 270 days)
 *
 * This service creates all RefillQueue entries upfront when a multi-month package is purchased,
 * allowing for automated reminders and processing at the appropriate intervals.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RefillQueue, RefillStatus, Subscription, Patient, Clinic } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface ShipmentScheduleInput {
  clinicId: number;
  patientId: number;
  subscriptionId?: number;
  packageMonths: number;
  budDays?: number;
  medicationName?: string;
  medicationStrength?: string;
  medicationForm?: string;
  planName?: string;
  vialCount?: number;
  startDate?: Date;
}

export interface ShipmentScheduleResult {
  shipments: RefillQueue[];
  totalShipments: number;
  scheduleInterval: number;
}

export interface UpcomingShipment extends RefillQueue {
  patient?: Patient;
  clinic?: Clinic;
  subscription?: Subscription | null;
  daysUntilDue: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default Beyond Use Date in days */
export const DEFAULT_BUD_DAYS = 90;

/** Minimum package months to trigger multi-shipment scheduling */
export const MIN_MULTI_SHIPMENT_MONTHS = 4;

/** Days before shipment to send advance reminder */
export const ADVANCE_REMINDER_DAYS = 7;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the number of shipments needed based on package duration and BUD
 * @param packageMonths - Total months in the package (e.g., 6, 12)
 * @param budDays - Beyond Use Date in days (default 90)
 * @returns Number of shipments required
 */
export function calculateShipmentsNeeded(
  packageMonths: number,
  budDays: number = DEFAULT_BUD_DAYS
): number {
  const totalDays = packageMonths * 30; // Approximate days in package
  const shipmentsNeeded = Math.ceil(totalDays / budDays);
  return Math.max(1, shipmentsNeeded); // At least 1 shipment
}

/**
 * Check if a package requires multi-shipment scheduling
 * @param packageMonths - Total months in the package
 * @param budDays - Beyond Use Date in days
 * @returns True if multiple shipments are needed
 */
export function requiresMultiShipment(
  packageMonths: number,
  budDays: number = DEFAULT_BUD_DAYS
): boolean {
  return calculateShipmentsNeeded(packageMonths, budDays) > 1;
}

/**
 * Calculate shipment dates using same-day-of-month logic.
 *
 * Each refill lands on the same calendar day as the original purchase,
 * spaced 3 months apart (matching the pharmacy's max 3-month supply).
 *
 * Edge cases:
 * - Jan 31 → Apr 30 (clamped to last day), Jul 31, Oct 31
 * - Jan 29 → Apr 29, Jul 29, Oct 29
 * - Feb 28 (non-leap) → May 28, Aug 28, Nov 28
 *
 * @param startDate - Initial shipment/purchase date
 * @param totalShipments - Total number of shipments
 * @param _budDays - Beyond Use Date in days (kept for backward compatibility, not used for date calc)
 * @returns Array of dates for each shipment
 */
export function calculateShipmentDates(
  startDate: Date,
  totalShipments: number,
  _budDays: number = DEFAULT_BUD_DAYS
): Date[] {
  const dates: Date[] = [];
  const originDay = startDate.getDate();

  for (let i = 0; i < totalShipments; i++) {
    if (i === 0) {
      dates.push(new Date(startDate));
      continue;
    }

    // Advance by (i * 3) months from the start date, keeping the same day-of-month
    const monthsToAdd = i * 3;
    const targetMonth = startDate.getMonth() + monthsToAdd;
    const targetYear = startDate.getFullYear() + Math.floor(targetMonth / 12);
    const targetMonthNormalized = targetMonth % 12;

    // Get the last day of the target month to handle clamping (e.g., Jan 31 → Apr 30)
    const lastDayOfTargetMonth = new Date(targetYear, targetMonthNormalized + 1, 0).getDate();
    const clampedDay = Math.min(originDay, lastDayOfTargetMonth);

    const shipmentDate = new Date(targetYear, targetMonthNormalized, clampedDay);
    // Preserve the time-of-day from the original date
    shipmentDate.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
    dates.push(shipmentDate);
  }

  return dates;
}

/**
 * Get package months from subscription data
 * Parses plan name or category to determine package duration
 */
export function getPackageMonthsFromSubscription(subscription: Subscription): number {
  // Check vialCount first (6 vials = 6 months)
  if (subscription.vialCount) {
    return subscription.vialCount;
  }

  // Parse from planName (e.g., "Semaglutide 6 Month", "12-Month Package")
  const planName = subscription.planName?.toLowerCase() || '';
  const planId = subscription.planId?.toLowerCase() || '';

  // Look for month patterns
  const monthPatterns = [/(\d+)\s*month/i, /(\d+)month/i, /(\d+)-month/i];

  for (const pattern of monthPatterns) {
    const match = planName.match(pattern) || planId.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // Check for common plan categories
  if (planId.includes('annual') || planId.includes('12month')) return 12;
  if (planId.includes('6month') || planId.includes('semester')) return 6;
  if (planId.includes('3month') || planId.includes('quarterly')) return 3;

  // Default to vialCount-based calculation or 1 month
  return subscription.vialCount || 1;
}

// ============================================================================
// Core Service Functions
// ============================================================================

/**
 * Create a complete shipment schedule for a multi-month package
 * Creates all RefillQueue entries upfront with proper shipment numbering
 */
export async function createShipmentScheduleForSubscription(
  subscriptionId: number,
  budDays?: number
): Promise<ShipmentScheduleResult> {
  // Fetch subscription with related data
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      patient: true,
    },
  });

  if (!subscription) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }

  if (!subscription.clinicId) {
    throw new Error(`Subscription ${subscriptionId} has no clinicId`);
  }

  // Get clinic's BUD configuration
  const clinic = await prisma.clinic.findUnique({
    where: { id: subscription.clinicId },
    select: { defaultBudDays: true },
  });

  const effectiveBudDays = budDays ?? clinic?.defaultBudDays ?? DEFAULT_BUD_DAYS;
  const packageMonths = getPackageMonthsFromSubscription(subscription);
  const totalShipments = calculateShipmentsNeeded(packageMonths, effectiveBudDays);

  // If only 1 shipment needed, use standard scheduling
  if (totalShipments === 1) {
    const singleRefill = await createSingleRefill({
      clinicId: subscription.clinicId,
      patientId: subscription.patientId,
      subscriptionId: subscription.id,
      vialCount: subscription.vialCount || 1,
      planName: subscription.planName,
      budDays: effectiveBudDays,
    });

    return {
      shipments: [singleRefill],
      totalShipments: 1,
      scheduleInterval: effectiveBudDays,
    };
  }

  // Calculate shipment dates
  const startDate = subscription.currentPeriodStart || new Date();
  const shipmentDates = calculateShipmentDates(startDate, totalShipments, effectiveBudDays);

  // Create all shipments in a transaction
  const shipments = await prisma.$transaction(async (tx) => {
    const createdShipments: RefillQueue[] = [];
    let parentRefillId: number | null = null;

    for (let i = 0; i < totalShipments; i++) {
      const shipmentNumber = i + 1;
      const isFirstShipment = i === 0;

      const refill: any = await tx.refillQueue.create({
        data: {
          clinicId: subscription.clinicId!,
          patientId: subscription.patientId,
          subscriptionId: subscription.id,
          vialCount: subscription.vialCount || 1,
          refillIntervalDays: effectiveBudDays,
          nextRefillDate: shipmentDates[i],
          status: isFirstShipment ? 'PENDING_PAYMENT' : 'SCHEDULED',
          planName: subscription.planName,
          shipmentNumber,
          totalShipments,
          parentRefillId: parentRefillId,
          budDays: effectiveBudDays,
        },
      });

      // First shipment becomes the parent for subsequent ones
      if (isFirstShipment) {
        parentRefillId = refill.id;
      }

      createdShipments.push(refill);
    }

    // Update subscription with reference to first refill
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        lastRefillQueueId: createdShipments[0].id,
        vialCount: subscription.vialCount || 1,
        refillIntervalDays: effectiveBudDays,
      },
    });

    return createdShipments;
  }, { timeout: 15000 });

  logger.info('[ShipmentSchedule] Created multi-shipment schedule', {
    subscriptionId,
    patientId: subscription.patientId,
    packageMonths,
    totalShipments,
    budDays: effectiveBudDays,
    shipmentIds: shipments.map((s) => s.id),
  });

  return {
    shipments,
    totalShipments,
    scheduleInterval: effectiveBudDays,
  };
}

/**
 * Create shipment schedule from input parameters (not subscription-based)
 */
export async function createShipmentSchedule(
  input: ShipmentScheduleInput
): Promise<ShipmentScheduleResult> {
  const {
    clinicId,
    patientId,
    subscriptionId,
    packageMonths,
    budDays = DEFAULT_BUD_DAYS,
    medicationName,
    medicationStrength,
    medicationForm,
    planName,
    vialCount = 1,
    startDate = new Date(),
  } = input;

  const totalShipments = calculateShipmentsNeeded(packageMonths, budDays);
  const shipmentDates = calculateShipmentDates(startDate, totalShipments, budDays);

  // Create all shipments in a transaction
  const shipments = await prisma.$transaction(async (tx) => {
    const createdShipments: RefillQueue[] = [];
    let parentRefillId: number | null = null;

    for (let i = 0; i < totalShipments; i++) {
      const shipmentNumber = i + 1;
      const isFirstShipment = i === 0;

      const refill: any = await tx.refillQueue.create({
        data: {
          clinicId,
          patientId,
          subscriptionId,
          vialCount,
          refillIntervalDays: budDays,
          nextRefillDate: shipmentDates[i],
          status: isFirstShipment ? 'PENDING_PAYMENT' : 'SCHEDULED',
          medicationName,
          medicationStrength,
          medicationForm,
          planName,
          shipmentNumber,
          totalShipments,
          parentRefillId,
          budDays,
        },
      });

      if (isFirstShipment) {
        parentRefillId = refill.id;
      }

      createdShipments.push(refill);
    }

    return createdShipments;
  }, { timeout: 15000 });

  logger.info('[ShipmentSchedule] Created shipment schedule', {
    clinicId,
    patientId,
    packageMonths,
    totalShipments,
    budDays,
    shipmentIds: shipments.map((s) => s.id),
  });

  return {
    shipments,
    totalShipments,
    scheduleInterval: budDays,
  };
}

// ============================================================================
// Invoice-Based Refill Scheduling (Airtable / WellMedR)
// ============================================================================

export interface ScheduleRefillsFromInvoiceInput {
  clinicId: number;
  patientId: number;
  invoiceId: number;
  /** Medication name (e.g. Tirzepatide 2.5mg, Semaglutide 0.25mg) */
  medicationName: string;
  medicationStrength?: string;
  medicationForm?: string;
  /** Plan duration: 6-month, 12-month, etc. */
  planName: string;
  /** Date of original prescription (payment date). Future refills are 90, 180, 270 days from this. */
  prescriptionDate: Date;
  budDays?: number;
}

/**
 * Schedule RefillQueue entries for invoice-paid plans (WellMedR / Airtable).
 *
 * The original/first prescription is always handled manually (not queued). Only future refills are queued.
 *
 * - 1-month: One refill at 28 days; status PENDING_PAYMENT (admin verifies payment before refill).
 * - 3-month: One refill at 84 days; status PENDING_PAYMENT (admin verifies payment before refill).
 * - 6-month: 1 refill at 90 days (pre-paid, PENDING_ADMIN). Rebilling in 6 months.
 * - 12-month: 3 refills at 90, 180, 270 days (pre-paid, PENDING_ADMIN). Rebilling in 12 months.
 *
 * Pharmacy ships 3 months at a time (90-day BUD). Same-day-of-month logic for 6/12: e.g. Jan 15 → refills Apr 15, Jul 15, Oct 15.
 */
export async function scheduleFutureRefillsFromInvoice(
  input: ScheduleRefillsFromInvoiceInput
): Promise<RefillQueue[]> {
  const {
    clinicId,
    patientId,
    invoiceId,
    medicationName,
    medicationStrength,
    medicationForm,
    planName,
    prescriptionDate,
    budDays = DEFAULT_BUD_DAYS,
  } = input;

  const packageMonths = parsePackageMonthsFromPlan(planName);

  // 1-month: single refill at 28 days, payment verification pending by admin
  if (packageMonths === 1) {
    const nextRefillDate = new Date(prescriptionDate);
    nextRefillDate.setDate(nextRefillDate.getDate() + REFILL_DAYS_1_MONTH);
    const refill = await prisma.refillQueue.create({
      data: {
        clinicId,
        patientId,
        invoiceId,
        vialCount: 1,
        refillIntervalDays: REFILL_DAYS_1_MONTH,
        nextRefillDate,
        status: 'PENDING_PAYMENT',
        medicationName,
        medicationStrength,
        medicationForm,
        planName,
        shipmentNumber: 1,
        totalShipments: 1,
        parentRefillId: null,
        budDays: REFILL_DAYS_1_MONTH,
        paymentVerified: false,
        paymentMethod: null,
      },
    });
    logger.info('[ShipmentSchedule] Scheduled 1-month refill (payment verification pending)', {
      clinicId,
      patientId,
      invoiceId,
      nextRefillDate: refill.nextRefillDate,
    });
    return [refill];
  }

  // 3-month: single refill at 84 days, payment verification pending by admin
  if (packageMonths === 3) {
    const nextRefillDate = new Date(prescriptionDate);
    nextRefillDate.setDate(nextRefillDate.getDate() + REFILL_DAYS_3_MONTH);
    const refill = await prisma.refillQueue.create({
      data: {
        clinicId,
        patientId,
        invoiceId,
        vialCount: 3,
        refillIntervalDays: budDays,
        nextRefillDate,
        status: 'PENDING_PAYMENT',
        medicationName,
        medicationStrength,
        medicationForm,
        planName,
        shipmentNumber: 1,
        totalShipments: 1,
        parentRefillId: null,
        budDays,
        paymentVerified: false,
        paymentMethod: null,
      },
    });
    logger.info('[ShipmentSchedule] Scheduled 3-month refill (payment verification pending)', {
      clinicId,
      patientId,
      invoiceId,
      nextRefillDate: refill.nextRefillDate,
    });
    return [refill];
  }

  // 6-month and 12-month: pre-paid; original prescription is handled manually (not queued).
  // Queue only future refills: 6-month = 1 refill at 90 days; 12-month = 3 refills at 90, 180, 270 days.
  if (packageMonths < 4) {
    return [];
  }

  const totalShipments = calculateShipmentsNeeded(packageMonths, budDays);
  const futureRefillCount = totalShipments - 1; // exclude initial (handled manually)
  if (futureRefillCount < 1) return [];

  // Dates: index 0 = original (manual), 1 = 90d, 2 = 180d, 3 = 270d
  const shipmentDates = calculateShipmentDates(prescriptionDate, totalShipments, budDays);

  const refills = await prisma.$transaction(async (tx) => {
    const created: RefillQueue[] = [];
    let parentRefillId: number | null = null;

    for (let i = 1; i < totalShipments; i++) {
      const shipmentNumber = i; // 1, 2, 3 (first queued = 1, second = 2, third = 3)
      const isFirstQueued = i === 1;

      const refill: any = await tx.refillQueue.create({
        data: {
          clinicId,
          patientId,
          invoiceId,
          vialCount: 3,
          refillIntervalDays: budDays,
          nextRefillDate: shipmentDates[i],
          status: 'PENDING_ADMIN',
          medicationName,
          medicationStrength,
          medicationForm,
          planName,
          shipmentNumber,
          totalShipments: futureRefillCount,
          parentRefillId,
          budDays,
          paymentVerified: true,
          paymentVerifiedAt: new Date(),
          paymentMethod: 'invoice-prepaid',
        },
      });

      if (isFirstQueued) {
        parentRefillId = refill.id;
      }
      created.push(refill);
    }

    return created;
  }, { timeout: 15000 });

  logger.info('[ShipmentSchedule] Scheduled future refills from invoice (original handled manually)', {
    clinicId,
    patientId,
    invoiceId,
    packageMonths,
    futureRefillCount: refills.length,
    dates: refills.map((r) => ({ shipment: (r as any).shipmentNumber, date: r.nextRefillDate })),
  });

  return refills;
}

/** Parse plan name to package duration in months (1, 3, 6, 12 or 0 if unknown). Exported for callers (e.g. WellMedR invoice). */
export function parsePackageMonthsFromPlan(planName: string): number {
  const lower = (planName || '').toLowerCase();
  const m12 = /12\s*month|12month|annual|yearly|1\s*year/.exec(lower);
  if (m12) return 12;
  const m6 = /6\s*month|6month|semester|semi-?annual/.exec(lower);
  if (m6) return 6;
  const m3 = /3\s*month|3month|quarterly/.exec(lower);
  if (m3) return 3;
  const m1 = /1\s*month|1month|monthly/.exec(lower);
  if (m1) return 1;
  return 0;
}

/** Days from prescription to next refill for 1-month plan (admin verifies payment before refill). */
const REFILL_DAYS_1_MONTH = 28;
/** Days from prescription to next refill for 3-month plan (admin verifies payment before refill). */
const REFILL_DAYS_3_MONTH = 84;

/**
 * Create a single refill (for packages that don't need multi-shipment)
 */
async function createSingleRefill(input: {
  clinicId: number;
  patientId: number;
  subscriptionId?: number;
  vialCount: number;
  planName?: string | null;
  budDays: number;
}): Promise<RefillQueue> {
  const refill = await prisma.refillQueue.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      subscriptionId: input.subscriptionId,
      vialCount: input.vialCount,
      refillIntervalDays: input.budDays,
      nextRefillDate: new Date(),
      status: 'PENDING_PAYMENT',
      planName: input.planName,
      shipmentNumber: 1,
      totalShipments: 1,
      budDays: input.budDays,
    },
  });

  return refill;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get upcoming shipments that are due within the specified days
 * Used for advance reminders and processing
 */
export async function getUpcomingShipments(
  clinicId?: number,
  daysAhead: number = ADVANCE_REMINDER_DAYS
): Promise<UpcomingShipment[]> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const where: any = {
    status: 'SCHEDULED',
    nextRefillDate: {
      gt: now,
      lte: futureDate,
    },
    // Only get multi-shipment entries (shipment 2+)
    shipmentNumber: {
      gt: 1,
    },
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  const shipments = await prisma.refillQueue.findMany({
    where,
    include: {
      patient: true,
      clinic: true,
      subscription: true,
    },
    orderBy: { nextRefillDate: 'asc' },
  });

  // Calculate days until due for each shipment
  return shipments.map((shipment) => ({
    ...shipment,
    daysUntilDue: Math.ceil(
      (shipment.nextRefillDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

/**
 * Get shipments that need advance reminder (not yet sent)
 */
export async function getShipmentsNeedingReminder(
  clinicId?: number,
  daysAhead: number = ADVANCE_REMINDER_DAYS
): Promise<UpcomingShipment[]> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const where: any = {
    status: 'SCHEDULED',
    nextRefillDate: {
      gt: now,
      lte: futureDate,
    },
    reminderSentAt: null, // Not yet sent
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  const shipments = await prisma.refillQueue.findMany({
    where,
    include: {
      patient: true,
      clinic: true,
      subscription: true,
    },
    orderBy: { nextRefillDate: 'asc' },
  });

  return shipments.map((shipment) => ({
    ...shipment,
    daysUntilDue: Math.ceil(
      (shipment.nextRefillDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

/**
 * Get all shipments in a series (by parent refill ID)
 */
export async function getShipmentSeries(parentRefillId: number): Promise<RefillQueue[]> {
  // Get the parent refill
  const parentRefill = await prisma.refillQueue.findUnique({
    where: { id: parentRefillId },
  });

  if (!parentRefill) {
    return [];
  }

  // Get all child refills plus the parent
  const childRefills = await prisma.refillQueue.findMany({
    where: { parentRefillId },
    orderBy: { shipmentNumber: 'asc' },
  });

  return [parentRefill, ...childRefills];
}

/**
 * Get shipment schedule for a patient
 */
export async function getPatientShipmentSchedule(
  patientId: number,
  includeCompleted: boolean = false
): Promise<RefillQueue[]> {
  const statusFilter: RefillStatus[] = includeCompleted
    ? [
        'SCHEDULED',
        'PENDING_PAYMENT',
        'PENDING_ADMIN',
        'APPROVED',
        'PENDING_PROVIDER',
        'PRESCRIBED',
        'COMPLETED',
      ]
    : ['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'];

  return prisma.refillQueue.findMany({
    where: {
      patientId,
      status: { in: statusFilter },
      totalShipments: { gt: 1 }, // Only multi-shipment schedules
    },
    orderBy: [{ parentRefillId: 'asc' }, { shipmentNumber: 'asc' }],
    include: {
      subscription: true,
    },
  });
}

/**
 * Mark reminder as sent for a shipment
 */
export async function markReminderSent(refillId: number): Promise<RefillQueue> {
  return prisma.refillQueue.update({
    where: { id: refillId },
    data: { reminderSentAt: new Date() },
  });
}

/**
 * Mark patient as notified for a shipment
 */
export async function markPatientNotified(refillId: number): Promise<RefillQueue> {
  return prisma.refillQueue.update({
    where: { id: refillId },
    data: { patientNotifiedAt: new Date() },
  });
}

/**
 * Reschedule a shipment to a new date
 */
export async function rescheduleShipment(
  refillId: number,
  newDate: Date,
  reason?: string
): Promise<RefillQueue> {
  const updated = await prisma.refillQueue.update({
    where: { id: refillId },
    data: {
      nextRefillDate: newDate,
      adminNotes: reason,
      // Reset notification flags
      reminderSentAt: null,
      patientNotifiedAt: null,
    },
  });

  logger.info('[ShipmentSchedule] Rescheduled shipment', {
    refillId,
    newDate,
    reason,
  });

  return updated;
}

/**
 * Cancel remaining shipments in a series
 */
export async function cancelRemainingShipments(
  parentRefillId: number,
  reason?: string
): Promise<number> {
  const result = await prisma.refillQueue.updateMany({
    where: {
      OR: [{ id: parentRefillId }, { parentRefillId }],
      status: 'SCHEDULED',
    },
    data: {
      status: 'CANCELLED',
      adminNotes: reason,
    },
  });

  logger.info('[ShipmentSchedule] Cancelled remaining shipments', {
    parentRefillId,
    cancelledCount: result.count,
    reason,
  });

  return result.count;
}

/**
 * Get shipment schedule summary for admin dashboard
 */
export async function getShipmentScheduleSummary(clinicId: number): Promise<{
  totalScheduled: number;
  dueIn7Days: number;
  dueIn30Days: number;
  awaitingReminder: number;
}> {
  const now = new Date();
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const [totalScheduled, dueIn7Days, dueIn30Days, awaitingReminder] = await Promise.all([
    prisma.refillQueue.count({
      where: {
        clinicId,
        status: 'SCHEDULED',
        totalShipments: { gt: 1 },
      },
    }),
    prisma.refillQueue.count({
      where: {
        clinicId,
        status: 'SCHEDULED',
        nextRefillDate: { lte: in7Days },
      },
    }),
    prisma.refillQueue.count({
      where: {
        clinicId,
        status: 'SCHEDULED',
        nextRefillDate: { lte: in30Days },
      },
    }),
    prisma.refillQueue.count({
      where: {
        clinicId,
        status: 'SCHEDULED',
        nextRefillDate: { lte: in7Days },
        reminderSentAt: null,
      },
    }),
  ]);

  return {
    totalScheduled,
    dueIn7Days,
    dueIn30Days,
    awaitingReminder,
  };
}
