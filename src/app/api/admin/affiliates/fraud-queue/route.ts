/**
 * Affiliate Fraud Queue API
 *
 * Admin endpoint for reviewing and resolving fraud alerts.
 *
 * GET  - List fraud alerts with filters
 * PATCH - Update alert status / resolve
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { badRequest, notFound, forbidden, serverError } from '@/lib/api/error-response';

interface FraudAlertListParams {
  clinicId?: number;
  affiliateId?: number;
  status?: string;
  severity?: string;
  type?: string;
  page?: number;
  limit?: number;
}

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const params: FraudAlertListParams = {
      clinicId: searchParams.get('clinicId') ? parseInt(searchParams.get('clinicId')!) : undefined,
      affiliateId: searchParams.get('affiliateId')
        ? parseInt(searchParams.get('affiliateId')!)
        : undefined,
      status: searchParams.get('status') || undefined,
      severity: searchParams.get('severity') || undefined,
      type: searchParams.get('type') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '50'), 100),
    };

    // Build where clause
    const where: any = {};

    // Scope by clinic for non-super-admin
    if (user.role !== 'super_admin') {
      if (!user.clinicId) {
        return NextResponse.json({ error: 'No clinic access' }, { status: 403 });
      }
      where.clinicId = user.clinicId;
    } else if (params.clinicId) {
      where.clinicId = params.clinicId;
    }

    if (params.affiliateId) {
      where.affiliateId = params.affiliateId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.severity) {
      where.severity = params.severity;
    }

    if (params.type) {
      where.alertType = params.type;
    }

    // Get total count
    const total = await prisma.affiliateFraudAlert.count({ where });

    // Get alerts with pagination
    const alerts = await prisma.affiliateFraudAlert.findMany({
      where,
      include: {
        affiliate: {
          select: {
            id: true,
            displayName: true,
            status: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // OPEN first
        { severity: 'desc' }, // CRITICAL first
        { createdAt: 'desc' },
      ],
      skip: (params.page! - 1) * params.limit!,
      take: params.limit,
    });

    // Get summary stats
    const stats = await prisma.affiliateFraudAlert.groupBy({
      by: ['status'],
      where:
        user.role === 'super_admin'
          ? params.clinicId
            ? { clinicId: params.clinicId }
            : {}
          : { clinicId: user.clinicId! },
      _count: true,
    });

    const severityStats = await prisma.affiliateFraudAlert.groupBy({
      by: ['severity'],
      where: {
        ...(user.role === 'super_admin'
          ? params.clinicId
            ? { clinicId: params.clinicId }
            : {}
          : { clinicId: user.clinicId! }),
        status: 'OPEN',
      },
      _count: true,
    });

    return NextResponse.json({
      alerts: alerts.map((alert: (typeof alerts)[number]) => ({
        id: alert.id,
        createdAt: alert.createdAt,
        clinicId: alert.clinicId,
        clinicName: alert.clinic.name,
        affiliateId: alert.affiliateId,
        affiliateName: alert.affiliate.displayName,
        affiliateEmail: alert.affiliate.user.email,
        affiliateStatus: alert.affiliate.status,
        alertType: alert.alertType,
        severity: alert.severity,
        description: alert.description,
        evidence: alert.evidence,
        riskScore: alert.riskScore,
        affectedAmountCents: alert.affectedAmountCents,
        status: alert.status,
        resolvedAt: alert.resolvedAt,
        resolvedBy: alert.resolvedBy,
        resolution: alert.resolution,
        resolutionAction: alert.resolutionAction,
      })),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit!),
      },
      stats: {
        byStatus: stats.reduce(
          (acc: Record<string, number>, s: { status: string; _count: number }) => {
            acc[s.status] = s._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        bySeverity: severityStats.reduce(
          (acc: Record<string, number>, s: { severity: string; _count: number }) => {
            acc[s.severity] = s._count;
            return acc;
          },
          {} as Record<string, number>
        ),
      },
    });
  } catch (error) {
    logger.error('[FraudQueue] Error listing alerts', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to list fraud alerts');
  }
}

async function handlePatch(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json();
    const { alertId, action, resolution, reversCommission } = body;

    if (!alertId || !action) {
      return badRequest('Missing required fields: alertId, action');
    }

    // Get the alert
    const alert = await prisma.affiliateFraudAlert.findUnique({
      where: { id: alertId },
      include: {
        affiliate: true,
      },
    });

    if (!alert) {
      return notFound('Alert not found');
    }

    // Check clinic access
    if (user.role !== 'super_admin' && alert.clinicId !== user.clinicId) {
      return forbidden('Access denied to this clinic');
    }

    // Process action - use Prisma enum types (must match schema exactly)
    type FraudAlertStatus =
      | 'OPEN'
      | 'INVESTIGATING'
      | 'CONFIRMED_FRAUD'
      | 'FALSE_POSITIVE'
      | 'DISMISSED';
    type FraudResolutionAction =
      | 'NO_ACTION'
      | 'WARNING_ISSUED'
      | 'COMMISSION_REVERSED'
      | 'COMMISSIONS_HELD'
      | 'AFFILIATE_SUSPENDED'
      | 'AFFILIATE_TERMINATED';

    let status: FraudAlertStatus;
    let resolutionAction: FraudResolutionAction | null = null;

    switch (action) {
      case 'dismiss':
        status = 'DISMISSED';
        resolutionAction = 'NO_ACTION';
        break;
      case 'false_positive':
        status = 'FALSE_POSITIVE';
        resolutionAction = 'NO_ACTION';
        break;
      case 'confirm':
        status = 'CONFIRMED_FRAUD';
        resolutionAction = (body.resolutionAction as FraudResolutionAction) || 'WARNING_ISSUED';
        break;
      case 'investigate':
        status = 'INVESTIGATING';
        break;
      default:
        return badRequest('Invalid action. Must be: dismiss, false_positive, confirm, or investigate');
    }

    // Update alert
    const updatedAlert = await prisma.affiliateFraudAlert.update({
      where: { id: alertId },
      data: {
        status,
        resolvedAt: status !== 'INVESTIGATING' ? new Date() : null,
        resolvedBy: status !== 'INVESTIGATING' ? user.id : null,
        resolution: resolution || null,
        resolutionAction,
      },
    });

    // Take additional actions based on resolution
    if (action === 'confirm') {
      // Reverse commission if requested
      if (reversCommission && alert.commissionEventId) {
        await prisma.affiliateCommissionEvent.update({
          where: { id: alert.commissionEventId },
          data: {
            status: 'REVERSED',
            reversedAt: new Date(),
            reversalReason: 'fraud',
          },
        });
      }

      // Apply resolution action to affiliate
      if (body.resolutionAction === 'AFFILIATE_SUSPENDED') {
        await prisma.affiliate.update({
          where: { id: alert.affiliateId },
          data: { status: 'SUSPENDED' },
        });
      } else if (body.resolutionAction === 'AFFILIATE_TERMINATED') {
        await prisma.affiliate.update({
          where: { id: alert.affiliateId },
          data: { status: 'INACTIVE' },
        });
      }
    }

    logger.info('[FraudQueue] Alert resolved', {
      alertId,
      action,
      status,
      resolutionAction,
      resolvedBy: user.id,
    });

    // HIPAA/SOC2 audit log for fraud resolution actions
    logger.security('[AffiliateAudit] Admin resolved fraud alert', {
      action: 'FRAUD_ALERT_RESOLVED',
      alertId,
      fraudAction: action,
      resultStatus: status,
      resolutionAction,
      affiliateId: alert.affiliateId,
      clinicId: alert.clinicId,
      performedBy: user.id,
      performedByRole: user.role,
      commissionReversed: !!reversCommission,
    });

    return NextResponse.json({
      success: true,
      alert: {
        id: updatedAlert.id,
        status: updatedAlert.status,
        resolutionAction: updatedAlert.resolutionAction,
        resolvedAt: updatedAlert.resolvedAt,
      },
    });
  } catch (error) {
    logger.error('[FraudQueue] Error updating alert', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to update fraud alert');
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });

export const PATCH = withAuth(handlePatch, { roles: ['super_admin', 'admin'] });
