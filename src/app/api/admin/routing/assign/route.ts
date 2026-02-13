/**
 * Admin Routing - Manual Assignment API
 *
 * POST - Admin manually assigns a prescription to a provider
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerRoutingService } from '@/services/provider';
import { z } from 'zod';

const assignSchema = z.object({
  orderId: z.number().int().positive(),
  providerId: z.number().int().positive(),
});

/**
 * POST /api/admin/routing/assign
 * Admin manually assigns a prescription to a provider
 */
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;

    // Super admin can assign for any clinic (clinicId might be in body)
    // Admin must have a clinic
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Admin must be associated with a clinic' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = assignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { orderId, providerId } = parsed.data;

    logger.info('[ADMIN-ROUTING] Manual assignment', {
      userId: user.id,
      clinicId,
      orderId,
      providerId,
    });

    // Perform manual assignment
    const result = await providerRoutingService.manuallyAssign(orderId, providerId, user.id);

    logger.info('[ADMIN-ROUTING] Assignment successful', {
      orderId,
      providerId,
      providerName: result.providerName,
      assignedBy: user.email,
    });

    return NextResponse.json({
      success: true,
      message: 'Prescription assigned successfully',
      assignment: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not found')) {
      return NextResponse.json({ error: errorMessage }, { status: 404 });
    }

    logger.error('[ADMIN-ROUTING] Error assigning prescription', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to assign prescription', details: errorMessage },
      { status: 500 }
    );
  }
}

export const POST = withAdminAuth(handlePost);
