/**
 * DATABASE METRICS API
 * ====================
 *
 * Admin endpoint for monitoring database performance:
 * - Query optimizer metrics
 * - Connection pool status
 * - Cache hit rates
 * - Slow query tracking
 *
 * GET /api/admin/database-metrics - Get all metrics
 * POST /api/admin/database-metrics/clear-cache - Clear caches
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  getDatabaseMetrics,
  getDatabaseHealth,
  clearAllCaches,
  invalidateEntity,
} from '@/lib/database';
import { logger } from '@/lib/logger';

// Control Center: super_admin only
const ALLOWED_ROLES = ['super_admin'];

/**
 * GET - Retrieve database metrics
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const metrics = getDatabaseMetrics();
    const health = getDatabaseHealth();

    return NextResponse.json({
      health,
      metrics,
      recommendations: generateRecommendations(metrics, health),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get database metrics', { error: errorMsg });
    return NextResponse.json({ error: 'Failed to retrieve metrics' }, { status: 500 });
  }
});

/**
 * POST - Cache management operations
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, entityType, entityId } = body;

    switch (action) {
      case 'clear-all':
        await clearAllCaches();
        logger.info('All caches cleared', { userId: user.id });
        return NextResponse.json({
          success: true,
          message: 'All caches cleared',
        });

      case 'invalidate':
        if (!entityType) {
          return NextResponse.json({ error: 'entityType is required' }, { status: 400 });
        }
        await invalidateEntity(entityType, entityId);
        logger.info('Entity cache invalidated', {
          userId: user.id,
          entityType,
          entityId,
        });
        return NextResponse.json({
          success: true,
          message: `Cache invalidated for ${entityType}${entityId ? `:${entityId}` : ''}`,
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: clear-all, invalidate' },
          { status: 400 }
        );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache operation failed', { error: errorMsg, userId: user.id });
    return NextResponse.json({ error: 'Cache operation failed' }, { status: 500 });
  }
});

/**
 * Generate performance recommendations based on metrics
 */
function generateRecommendations(
  metrics: ReturnType<typeof getDatabaseMetrics>,
  health: ReturnType<typeof getDatabaseHealth>
): string[] {
  const recommendations: string[] = [];
  const queryMetrics = metrics.queryOptimizer;

  // Cache hit rate recommendations
  const cacheHitRate =
    queryMetrics.totalQueries > 0 ? (queryMetrics.cacheHits / queryMetrics.totalQueries) * 100 : 0;

  if (cacheHitRate < 50 && queryMetrics.totalQueries > 100) {
    recommendations.push(
      'Cache hit rate is below 50%. Consider reviewing cache TTL settings or adding more cacheable queries.'
    );
  }

  // Slow query recommendations
  const slowQueryRate =
    queryMetrics.totalQueries > 0
      ? (queryMetrics.slowQueries / queryMetrics.totalQueries) * 100
      : 0;

  if (slowQueryRate > 5) {
    recommendations.push(
      `${slowQueryRate.toFixed(1)}% of queries are slow (>500ms). Review query patterns and add indexes.`
    );
  }

  // Average query time recommendations
  if (queryMetrics.avgQueryTime > 200) {
    recommendations.push(
      `Average query time is ${Math.round(queryMetrics.avgQueryTime)}ms. Consider query optimization or index review.`
    );
  }

  // Connection pool recommendations
  if (health.status === 'degraded') {
    recommendations.push(
      'Connection pool is degraded. Monitor for connection leaks or increase pool size.'
    );
  } else if (health.status === 'unhealthy') {
    recommendations.push('Connection pool is unhealthy! Immediate investigation required.');
  }

  // L1 cache recommendations
  const l1Stats = queryMetrics.l1CacheStats;
  if (l1Stats.size > l1Stats.maxSize * 0.9) {
    recommendations.push(
      'L1 memory cache is near capacity. Consider increasing maxSize or reducing TTL.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Database performance is within normal parameters.');
  }

  return recommendations;
}
