/**
 * POST /api/orders/[id]/decline
 * Provider declines an admin-queued prescription.
 * Enterprise: Records PRESCRIPTION_DECLINED in HIPAA audit.
 *
 * @security Requires provider (or admin) with access to the order's clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { tenantNotFoundResponse } from '@/lib/tenant-response';
import { logger } from '@/lib/logger';
import { providerService } from '@/domains/provider';

type Params = { params: Promise<{ id: string }> };

async function handler(req: NextRequest, user: AuthUser, context?: Params) {
  try {
    const params = context?.params;
    if (!params) {
      return NextResponse.json({ error: 'Route context missing' }, { status: 500 });
    }
    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    const body = await req.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'A reason for declining is required (minimum 10 characters)' },
        { status: 400 }
      );
    }

    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'No clinic context. Please log in again.' },
        { status: 400 }
      );
    }

    const providerClinicIds = await providerService.getClinicIdsForProviderUser(
      user.id, user.providerId ?? null
    );

    const order = await runWithClinicContext(user.clinicId, () =>
      prisma.order.findUnique({
        where: { id: orderId },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, clinicId: true } },
          clinic: { select: { id: true, name: true } },
        },
      })
    );

    if (!order) return tenantNotFoundResponse();

    if (order.status !== 'queued_for_provider') {
      return NextResponse.json(
        {
          error:
            'Order is not awaiting provider approval. Only queued prescriptions can be declined.',
        },
        { status: 400 }
      );
    }

    if (
      order.clinicId != null &&
      !providerClinicIds.includes(order.clinicId) &&
      user.role !== 'super_admin'
    ) {
      return tenantNotFoundResponse();
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'declined',
        errorMessage: `Declined by provider: ${reason.trim()}`,
        approvedByUserId: user.id,
        approvedAt: new Date(),
      },
    });

    logger.info('[ORDER-DECLINE] Order declined by provider', {
      orderId: order.id,
      patientId: order.patientId,
      declinedBy: user.email,
      userId: user.id,
      reason: reason.trim(),
      clinicId: order.clinicId,
    });

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: order.clinicId ?? undefined,
        eventType: AuditEventType.PRESCRIPTION_DECLINED,
        resourceType: 'Order',
        resourceId: String(order.id),
        patientId: order.patientId,
        action: 'prescription_declined_by_provider',
        outcome: 'SUCCESS',
        metadata: { orderId: order.id, reason: reason.trim() },
      });
    } catch (auditErr) {
      logger.error('[ORDER-DECLINE] Audit log failed', {
        orderId: order.id,
        error: auditErr instanceof Error ? auditErr.message : 'Unknown',
      });
    }

    return NextResponse.json({
      success: true,
      order: {
        id: updated.id,
        status: updated.status,
      },
      message: 'Prescription declined.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ORDER-DECLINE] Error', { error: message });
    return NextResponse.json(
      { error: 'Failed to decline prescription', details: message },
      { status: 500 }
    );
  }
}

export const POST = (req: NextRequest, context: Params) =>
  withProviderAuth(
    handler as (req: NextRequest, user: AuthUser, context?: unknown) => Promise<Response>
  )(req, context);
