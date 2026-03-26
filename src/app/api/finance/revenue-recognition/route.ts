/**
 * REVENUE RECOGNITION API
 *
 * GET /api/finance/revenue-recognition
 *   ?type=waterfall|journals|summary (default: waterfall)
 *   &months=12
 *   &clinicId=1 (super_admin only)
 *
 * POST /api/finance/revenue-recognition
 *   { action: 'process' } - Run monthly recognition
 *   { action: 'sync', clinicId } - Sync subscription entries from Stripe
 *
 * PROTECTED: admin/super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import {
  getRevenueWaterfall,
  getJournalEntries,
  processMonthlyRecognition,
  syncSubscriptionEntries,
} from '@/services/finance/revenueRecognitionService';

export const dynamic = 'force-dynamic';

async function getHandler(request: NextRequest, user: AuthUser) {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'waterfall';
    const months = Math.min(parseInt(searchParams.get('months') || '12'), 24);

    let clinicId: number | undefined;
    if (user.role === 'super_admin' && searchParams.get('clinicId')) {
      clinicId = parseInt(searchParams.get('clinicId')!);
    } else if (user.clinicId) {
      clinicId = user.clinicId;
    }

    switch (type) {
      case 'waterfall': {
        const data = await getRevenueWaterfall(clinicId, months);
        return NextResponse.json({ success: true, type: 'waterfall', ...data });
      }
      case 'journals': {
        const limit = parseInt(searchParams.get('limit') || '100');
        const offset = parseInt(searchParams.get('offset') || '0');
        const data = await getJournalEntries(clinicId, limit, offset);
        return NextResponse.json({ success: true, type: 'journals', ...data });
      }
      default:
        return NextResponse.json({ error: 'Invalid type', validTypes: ['waterfall', 'journals'] }, { status: 400 });
    }
  } catch (error) {
    logger.error('[RevRec API] GET failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: 'Failed to fetch revenue recognition data' }, { status: 500 });
  }
}

async function postHandler(request: NextRequest, user: AuthUser) {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { action, clinicId: bodyClinicId, period } = body;

    switch (action) {
      case 'process': {
        const result = await processMonthlyRecognition(period);
        return NextResponse.json({ success: true, ...result });
      }
      case 'sync': {
        const targetClinicId = user.role === 'super_admin' ? bodyClinicId : user.clinicId;
        if (!targetClinicId) {
          return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
        }
        const result = await syncSubscriptionEntries(targetClinicId);
        return NextResponse.json({ success: true, ...result });
      }
      default:
        return NextResponse.json({ error: 'Invalid action', validActions: ['process', 'sync'] }, { status: 400 });
    }
  } catch (error) {
    logger.error('[RevRec API] POST failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
