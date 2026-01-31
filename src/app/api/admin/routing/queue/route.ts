/**
 * Admin Routing Queue API
 * 
 * GET - Get the routing queue for admin view (unassigned and assigned counts)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerRoutingService } from '@/services/provider';

/**
 * GET /api/admin/routing/queue
 * Get the admin routing queue view
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const clinicIdParam = searchParams.get('clinicId');
    
    // Use query param if super admin, otherwise use user's clinic
    let clinicId: number | undefined;
    
    if (user.role === 'super_admin' && clinicIdParam) {
      clinicId = parseInt(clinicIdParam, 10);
    } else {
      clinicId = user.clinicId;
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    // Check if routing is enabled for this clinic
    const config = await providerRoutingService.getRoutingConfig(clinicId);
    
    if (!config?.routingEnabled) {
      return NextResponse.json({
        enabled: false,
        message: 'Provider routing is not enabled for this clinic',
        config: null,
        unassigned: [],
        assigned: [],
        providers: [],
      });
    }

    logger.info('[ADMIN-ROUTING] Getting routing queue', {
      userId: user.id,
      clinicId,
      routingStrategy: config.routingStrategy,
    });

    // Get admin routing queue
    const queue = await providerRoutingService.getAdminRoutingQueue(clinicId);

    return NextResponse.json({
      enabled: true,
      config: {
        routingStrategy: config.routingStrategy,
        soapApprovalMode: config.soapApprovalMode,
        compensationEnabled: config.compensationEnabled,
        autoAssignOnPayment: config.autoAssignOnPayment,
      },
      ...queue,
      counts: {
        unassigned: queue.unassigned.length,
        totalAssigned: queue.assigned.reduce((sum, a) => sum + a.count, 0),
        providers: queue.providers.length,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-ROUTING] Error getting routing queue', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to get routing queue', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
