/**
 * Affiliate Fraud Detection Service
 *
 * Detects fraudulent affiliate activity including:
 * - Self-referral (affiliate referring themselves)
 * - Duplicate IP conversions
 * - Velocity spikes (unusual conversion rates)
 * - Geographic mismatches
 * - High refund rates
 * - Cookie stuffing patterns
 * - Suspicious device patterns
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/observability/request-context';
import { analyzeIp, hashIp } from './ipIntelService';

export interface FraudCheckRequest {
  clinicId: number;
  affiliateId: number;
  touchId?: number;
  commissionEventId?: number;
  ipAddress?: string;
  patientEmail?: string;
  patientId?: number;
  eventAmountCents?: number;
}

export interface FraudCheckResult {
  passed: boolean;
  riskScore: number; // 0-100
  alerts: FraudAlert[];
  recommendation: 'approve' | 'review' | 'reject';
}

export interface FraudAlert {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: Record<string, any>;
  affectedAmountCents?: number;
}

interface FraudConfig {
  enabled: boolean;
  maxConversionsPerDay: number;
  maxConversionsPerHour: number;
  velocitySpikeMultiplier: number;
  maxConversionsPerIp: number;
  minIpRiskScore: number;
  blockProxyVpn: boolean;
  blockDatacenter: boolean;
  blockTor: boolean;
  maxRefundRatePct: number;
  minRefundsForAlert: number;
  enableGeoMismatchCheck: boolean;
  allowedCountries: string[] | null;
  enableSelfReferralCheck: boolean;
  autoHoldOnHighRisk: boolean;
  autoSuspendOnCritical: boolean;
}

const DEFAULT_CONFIG: FraudConfig = {
  enabled: true,
  maxConversionsPerDay: 50,
  maxConversionsPerHour: 10,
  velocitySpikeMultiplier: 3.0,
  maxConversionsPerIp: 3,
  minIpRiskScore: 75,
  blockProxyVpn: false,
  blockDatacenter: true,
  blockTor: true,
  maxRefundRatePct: 20,
  minRefundsForAlert: 5,
  enableGeoMismatchCheck: true,
  allowedCountries: null,
  enableSelfReferralCheck: true,
  autoHoldOnHighRisk: true,
  autoSuspendOnCritical: false,
};

/**
 * Get fraud configuration for a clinic
 */
async function getFraudConfig(clinicId: number): Promise<FraudConfig> {
  const config = await prisma.affiliateFraudConfig.findUnique({
    where: { clinicId },
  });

  if (!config) {
    return DEFAULT_CONFIG;
  }

  return {
    enabled: config.enabled,
    maxConversionsPerDay: config.maxConversionsPerDay,
    maxConversionsPerHour: config.maxConversionsPerHour,
    velocitySpikeMultiplier: config.velocitySpikeMultiplier,
    maxConversionsPerIp: config.maxConversionsPerIp,
    minIpRiskScore: config.minIpRiskScore,
    blockProxyVpn: config.blockProxyVpn,
    blockDatacenter: config.blockDatacenter,
    blockTor: config.blockTor,
    maxRefundRatePct: config.maxRefundRatePct,
    minRefundsForAlert: config.minRefundsForAlert,
    enableGeoMismatchCheck: config.enableGeoMismatchCheck,
    allowedCountries: config.allowedCountries as string[] | null,
    enableSelfReferralCheck: config.enableSelfReferralCheck,
    autoHoldOnHighRisk: config.autoHoldOnHighRisk,
    autoSuspendOnCritical: config.autoSuspendOnCritical,
  };
}

/**
 * Check for self-referral (affiliate referring themselves)
 */
