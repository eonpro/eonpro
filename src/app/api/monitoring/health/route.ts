/**
 * Health check endpoint for monitoring
 * Returns 200 if the application is running
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/health
 * Basic health check - confirms the application is responding
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: 0,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  };

  health.responseTime = Date.now() - startTime;

  return NextResponse.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
