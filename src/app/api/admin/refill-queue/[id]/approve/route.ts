/**
 * Admin Refill Approval API
 * 
 * POST /api/admin/refill-queue/[id]/approve - Approve refill for provider queue
 * 
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { getRefillById, approveRefill } from '@/services/refill';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Approve refill for provider queue
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

    // Check if already approved
    if (refill.adminApproved === true) {
      return NextResponse.json(
        { error: 'Refill already approved' },
        { status: 400 }
      );
    }

    // Check status
    if (refill.status !== 'PENDING_ADMIN') {
      return NextResponse.json(
        { error: `Cannot approve refill in status: ${refill.status}. Must be PENDING_ADMIN.` },
        { status: 400 }
      );
    }

    // Check payment verification
    if (!refill.paymentVerified) {
      return NextResponse.json(
        { error: 'Payment must be verified before approval' },
        { status: 400 }
      );
    }

    // Parse optional body - notes are optional
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is OK for approval
    }
    const { notes } = body;

    const updatedRefill = await approveRefill(refillId, user.id, notes);

    logger.info('[Admin RefillQueue] Refill approved', {
      refillId,
      userId: user.id,
      patientId: refill.patientId,
    });

    return NextResponse.json({
      success: true,
      refill: updatedRefill,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Admin RefillQueue] Error approving refill', { error: message });
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin'] });
