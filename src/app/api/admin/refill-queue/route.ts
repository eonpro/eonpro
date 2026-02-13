/**
 * Admin Refill Queue API
 *
 * GET /api/admin/refill-queue - List refills with filters and stats
 * POST /api/admin/refill-queue - Batch process due refills (moves SCHEDULED -> PENDING_PAYMENT)
 *
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError, BadRequestError } from '@/domains/shared/errors';
import { getAdminRefillQueue, getRefillQueueStats, processDueRefills } from '@/services/refill';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import type { RefillStatus } from '@prisma/client';

// GET - List refills with filters and stats
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const { searchParams } = new URL(req.url);

      // Parse filters
      const statusParam = searchParams.get('status');
      const status = statusParam ? (statusParam.split(',') as RefillStatus[]) : undefined;

      const patientId = searchParams.get('patientId')
        ? parseInt(searchParams.get('patientId')!)
        : undefined;

      const dueBefore = searchParams.get('dueBefore')
        ? new Date(searchParams.get('dueBefore')!)
        : undefined;

      const dueAfter = searchParams.get('dueAfter')
        ? new Date(searchParams.get('dueAfter')!)
        : undefined;

      // Determine clinic ID based on role
      const clinicId =
        user.role === 'super_admin'
          ? searchParams.get('clinicId')
            ? parseInt(searchParams.get('clinicId')!)
            : undefined
          : user.clinicId;

      if (!clinicId && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
      }

      // Fetch refills and stats in parallel
      const [refills, stats] = await Promise.all([
        getAdminRefillQueue({
          clinicId,
          patientId,
          status,
          dueBefore,
          dueAfter,
        }),
        clinicId ? getRefillQueueStats(clinicId) : null,
      ]);

      // Transform refills for response
      const transformedRefills = refills.map((refill) => ({
        id: refill.id,
        createdAt: refill.createdAt,
        updatedAt: refill.updatedAt,
        clinicId: refill.clinicId,
        patientId: refill.patientId,
        subscriptionId: refill.subscriptionId,
        status: refill.status,
        vialCount: refill.vialCount,
        refillIntervalDays: refill.refillIntervalDays,
        nextRefillDate: refill.nextRefillDate,
        lastRefillDate: refill.lastRefillDate,
        // Payment info
        paymentVerified: refill.paymentVerified,
        paymentVerifiedAt: refill.paymentVerifiedAt,
        paymentMethod: refill.paymentMethod,
        paymentReference: refill.paymentReference,
        // Admin info
        adminApproved: refill.adminApproved,
        adminApprovedAt: refill.adminApprovedAt,
        adminNotes: refill.adminNotes,
        // Provider info
        providerQueuedAt: refill.providerQueuedAt,
        prescribedAt: refill.prescribedAt,
        orderId: refill.orderId,
        // Request info
        requestedEarly: refill.requestedEarly,
        patientNotes: refill.patientNotes,
        // Medication info
        medicationName: refill.medicationName,
        medicationStrength: refill.medicationStrength,
        medicationForm: refill.medicationForm,
        planName: refill.planName,
        // Relations
        patient: refill.patient
          ? (() => {
              // Decrypt patient PHI fields
              const decrypted = decryptPatientPHI(refill.patient, [...DEFAULT_PHI_FIELDS]);
              return {
                id: refill.patient.id,
                firstName: decrypted.firstName || refill.patient.firstName,
                lastName: decrypted.lastName || refill.patient.lastName,
                email: decrypted.email || refill.patient.email,
                phone: decrypted.phone || refill.patient.phone,
              };
            })()
          : null,
        subscription: refill.subscription
          ? {
              id: refill.subscription.id,
              planName: refill.subscription.planName,
              status: refill.subscription.status,
            }
          : null,
        lastOrder: refill.lastOrder
          ? {
              id: refill.lastOrder.id,
              status: refill.lastOrder.status,
              createdAt: refill.lastOrder.createdAt,
            }
          : null,
        invoice: refill.invoice
          ? {
              id: refill.invoice.id,
              status: refill.invoice.status,
              amount: refill.invoice.amount,
              paidAt: refill.invoice.paidAt,
            }
          : null,
      }));

      return NextResponse.json({
        refills: transformedRefills,
        stats,
        total: refills.length,
      });
    } catch (error) {
      return handleApiError(error, { route: 'GET /api/admin/refill-queue' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// POST - Batch process due refills (cron job trigger or manual)
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const body = await req.json();
      const { action } = body;

      if (action !== 'process_due') {
        throw new BadRequestError('Invalid action. Use "process_due" to process due refills.');
      }

      // Determine clinic ID based on role
      const clinicId =
        user.role === 'super_admin'
          ? body.clinicId
            ? parseInt(body.clinicId)
            : undefined
          : user.clinicId;

      // Process due refills
      const result = await processDueRefills(clinicId);

      logger.info('[Admin RefillQueue] Processed due refills', {
        clinicId,
        processed: result.processed,
        errors: result.errors.length,
        userId: user.id,
      });

      return NextResponse.json({
        success: true,
        processed: result.processed,
        errors: result.errors,
      });
    } catch (error) {
      return handleApiError(error, { route: 'POST /api/admin/refill-queue' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
