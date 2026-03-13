/**
 * Patient Delivery Confirmation API
 * ==================================
 * POST /api/patient-portal/shipments/confirm-receipt
 *
 * Allows a patient to mark a shipment as received. The button is only
 * surfaced 48 h after the tracking number was generated. On confirmation
 * the patient is redirected to the welcome-kit page.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

const confirmSchema = z.object({
  trackingNumber: z.string().min(1).max(100),
});

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.patientId) {
        return NextResponse.json(
          { error: 'Patient profile required', code: 'PATIENT_REQUIRED' },
          { status: 400 },
        );
      }

      const body = await req.json();
      const parsed = confirmSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const { trackingNumber } = parsed.data;

      const shippingUpdate = await prisma.patientShippingUpdate.findFirst({
        where: {
          trackingNumber,
          patientId: user.patientId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!shippingUpdate) {
        return NextResponse.json(
          { error: 'Shipment not found', code: 'NOT_FOUND' },
          { status: 404 },
        );
      }

      if (shippingUpdate.patientConfirmedAt) {
        return NextResponse.json(
          { error: 'Already confirmed', code: 'ALREADY_CONFIRMED' },
          { status: 409 },
        );
      }

      const trackingCreatedAt = shippingUpdate.shippedAt ?? shippingUpdate.createdAt;
      const elapsed = Date.now() - new Date(trackingCreatedAt).getTime();
      if (elapsed < FORTY_EIGHT_HOURS_MS) {
        return NextResponse.json(
          { error: 'Cannot confirm yet — 48 hours must pass after shipment', code: 'TOO_EARLY' },
          { status: 422 },
        );
      }

      const blockedStatuses = ['RETURNED', 'EXCEPTION', 'CANCELLED'];
      if (blockedStatuses.includes(shippingUpdate.status)) {
        return NextResponse.json(
          { error: 'Cannot confirm a shipment with status: ' + shippingUpdate.status, code: 'INVALID_STATUS' },
          { status: 422 },
        );
      }

      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.patientShippingUpdate.update({
          where: { id: shippingUpdate.id },
          data: {
            patientConfirmedAt: now,
            patientConfirmedById: user.id,
            status: 'DELIVERED',
            actualDelivery: shippingUpdate.actualDelivery ?? now,
          },
        });

        if (shippingUpdate.orderId) {
          await tx.order.update({
            where: { id: shippingUpdate.orderId },
            data: { shippingStatus: 'delivered' },
          });
        }
      });

      await auditLog({
        eventType: AuditEventType.RECORD_UPDATED,
        userId: user.id,
        patientId: user.patientId,
        resourceType: 'PatientShippingUpdate',
        resourceId: String(shippingUpdate.id),
        description: `Patient confirmed delivery receipt for tracking ${trackingNumber}`,
        metadata: { trackingNumber, shippingUpdateId: shippingUpdate.id },
      }).catch((err) => {
        logger.error('[ConfirmReceipt] Audit log failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info('[ConfirmReceipt] Patient confirmed delivery', {
        patientId: user.patientId,
        trackingNumber,
        shippingUpdateId: shippingUpdate.id,
      });

      return NextResponse.json({
        success: true,
        redirectTo: '/patient-portal/welcome-kit',
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/patient-portal/shipments/confirm-receipt' },
      });
    }
  },
  { roles: ['patient'] },
);
