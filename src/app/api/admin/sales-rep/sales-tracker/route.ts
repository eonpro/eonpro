/**
 * Sales Commission Tracker API
 *
 * GET  — List all succeeded payments with their commission disposition status.
 *        Admins use this to see every sale (new + rebill) and decide commission rates.
 * POST — Disposition a payment: mark as NEW (8%) or RECURRING (1%), assign a sales rep,
 *        create commission event, and assign patient to the rep.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, withoutClinicFilter, runWithClinicContext } from '@/lib/db';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { COMMISSION_ELIGIBLE_ROLES } from '@/lib/constants/commission-eligible-roles';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

export const dynamic = 'force-dynamic';

const COMMISSION_RATES = {
  NEW: 800, // 8% in basis points
  RECURRING: 100, // 1% in basis points
} as const;

const dispositionSchema = z.object({
  paymentId: z.number().positive(),
  commissionType: z.enum(['NEW', 'RECURRING']),
  salesRepId: z.number().positive(),
  notes: z.string().max(500).optional(),
});

// ============================================================================
// GET — List payments with disposition status
// ============================================================================

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dispositionFilter = searchParams.get('disposition'); // 'all' | 'pending' | 'dispositioned'
    const searchQuery = searchParams.get('search') || '';

    const clinicIdParam = searchParams.get('clinicId');
    const clinicId =
      user.role === 'super_admin'
        ? clinicIdParam
          ? parseInt(clinicIdParam, 10) || undefined
          : undefined
        : user.clinicId;

    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const runQuery = async () => {
      const paymentWhere: Record<string, any> = {
        status: 'SUCCEEDED',
      };

      if (clinicId) paymentWhere.clinicId = clinicId;

      if (startDate || endDate) {
        paymentWhere.paidAt = {};
        if (startDate) paymentWhere.paidAt.gte = new Date(startDate);
        if (endDate) {
          const ed = new Date(endDate);
          ed.setHours(23, 59, 59, 999);
          paymentWhere.paidAt.lte = ed;
        }
      }

      // Fetch payments with related data
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: paymentWhere,
          orderBy: { paidAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                salesRepAssignments: {
                  where: { isActive: true },
                  select: {
                    salesRepId: true,
                    salesRep: { select: { id: true, firstName: true, lastName: true } },
                  },
                  take: 1,
                },
              },
            },
            invoice: {
              select: {
                id: true,
                description: true,
                stripeInvoiceNumber: true,
                items: {
                  select: { description: true, amount: true },
                },
              },
            },
            subscription: {
              select: { id: true },
            },
          },
        }),
        prisma.payment.count({ where: paymentWhere }),
      ]);

      // Get all commission events linked to these payments (via metadata.paymentId)
      const paymentIds = payments.map((p: any) => p.id);
      const commissionEvents = await prisma.salesRepCommissionEvent.findMany({
        where: {
          isManual: true,
          metadata: { path: ['source'], equals: 'sales_tracker' },
          ...(clinicId ? { clinicId } : {}),
        },
        select: {
          id: true,
          metadata: true,
          salesRepId: true,
          commissionAmountCents: true,
          eventAmountCents: true,
          isRecurring: true,
          salesRep: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // Build a lookup: paymentId → commission event
      const commissionByPaymentId: Record<number, any> = {};
      for (const ce of commissionEvents) {
        const meta = ce.metadata as Record<string, any> | null;
        if (meta?.paymentId && paymentIds.includes(meta.paymentId)) {
          commissionByPaymentId[meta.paymentId] = ce;
        }
      }

      // Build response
      const enrichedPayments = payments.map((p: any) => {
        const commission = commissionByPaymentId[p.id];
        const currentRep = p.patient?.salesRepAssignments?.[0] || null;
        const isRebill = !!p.subscriptionId;

        // Decrypt patient PHI fields
        let patientData = null;
        if (p.patient) {
          const decrypted = decryptPatientPHI(p.patient, [
            'firstName',
            'lastName',
            'email',
          ]);
          patientData = {
            id: p.patient.id,
            firstName: decrypted.firstName || '[Encrypted]',
            lastName: decrypted.lastName || '[Encrypted]',
            email: decrypted.email || '[Encrypted]',
          };
        }

        return {
          id: p.id,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
          amount: p.amount,
          currency: p.currency,
          description: p.description || p.invoice?.description || null,
          stripeInvoiceNumber: p.invoice?.stripeInvoiceNumber || null,
          invoiceItems: p.invoice?.items || [],
          isRebill,
          patient: patientData,
          currentSalesRep: currentRep
            ? {
                id: currentRep.salesRep.id,
                firstName: currentRep.salesRep.firstName,
                lastName: currentRep.salesRep.lastName,
              }
            : null,
          disposition: commission
            ? {
                commissionEventId: commission.id,
                commissionType: commission.isRecurring ? 'RECURRING' : 'NEW',
                commissionAmountCents: commission.commissionAmountCents,
                salesRep: {
                  id: commission.salesRep.id,
                  firstName: commission.salesRep.firstName,
                  lastName: commission.salesRep.lastName,
                },
              }
            : null,
        };
      });

      // Apply client-side disposition filter
      let filtered = enrichedPayments;
      if (dispositionFilter === 'pending') {
        filtered = enrichedPayments.filter((p: any) => !p.disposition);
      } else if (dispositionFilter === 'dispositioned') {
        filtered = enrichedPayments.filter((p: any) => !!p.disposition);
      }

      // Apply search filter on patient name
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (p: any) =>
            p.patient?.firstName?.toLowerCase().includes(q) ||
            p.patient?.lastName?.toLowerCase().includes(q) ||
            p.patient?.email?.toLowerCase().includes(q) ||
            p.stripeInvoiceNumber?.toLowerCase().includes(q)
        );
      }

      // Summary stats
      const pendingCount = enrichedPayments.filter((p: any) => !p.disposition).length;
      const dispositionedCount = enrichedPayments.filter((p: any) => !!p.disposition).length;
      const totalRevenueCents = enrichedPayments.reduce(
        (sum: number, p: any) => sum + (p.amount || 0),
        0
      );
      const totalCommissionCents = enrichedPayments.reduce(
        (sum: number, p: any) => sum + (p.disposition?.commissionAmountCents || 0),
        0
      );

      return NextResponse.json({
        payments: filtered,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        summary: {
          totalPayments: total,
          pendingDisposition: pendingCount,
          dispositioned: dispositionedCount,
          totalRevenueCents,
          totalCommissionCents,
        },
      });
    };

    if (user.role === 'super_admin') {
      return await withoutClinicFilter(runQuery);
    }
    return await runWithClinicContext(clinicId!, runQuery);
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/admin/sales-rep/sales-tracker' } });
  }
}

// ============================================================================
// POST — Disposition a payment
// ============================================================================

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = dispositionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { paymentId, commissionType, salesRepId, notes } = parsed.data;

    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 403 });
    }

    const runDisposition = async () => {
      // Verify payment exists and is succeeded
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          amount: true,
          clinicId: true,
          patientId: true,
          status: true,
          paidAt: true,
        },
      });

      if (!payment) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
      }

      if (payment.status !== 'SUCCEEDED') {
        return NextResponse.json(
          { error: 'Only succeeded payments can be dispositioned' },
          { status: 400 }
        );
      }

      if (clinicId && payment.clinicId !== clinicId) {
        return NextResponse.json(
          { error: 'Payment does not belong to this clinic' },
          { status: 403 }
        );
      }

      // Check if already dispositioned
      const existingCommission = await prisma.salesRepCommissionEvent.findFirst({
        where: {
          isManual: true,
          metadata: {
            path: ['paymentId'],
            equals: paymentId,
          },
        },
      });

      if (existingCommission) {
        return NextResponse.json(
          { error: 'Payment already dispositioned', existingCommissionId: existingCommission.id },
          { status: 409 }
        );
      }

      // Verify sales rep exists and is eligible
      const rep = await prisma.user.findFirst({
        where: {
          id: salesRepId,
          role: { in: [...COMMISSION_ELIGIBLE_ROLES] },
          status: 'ACTIVE',
        },
        select: { id: true, firstName: true, lastName: true, clinicId: true },
      });

      if (!rep) {
        return NextResponse.json(
          { error: 'Sales rep not found or not eligible for commissions' },
          { status: 404 }
        );
      }

      const targetClinicId = payment.clinicId || clinicId || rep.clinicId;
      if (!targetClinicId) {
        return NextResponse.json({ error: 'Unable to determine clinic' }, { status: 400 });
      }

      // Calculate commission
      const rateBps = COMMISSION_RATES[commissionType];
      const commissionAmountCents = Math.round((payment.amount * rateBps) / 10000);
      const isRecurring = commissionType === 'RECURRING';

      // Create commission event + patient assignment in a transaction
      const result = await prisma.$transaction(
        async (tx) => {
          const commissionEvent = await tx.salesRepCommissionEvent.create({
            data: {
              clinicId: targetClinicId,
              salesRepId,
              eventAmountCents: payment.amount,
              commissionAmountCents,
              baseCommissionCents: commissionAmountCents,
              occurredAt: payment.paidAt || new Date(),
              status: 'APPROVED',
              isManual: true,
              isRecurring,
              patientId: payment.patientId,
              notes: notes || null,
              metadata: {
                source: 'sales_tracker',
                paymentId: payment.id,
                commissionType,
                rateBps,
                createdBy: user.id,
              },
            },
          });

          // Deactivate existing assignments for this patient (if reassigning)
          await tx.patientSalesRepAssignment.updateMany({
            where: {
              patientId: payment.patientId,
              clinicId: targetClinicId,
              isActive: true,
              salesRepId: { not: salesRepId },
            },
            data: {
              isActive: false,
              removedAt: new Date(),
              removedById: user.id,
              removalNote: `Reassigned via Sales Tracker (payment #${paymentId})`,
            },
          });

          // Create or reactivate assignment
          const existingAssignment = await tx.patientSalesRepAssignment.findFirst({
            where: {
              patientId: payment.patientId,
              salesRepId,
              clinicId: targetClinicId,
              isActive: true,
            },
          });

          let assignment = existingAssignment;
          if (!existingAssignment) {
            assignment = await tx.patientSalesRepAssignment.create({
              data: {
                patientId: payment.patientId,
                salesRepId,
                clinicId: targetClinicId,
                assignedById: user.id,
                isActive: true,
              },
            });
          }

          return { commissionEvent, assignment };
        },
        { timeout: 15000 }
      );

      logger.info('[SalesTracker] Payment dispositioned', {
        paymentId,
        commissionEventId: result.commissionEvent.id,
        salesRepId,
        commissionType,
        commissionAmountCents,
        clinicId: targetClinicId,
        dispositionedBy: user.id,
      });

      return NextResponse.json({
        success: true,
        commissionEvent: {
          id: result.commissionEvent.id,
          commissionAmountCents,
          commissionType,
          salesRep: { id: rep.id, firstName: rep.firstName, lastName: rep.lastName },
        },
        assignment: result.assignment
          ? { id: result.assignment.id, salesRepId }
          : null,
      });
    };

    if (user.role === 'super_admin') {
      return await withoutClinicFilter(runDisposition);
    }
    return await runWithClinicContext(clinicId!, runDisposition);
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/admin/sales-rep/sales-tracker' },
    });
  }
}

// ============================================================================
// GET list of sales reps for the dropdown
// ============================================================================

async function handleGetReps(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;

    const fetchReps = async () => {
      const reps = await prisma.user.findMany({
        where: {
          role: { in: [...COMMISSION_ELIGIBLE_ROLES] },
          status: 'ACTIVE',
          ...(clinicId ? { clinicId } : {}),
        },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      return reps;
    };

    const reps =
      user.role === 'super_admin'
        ? await withoutClinicFilter(fetchReps)
        : await runWithClinicContext(clinicId!, fetchReps);

    return NextResponse.json({ reps });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/admin/sales-rep/sales-tracker (reps)' },
    });
  }
}

// Route the action param
async function routeGet(req: NextRequest, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('action') === 'reps') {
    return handleGetReps(req, user);
  }
  return handleGet(req, user);
}

export const GET = withAuth(routeGet, { roles: ['super_admin', 'admin'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
