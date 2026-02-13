#!/usr/bin/env npx tsx
/**
 * Patient Owner Proof — Enterprise Incident
 * ========================================
 *
 * Prints patient ownership and clinic.features.BLOODWORK_LABS for showLabsTab evaluation.
 * Explains cross-tenant viewing (super_admin only).
 *
 * Usage: npx tsx scripts/patient-owner-proof.ts <patientId>
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
  const patientId = parseInt(process.argv[2] ?? '0', 10);
  if (!patientId) {
    console.error('Usage: npx tsx scripts/patient-owner-proof.ts <patientId>');
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

  const features = patient.clinic?.features;
  const raw =
    features && typeof features === 'object' && !Array.isArray(features)
      ? (features as Record<string, unknown>).BLOODWORK_LABS
      : undefined;
  const showLabsTab = getClinicFeatureBoolean(features, 'BLOODWORK_LABS', true);

  console.log('\n=== PATIENT OWNER PROOF ===\n');
  console.log(`patient.id:       ${patient.id}`);
  console.log(`patient.clinicId: ${patient.clinicId}`);
  if (patient.clinic) {
    console.log(`clinic.id:        ${patient.clinic.id}`);
    console.log(`clinic.name:     ${patient.clinic.name}`);
    console.log(`clinic.subdomain: ${patient.clinic.subdomain}`);
    console.log(`clinic.customDomain: ${patient.clinic.customDomain ?? 'null'}`);
    console.log(`BLOODWORK_LABS raw:  ${JSON.stringify(raw)} (${raw === undefined ? 'undefined' : typeof raw})`);
    console.log(`showLabsTab (evaluated): ${showLabsTab}`);
  } else {
    console.log('clinic: null (patient has no clinic)');
  }

  console.log('\n=== CROSS-TENANT VIEWING ===');
  console.log(
    'Non-super_admin: Prisma filters by user.clinicId; can only view patients where patient.clinicId === user.clinicId.'
  );
  console.log(
    'Super_admin: clinicId undefined; no filter; can view any patient. Labs tab uses patient.clinic.features.'
  );
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
