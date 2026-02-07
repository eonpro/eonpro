/**
 * Assign a patient to the EONMEDS clinic
 *
 * Use when a patient was created under the wrong clinic (e.g. null or another clinic)
 * and should be visible to Eonmeds clinic admins.
 *
 * Usage:
 *   npx ts-node scripts/assign-patient-to-eonmeds.ts [patientId] [clinicId]
 *   npx ts-node scripts/assign-patient-to-eonmeds.ts 22
 *   npx ts-node scripts/assign-patient-to-eonmeds.ts 22 3
 *
 * - patientId: defaults to 22
 * - clinicId: optional. If given (e.g. 3 for Eonmeds on prod), use it directly.
 *   Use this when running against production so you don't rely on name lookup.
 *
 * To run against production DB:
 *   DATABASE_URL="<production-url>" npx ts-node scripts/assign-patient-to-eonmeds.ts 22 3
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const patientIdRaw = process.argv[2];
  const clinicIdRaw = process.argv[3];
  const patientId = patientIdRaw ? parseInt(patientIdRaw, 10) : 22;
  const clinicIdArg = clinicIdRaw ? parseInt(clinicIdRaw, 10) : undefined;

  if (isNaN(patientId) || patientId <= 0) {
    console.error('Usage: npx ts-node scripts/assign-patient-to-eonmeds.ts [patientId] [clinicId]');
    process.exit(1);
  }

  console.log('🔧 Assigning patient to EONMEDS clinic...\n');

  // 1. Resolve target clinic: by ID if provided, else by EONMEDS name/subdomain
  let eonmeds: { id: number; name: string; subdomain: string | null };
  if (clinicIdArg != null && !isNaN(clinicIdArg) && clinicIdArg > 0) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicIdArg },
      select: { id: true, name: true, subdomain: true },
    });
    if (!clinic) {
      console.error(`❌ Clinic with id ${clinicIdArg} not found.`);
      process.exit(1);
    }
    eonmeds = clinic;
    console.log(`✅ Using clinic: ID ${eonmeds.id}, Name: ${eonmeds.name}, Subdomain: ${eonmeds.subdomain}\n`);
  } else {
    const found = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: 'eonmeds' },
          { name: { contains: 'EONMEDS', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, subdomain: true },
    });
    if (!found) {
      console.error('❌ EONMEDS clinic not found in database. Pass clinic ID as second arg, e.g.: 22 3');
      process.exit(1);
    }
    eonmeds = found;
    console.log(`✅ EONMEDS clinic: ID ${eonmeds.id}, Name: ${eonmeds.name}, Subdomain: ${eonmeds.subdomain}\n`);
  }

  // 2. Load current patient (use raw query to avoid clinic filter if using wrapped client)
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, clinicId: true, patientId: true, firstName: true, lastName: true },
  });

  if (!patient) {
    console.error(`❌ Patient with id ${patientId} not found.`);
    process.exit(1);
  }

  if (patient.clinicId === eonmeds.id) {
    console.log(`ℹ️  Patient ${patientId} is already assigned to EONMEDS (clinicId: ${eonmeds.id}). No change.`);
    return;
  }

  // 3. Check for unique constraint: (clinicId, patientId) - if patient has patientId, ensure no duplicate in Eonmeds
  if (patient.patientId) {
    const existing = await prisma.patient.findFirst({
      where: {
        clinicId: eonmeds.id,
        patientId: patient.patientId,
        id: { not: patientId },
      },
    });
    if (existing) {
      console.error(
        `❌ EONMEDS already has a patient with patientId "${patient.patientId}" (Patient id: ${existing.id}). ` +
          'Cannot assign without changing patientId or resolving the duplicate.'
      );
      process.exit(1);
    }
  }

  console.log(`Patient: id=${patient.id}, current clinicId=${patient.clinicId}, patientId=${patient.patientId ?? '(none)'}`);

  // 4. Update patient and related Order clinicIds in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.patient.update({
      where: { id: patientId },
      data: { clinicId: eonmeds.id },
    });
    const orderResult = await tx.order.updateMany({
      where: { patientId },
      data: { clinicId: eonmeds.id },
    });
    console.log(`\n✅ Updated Patient ${patientId} → clinicId = ${eonmeds.id} (EONMEDS)`);
    if (orderResult.count > 0) {
      console.log(`✅ Updated ${orderResult.count} order(s) for this patient to EONMEDS clinic.`);
    }
  });

  console.log('\n🎉 Done. Eonmeds clinic admins can now access this patient.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
