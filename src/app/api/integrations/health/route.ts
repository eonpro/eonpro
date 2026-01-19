/**
 * Integration Health Endpoint
 * 
 * Public endpoint for external systems (WeightLossIntake) to check EONPRO health.
 * 
 * GET /api/integrations/health
 * 
 * Returns:
 * - status: healthy | degraded | unhealthy
 * - services: database, redis, webhook status
 * - metrics: success rate, latency, queue depth
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHealthStatus, sendHealthAlert } from '@/lib/monitoring/healthMonitor';
import { logger } from '@/lib/logger';

// Cache health status for 30 seconds to avoid hammering services
let cachedHealth: { data: Awaited<ReturnType<typeof getHealthStatus>>; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const requestId = `health-${Date.now()}`;
  
  try {
    // Check cache
    if (cachedHealth && Date.now() - cachedHealth.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        ...cachedHealth.data,
        cached: true,
        cacheAge: Date.now() - cachedHealth.timestamp,
      });
    }

    // Get fresh health status
    const health = await getHealthStatus();
    
    // Update cache
    cachedHealth = { data: health, timestamp: Date.now() };

    // Send alert if unhealthy
    if (health.status === 'unhealthy') {
      await sendHealthAlert(health);
    }

    // Determine HTTP status code
    const httpStatus = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;

    logger.debug(`[Health ${requestId}] Status: ${health.status}`);

    return NextResponse.json({
      ...health,
      cached: false,
    }, { status: httpStatus });
  } catch (err) {
    logger.error(`[Health ${requestId}] Check failed:`, err);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Health check failed',
      checks: {
        database: { status: 'down', lastCheck: new Date().toISOString() },
        redis: { status: 'down', lastCheck: new Date().toISOString() },
        webhook: { status: 'down', lastCheck: new Date().toISOString() },
      },
      metrics: {
        successRate: 0,
        avgLatencyMs: 0,
        requestsLastHour: 0,
        errorsLastHour: 0,
        queueDepth: 0,
      },
    }, { status: 503 });
  }
}

// HEAD request for simple availability check
export async function HEAD() {
  try {
    const health = cachedHealth?.data || await getHealthStatus();
    const httpStatus = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    return new NextResponse(null, { status: httpStatus });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
