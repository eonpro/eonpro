import { prisma } from '@/lib/db';
import { WebhookStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export interface WebhookLogData {
  endpoint: string;
  request: NextRequest;
  payload?: any;
  status: WebhookStatus;
  statusCode: number;
  errorMessage?: string;
  responseData?: any;
  processingTimeMs?: number;
}

export async function logWebhookAttempt(data: WebhookLogData) {
  try {
    // Extract headers (redact sensitive information)
    const headers: Record<string, string> = {};
    data.request.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('token') ||
        lowerKey.includes('api-key')
      ) {
        headers[key] = '[REDACTED]';
      } else {
        headers[key] = value;
      }
    });

    // Get IP address
    const ipAddress =
      data.request.headers.get('x-forwarded-for') ||
      data.request.headers.get('x-real-ip') ||
      'unknown';

    const userAgent = data.request.headers.get('user-agent') || 'unknown';

    await prisma.webhookLog.create({
      data: {
        endpoint: data.endpoint,
        method: data.request.method,
        headers,
        payload: data.payload,
        status: data.status,
        statusCode: data.statusCode,
        errorMessage: data.errorMessage,
        responseData: data.responseData,
        ipAddress,
        userAgent,
        processingTimeMs: data.processingTimeMs,
      },
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[WebhookLogger] Failed to log webhook attempt:', error);
    // Don't throw - logging failures shouldn't break the webhook
  }
}

export async function getWebhookStats(endpoint?: string, days: number = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = {
    createdAt: { gte: since },
    ...(endpoint && { endpoint }),
  };

  const [total, successful, failed, invalidAuth, invalidPayload] = await Promise.all([
    prisma.webhookLog.count({ where }),
    prisma.webhookLog.count({
      where: { ...where, status: WebhookStatus.SUCCESS },
    }),
    prisma.webhookLog.count({
      where: { ...where, status: WebhookStatus.ERROR },
    }),
    prisma.webhookLog.count({
      where: { ...where, status: WebhookStatus.INVALID_AUTH },
    }),
    prisma.webhookLog.count({
      where: { ...where, status: WebhookStatus.INVALID_PAYLOAD },
    }),
  ]);

  // Get recent logs
  const recentLogs = await prisma.webhookLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      endpoint: true,
      status: true,
      statusCode: true,
      errorMessage: true,
      createdAt: true,
      processingTimeMs: true,
    },
  });

  // Calculate average processing time
  const avgProcessingTime = await prisma.webhookLog.aggregate({
    where: {
      ...where,
      status: WebhookStatus.SUCCESS,
      processingTimeMs: { not: null },
    },
    _avg: {
      processingTimeMs: true,
    },
  });

  return {
    total,
    successful,
    failed,
    invalidAuth,
    invalidPayload,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    avgProcessingTimeMs: avgProcessingTime._avg.processingTimeMs || 0,
    recentLogs,
  };
}

export async function cleanOldWebhookLogs(daysToKeep: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const deleted = await prisma.webhookLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  return deleted.count;
}