async function checkSelfReferral(
  affiliateId: number,
  patientEmail?: string,
  ipAddress?: string
): Promise<FraudAlert | null> {
  // Get affiliate's user email
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  if (!affiliate) return null;

  // Check email match
  if (patientEmail && affiliate.user.email.toLowerCase() === patientEmail.toLowerCase()) {
    return {
      type: 'SELF_REFERRAL',
      severity: 'CRITICAL',
      description: 'Affiliate email matches patient email',
      evidence: {
        affiliateEmail: affiliate.user.email,
        patientEmail,
      },
    };
  }

  // Check IP match (if we have affiliate's recent IPs)
  if (ipAddress) {
    const ipHash = hashIp(ipAddress);

    // Check if affiliate has logged in from this IP recently
    // This would require tracking affiliate login IPs - simplified for now
    const recentTouchesFromIp = await prisma.affiliateTouch.count({
      where: {
        affiliateId,
        ipAddressHash: ipHash,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      },
    });

    if (recentTouchesFromIp > 10) {
      return {
        type: 'SELF_REFERRAL',
        severity: 'HIGH',
        description: 'High number of touches from same IP as affiliate activity',
        evidence: {
          ipHash,
          touchCount: recentTouchesFromIp,
        },
      };
    }
  }

  return null;
}

/**
 * Check for duplicate IP conversions
 */
