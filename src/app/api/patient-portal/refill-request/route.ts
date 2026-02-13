/**
 * Patient Refill Request API
 * ==========================
 *
 * Allows patients to view their refill schedule and request early refills.
 *
 * GET - Get patient's refill queue and history
 * POST - Request an early refill
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  requestEarlyRefill,
  getPatientRefillHistory,
  hasPendingRefillsAwaitingPayment,
} from '@/services/refill';

// Zod schema for early refill request
const earlyRefillRequestSchema = z.object({
  subscriptionId: z.number().positive('Subscription ID must be positive').optional(),
  notes: z.string().max(500, 'Notes must be under 500 characters').optional(),
});

// Type definitions for refill queue and history items
interface RefillQueueItem {
  id: number;
  status: string;
  vialCount: number | null;
  refillIntervalDays: number | null;
  nextRefillDate: Date | null;
  lastRefillDate: Date | null;
  medicationName: string | null;
  medicationStrength: string | null;
  planName: string | null;
  requestedEarly: boolean;
  patientNotes: string | null;
  paymentVerified: boolean;
  adminApproved: boolean | null;
  subscription: {
    id: number;
    planName: string | null;
  } | null;
}

interface RefillHistoryItem {
  id: number;
  status: string;
  medicationName: string | null;
  medicationStrength: string | null;
  planName: string | null;
  prescribedAt: Date | null;
  nextRefillDate: Date | null;
  order: {
    id: number;
    status: string;
    trackingNumber: string | null;
  } | null;
}

interface SubscriptionItem {
  id: number;
  planName: string | null;
  vialCount: number | null;
  refillIntervalDays: number | null;
  currentPeriodEnd: Date | null;
  nextBillingDate: Date | null;
}

/**
 * GET /api/patient-portal/refill-request
 * Get patient's refill schedule and history
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    // Get patient with clinic ID
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: {
        id: true,
        clinicId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Get active subscriptions for the patient
    const subscriptions = await prisma.subscription.findMany({
      where: {
        patientId: patient.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        planName: true,
        vialCount: true,
        refillIntervalDays: true,
        currentPeriodEnd: true,
        nextBillingDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get refill queue items for the patient
    const refillQueue = await prisma.refillQueue.findMany({
      where: {
        patientId: patient.id,
        status: {
          in: ['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'],
        },
      },
      orderBy: { nextRefillDate: 'asc' },
      select: {
        id: true,
        status: true,
        vialCount: true,
        refillIntervalDays: true,
        nextRefillDate: true,
        lastRefillDate: true,
        medicationName: true,
        medicationStrength: true,
        planName: true,
        requestedEarly: true,
        patientNotes: true,
        paymentVerified: true,
        adminApproved: true,
        subscription: {
          select: {
            id: true,
            planName: true,
          },
        },
      },
    });

    // Get refill history (completed refills)
    const refillHistory = await prisma.refillQueue.findMany({
      where: {
        patientId: patient.id,
        status: { in: ['PRESCRIBED', 'COMPLETED'] },
      },
      orderBy: { prescribedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        medicationName: true,
        medicationStrength: true,
        planName: true,
        prescribedAt: true,
        nextRefillDate: true,
        order: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
          },
        },
      },
    });

    // Check if patient can request early refill
    const hasPendingRefills = refillQueue.length > 0;
    const canRequestEarly =
      subscriptions.length > 0 && !refillQueue.some((r: RefillQueueItem) => r.requestedEarly);

    // Transform refill queue for frontend
    const upcomingRefills = refillQueue.map((refill: RefillQueueItem) => ({
      id: refill.id,
      status: refill.status,
      statusLabel: getStatusLabel(refill.status),
      medication: refill.medicationName || 'Prescription Refill',
      strength: refill.medicationStrength,
      plan: refill.planName || refill.subscription?.planName || 'Subscription',
      vialCount: refill.vialCount,
      intervalDays: refill.refillIntervalDays,
      nextRefillDate: refill.nextRefillDate,
      isEarlyRequest: refill.requestedEarly,
      paymentStatus: refill.paymentVerified ? 'verified' : 'pending',
      approvalStatus:
        refill.adminApproved === true
          ? 'approved'
          : refill.adminApproved === false
            ? 'rejected'
            : 'pending',
    }));

    // Transform refill history for frontend
    const pastRefills = refillHistory.map((refill: RefillHistoryItem) => ({
      id: refill.id,
      status: refill.status,
      medication: refill.medicationName || 'Prescription Refill',
      strength: refill.medicationStrength,
      plan: refill.planName,
      prescribedAt: refill.prescribedAt,
      orderId: refill.order?.id,
      orderStatus: refill.order?.status,
      trackingNumber: refill.order?.trackingNumber,
    }));

    return NextResponse.json({
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
      },
      subscriptions: subscriptions.map((sub: SubscriptionItem) => ({
        id: sub.id,
        planName: sub.planName,
        vialCount: sub.vialCount,
        intervalDays:
          sub.refillIntervalDays || (sub.vialCount === 6 ? 180 : sub.vialCount === 3 ? 90 : 30),
        nextBillingDate: sub.nextBillingDate,
        currentPeriodEnd: sub.currentPeriodEnd,
      })),
      upcomingRefills,
      pastRefills,
      canRequestEarly,
      hasPendingRefills,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Patient Refill Request] Error fetching refills', { error: message });
    return NextResponse.json({ error: 'Failed to fetch refill data' }, { status: 500 });
  }
});

/**
 * POST /api/patient-portal/refill-request
 * Request an early refill
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const body = await req.json();

    // Validate request body with Zod schema
    const validationResult = earlyRefillRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { subscriptionId, notes } = validationResult.data;

    // Get patient with clinic ID
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: {
        id: true,
        clinicId: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // If subscriptionId provided, verify it belongs to the patient
    if (subscriptionId) {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          patientId: patient.id,
          status: 'ACTIVE',
        },
      });

      if (!subscription) {
        return NextResponse.json(
          { error: 'Subscription not found or not active' },
          { status: 404 }
        );
      }
    }

    // Check if there's already an early request pending
    const existingEarlyRequest = await prisma.refillQueue.findFirst({
      where: {
        patientId: patient.id,
        subscriptionId: subscriptionId || undefined,
        requestedEarly: true,
        status: {
          in: ['PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'],
        },
      },
    });

    if (existingEarlyRequest) {
      return NextResponse.json(
        { error: 'You already have a pending early refill request' },
        { status: 400 }
      );
    }

    // Create the early refill request
    const refill = await requestEarlyRefill({
      patientId: patient.id,
      clinicId: patient.clinicId,
      subscriptionId: subscriptionId || undefined,
      notes: notes || undefined,
    });

    logger.info('[Patient Refill Request] Early refill requested', {
      refillId: refill.id,
      patientId: patient.id,
      subscriptionId,
    });

    return NextResponse.json({
      success: true,
      message: 'Refill request submitted successfully. Our team will review it shortly.',
      refill: {
        id: refill.id,
        status: refill.status,
        statusLabel: getStatusLabel(refill.status),
        nextRefillDate: refill.nextRefillDate,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Patient Refill Request] Error requesting early refill', { error: message });
    return NextResponse.json({ error: 'Failed to submit refill request' }, { status: 500 });
  }
});

/**
 * Get human-readable status label
 */
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    PENDING_PAYMENT: 'Awaiting Payment',
    PENDING_ADMIN: 'Under Review',
    APPROVED: 'Approved',
    PENDING_PROVIDER: 'With Provider',
    PRESCRIBED: 'Prescribed',
    COMPLETED: 'Completed',
    REJECTED: 'Not Approved',
    CANCELLED: 'Cancelled',
    ON_HOLD: 'On Hold',
  };
  return labels[status] || status;
}
