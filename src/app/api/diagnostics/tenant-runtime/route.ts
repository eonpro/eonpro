/**
 * Tenant Runtime Diagnostics — Enterprise Incident
 * ================================================
 *
 * GET /api/diagnostics/tenant-runtime?patientId=X
 * Super-admin only. Returns tenant resolution + patient proof + showLabsTab + dbFingerprintRef.
 * Bypasses cache: goes straight to Prisma (no-cache).
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
      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: parts[0], mode: 'insensitive' },
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
      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: parts[0], mode: 'insensitive' },
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
    clinic = await basePrisma.clinic.findFirst({
      where: {
        subdomain: { equals: parts[0], mode: 'insensitive' },
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
  return clinic ?? null;
}

export const GET = withSuperAdminAuth(async (request: NextRequest) => {
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  const domain = host.split(':')[0];
  const { searchParams } = new URL(request.url);
  const patientIdParam = searchParams.get('patientId');

  const dbFingerprintRef = getDatasourceHash();
  const clinic = await resolveClinicForDiagnostics(domain);

  const resolvedClinicRow = clinic
    ? {
        id: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain,
        customDomain: clinic.customDomain,
        status: clinic.status,
        features_BLOODWORK_LABS: (() => {
          const raw =
            clinic.features &&
            typeof clinic.features === 'object' &&
            !Array.isArray(clinic.features)
              ? (clinic.features as Record<string, unknown>).BLOODWORK_LABS
              : undefined;
          return {
            raw,
            rawType: raw === undefined ? 'undefined' : typeof raw,
            evaluated: getClinicFeatureBoolean(clinic.features, 'BLOODWORK_LABS', true),
          };
        })(),
      }
    : null;

  let patientProof: Record<string, unknown> | null = null;
  let showLabsTab: boolean | null = null;
  let crossTenant = false;

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
        crossTenant = clinic != null && patient.clinicId != null && patient.clinicId !== clinic.id;
        const patientClinicFeatures = patient.clinic?.features;
        showLabsTab = getClinicFeatureBoolean(
          patientClinicFeatures,
          'BLOODWORK_LABS',
          true
        );
        const pcRaw =
          patientClinicFeatures &&
          typeof patientClinicFeatures === 'object' &&
          !Array.isArray(patientClinicFeatures)
            ? (patientClinicFeatures as Record<string, unknown>).BLOODWORK_LABS
            : undefined;
        patientProof = {
          patient: {
            id: patient.id,
            clinicId: patient.clinicId,
          },
          patient_clinic: patient.clinic
            ? {
                id: patient.clinic.id,
                subdomain: patient.clinic.subdomain,
                customDomain: patient.clinic.customDomain,
                features_BLOODWORK_LABS: {
                  raw: pcRaw,
                  rawType: pcRaw === undefined ? 'undefined' : typeof pcRaw,
                  evaluated: showLabsTab,
                },
              }
            : null,
          crossTenant,
          showLabsTab,
        };
      }
    }
  }

  return NextResponse.json(
    {
      host,
      resolvedClinicId: clinic?.id ?? null,
      resolvedClinicRow,
      patientProof: patientProof ?? undefined,
      showLabsTab:
        showLabsTab !== null
          ? showLabsTab
          : patientProof
            ? (patientProof as Record<string, unknown>).showLabsTab
            : null,
      crossTenant,
      dbFingerprintRef,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
});