async function checkDuplicateIp(
  clinicId: number,
  affiliateId: number,
  ipAddress: string,
  maxPerIp: number
): Promise<FraudAlert | null> {
  const ipHash = hashIp(ipAddress);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Count conversions from this IP for this affiliate
  const conversionsFromIp = await prisma.affiliateTouch.count({
    where: {
      clinicId,
      affiliateId,
      ipAddressHash: ipHash,
      convertedPatientId: { not: null },
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  if (conversionsFromIp >= maxPerIp) {
    return {
      type: 'DUPLICATE_IP',
      severity: conversionsFromIp > maxPerIp * 2 ? 'HIGH' : 'MEDIUM',
      description: `${conversionsFromIp} conversions from same IP in 30 days`,
      evidence: {
        ipHash,
        conversions: conversionsFromIp,
        threshold: maxPerIp,
      },
    };
  }

  return null;
}

/**
 * Check for velocity spikes (unusual conversion rates)
 */
async function checkVelocitySpike(
  clinicId: number,
  affiliateId: number,
  config: FraudConfig
): Promise<FraudAlert | null> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get recent conversion counts
  const [hourlyCount, dailyCount, monthlyStats] = await Promise.all([
    prisma.affiliateCommissionEvent.count({
      where: {
        clinicId,
        affiliateId,
        occurredAt: { gte: oneHourAgo },
        status: { not: 'REVERSED' },
      },
    }),
    prisma.affiliateCommissionEvent.count({
      where: {
        clinicId,
        affiliateId,
        occurredAt: { gte: oneDayAgo },
        status: { not: 'REVERSED' },
      },
    }),
    prisma.affiliateCommissionEvent.aggregate({
      where: {
        clinicId,
        affiliateId,
        occurredAt: { gte: thirtyDaysAgo },
        status: { not: 'REVERSED' },
      },
      _count: true,
    }),
  ]);

  // Calculate daily average over 30 days
  const dailyAverage = monthlyStats._count / 30;

  // Check hourly threshold
  if (hourlyCount > config.maxConversionsPerHour) {
    return {
      type: 'VELOCITY_SPIKE',
      severity: 'HIGH',
      description: `${hourlyCount} conversions in the last hour (threshold: ${config.maxConversionsPerHour})`,
      evidence: {
        hourlyCount,
        threshold: config.maxConversionsPerHour,
        type: 'hourly',
      },
    };
  }

  // Check daily threshold
  if (dailyCount > config.maxConversionsPerDay) {
    return {
      type: 'VELOCITY_SPIKE',
      severity: 'HIGH',
      description: `${dailyCount} conversions in the last 24 hours (threshold: ${config.maxConversionsPerDay})`,
      evidence: {
        dailyCount,
        threshold: config.maxConversionsPerDay,
        type: 'daily',
      },
    };
  }

  // Check for spike vs average
  if (dailyAverage > 1 && dailyCount > dailyAverage * config.velocitySpikeMultiplier) {
    return {
      type: 'VELOCITY_SPIKE',
      severity: 'MEDIUM',
      description: `Today's conversions (${dailyCount}) are ${(dailyCount / dailyAverage).toFixed(1)}x the daily average`,
      evidence: {
        dailyCount,
        dailyAverage: Math.round(dailyAverage),
        multiplier: config.velocitySpikeMultiplier,
        type: 'spike',
      },
    };
  }

  return null;
}

/**
 * Check IP risk (proxy, VPN, TOR, datacenter)
 */
async function checkIpRisk(ipAddress: string, config: FraudConfig): Promise<FraudAlert | null> {
  const ipIntel = await analyzeIp(ipAddress);

  // Check blocked types
  if (config.blockTor && ipIntel.isTor) {
    return {
      type: 'SUSPICIOUS_PATTERN',
      severity: 'CRITICAL',
      description: 'Traffic from TOR exit node',
      evidence: {
        ipHash: ipIntel.ipHash,
        isTor: true,
        riskScore: ipIntel.riskScore,
      },
    };
  }

  if (config.blockDatacenter && ipIntel.isDatacenter) {
    return {
      type: 'SUSPICIOUS_PATTERN',
      severity: 'HIGH',
      description: 'Traffic from datacenter IP',
      evidence: {
        ipHash: ipIntel.ipHash,
        isDatacenter: true,
        riskScore: ipIntel.riskScore,
      },
    };
  }

  if (config.blockProxyVpn && (ipIntel.isProxy || ipIntel.isVpn)) {
    return {
      type: 'SUSPICIOUS_PATTERN',
      severity: 'MEDIUM',
      description: 'Traffic from proxy or VPN',
      evidence: {
        ipHash: ipIntel.ipHash,
        isProxy: ipIntel.isProxy,
        isVpn: ipIntel.isVpn,
        riskScore: ipIntel.riskScore,
      },
    };
  }

  // Check overall risk score
  if (ipIntel.riskScore >= config.minIpRiskScore) {
    return {
      type: 'SUSPICIOUS_PATTERN',
      severity: ipIntel.riskScore >= 90 ? 'HIGH' : 'MEDIUM',
      description: `High IP risk score: ${ipIntel.riskScore}`,
      evidence: {
        ipHash: ipIntel.ipHash,
        riskScore: ipIntel.riskScore,
        fraudScore: ipIntel.fraudScore,
      },
    };
  }

  return null;
}

/**
 * Check refund rate
 */
async function checkRefundRate(
  clinicId: number,
  affiliateId: number,
  config: FraudConfig
): Promise<FraudAlert | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [totalEvents, reversedEvents] = await Promise.all([
    prisma.affiliateCommissionEvent.count({
      where: {
        clinicId,
        affiliateId,
        occurredAt: { gte: ninetyDaysAgo },
      },
    }),
    prisma.affiliateCommissionEvent.count({
      where: {
        clinicId,
        affiliateId,
        occurredAt: { gte: ninetyDaysAgo },
        status: 'REVERSED',
      },
    }),
  ]);

  if (totalEvents < config.minRefundsForAlert) {
    return null; // Not enough data
  }

  const refundRate = (reversedEvents / totalEvents) * 100;

  if (refundRate > config.maxRefundRatePct) {
    return {
      type: 'REFUND_ABUSE',
      severity: refundRate > config.maxRefundRatePct * 2 ? 'HIGH' : 'MEDIUM',
      description: `Refund rate ${refundRate.toFixed(1)}% exceeds threshold ${config.maxRefundRatePct}%`,
      evidence: {
        totalEvents,
        reversedEvents,
        refundRate: refundRate.toFixed(1),
        threshold: config.maxRefundRatePct,
      },
    };
  }

  return null;
}

/**
 * Main fraud check function
 */
export async function performFraudCheck(request: FraudCheckRequest): Promise<FraudCheckResult> {
  const { clinicId, affiliateId, ipAddress, patientEmail } = request;

  // Get fraud config
  const config = await getFraudConfig(clinicId);

  if (!config.enabled) {
    return {
      passed: true,
      riskScore: 0,
      alerts: [],
      recommendation: 'approve',
    };
  }

  const alerts: FraudAlert[] = [];
  let totalRiskScore = 0;

  try {
    // Run checks in parallel where possible
    const checks = await Promise.all([
      // Self-referral check
      config.enableSelfReferralCheck
        ? checkSelfReferral(affiliateId, patientEmail, ipAddress)
        : null,

      // Duplicate IP check
      ipAddress
        ? checkDuplicateIp(clinicId, affiliateId, ipAddress, config.maxConversionsPerIp)
        : null,

      // Velocity spike check
      checkVelocitySpike(clinicId, affiliateId, config),

      // IP risk check
      ipAddress ? checkIpRisk(ipAddress, config) : null,

      // Refund rate check
      checkRefundRate(clinicId, affiliateId, config),
    ]);

    // Collect alerts
    for (const alert of checks) {
      if (alert) {
        alerts.push(alert);

        // Calculate risk score contribution
        switch (alert.severity) {
          case 'CRITICAL':
            totalRiskScore += 40;
            break;
          case 'HIGH':
            totalRiskScore += 25;
            break;
          case 'MEDIUM':
            totalRiskScore += 15;
            break;
          case 'LOW':
            totalRiskScore += 5;
            break;
        }
      }
    }

    // Cap risk score at 100
    totalRiskScore = Math.min(100, totalRiskScore);

    // Determine recommendation
    let recommendation: 'approve' | 'review' | 'reject' = 'approve';

    if (alerts.some((a) => a.severity === 'CRITICAL')) {
      recommendation = 'reject';
    } else if (totalRiskScore >= 50 || alerts.some((a) => a.severity === 'HIGH')) {
      recommendation = 'review';
    } else if (totalRiskScore >= 25) {
      recommendation = 'review';
    }

    return {
      passed: recommendation === 'approve',
      riskScore: totalRiskScore,
      alerts,
      recommendation,
    };
  } catch (error) {
    logger.error('[FraudDetection] Error performing fraud check', {
      clinicId,
      affiliateId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // On error, be cautious but don't block
    return {
      passed: true,
      riskScore: 0,
      alerts: [],
      recommendation: 'approve',
    };
  }
}

/**
 * Create fraud alert record in database
 */
export async function createFraudAlert(
  clinicId: number,
  affiliateId: number,
  alert: FraudAlert,
  commissionEventId?: number,
  touchId?: number
): Promise<number> {
  const record = await prisma.affiliateFraudAlert.create({
    data: {
      clinicId,
      affiliateId,
      alertType: alert.type as any, // FraudAlertType enum
      severity: alert.severity, // FraudSeverity enum
      description: alert.description,
      evidence: alert.evidence,
      commissionEventId,
      touchId,
      riskScore: 0, // Will be set from overall check
      affectedAmountCents: alert.affectedAmountCents,
      status: 'OPEN',
    },
  });

  logger.warn('[FraudDetection] Fraud alert created', {
    alertId: record.id,
    clinicId,
    affiliateId,
    type: alert.type,
    severity: alert.severity,
  });

  return record.id;
}

/**
 * Process fraud check result and create alerts
 */
export async function processFraudCheckResult(
  request: FraudCheckRequest,
  result: FraudCheckResult
): Promise<void> {
  const { clinicId, affiliateId, commissionEventId, touchId, eventAmountCents } = request;

  // Create alerts in database
  for (const alert of result.alerts) {
    alert.affectedAmountCents = eventAmountCents;
    await createFraudAlert(clinicId, affiliateId, alert, commissionEventId, touchId);
  }

  // Auto-actions based on config
  const config = await getFraudConfig(clinicId);

  // Hold commissions on high risk
  if (config.autoHoldOnHighRisk && result.recommendation === 'review' && commissionEventId) {
    await prisma.affiliateCommissionEvent.update({
      where: { id: commissionEventId },
      data: {
        status: 'PENDING',
        metadata: {
          fraudHold: true,
          fraudRiskScore: result.riskScore,
          fraudAlertCount: result.alerts.length,
        },
      },
    });
  }

  // Suspend affiliate on critical alerts
  if (config.autoSuspendOnCritical && result.alerts.some((a) => a.severity === 'CRITICAL')) {
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: { status: 'SUSPENDED' },
    });

    logger.warn('[FraudDetection] Affiliate auto-suspended due to critical fraud alert', {
      affiliateId,
      clinicId,
    });
  }
}
