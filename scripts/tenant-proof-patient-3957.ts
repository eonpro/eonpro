#!/usr/bin/env npx tsx
/**
 * Tenant Proof Path — Patient 3957 + Labs Tab Root Cause
 * =====================================================
 *
 * Dumps the exact values needed for the Labs tab root cause verdict.
 * Run against production DB (with care) or staging to get proof.
 *
 * Usage:
 *   npx tsx scripts/tenant-proof-patient-3957.ts [patientId]
 *   patientId defaults to 3957
 *
 * Output:
 *   - host (simulated from env)
 *   - resolvedClinicId (for ot.eonpro.io → 8)
 *   - patient.id, patient.clinicId
 *   - patient.clinic.subdomain, customDomain
 *   - patient.clinic.features.BLOODWORK_LABS (raw + evaluated)
 *   - resolved clinic (clinic 8) features.BLOODWORK_LABS
 *   - verdict
 *
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getClinicFeatureBoolean(features: unknown, key: string, defaultWhenMissing: boolean): boolean {
  if (features == null || typeof features !== 'object' || Array.isArray(features)) {
    return defaultWhenMissing;
  }
  const val = (features as Record<string, unknown>)[key];
  if (val === false) return false;
  if (val === true) return true;
  return defaultWhenMissing;
}

async function main() {
  const patientId = parseInt(process.argv[2] ?? '3957', 10);
  if (isNaN(patientId)) {
    console.error('Invalid patientId');
    process.exit(1);
  }

  const patient = await prisma.patient.findUnique({
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

  if (!patient) {
    console.log(`Patient ${patientId} not found.`);
    process.exit(0);
  }

  const clinic8 = await prisma.clinic.findUnique({
    where: { id: 8 },
    select: { id: true, name: true, subdomain: true, features: true },
  });

  const pcFeatures = patient.clinic?.features;
  const pcObj = pcFeatures && typeof pcFeatures === 'object' && !Array.isArray(pcFeatures) ? (pcFeatures as Record<string, unknown>) : {};
  const patientBLOODWORK_raw = pcObj.BLOODWORK_LABS;
  const patientBLOODWORK_evaluated = patient.clinic
    ? getClinicFeatureBoolean(pcFeatures, 'BLOODWORK_LABS', true)
    : null;

  const resolved8Features = clinic8?.features;
  const resolved8Obj =
    resolved8Features && typeof resolved8Features === 'object' && !Array.isArray(resolved8Features)
      ? (resolved8Features as Record<string, unknown>)
      : {};
  const resolved8_BLOODWORK_raw = resolved8Obj.BLOODWORK_LABS;
  const resolved8_BLOODWORK_evaluated = clinic8 ? getClinicFeatureBoolean(resolved8Features, 'BLOODWORK_LABS', true) : null;

  const resolvedClinicId = 8; // ot.eonpro.io → 8
  const crossTenant = patient.clinicId != null && patient.clinicId !== resolvedClinicId;

  let verdict: string;
  if (crossTenant) {
    verdict =
      'CROSS_TENANT: patient.clinicId !== resolvedClinicId (8). Provider on ot.eonpro.io cannot view this patient (prisma filters by user.clinicId). Only super_admin can. Labs uses patient.clinic.features.';
  } else if (patient.clinicId === 8 && patientBLOODWORK_raw === false) {
    verdict =
      'CONFIG_DRIFT: patient belongs to clinic 8, BLOODWORK_LABS raw=false. Labs tab HIDDEN. Fix: npx tsx scripts/ensure-clinic-feature-defaults.ts or Super-admin Sync Default Features.';
  } else if (patient.clinicId === 8 && (patientBLOODWORK_raw === undefined || patientBLOODWORK_raw === null)) {
    verdict =
      'MISSING_KEY: patient clinic 8, BLOODWORK_LABS missing. Default=true → Labs SHOULD SHOW. If not, check frontend/cache.';
  } else if (patient.clinicId === 8 && patientBLOODWORK_raw === true) {
    verdict = 'NO_ISSUE: patient clinic 8, BLOODWORK_LABS=true. Labs should be visible.';
  } else {
    verdict = `CONTEXT: patient.clinicId=${patient.clinicId}, resolvedClinicId=8, BLOODWORK_LABS raw=${JSON.stringify(patientBLOODWORK_raw)}.`;
  }

  const out = {
    host: 'ot.eonpro.io (simulated)',
    resolvedClinicId: 8,
    patientProof: {
      patient: {
        id: patient.id,
        clinicId: patient.clinicId,
        clinic: patient.clinic
          ? {
              subdomain: patient.clinic.subdomain,
              customDomain: patient.clinic.customDomain,
              features_BLOODWORK_LABS: {
                raw: patientBLOODWORK_raw,
                rawType: patientBLOODWORK_raw === undefined ? 'undefined' : typeof patientBLOODWORK_raw,
                evaluated: patientBLOODWORK_evaluated,
              },
            }
          : null,
      },
      resolved: clinic8
        ? {
            clinicId: clinic8.id,
            features_BLOODWORK_LABS: {
              raw: resolved8_BLOODWORK_raw,
              rawType: resolved8_BLOODWORK_raw === undefined ? 'undefined' : typeof resolved8_BLOODWORK_raw,
              evaluated: resolved8_BLOODWORK_evaluated,
            },
          }
        : null,
      crossTenant,
      verdict,
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
