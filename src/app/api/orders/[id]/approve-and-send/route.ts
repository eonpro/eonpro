/**
 * POST /api/orders/[id]/approve-and-send
 * Provider approves an admin-queued prescription and sends it to the pharmacy (Lifefile).
 * Enterprise: Records PRESCRIPTION_APPROVED in HIPAA audit.
 *
 * @security Requires provider (or admin) with access to the order's clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService } from '@/domains/provider';
import { getClinicLifefileClient } from '@/lib/clinic-lifefile';
import lifefile, { getEnvCredentials } from '@/lib/lifefile';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { tenantNotFoundResponse } from '@/lib/tenant-response';
import { logger } from '@/lib/logger';
import type { LifefileOrderPayload } from '@/lib/lifefile';

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

    const providerClinicIds = await providerService.getClinicIdsForProviderUser(
      user.id,
      user.providerId
    );
    if (providerClinicIds.length === 0) {
      return NextResponse.json(
        { error: 'Provider must be associated with at least one clinic' },
        { status: 400 }
      );
    }

    let order: Awaited<ReturnType<typeof prisma.order.findUnique>> = null;
    for (const cid of providerClinicIds) {
      order = await runWithClinicContext(cid, () =>
        prisma.order.findUnique({
          where: { id: orderId },
          include: {
            patient: { select: { id: true, clinicId: true } },
            clinic: true,
            provider: true,
            rxs: true,
          },
        })
      );
      if (order) break;
    }

    if (!order) return tenantNotFoundResponse();

    if (order.status !== 'queued_for_provider') {
      return NextResponse.json(
        {
          error:
            'Order is not awaiting provider approval. Only queued prescriptions can be approved and sent.',
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

    const requestJson = order.requestJson;
    if (!requestJson || typeof requestJson !== 'string') {
      return NextResponse.json(
        { error: 'Order payload missing. Cannot send to pharmacy.' },
        { status: 400 }
      );
    }

    const { safeParseJsonString } = await import('@/lib/utils/safe-json');
    const payload = safeParseJsonString<LifefileOrderPayload>(requestJson);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid order payload. Cannot send to pharmacy.' },
        { status: 400 }
      );
    }

    const clinicClient = order.clinicId ? await getClinicLifefileClient(order.clinicId) : null;
    const client = clinicClient ?? lifefile;
    if (!clinicClient && !getEnvCredentials()) {
      return NextResponse.json(
        { error: 'Lifefile not configured for this clinic' },
        { status: 400 }
      );
    }
    let orderResponse: { orderId?: string | number; status?: string };
    try {
      orderResponse = await client.createFullOrder(payload);
    } catch (lifefileError: unknown) {
      const errorMessage =
        lifefileError instanceof Error ? lifefileError.message : 'Unknown Lifefile error';
      logger.error('[APPROVE-AND-SEND] Lifefile API failed', {
        orderId: order.id,
        error: errorMessage,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'error',
          errorMessage: `Lifefile submission failed: ${errorMessage}`,
        },
      });
      return NextResponse.json(
        {
          error: 'Failed to send prescription to pharmacy',
          detail: errorMessage,
          recoverable: true,
        },
        { status: 502 }
      );
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        lifefileOrderId: orderResponse.orderId != null ? String(orderResponse.orderId) : undefined,
        status: orderResponse.status ?? 'sent',
        responseJson: JSON.stringify(orderResponse),
        approvedByUserId: user.id,
        approvedAt: new Date(),
      },
    });

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: order.clinicId ?? undefined,
        eventType: AuditEventType.PRESCRIPTION_APPROVED,
        resourceType: 'Order',
        resourceId: String(order.id),
        patientId: order.patientId,
        action: 'prescription_approved_sent_to_pharmacy',
        outcome: 'SUCCESS',
        metadata: { orderId: order.id, lifefileOrderId: updated.lifefileOrderId },
      });
    } catch (auditErr) {
      logger.error('[APPROVE-AND-SEND] Audit log failed', {
        orderId: order.id,
        error: auditErr instanceof Error ? auditErr.message : 'Unknown',
      });
    }

    return NextResponse.json({
      success: true,
      order: {
        id: updated.id,
        status: updated.status,
        lifefileOrderId: updated.lifefileOrderId,
        approvedAt: updated.approvedAt,
      },
      message: 'Prescription approved and sent to pharmacy.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[APPROVE-AND-SEND] Error', { error: message });
    return NextResponse.json(
      { error: 'Failed to approve and send prescription', details: message },
      { status: 500 }
    );
  }
}

export const POST = (req: NextRequest, context: Params) => withProviderAuth(handler)(req, context);
