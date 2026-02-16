/**
 * SLACK ALERTING SERVICE
 * ======================
 *
 * Sends structured alerts to Slack channels via webhook.
 * Integrated with Sentry alerts and health check monitoring.
 *
 * Environment variables:
 *   SLACK_WEBHOOK_URL          - Primary alert channel (#alerts)
 *   SLACK_MONITORING_WEBHOOK   - Monitoring channel (#monitoring) — optional, falls back to primary
 *   ALERT_EMAIL                - Email for critical alerts (future use)
 *
 * @module observability/slack-alerts
 */

import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

type AlertSeverity = 'critical' | 'warning' | 'info';

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text: string; emoji?: boolean }>;
}

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  channel?: string;
}

interface AlertPayload {
  title: string;
  severity: AlertSeverity;
  description: string;
  details?: Record<string, unknown>;
  route?: string;
  timestamp?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: ':rotating_light:',
  warning: ':warning:',
  info: ':information_source:',
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: '#FF0000',
  warning: '#FFA500',
  info: '#0099FF',
};

// Throttle duplicate alerts: same title within this window is suppressed
const ALERT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const recentAlerts = new Map<string, number>();

// ============================================================================
// Core
// ============================================================================

function getWebhookUrl(severity: AlertSeverity): string | undefined {
  if (severity === 'info') {
    return process.env.SLACK_MONITORING_WEBHOOK || process.env.SLACK_WEBHOOK_URL;
  }
  return process.env.SLACK_WEBHOOK_URL;
}

function isThrottled(key: string): boolean {
  const lastSent = recentAlerts.get(key);
  if (lastSent && Date.now() - lastSent < ALERT_THROTTLE_MS) {
    return true;
  }
  recentAlerts.set(key, Date.now());

  // Cleanup old entries every 100 inserts
  if (recentAlerts.size > 100) {
    const cutoff = Date.now() - ALERT_THROTTLE_MS;
    for (const [k, v] of recentAlerts) {
      if (v < cutoff) recentAlerts.delete(k);
    }
  }
  return false;
}

function buildSlackBlocks(payload: AlertPayload): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${SEVERITY_EMOJI[payload.severity]} ${payload.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: payload.description,
      },
    },
  ];

  // Add details as fields
  if (payload.details && Object.keys(payload.details).length > 0) {
    const fields = Object.entries(payload.details)
      .slice(0, 10) // Max 10 fields
      .map(([key, value]) => ({
        type: 'mrkdwn' as const,
        text: `*${key}:*\n${String(value)}`,
      }));

    blocks.push({ type: 'section', fields });
  }

  // Add context footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*Environment:* ${process.env.NODE_ENV || 'unknown'} | *Time:* ${payload.timestamp || new Date().toISOString()}${payload.route ? ` | *Route:* ${payload.route}` : ''}`,
      },
    ],
  });

  return blocks;
}

/**
 * Send an alert to Slack.
 * Automatically throttles duplicate alerts and selects the right channel.
 */
export async function sendSlackAlert(payload: AlertPayload): Promise<boolean> {
  const webhookUrl = getWebhookUrl(payload.severity);

  if (!webhookUrl) {
    logger.debug('[SlackAlerts] No webhook URL configured, skipping alert', {
      title: payload.title,
    });
    return false;
  }

  // Throttle duplicate alerts
  const throttleKey = `${payload.severity}:${payload.title}`;
  if (isThrottled(throttleKey)) {
    logger.debug('[SlackAlerts] Alert throttled (duplicate within 5min)', {
      title: payload.title,
    });
    return false;
  }

  const message: SlackMessage = {
    text: `${SEVERITY_EMOJI[payload.severity]} [${payload.severity.toUpperCase()}] ${payload.title}`,
    blocks: buildSlackBlocks(payload),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('[SlackAlerts] Webhook returned non-OK', {
        status: response.status,
        title: payload.title,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('[SlackAlerts] Failed to send alert', {
      title: payload.title,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
}

// ============================================================================
// Convenience Methods
// ============================================================================

/**
 * Send a critical alert (immediate attention required).
 */
export async function alertCritical(
  title: string,
  description: string,
  details?: Record<string, unknown>
): Promise<void> {
  await sendSlackAlert({ title, severity: 'critical', description, details });
}

/**
 * Send a warning alert (investigate within 1 hour).
 */
export async function alertWarning(
  title: string,
  description: string,
  details?: Record<string, unknown>
): Promise<void> {
  await sendSlackAlert({ title, severity: 'warning', description, details });
}

/**
 * Send an info alert (monitoring, no action required).
 */
export async function alertInfo(
  title: string,
  description: string,
  details?: Record<string, unknown>
): Promise<void> {
  await sendSlackAlert({ title, severity: 'info', description, details });
}

/**
 * Send a health check alert with structured status information.
 */
export async function alertHealthDegraded(healthReport: {
  status: string;
  checks: Array<{ name: string; status: string; message?: string }>;
}): Promise<void> {
  const unhealthyChecks = healthReport.checks.filter(
    (c) => c.status === 'unhealthy' || c.status === 'degraded'
  );

  const severity: AlertSeverity =
    unhealthyChecks.some((c) => c.status === 'unhealthy') ? 'critical' : 'warning';

  const details: Record<string, unknown> = {};
  for (const check of unhealthyChecks) {
    details[check.name] = `${check.status}${check.message ? ` — ${check.message}` : ''}`;
  }

  await sendSlackAlert({
    title: `Platform Health: ${healthReport.status.toUpperCase()}`,
    severity,
    description: `${unhealthyChecks.length} service(s) reporting issues`,
    details,
  });
}
