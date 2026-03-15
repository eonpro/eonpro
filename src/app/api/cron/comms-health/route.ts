/**
 * COMMUNICATIONS HEALTH MONITOR
 * =============================
 *
 * Cron job that deeply tests email (AWS SES) and SMS (Twilio) connectivity
 * every 15 minutes. Sends Slack alerts when either service is unreachable.
 *
 * Tests performed:
 *   - SES: Calls GetSendQuota to prove credentials + connectivity
 *   - Twilio: Fetches account status to prove credentials + connectivity
 *   - Config: Verifies feature flags and env vars are present
 *
 * @see vercel.json for cron schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { alertCritical, alertWarning, alertInfo } from '@/lib/observability/slack-alerts';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { isSESEnabled, isSESConfigured } from '@/lib/integrations/aws/sesConfig';
import { isTwilioConfigured } from '@/lib/integrations/twilio/config';
import { isFeatureEnabled } from '@/lib/features';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ServiceCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

const PROBE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function checkSES(): Promise<ServiceCheck> {
  const start = Date.now();

  if (!isFeatureEnabled('AWS_SES_EMAIL')) {
    return {
      name: 'AWS SES (Email)',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: 'Feature flag NEXT_PUBLIC_ENABLE_AWS_SES_EMAIL is not enabled',
      details: { featureFlag: false },
    };
  }

  if (!isSESConfigured()) {
    return {
      name: 'AWS SES (Email)',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: 'AWS SES credentials are missing (ACCESS_KEY, SECRET, FROM_EMAIL, or REGION)',
      details: { configured: false },
    };
  }

  try {
    const { getSendQuota } = await import('@/lib/integrations/aws/sesService');
    const quota = await withTimeout(getSendQuota(), PROBE_TIMEOUT_MS, 'SES GetSendQuota');
    const latencyMs = Date.now() - start;

    if (quota.max24HourSend === 0 && quota.maxSendRate === 0) {
      return {
        name: 'AWS SES (Email)',
        status: 'degraded',
        latencyMs,
        message: 'SES returned zero quota — may be in sandbox or throttled',
        details: { quota },
      };
    }

    const usagePercent = quota.max24HourSend > 0
      ? Math.round((quota.sentLast24Hours / quota.max24HourSend) * 100)
      : 0;

    const status = usagePercent > 90 ? 'degraded' : latencyMs > 3000 ? 'degraded' : 'healthy';

    return {
      name: 'AWS SES (Email)',
      status,
      latencyMs,
      message: status === 'healthy'
        ? `Operational — ${quota.sentLast24Hours}/${quota.max24HourSend} emails sent (${usagePercent}% of quota)`
        : `High usage: ${usagePercent}% of daily quota consumed`,
      details: { quota, usagePercent },
    };
  } catch (error) {
    return {
      name: 'AWS SES (Email)',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown SES error',
    };
  }
}

async function checkTwilio(): Promise<ServiceCheck> {
  const start = Date.now();

  if (!isFeatureEnabled('TWILIO_SMS')) {
    return {
      name: 'Twilio (SMS)',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: 'Feature flag NEXT_PUBLIC_ENABLE_TWILIO_SMS is not enabled',
      details: { featureFlag: false },
    };
  }

  if (!isTwilioConfigured()) {
    return {
      name: 'Twilio (SMS)',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: 'Twilio credentials are missing (ACCOUNT_SID, AUTH_TOKEN, or PHONE_NUMBER)',
      details: { configured: false },
    };
  }

  if (process.env.TWILIO_USE_MOCK === 'true') {
    return {
      name: 'Twilio (SMS)',
      status: 'degraded',
      latencyMs: Date.now() - start,
      message: 'TWILIO_USE_MOCK=true — real SMS will NOT be delivered',
      details: { mockMode: true },
    };
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, {
      timeout: PROBE_TIMEOUT_MS,
    });
    const account = await withTimeout(
      client.api.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch(),
      PROBE_TIMEOUT_MS,
      'Twilio account fetch'
    );
    const latencyMs = Date.now() - start;

    if (account.status !== 'active') {
      return {
        name: 'Twilio (SMS)',
        status: 'unhealthy',
        latencyMs,
        message: `Twilio account status is "${account.status}" — SMS delivery may be blocked`,
        details: { accountStatus: account.status },
      };
    }

    return {
      name: 'Twilio (SMS)',
      status: latencyMs > 3000 ? 'degraded' : 'healthy',
      latencyMs,
      message: `Operational — account active, from: ${process.env.TWILIO_PHONE_NUMBER}`,
    };
  } catch (error) {
    return {
      name: 'Twilio (SMS)',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown Twilio error',
    };
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const checks = await Promise.all([checkSES(), checkTwilio()]);

    const hasUnhealthy = checks.some((c) => c.status === 'unhealthy');
    const hasDegraded = checks.some((c) => c.status === 'degraded');
    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    if (hasUnhealthy) {
      const downServices = checks.filter((c) => c.status === 'unhealthy');
      await alertCritical(
        'Communications Service DOWN',
        `Password reset emails/texts may not be delivering.\n${downServices.map((s) => `• *${s.name}*: ${s.message}`).join('\n')}`,
        {
          ...Object.fromEntries(downServices.map((s) => [s.name, s.message])),
          action: 'Check Vercel env vars and AWS/Twilio dashboards immediately',
        }
      );
    } else if (hasDegraded) {
      const degraded = checks.filter((c) => c.status === 'degraded');
      await alertWarning(
        'Communications Service Degraded',
        `Email/SMS delivery may be impacted.\n${degraded.map((s) => `• *${s.name}*: ${s.message}`).join('\n')}`,
        Object.fromEntries(degraded.map((s) => [s.name, s.message]))
      );
    }

    if (overallStatus !== 'healthy') {
      logger.warn('[CommsHealth] Communications not fully healthy', {
        status: overallStatus,
        checks: checks.map((c) => ({ name: c.name, status: c.status, message: c.message })),
      });
    } else {
      logger.info('[CommsHealth] All communications services healthy', {
        ses: checks[0].message,
        twilio: checks[1].message,
      });
    }

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        checks,
      },
      {
        status: overallStatus === 'unhealthy' ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CommsHealth] Cron failed', error instanceof Error ? error : undefined);

    await alertCritical(
      'Communications health monitor failed',
      `The comms health cron itself crashed: ${message}`,
      { error: message }
    );

    return NextResponse.json(
      { status: 'unhealthy', error: message, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
