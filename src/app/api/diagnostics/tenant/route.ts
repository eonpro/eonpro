/**
 * Tenant Diagnostics Endpoint — Labs Tab / Tenant Uniformity Diagnosis
 * ===================================================================
 *
 * GET /api/diagnostics/tenant
 * Super-admin only. Returns host → clinic resolution and BLOODWORK_LABS evaluation.
 *
 * Use to prove:
 * - What clinicId ot.eonpro.io resolves to at runtime
 * - clinic.features raw value and getClinicFeatureBoolean result for BLOODWORK_LABS
 *
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma } from '@/lib/db';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';
import { getDatasourceHash } from '@/lib/diagnostics/db-fingerprint';
import { withSuperAdminAuth } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function resolveClinicForDiagnostics(domain: string) {
  const normalizedDomain = domain.split(':')[0].toLowerCase();

  // 1. Try customDomain
  let clinic = await basePrisma.clinic.findFirst({
    where: {
      customDomain: normalizedDomain,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
      customDomain: true,
      status: true,
      features: true,
    },
  });

  if (clinic) return clinic;

  const parts = normalizedDomain.split('.');
  const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging'];

  if (normalizedDomain.includes('localhost')) {
    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      const subdomain = parts[0];
      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: subdomain, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          status: true,
          features: true,
        },
      });
    }
  } else if (normalizedDomain.endsWith('.eonpro.io') && parts.length >= 3) {
    if (!skipSubdomains.includes(parts[0])) {
      const subdomain = parts[0];
      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: subdomain, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          status: true,
          features: true,
        },
      });
    }
  } else if (parts.length >= 3 && !skipSubdomains.includes(parts[0])) {
    const subdomain = parts[0];
    clinic = await basePrisma.clinic.findFirst({
      where: {
        subdomain: { equals: subdomain, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        status: true,
        features: true,
      },
    });
  }

  return clinic;
}

export const GET = withSuperAdminAuth(
  async (request: NextRequest) => {
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
    const domain = host.split(':')[0];
    const { searchParams } = new URL(request.url);
    const patientIdParam = searchParams.get('patientId');

    const clinic = await resolveClinicForDiagnostics(domain);

    // Proof path: patient ownership vs tenant resolution (for Labs tab root cause)
    let patientProof: Record<string, unknown> | null = null;
    if (patientIdParam) {
      const patientId = parseInt(patientIdParam, 10);
      if (!isNaN(patientId)) {
        const patient = await basePrisma.patient.findUnique({
          where: { id: patientId },
          select: {
            id: true,
            clinicId: true,
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
                customDomain: true,
                features: true,
              },
            },
          },
        });
        if (patient) {
          const pcRaw = patient.clinic?.features;
          const pcFeatures = pcRaw && typeof pcRaw === 'object' && !Array.isArray(pcRaw) ? (pcRaw as Record<string, unknown>) : {};
          const patientBLOODWORK_LABS = pcFeatures.BLOODWORK_LABS;
          const patientBLOODWORK_LABS_evaluated = patient.clinic
            ? getClinicFeatureBoolean(pcRaw, 'BLOODWORK_LABS', true)
            : null;
          const resolvedRaw = clinic?.features;
          const resolvedBLOODWORK_LABS_raw =
            resolvedRaw && typeof resolvedRaw === 'object' && !Array.isArray(resolvedRaw)
              ? (resolvedRaw as Record<string, unknown>).BLOODWORK_LABS
              : undefined;
          const resolvedBLOODWORK_LABS_evaluated = clinic ? getClinicFeatureBoolean(resolvedRaw, 'BLOODWORK_LABS', true) : null;
          patientProof = {
            patient: {
              id: patient.id,
              clinicId: patient.clinicId,
              clinic: patient.clinic
                ? {
                    id: patient.clinic.id,
                    name: patient.clinic.name,
                    subdomain: patient.clinic.subdomain,
                    customDomain: patient.clinic.customDomain,
                    features_BLOODWORK_LABS: {
                      raw: patientBLOODWORK_LABS,
                      rawType: patientBLOODWORK_LABS === undefined ? 'undefined' : typeof patientBLOODWORK_LABS,
                      evaluated: patientBLOODWORK_LABS_evaluated,
                    },
                  }
                : null,
            },
            resolved: clinic
              ? {
                  clinicId: clinic.id,
                  features_BLOODWORK_LABS: {
                    raw: resolvedBLOODWORK_LABS_raw,
                    rawType:
                      resolvedBLOODWORK_LABS_raw === undefined ? 'undefined' : typeof resolvedBLOODWORK_LABS_raw,
                    evaluated: resolvedBLOODWORK_LABS_evaluated,
                  },
                }
              : null,
            crossTenant: clinic != null && patient.clinicId != null && patient.clinicId !== clinic.id,
          };
          // Compute verdict for proof path
          const pt = patientProof as { patient: { clinicId: number | null }; resolved: { clinicId: number } | null; crossTenant: boolean };
          const pClinic = patient?.clinic;
          const pFeatures = pClinic?.features;
          const pRaw =
            pFeatures && typeof pFeatures === 'object' && !Array.isArray(pFeatures)
              ? (pFeatures as Record<string, unknown>).BLOODWORK_LABS
              : undefined;
          if (pt.crossTenant) {
            (patientProof as Record<string, unknown>).verdict =
              'CROSS_TENANT: patient.clinicId !== resolvedClinicId. Provider/super_admin on ot.eonpro.io can view patient from another clinic. Labs tab uses patient.clinic.features (patient owns clinic), so visibility is correct for that clinic. Fix: enforce patient.clinicId === resolved clinicId for non-super_admin (or restrict super_admin cross-clinic view by host).';
          } else if (
            pt.patient.clinicId === 8 &&
            pRaw === false
          ) {
            (patientProof as Record<string, unknown>).verdict =
              'CONFIG_DRIFT: patient belongs to clinic 8 (OT), patient.clinic.features.BLOODWORK_LABS raw=false. Labs tab hidden. Fix: run migration or sync-feature-defaults for clinic 8; ensure BLOODWORK_LABS=true for all ACTIVE clinics unless explicitly disabled.';
          } else if (pt.patient.clinicId === 8 && (pRaw === undefined || pRaw === null)) {
            (patientProof as Record<string, unknown>).verdict =
              'MISSING_KEY: patient belongs to clinic 8, BLOODWORK_LABS key missing in clinic.features. getClinicFeatureBoolean(,,true) → evaluated=true, so Labs should SHOW. If Labs missing, check for explicit false elsewhere or stale cache.';
          } else if (pt.patient.clinicId === 8 && pRaw === true) {
            (patientProof as Record<string, unknown>).verdict =
              'NO_ISSUE: patient belongs to clinic 8, BLOODWORK_LABS=true. Labs tab should be visible. If still missing, check frontend render path or cache.';
          } else {
            (patientProof as Record<string, unknown>).verdict =
              `CONTEXT: patient.clinicId=${pt.patient.clinicId}, resolvedClinicId=${pt.resolved?.clinicId ?? 'null'}, BLOODWORK_LABS raw=${JSON.stringify(pRaw)}.`;
          }
        }
      }
    }

    const raw = clinic?.features;
    let featureKeys: Record<string, unknown> = {};
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      featureKeys = raw as Record<string, unknown>;
    }

    const bloodworkLabsRaw = featureKeys.BLOODWORK_LABS;
    const bloodworkLabsEvaluated = getClinicFeatureBoolean(raw, 'BLOODWORK_LABS', true);

    const result = {
      host,
      domain,
      resolvedClinicId: clinic?.id ?? null,
      dbFingerprintRef: getDatasourceHash(),
      patientProof: patientProof ?? undefined,
      resolved: clinic
        ? {
            clinicId: clinic.id,
            name: clinic.name,
            subdomain: clinic.subdomain,
            customDomain: clinic.customDomain,
            status: clinic.status,
            featureKeys: Object.keys(featureKeys),
            BLOODWORK_LABS: {
              raw: bloodworkLabsRaw,
              rawType: typeof bloodworkLabsRaw,
              evaluated: bloodworkLabsEvaluated,
            },
          }
        : null,
      buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_BUILD_ID || 'local',
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }
);
