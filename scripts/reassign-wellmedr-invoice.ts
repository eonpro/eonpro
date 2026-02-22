#!/usr/bin/env tsx
/**
 * Reassign a WellMedR import invoice from the stub patient to the correct (existing) patient.
 * Use when the import created a new stub but the patient already existed in the system.
 *
 * Usage:
 *   npx tsx scripts/reassign-wellmedr-invoice.ts <invoiceId> <toPatientId>
 *
 * Example (Erica Ballerini: invoice 1 → patient 30640):
 *   npx tsx scripts/reassign-wellmedr-invoice.ts 1 30640
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const invoiceId = parseInt(process.argv[2], 10);
  const toPatientId = parseInt(process.argv[3], 10);

  if (!invoiceId || !toPatientId) {
    console.error('Usage: npx tsx scripts/reassign-wellmedr-invoice.ts <invoiceId> <toPatientId>');
    process.exit(1);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  if (!invoice) {
    console.error(`Invoice ${invoiceId} not found.`);
    process.exit(1);
  }

  const targetPatient = await prisma.patient.findUnique({
    where: { id: toPatientId },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!targetPatient) {
    console.error(`Patient ${toPatientId} not found.`);
    process.exit(1);
  }

  if (invoice.patientId === toPatientId) {
    console.log(`Invoice ${invoiceId} is already assigned to patient ${toPatientId}. No change.`);
    await prisma.$disconnect();
    return;
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { patientId: toPatientId },
  });

  console.log(`Reassigned invoice ${invoiceId} from patient ${invoice.patientId} to patient ${toPatientId}.`);
  console.log(`  Target patient: ${targetPatient.firstName} ${targetPatient.lastName} (id ${toPatientId})`);
  console.log(`  Billing tab for /patients/${toPatientId}?tab=billing will now show this invoice.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
