/**
 * Admin Refill Rejection API
 * 
 * POST /api/admin/refill-queue/[id]/reject - Reject refill request
 * 
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { getRefillById, rejectRefill } from '@/services/refill';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Reject refill request
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) => {
  try {
    const { id } = await context.params;
    const refillId = parseInt(id);

    if (isNaN(refillId)) {
      return NextResponse.json({ error: 'Invalid refill ID' }, { status: 400 });
    }

    const refill = await getRefillById(refillId);

    if (!refill) {
      return NextResponse.json({ error: 'Refill not found' }, { status: 404 });
    }

    // Check clinic access
    if (user.role !== 'super_admin' && refill.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if already processed
    if (refill.adminApproved !== null) {
      return NextResponse.json(
        { error: `Refill already ${refill.adminApproved ? 'approved' : 'rejected'}` },
        { status: 400 }
      );
    }

    // Check status
    if (refill.status !== 'PENDING_ADMIN') {
      return NextResponse.json(
        { error: `Cannot reject refill in status: ${refill.status}. Must be PENDING_ADMIN.` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    const updatedRefill = await rejectRefill(refillId, user.id, reason.trim());

    logger.info('[Admin RefillQueue] Refill rejected', {
      refillId,
      userId: user.id,
      patientId: refill.patientId,
      reason,
    });

    return NextResponse.json({
      success: true,
      refill: updatedRefill,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Admin RefillQueue] Error rejecting refill', { error: message });
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin'] });
