/**
 * Provider Routing - Claim Prescription API
 * 
 * POST - Provider claims a prescription from the available queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerRoutingService } from '@/services/provider';
import { z } from 'zod';

const claimSchema = z.object({
  orderId: z.number().int().positive(),
});

/**
 * POST /api/provider/routing/claim
 * Provider claims a prescription from the queue
 */
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    const providerId = user.providerId;
    if (!providerId) {
      return NextResponse.json(
        { error: 'User is not linked to a provider profile' },
        { status: 400 }
      );
    }

    // Check if routing is enabled for this clinic
    const config = await providerRoutingService.getRoutingConfig(clinicId);
    
    if (!config?.routingEnabled) {
      return NextResponse.json(
        { error: 'Provider routing is not enabled for this clinic' },
        { status: 400 }
      );
    }

    if (config.routingStrategy !== 'PROVIDER_CHOICE') {
      return NextResponse.json(
        { error: 'This clinic does not use provider self-select routing' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = claimSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { orderId } = parsed.data;

    logger.info('[PROVIDER-ROUTING] Provider claiming prescription', {
      userId: user.id,
      providerId,
      clinicId,
      orderId,
    });

    // Claim the prescription
    const result = await providerRoutingService.claimPrescription(orderId, providerId);

    logger.info('[PROVIDER-ROUTING] Prescription claimed', {
      orderId,
      providerId,
      providerName: result.providerName,
    });

    return NextResponse.json({
      success: true,
      message: 'Prescription claimed successfully',
      assignment: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle specific errors
    if (errorMessage.includes('already assigned')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 409 } // Conflict
      );
    }

    logger.error('[PROVIDER-ROUTING] Error claiming prescription', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to claim prescription', details: errorMessage },
      { status: 500 }
    );
  }
}

export const POST = withProviderAuth(handlePost);
