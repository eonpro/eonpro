import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { withReadFallback } from '@/lib/database/read-replica';
import { executeDbRead } from '@/lib/database/executeDb';

/**
 * GET /api/admin/lifefile-status
 * Check LifeFile webhook status for WellMedR
 *
 * Query params:
 *   ?clinic=wellmedr (default)
 *   ?days=7 (default, how many days to look back)
 *
 * Auth: JWT via withAdminAuth (admin or super_admin)
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Parse query params
    const { searchParams } = new URL(req.url);
    const clinicSubdomain = searchParams.get('clinic') || 'wellmedr';
    const days = parseInt(searchParams.get('days') || '7', 10);
    const lookbackDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Find clinic
    const clinicResult = await executeDbRead(
      () =>
        withReadFallback((db) =>
          db.clinic.findFirst({
            where: {
              OR: [
                { subdomain: clinicSubdomain },
                { name: { contains: clinicSubdomain, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              name: true,
              subdomain: true,
              lifefileEnabled: true,
              lifefilePracticeId: true,
            },
          })
        ),
      'adminLifefileStatus:findClinic'
    );
    if (!clinicResult.success) {
      throw new Error(clinicResult.error?.message ?? 'Failed to load clinic');
    }
    const clinic = clinicResult.data;

    if (!clinic) {
      return NextResponse.json(
        {
          error: `Clinic '${clinicSubdomain}' not found`,
        },
        { status: 404 }
      );
    }

    // Get webhook logs for LifeFile endpoints
    const webhookLogsResult = await executeDbRead(
      () =>
        withReadFallback((db) =>
          db.webhookLog.findMany({
            where: {
              createdAt: { gte: lookbackDate },
              OR: [{ endpoint: { contains: 'lifefile' } }, { endpoint: { contains: 'wellmedr' } }],
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              endpoint: true,
              status: true,
              statusCode: true,
              createdAt: true,
              ipAddress: true,
              processingTimeMs: true,
              errorMessage: true,
              clinicId: true,
            },
          })
        ),
      'adminLifefileStatus:webhookLogs'
    );
    if (!webhookLogsResult.success) {
      throw new Error(webhookLogsResult.error?.message ?? 'Failed to load webhook logs');
    }
    const webhookLogs = webhookLogsResult.data ?? [];

    // Group webhook logs by endpoint
    const webhooksByEndpoint: Record<
      string,
      {
        total: number;
        success: number;
        failed: number;
        lastReceived: Date | null;
        lastStatus: string | null;
      }
    > = {};

    for (const log of webhookLogs) {
      const endpoint = log.endpoint || 'unknown';
      if (!webhooksByEndpoint[endpoint]) {
        webhooksByEndpoint[endpoint] = {
          total: 0,
          success: 0,
          failed: 0,
          lastReceived: null,
          lastStatus: null,
        };
      }

      const entry = webhooksByEndpoint[endpoint];
      entry.total++;

      if (log.status === 'SUCCESS') {
        entry.success++;
      } else {
        entry.failed++;
      }

      if (!entry.lastReceived || log.createdAt > entry.lastReceived) {
        entry.lastReceived = log.createdAt;
        entry.lastStatus = log.status;
      }
    }

    // Get shipping updates for clinic
    const [
      shippingUpdatesResult,
      ordersWithTrackingResult,
      ordersWithLifefileIdResult,
      ordersMissingTrackingResult,
    ] = await Promise.all([
      executeDbRead(
        () =>
          withReadFallback((db) =>
            db.patientShippingUpdate.findMany({
              where: {
                clinicId: clinic.id,
                createdAt: { gte: lookbackDate },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
              include: {
                patient: {
                  select: { firstName: true, lastName: true, patientId: true },
                },
              },
            })
          ),
        'adminLifefileStatus:shippingUpdates'
      ),
      executeDbRead(
        () =>
          withReadFallback((db) =>
            db.order.findMany({
              where: {
                clinicId: clinic.id,
                trackingNumber: { not: null },
                createdAt: { gte: lookbackDate },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
              include: {
                patient: {
                  select: { firstName: true, lastName: true, patientId: true },
                },
              },
            })
          ),
        'adminLifefileStatus:ordersWithTracking'
      ),
      executeDbRead(
        () =>
          withReadFallback((db) =>
            db.order.count({
              where: {
                clinicId: clinic.id,
                lifefileOrderId: { not: null },
              },
            })
          ),
        'adminLifefileStatus:ordersWithLifefileId'
      ),
      executeDbRead(
        () =>
          withReadFallback((db) =>
            db.order.count({
              where: {
                clinicId: clinic.id,
                trackingNumber: null,
                status: { notIn: ['CANCELLED', 'FAILED'] },
                createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
              },
            })
          ),
        'adminLifefileStatus:ordersMissingTracking'
      ),
    ]);
    if (
      !shippingUpdatesResult.success ||
      !ordersWithTrackingResult.success ||
      !ordersWithLifefileIdResult.success ||
      !ordersMissingTrackingResult.success
    ) {
      throw new Error('Failed to load one or more lifefile status datasets');
    }
    const shippingUpdates = shippingUpdatesResult.data ?? [];
    const ordersWithTracking = ordersWithTrackingResult.data ?? [];
    const ordersWithLifefileId = ordersWithLifefileIdResult.data ?? 0;
    const ordersMissingTracking = ordersMissingTrackingResult.data ?? 0;

    // Calculate summary stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const webhooksToday = webhookLogs.filter((l) => l.createdAt >= today).length;
    const shippingUpdatesToday = shippingUpdates.filter((s) => s.createdAt >= today).length;

    // Filter out test data
    const realWebhooks = webhookLogs.filter((l) => {
      const payload = l as any;
      const payloadStr = JSON.stringify(payload.payload || '');
      return !payloadStr.includes('VERIFY-TEST') && !payloadStr.includes('test-verify');
    });

    const hasRealDataFromLifeFile = shippingUpdates.some(
      (s) => s.source === 'lifefile' && !s.trackingNumber?.includes('TEST')
    );

    logger.info('[LIFEFILE STATUS] Admin checked status', {
      clinicId: clinic.id,
      subdomain: clinicSubdomain,
      webhookLogsCount: webhookLogs.length,
    });

    return NextResponse.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain,
        lifefileEnabled: clinic.lifefileEnabled,
        lifefilePracticeId: clinic.lifefilePracticeId,
      },

      summary: {
        lookbackDays: days,
        webhooksToday,
        shippingUpdatesToday,
        totalWebhooksInPeriod: webhookLogs.length,
        totalShippingUpdates: shippingUpdates.length,
        ordersWithTracking: ordersWithTracking.length,
        ordersWithLifefileId,
        ordersMissingTracking,
        hasRealDataFromLifeFile,
      },

      webhookEndpoints: {
        configured: {
          shipping: '/api/webhooks/wellmedr-shipping',
          dataPush: '/api/webhooks/lifefile-data-push',
          prescriptionStatus: '/api/webhooks/lifefile/prescription-status',
        },
        activity: webhooksByEndpoint,
      },

      recentWebhookLogs: webhookLogs.slice(0, 10).map((log) => ({
        id: log.id,
        endpoint: log.endpoint,
        status: log.status,
        statusCode: log.statusCode,
        createdAt: log.createdAt,
        createdAgo: getTimeAgo(log.createdAt),
        ipAddress: log.ipAddress,
        processingTimeMs: log.processingTimeMs,
        errorMessage: log.errorMessage,
      })),

      recentShippingUpdates: shippingUpdates.slice(0, 10).map((update) => ({
        id: update.id,
        patient: `${update.patient?.firstName ?? ''} ${update.patient?.lastName ?? ''}`,
        patientId: update.patient?.patientId,
        trackingNumber: update.trackingNumber,
        carrier: update.carrier,
        status: update.status,
        source: update.source,
        lifefileOrderId: update.lifefileOrderId,
        createdAt: update.createdAt,
        createdAgo: getTimeAgo(update.createdAt),
      })),

      recentOrdersWithTracking: ordersWithTracking.slice(0, 10).map((order) => ({
        id: order.id,
        patient: `${order.patient.firstName} ${order.patient.lastName}`,
        patientId: order.patient.patientId,
        lifefileOrderId: order.lifefileOrderId,
        trackingNumber: order.trackingNumber,
        shippingStatus: order.shippingStatus,
        status: order.status,
        lastWebhookAt: order.lastWebhookAt,
        createdAt: order.createdAt,
        createdAgo: getTimeAgo(order.createdAt),
      })),

      diagnosis: getDiagnosis(
        webhooksByEndpoint,
        shippingUpdates.length,
        hasRealDataFromLifeFile,
        webhooksToday
      ),

      checkedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('[LIFEFILE STATUS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getDiagnosis(
  webhooksByEndpoint: Record<string, any>,
  shippingUpdatesCount: number,
  hasRealDataFromLifeFile: boolean,
  webhooksToday: number
): {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  recommendations: string[];
} {
  const recommendations: string[] = [];

  // Check if webhooks are configured
  const hasShippingWebhook = webhooksByEndpoint['/api/webhooks/wellmedr-shipping'];
  const hasDataPushWebhook = webhooksByEndpoint['/api/webhooks/lifefile-data-push'];

  if (!hasShippingWebhook && !hasDataPushWebhook) {
    return {
      status: 'error',
      message: 'No webhook activity detected from LifeFile',
      recommendations: [
        'Contact LifeFile (support@lifefile.net) to verify Data Push is configured',
        'Confirm they are sending to: https://app.eonpro.io/api/webhooks/wellmedr-shipping',
        'Verify credentials are set via LIFEFILE_WEBHOOK_USERNAME and LIFEFILE_WEBHOOK_PASSWORD env vars',
      ],
    };
  }

  // Check for recent activity
  if (webhooksToday === 0) {
    recommendations.push('No webhooks received today - check if LifeFile is actively sending');
  }

  // Check for real data (not just tests)
  if (!hasRealDataFromLifeFile && shippingUpdatesCount > 0) {
    recommendations.push('Only test data detected - waiting for real shipments from LifeFile');
  }

  // Check for errors
  const totalErrors = Object.values(webhooksByEndpoint).reduce(
    (sum: number, e: any) => sum + (e.failed || 0),
    0
  );

  if (totalErrors > 0) {
    recommendations.push(`${totalErrors} webhook errors detected - check logs for details`);
  }

  if (hasRealDataFromLifeFile && webhooksToday > 0) {
    return {
      status: 'healthy',
      message: 'LifeFile integration is working correctly',
      recommendations: recommendations.length > 0 ? recommendations : ['All systems operational'],
    };
  }

  if (shippingUpdatesCount > 0 || Object.keys(webhooksByEndpoint).length > 0) {
    return {
      status: 'warning',
      message: 'Webhook endpoints are receiving data, but may need attention',
      recommendations:
        recommendations.length > 0
          ? recommendations
          : ['Monitor for incoming real data from LifeFile'],
    };
  }

  return {
    status: 'error',
    message: 'LifeFile integration needs configuration',
    recommendations: [
      'Contact LifeFile to configure Data Push service',
      'Endpoint: https://app.eonpro.io/api/webhooks/wellmedr-shipping',
      'Auth: Basic Auth with credentials from LIFEFILE_WEBHOOK_USERNAME/LIFEFILE_WEBHOOK_PASSWORD env vars',
    ],
  };
}

export const GET = withAdminAuth(handleGet);
