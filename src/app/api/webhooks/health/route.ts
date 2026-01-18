import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Webhook Health Check Endpoint
 * 
 * GET /api/webhooks/health
 * 
 * Returns the health status of all webhook integrations.
 * Use this for external monitoring (Uptime Robot, Pingdom, etc.)
 * 
 * Public endpoint - no auth required (for monitoring services)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface WebhookHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccess: string | null;
  last24hCount: number;
  last24hErrors: number;
  successRate: string;
  avgResponseTime: string | null;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  
  // Optional: Search for specific patient (requires auth)
  const patientSearch = searchParams.get('patient');
  const authSecret = req.headers.get('x-webhook-secret');
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  
  try {
    // If patient search requested, require authentication
    if (patientSearch && authSecret === configuredSecret) {
      const patients = await prisma.patient.findMany({
        where: {
          OR: [
            { firstName: { contains: patientSearch, mode: 'insensitive' } },
            { lastName: { contains: patientSearch, mode: 'insensitive' } },
            { email: { contains: patientSearch, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          clinicId: true,
          tags: true,
          createdAt: true,
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      
      return NextResponse.json({
        search: patientSearch,
        found: patients.length,
        patients: patients.map(p => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          email: p.email,
          clinicId: p.clinicId,
          clinicName: p.clinic?.name || 'Unknown',
          clinicSubdomain: p.clinic?.subdomain || null,
          tags: p.tags,
          createdAt: p.createdAt,
          isolationStatus: p.clinic?.subdomain === 'eonmeds' || p.clinic?.name?.includes('EONMEDS') 
            ? '✅ Correctly isolated to EONMEDS' 
            : '⚠️ NOT in EONMEDS clinic',
        })),
      });
    }
    // Get webhook statistics from audit logs
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last1h = new Date(now.getTime() - 60 * 60 * 1000);

    // Count recent webhook events
    const [
      intakeSuccessCount,
      intakeErrorCount,
      lastIntakeSuccess,
      recentIntakeSubmissions,
      eonmedsClinic,
      dbHealthy,
    ] = await Promise.all([
      // Successful intake webhooks in last 24h
      prisma.auditLog.count({
        where: {
          action: { in: ['PATIENT_INTAKE_RECEIVED', 'PARTIAL_INTAKE_RECEIVED'] },
          createdAt: { gte: last24h },
        },
      }),
      // Failed webhook attempts (if logged)
      prisma.auditLog.count({
        where: {
          action: 'WEBHOOK_ERROR',
          createdAt: { gte: last24h },
        },
      }).catch(() => 0),
      // Last successful intake
      prisma.auditLog.findFirst({
        where: {
          action: { in: ['PATIENT_INTAKE_RECEIVED', 'PARTIAL_INTAKE_RECEIVED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      // Recent patient documents from webhooks
      prisma.patientDocument.count({
        where: {
          source: 'weightlossintake',
          createdAt: { gte: last24h },
        },
      }),
      // Check EONMEDS clinic exists
      prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: 'eonmeds' },
            { name: { contains: 'EONMEDS', mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true },
      }),
      // Database health check
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    ]);

    // Calculate health status
    const totalIntake = intakeSuccessCount + intakeErrorCount;
    const successRate = totalIntake > 0 
      ? ((intakeSuccessCount / totalIntake) * 100).toFixed(1) 
      : '100.0';

    // Determine webhook health status
    let webhookStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (parseFloat(successRate) < 50) {
      webhookStatus = 'down';
    } else if (parseFloat(successRate) < 95 || intakeErrorCount > 5) {
      webhookStatus = 'degraded';
    }

    // Check if we've received any webhooks recently (last hour)
    const lastSuccessTime = lastIntakeSuccess?.createdAt;
    const hoursSinceLastSuccess = lastSuccessTime 
      ? (now.getTime() - lastSuccessTime.getTime()) / (1000 * 60 * 60)
      : null;

    // Build health report
    const webhooks: WebhookHealth[] = [
      {
        name: 'weightlossintake',
        status: webhookStatus,
        lastSuccess: lastSuccessTime?.toISOString() || null,
        last24hCount: intakeSuccessCount,
        last24hErrors: intakeErrorCount,
        successRate: `${successRate}%`,
        avgResponseTime: null, // Could add if we track response times
      },
    ];

    // Overall system health
    const systemHealth = {
      database: dbHealthy ? 'healthy' : 'down',
      eonmedsClinic: eonmedsClinic ? 'configured' : 'missing',
      webhookSecret: process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET ? 'configured' : 'missing',
    };

    const overallStatus = 
      !dbHealthy ? 'down' :
      !eonmedsClinic ? 'degraded' :
      !process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET ? 'degraded' :
      webhookStatus;

    const responseTime = Date.now() - startTime;

    const response = {
      status: overallStatus,
      timestamp: now.toISOString(),
      responseTime: `${responseTime}ms`,
      webhooks,
      system: systemHealth,
      statistics: {
        last24h: {
          totalWebhooks: intakeSuccessCount,
          documentsGenerated: recentIntakeSubmissions,
          errors: intakeErrorCount,
        },
        lastSuccess: {
          timestamp: lastSuccessTime?.toISOString() || null,
          hoursAgo: hoursSinceLastSuccess ? hoursSinceLastSuccess.toFixed(1) : null,
        },
      },
      endpoints: {
        intake: 'https://app.eonpro.io/api/webhooks/weightlossintake',
        test: 'https://app.eonpro.io/api/webhooks/test',
        health: 'https://app.eonpro.io/api/webhooks/health',
      },
    };

    // Log health check
    logger.debug('[WEBHOOK HEALTH] Health check completed', {
      status: overallStatus,
      responseTime,
    });

    // Return appropriate status code based on health
    const statusCode = overallStatus === 'healthy' ? 200 : 
                       overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    logger.error('[WEBHOOK HEALTH] Health check failed:', error);
    
    return NextResponse.json({
      status: 'down',
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }
}
