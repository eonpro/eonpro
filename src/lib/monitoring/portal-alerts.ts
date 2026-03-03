/**
 * PATIENT PORTAL ALERT SERVICE
 * ============================
 * Sends Slack alerts specifically for patient portal health events.
 * Handles deduplication, state transitions, and recovery messages.
 *
 * Uses SLACK_PORTAL_ALERTS_WEBHOOK if set, otherwise falls back to
 * SLACK_MONITORING_WEBHOOK or SLACK_WEBHOOK_URL.
 *
 * @module monitoring/portal-alerts
 */

import { logger } from '@/lib/logger';
import type { ProbeResult, ProbeStatus } from './portal-metrics';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function getWebhookUrl(): string | undefined {
  return (
    process.env.SLACK_PORTAL_ALERTS_WEBHOOK ||
    process.env.SLACK_MONITORING_WEBHOOK ||
    process.env.SLACK_WEBHOOK_URL
  );
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

let lastAlertTime = 0;
let lastAlertStatus: ProbeStatus | null = null;

function shouldSendAlert(status: ProbeStatus): boolean {
  const now = Date.now();

  // Always send recovery alerts
  if (status === 'healthy' && lastAlertStatus && lastAlertStatus !== 'healthy') {
    lastAlertTime = now;
    lastAlertStatus = status;
    return true;
  }

  // Dedup same-status alerts within window
  if (status === lastAlertStatus && now - lastAlertTime < DEDUP_WINDOW_MS) {
    return false;
  }

  lastAlertTime = now;
  lastAlertStatus = status;
  return true;
}

// ---------------------------------------------------------------------------
// Slack Message Builders
// ---------------------------------------------------------------------------

const STATUS_EMOJI: Record<ProbeStatus, string> = {
  healthy: ':white_check_mark:',
  degraded: ':warning:',
  unhealthy: ':rotating_light:',
};

function buildProbeFields(probes: ProbeResult[]): Array<{ type: string; text: string }> {
  return probes.map((p) => ({
    type: 'mrkdwn',
    text: `*${p.name}:* ${STATUS_EMOJI[p.status]} ${p.status} (${p.latencyMs}ms)${p.message ? `\n${p.message}` : ''}`,
  }));
}

interface PortalAlertPayload {
  status: ProbeStatus;
  probes: ProbeResult[];
  durationMs: number;
  dashboardUrl?: string;
}

function buildDegradedMessage(payload: PortalAlertPayload) {
  const failedProbes = payload.probes.filter((p) => p.status !== 'healthy');
  const emoji = payload.status === 'unhealthy' ? ':rotating_light:' : ':warning:';
  const severity = payload.status === 'unhealthy' ? 'CRITICAL' : 'WARNING';
  const mention = payload.status === 'unhealthy' ? '<!channel> ' : '';

  return {
    text: `${emoji} [${severity}] Patient Portal ${payload.status.toUpperCase()}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Patient Portal ${severity}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${mention}${failedProbes.length} probe(s) reporting issues. Patients may be affected.`,
        },
      },
      {
        type: 'section',
        fields: buildProbeFields(payload.probes),
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Check duration:* ${payload.durationMs}ms | *Time:* ${new Date().toISOString()}${payload.dashboardUrl ? ` | <${payload.dashboardUrl}|View Dashboard>` : ''}`,
          },
        ],
      },
    ],
  };
}

function buildRecoveryMessage(payload: PortalAlertPayload) {
  return {
    text: ':white_check_mark: Patient Portal RECOVERED',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':white_check_mark: Patient Portal Recovered',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'All probes healthy. Portal is fully operational.',
        },
      },
      {
        type: 'section',
        fields: buildProbeFields(payload.probes),
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Check duration:* ${payload.durationMs}ms | *Time:* ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a portal health alert to Slack. Handles dedup and state transitions.
 * Returns true if an alert was actually sent.
 */
export async function sendPortalAlert(payload: PortalAlertPayload): Promise<boolean> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    logger.debug('[PortalAlerts] No webhook configured, skipping');
    return false;
  }

  if (!shouldSendAlert(payload.status)) {
    logger.debug('[PortalAlerts] Alert deduped', { status: payload.status });
    return false;
  }

  const isRecovery = payload.status === 'healthy';
  const message = isRecovery
    ? buildRecoveryMessage(payload)
    : buildDegradedMessage(payload);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn('[PortalAlerts] Slack webhook returned non-OK', { status: res.status });
      return false;
    }

    logger.info('[PortalAlerts] Alert sent', {
      status: payload.status,
      isRecovery,
    });
    return true;
  } catch (err) {
    logger.warn('[PortalAlerts] Failed to send', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return false;
  }
}
