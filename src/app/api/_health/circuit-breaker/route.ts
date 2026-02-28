/**
 * Circuit Breaker Health/Diagnostic Endpoint
 * ============================================
 *
 * GET /api/_health/circuit-breaker
 *
 * Returns the current state of the two-layer circuit breaker:
 * - Local (in-memory) breaker state for this serverless instance
 * - Global (Redis) breaker state shared across all instances
 * - Configuration and feature flag status
 *
 * Protected: requires super_admin or CRON_SECRET header.
 * Does NOT hit the database — safe to call even during outages.
 *
 * @module api/_health/circuit-breaker
 */

import { NextRequest, NextResponse } from 'next/server';
import { circuitBreaker } from '@/lib/database/circuit-breaker/index';
import { getQueryBudgetMetrics } from '@/lib/database/query-budget';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Auth: accept CRON_SECRET or check for super_admin via x-user-role header
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const userRole = req.headers.get('x-user-role');

  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isSuperAdmin = userRole === 'super_admin';

  if (!isCron && !isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await circuitBreaker.getSnapshot();
    const queryBudget = getQueryBudgetMetrics();

    const response = {
      timestamp: new Date().toISOString(),
      circuitBreaker: {
        enabled: snapshot.enabled,
        local: {
          state: snapshot.local.state,
          failureCount: snapshot.local.failureCount,
          lastTripReason: snapshot.local.lastTripReason,
          lastTripAt: snapshot.local.lastTripAt
            ? new Date(snapshot.local.lastTripAt).toISOString()
            : null,
          probesInFlight: snapshot.local.probesInFlight,
        },
        global: {
          isOpen: snapshot.global.isOpen,
          reason: snapshot.global.reason,
          trippedBy: snapshot.global.trippedBy,
          ttlRemaining: snapshot.global.ttlRemaining,
        },
      },
      currentRequest: queryBudget
        ? {
            queryCount: queryBudget.queryCount,
            cumulativeDbTimeMs: queryBudget.cumulativeDbTimeMs,
            route: queryBudget.route,
          }
        : null,
      environment: {
        DB_CIRCUIT_BREAKER_ENABLED: process.env.DB_CIRCUIT_BREAKER_ENABLED ?? 'true (default)',
        QUERY_BUDGET_WARN: process.env.QUERY_BUDGET_WARN ?? '8 (default)',
        QUERY_BUDGET_ERROR: process.env.QUERY_BUDGET_ERROR ?? '15 (default)',
        MAX_INCLUDE_DEPTH: process.env.MAX_INCLUDE_DEPTH ?? '3 (default)',
        BLOCK_DEEP_INCLUDES: process.env.BLOCK_DEEP_INCLUDES ?? 'false (default)',
      },
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logger.error('[CircuitBreakerHealth] Failed to get snapshot', error);
    return NextResponse.json(
      { error: 'Failed to read circuit breaker state' },
      { status: 500 }
    );
  }
}
