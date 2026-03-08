import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { fedexEnvironment, resolveCredentialsWithAttribution } from '@/lib/fedex';

type ClinicFedExConfig = {
  id: number;
  name: string;
  fedexEnabled: boolean;
  fedexClientId: string | null;
  fedexClientSecret: string | null;
  fedexAccountNumber: string | null;
};

function hasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function evaluateClinicFedExRouting(clinic: ClinicFedExConfig, allowEnvFallback: boolean) {
  const hasClientId = hasValue(clinic.fedexClientId);
  const hasClientSecret = hasValue(clinic.fedexClientSecret);
  const hasAccountNumber = hasValue(clinic.fedexAccountNumber);
  const clinicConfigComplete = clinic.fedexEnabled && hasClientId && hasClientSecret && hasAccountNumber;
  const hasAnyClinicConfig = hasClientId || hasClientSecret || hasAccountNumber;

  try {
    const resolution = resolveCredentialsWithAttribution(clinic, { allowEnvFallback });
    const driftRisk =
      resolution.source === 'env' && (clinic.fedexEnabled || hasAnyClinicConfig || allowEnvFallback);
    return {
      status: clinicConfigComplete ? 'clinic_configured' : resolution.source === 'env' ? 'env_fallback' : 'unknown',
      hasClientId,
      hasClientSecret,
      hasAccountNumber,
      clinicConfigComplete,
      hasAnyClinicConfig,
      credentialSource: resolution.source,
      accountFingerprint: resolution.accountFingerprint,
      fedexEnvironment: resolution.environment,
      usedEnvFallback: resolution.usedEnvFallback,
      driftRisk,
      warning:
        driftRisk && clinic.fedexEnabled
          ? 'Clinic FedEx is enabled but routing via environment fallback.'
          : driftRisk
            ? 'Routing via environment fallback.'
            : null,
    };
  } catch (error) {
    return {
      status: clinic.fedexEnabled || hasAnyClinicConfig ? 'misconfigured' : 'not_configured',
      hasClientId,
      hasClientSecret,
      hasAccountNumber,
      clinicConfigComplete,
      hasAnyClinicConfig,
      credentialSource: null,
      accountFingerprint: null,
      fedexEnvironment: fedexEnvironment(),
      usedEnvFallback: false,
      driftRisk: Boolean(clinic.fedexEnabled || hasAnyClinicConfig),
      warning: error instanceof Error ? error.message : 'FedEx routing unavailable',
    };
  }
}

async function handleGetFedExVisibilityAudit(req: NextRequest, user: AuthUser) {
  try {
    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';
    const scopeAllClinics = user.role === 'super_admin';

    const clinics = await prisma.clinic.findMany({
      where: scopeAllClinics ? {} : { id: user.clinicId ?? -1 },
      select: {
        id: true,
        name: true,
        fedexEnabled: true,
        fedexClientId: true,
        fedexClientSecret: true,
        fedexAccountNumber: true,
      },
      orderBy: { name: 'asc' },
      take: 200,
    });

    const clinicAudit = clinics.map((clinic) => ({
      clinicId: clinic.id,
      clinicName: clinic.name,
      fedexEnabled: clinic.fedexEnabled,
      ...evaluateClinicFedExRouting(clinic, allowEnvFallback),
    }));

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentLabels, recentShippingUpdates] = await Promise.all([
      prisma.shipmentLabel.findMany({
        where: {
          createdAt: { gte: since },
          ...(scopeAllClinics ? {} : { clinicId: user.clinicId }),
        },
        select: {
          id: true,
          clinicId: true,
          patientId: true,
          orderId: true,
          trackingNumber: true,
          status: true,
          serviceType: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
      }),
      prisma.patientShippingUpdate.findMany({
        where: {
          source: 'fedex_label',
          createdAt: { gte: since },
          ...(scopeAllClinics ? {} : { clinicId: user.clinicId }),
        },
        select: {
          id: true,
          clinicId: true,
          patientId: true,
          trackingNumber: true,
          createdAt: true,
          rawPayload: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 400,
      }),
    ]);

    const routingByTrackingPatient = new Map<string, Record<string, unknown>>();
    for (const update of recentShippingUpdates) {
      const routing = (update.rawPayload as Record<string, unknown> | null)?.fedexRouting;
      if (routing && typeof routing === 'object') {
        const key = `${update.trackingNumber}-${update.patientId}`;
        if (!routingByTrackingPatient.has(key)) {
          routingByTrackingPatient.set(key, routing as Record<string, unknown>);
        }
      }
    }

    const recentAttribution = recentLabels.map((label) => {
      const key = `${label.trackingNumber}-${label.patientId}`;
      const routing = routingByTrackingPatient.get(key) || null;
      return {
        labelId: label.id,
        clinicId: label.clinicId,
        patientId: label.patientId,
        orderId: label.orderId,
        trackingNumber: label.trackingNumber,
        status: label.status,
        serviceType: label.serviceType,
        createdAt: label.createdAt,
        routing,
      };
    });

    const summary = {
      clinicsAudited: clinicAudit.length,
      clinicConfigured: clinicAudit.filter((c) => c.status === 'clinic_configured').length,
      envFallback: clinicAudit.filter((c) => c.status === 'env_fallback').length,
      misconfigured: clinicAudit.filter((c) => c.status === 'misconfigured').length,
      driftRisk: clinicAudit.filter((c) => c.driftRisk).length,
      recentLabels: recentLabels.length,
      labelsWithRoutingTelemetry: recentAttribution.filter((l) => !!l.routing).length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      scope: scopeAllClinics ? 'all_clinics' : 'current_clinic',
      fedexEnvironment: fedexEnvironment(),
      allowEnvFallbackForClinicShipping: allowEnvFallback,
      summary,
      clinics: clinicAudit,
      recentShipmentAttribution: recentAttribution,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/shipping/fedex-visibility' });
  }
}

export const GET = withAuth(handleGetFedExVisibilityAudit, {
  roles: ['super_admin', 'admin'],
});

