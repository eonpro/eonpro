/**
 * Provider Routing - Available Prescriptions API
 *
 * GET - Get prescriptions available for the current provider to claim
 *       (for provider self-select routing mode)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerRoutingService } from '@/services/provider';

/**
 * GET /api/provider/routing/available
 * Get prescriptions available for the current provider to claim
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    // Check if routing is enabled for this clinic
    const config = await providerRoutingService.getRoutingConfig(clinicId);

    if (!config?.routingEnabled) {
      return NextResponse.json({
        enabled: false,
        message: 'Provider routing is not enabled for this clinic',
        items: [],
      });
    }

    // Get provider ID from the authenticated user
    const providerId = user.providerId;

    logger.info('[PROVIDER-ROUTING] Getting available prescriptions', {
      userId: user.id,
      providerId,
      clinicId,
      routingStrategy: config.routingStrategy,
    });

    // Get unassigned prescriptions (filtered by provider's license state if applicable)
    const items = await providerRoutingService.getUnassignedPrescriptions(
      clinicId,
      providerId ?? undefined
    );

    // Also get provider's currently assigned queue
    const assignedQueue = providerId
      ? await providerRoutingService.getProviderAssignedQueue(providerId, clinicId)
      : [];

    return NextResponse.json({
      enabled: true,
      routingStrategy: config.routingStrategy,
      soapApprovalMode: config.soapApprovalMode,
      available: items,
      assigned: assignedQueue,
      counts: {
        available: items.length,
        assigned: assignedQueue.length,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PROVIDER-ROUTING] Error getting available prescriptions', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to get available prescriptions', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withProviderAuth(handleGet);
