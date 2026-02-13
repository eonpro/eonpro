#!/usr/bin/env npx ts-node
/**
 * Fix invoice/order clinic mismatch for a specific patient or all mismatches
 *
 * Use when a patient (e.g. WellMedR WEL-xxx) appears in the wrong clinic's
 * prescription queue because invoice.clinicId or order.clinicId != patient.clinicId.
 *
 * Usage:
 *   # Fix all mismatches (same as audit FIX_MODE for invoices/orders)
 *   npx ts-node scripts/fix-invoice-clinic-mismatch.ts
 *
 *   # Fix only the patient with display ID WEL-78888027
 *   PATIENT_DISPLAY_ID=WEL-78888027 npx ts-node scripts/fix-invoice-clinic-mismatch.ts
 *
 *   # Dry run (report only, no updates)
 *   DRY_RUN=true npx ts-node scripts/fix-invoice-clinic-mismatch.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN === 'true';
const PATIENT_DISPLAY_ID = process.env.PATIENT_DISPLAY_ID?.trim(); // e.g. WEL-78888027

async function main() {
  console.log('Fix invoice/order clinic mismatch');
  console.log('DRY_RUN:', DRY_RUN);
  if (PATIENT_DISPLAY_ID) console.log('PATIENT_DISPLAY_ID:', PATIENT_DISPLAY_ID);
  console.log('');

  // 1. Find invoices where invoice.clinicId !== patient.clinicId
  const invoiceWhere = {
    status: 'PAID' as const,
    prescriptionProcessed: false,
    ...(PATIENT_DISPLAY_ID ? { patient: { patientId: PATIENT_DISPLAY_ID } } : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    include: {
      patient: { select: { id: true, patientId: true, clinicId: true, email: true } },
      clinic: { select: { id: true, name: true, subdomain: true } },
    },
    orderBy: { paidAt: 'asc' },
  });

  const invoiceMismatches = invoices.filter((inv) => inv.clinicId !== inv.patient.clinicId);

  if (invoiceMismatches.length > 0) {
    console.log(`Found ${invoiceMismatches.length} invoice(s) with clinic mismatch:`);
    for (const inv of invoiceMismatches) {
      const patient = inv.patient;
      const clinic = inv.clinic;
      console.log(
        `  Invoice ${inv.id} → patient ${patient.patientId} (${patient.email || 'no email'})`
      );
      console.log(
        `    invoice.clinicId: ${inv.clinicId} (${clinic?.name || '?'}) → patient.clinicId: ${patient.clinicId}`
      );
      if (!DRY_RUN && patient.clinicId) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { clinicId: patient.clinicId },
        });
        console.log(`    ✅ Updated invoice.clinicId to ${patient.clinicId}`);
      }
    }
    if (DRY_RUN) console.log('  (DRY_RUN: no changes made)');
    console.log('');
  } else {
    console.log('No invoice clinic mismatches found.');
    console.log('');
  }

  // 2. Find orders where order.clinicId !== patient.clinicId
  const orderWhere: { patient?: { patientId?: string } } = {};
  if (PATIENT_DISPLAY_ID) {
    orderWhere.patient = { patientId: PATIENT_DISPLAY_ID };
  }

  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      patient: { select: { id: true, patientId: true, clinicId: true } },
      clinic: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const orderMismatches = orders.filter((o) => o.clinicId !== o.patient.clinicId);

  if (orderMismatches.length > 0) {
    console.log(`Found ${orderMismatches.length} order(s) with clinic mismatch:`);
    for (const ord of orderMismatches) {
      console.log(`  Order ${ord.id} → patient ${ord.patient.patientId}`);
      console.log(
        `    order.clinicId: ${ord.clinicId} (${ord.clinic?.name || '?'}) → patient.clinicId: ${ord.patient.clinicId}`
      );
      if (!DRY_RUN && ord.patient.clinicId) {
        await prisma.order.update({
          where: { id: ord.id },
          data: { clinicId: ord.patient.clinicId },
        });
        console.log(`    ✅ Updated order.clinicId to ${ord.patient.clinicId}`);
      }
    }
    if (DRY_RUN) console.log('  (DRY_RUN: no changes made)');
    console.log('');
  } else {
    console.log('No order clinic mismatches found.');
    console.log('');
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
