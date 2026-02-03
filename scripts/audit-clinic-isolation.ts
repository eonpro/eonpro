#!/usr/bin/env ts-node
/**
 * MULTI-TENANT ISOLATION AUDIT SCRIPT
 * ====================================
 * 
 * Finds and reports data integrity issues related to clinic isolation.
 * 
 * Checks performed:
 * 1. Invoices where invoice.clinicId !== patient.clinicId
 * 2. Orders where order.clinicId !== patient.clinicId
 * 3. Refill queue items where refill.clinicId !== patient.clinicId
 * 4. Patients with mismatched patient ID prefix vs clinic
 * 
 * Usage:
 *   npx ts-node scripts/audit-clinic-isolation.ts
 *   
 * Options:
 *   FIX_MODE=true npx ts-node scripts/audit-clinic-isolation.ts
 *     - Interactively fix issues (updates invoice.clinicId to match patient.clinicId)
 * 
 * @module scripts/audit-clinic-isolation
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuditResult {
  category: string;
  issues: Array<{
    description: string;
    invoiceId?: number;
    orderId?: number;
    refillId?: number;
    patientId: number;
    patientDisplayId: string;
    patientEmail?: string;
    patientClinicId: number | null;
    expectedClinicId?: number;
    actualClinicId?: number | null;
    clinicName?: string;
    patientClinicName?: string;
  }>;
}

async function main() {
  console.log('='.repeat(80));
  console.log('MULTI-TENANT ISOLATION AUDIT');
  console.log('='.repeat(80));
  console.log('');
  console.log('Starting audit at:', new Date().toISOString());
  console.log('');

  const results: AuditResult[] = [];

  // 1. Check invoices with clinic mismatch
  // Prisma doesn't support comparing columns directly, so we filter in JS
  console.log('Checking invoices for clinic mismatch...');
  const invoiceIssues = (await prisma.invoice.findMany({
    include: {
      patient: {
        select: {
          id: true,
          patientId: true,
          email: true,
          firstName: true,
          lastName: true,
          clinicId: true,
          clinic: { select: { name: true, subdomain: true } },
        },
      },
      clinic: { select: { name: true, subdomain: true } },
    },
    where: {
      status: 'PAID',
      prescriptionProcessed: false,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })).filter(inv => inv.clinicId !== inv.patient.clinicId);

  if (invoiceIssues.length > 0) {
    results.push({
      category: 'INVOICES_CLINIC_MISMATCH',
      issues: invoiceIssues.map(inv => ({
        description: `Invoice ${inv.id} (clinic: ${inv.clinic?.name || inv.clinicId}) linked to patient ${inv.patient.patientId} (clinic: ${inv.patient.clinic?.name || inv.patient.clinicId})`,
        invoiceId: inv.id,
        patientId: inv.patient.id,
        patientDisplayId: inv.patient.patientId || `ID:${inv.patient.id}`,
        patientEmail: inv.patient.email,
        patientClinicId: inv.patient.clinicId,
        actualClinicId: inv.clinicId,
        clinicName: inv.clinic?.name || 'Unknown',
        patientClinicName: inv.patient.clinic?.name || 'Unknown',
      })),
    });
    console.log(`  FOUND ${invoiceIssues.length} invoice(s) with clinic mismatch!`);
  } else {
    console.log('  OK - No invoice clinic mismatches found');
  }

  // 2. Check orders with clinic mismatch
  console.log('Checking orders for clinic mismatch...');
  const orderIssues = (await prisma.order.findMany({
    include: {
      patient: {
        select: {
          id: true,
          patientId: true,
          email: true,
          clinicId: true,
          clinic: { select: { name: true } },
        },
      },
      clinic: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })).filter(order => order.clinicId !== order.patient.clinicId);

  if (orderIssues.length > 0) {
    results.push({
      category: 'ORDERS_CLINIC_MISMATCH',
      issues: orderIssues.map(order => ({
        description: `Order ${order.id} (clinic: ${order.clinic?.name || order.clinicId}) linked to patient ${order.patient.patientId} (clinic: ${order.patient.clinic?.name || order.patient.clinicId})`,
        orderId: order.id,
        patientId: order.patient.id,
        patientDisplayId: order.patient.patientId || `ID:${order.patient.id}`,
        patientEmail: order.patient.email,
        patientClinicId: order.patient.clinicId,
        actualClinicId: order.clinicId,
        clinicName: order.clinic?.name || 'Unknown',
        patientClinicName: order.patient.clinic?.name || 'Unknown',
      })),
    });
    console.log(`  FOUND ${orderIssues.length} order(s) with clinic mismatch!`);
  } else {
    console.log('  OK - No order clinic mismatches found');
  }

  // 3. Check refill queue items with clinic mismatch
  console.log('Checking refill queue for clinic mismatch...');
  const refillIssues = (await prisma.refillQueue.findMany({
    include: {
      patient: {
        select: {
          id: true,
          patientId: true,
          email: true,
          clinicId: true,
          clinic: { select: { name: true } },
        },
      },
      clinic: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })).filter(refill => refill.clinicId !== refill.patient.clinicId);

  if (refillIssues.length > 0) {
    results.push({
      category: 'REFILLS_CLINIC_MISMATCH',
      issues: refillIssues.map(refill => ({
        description: `Refill ${refill.id} (clinic: ${refill.clinic?.name || refill.clinicId}) linked to patient ${refill.patient.patientId} (clinic: ${refill.patient.clinic?.name || refill.patient.clinicId})`,
        refillId: refill.id,
        patientId: refill.patient.id,
        patientDisplayId: refill.patient.patientId || `ID:${refill.patient.id}`,
        patientEmail: refill.patient.email,
        patientClinicId: refill.patient.clinicId,
        actualClinicId: refill.clinicId,
        clinicName: refill.clinic?.name || 'Unknown',
        patientClinicName: refill.patient.clinic?.name || 'Unknown',
      })),
    });
    console.log(`  FOUND ${refillIssues.length} refill(s) with clinic mismatch!`);
  } else {
    console.log('  OK - No refill clinic mismatches found');
  }

  // 4. Check patients with mismatched patient ID prefix
  console.log('Checking patients for prefix/clinic mismatch...');
  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true, patientIdPrefix: true },
  });
  
  const prefixMap = new Map(
    clinics.filter(c => c.patientIdPrefix).map(c => [c.patientIdPrefix!, c.id])
  );
  const clinicNameMap = new Map(clinics.map(c => [c.id, c.name]));

  const patientsWithPrefix = await prisma.patient.findMany({
    where: {
      patientId: { contains: '-' },
    },
    select: {
      id: true,
      patientId: true,
      email: true,
      clinicId: true,
    },
    take: 1000,
  });

  const prefixMismatches = patientsWithPrefix.filter(patient => {
    if (!patient.patientId?.includes('-')) return false;
    const prefix = patient.patientId.split('-')[0];
    const expectedClinicId = prefixMap.get(prefix);
    return expectedClinicId !== undefined && expectedClinicId !== patient.clinicId;
  });

  if (prefixMismatches.length > 0) {
    results.push({
      category: 'PATIENTS_PREFIX_MISMATCH',
      issues: prefixMismatches.map(patient => {
        const prefix = patient.patientId!.split('-')[0];
        const expectedClinicId = prefixMap.get(prefix);
        return {
          description: `Patient ${patient.patientId} has prefix "${prefix}" (expected clinic ${expectedClinicId}) but is in clinic ${patient.clinicId}`,
          patientId: patient.id,
          patientDisplayId: patient.patientId!,
          patientEmail: patient.email || undefined,
          patientClinicId: patient.clinicId,
          expectedClinicId,
          clinicName: clinicNameMap.get(patient.clinicId!) || 'Unknown',
        };
      }),
    });
    console.log(`  FOUND ${prefixMismatches.length} patient(s) with prefix/clinic mismatch!`);
  } else {
    console.log('  OK - No patient prefix mismatches found');
  }

  // Print summary
  console.log('');
  console.log('='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));

  if (results.length === 0) {
    console.log('');
    console.log('✅ NO ISSUES FOUND - Multi-tenant isolation is intact');
    console.log('');
  } else {
    console.log('');
    console.log('⚠️  ISSUES FOUND:');
    console.log('');
    
    let totalIssues = 0;
    for (const result of results) {
      console.log(`\n📋 ${result.category} (${result.issues.length} issues)`);
      console.log('-'.repeat(60));
      
      for (const issue of result.issues.slice(0, 10)) {
        console.log(`  • ${issue.description}`);
        if (issue.patientEmail) {
          console.log(`    Email: ${issue.patientEmail}`);
        }
      }
      
      if (result.issues.length > 10) {
        console.log(`  ... and ${result.issues.length - 10} more`);
      }
      
      totalIssues += result.issues.length;
    }

    console.log('');
    console.log('='.repeat(80));
    console.log(`TOTAL ISSUES: ${totalIssues}`);
    console.log('='.repeat(80));
    console.log('');
    console.log('To fix invoice clinic mismatches, run:');
    console.log('  FIX_MODE=true npx ts-node scripts/audit-clinic-isolation.ts');
    console.log('');
    console.log('This will update invoice.clinicId to match patient.clinicId');
    console.log('');

    // Fix mode
    if (process.env.FIX_MODE === 'true') {
      console.log('');
      console.log('🔧 FIX MODE ENABLED');
      console.log('');
      
      const invoiceFixes = results.find(r => r.category === 'INVOICES_CLINIC_MISMATCH');
      if (invoiceFixes) {
        console.log(`Fixing ${invoiceFixes.issues.length} invoice(s)...`);
        
        for (const issue of invoiceFixes.issues) {
          if (issue.invoiceId && issue.patientClinicId) {
            console.log(`  Updating invoice ${issue.invoiceId} clinicId: ${issue.actualClinicId} → ${issue.patientClinicId}`);
            await prisma.invoice.update({
              where: { id: issue.invoiceId },
              data: { clinicId: issue.patientClinicId },
            });
          }
        }
        
        console.log('✅ Invoice fixes applied');
      }
      
      const orderFixes = results.find(r => r.category === 'ORDERS_CLINIC_MISMATCH');
      if (orderFixes) {
        console.log(`Fixing ${orderFixes.issues.length} order(s)...`);
        
        for (const issue of orderFixes.issues) {
          if (issue.orderId && issue.patientClinicId) {
            console.log(`  Updating order ${issue.orderId} clinicId: ${issue.actualClinicId} → ${issue.patientClinicId}`);
            await prisma.order.update({
              where: { id: issue.orderId },
              data: { clinicId: issue.patientClinicId },
            });
          }
        }
        
        console.log('✅ Order fixes applied');
      }
      
      const refillFixes = results.find(r => r.category === 'REFILLS_CLINIC_MISMATCH');
      if (refillFixes) {
        console.log(`Fixing ${refillFixes.issues.length} refill(s)...`);
        
        for (const issue of refillFixes.issues) {
          if (issue.refillId && issue.patientClinicId) {
            console.log(`  Updating refill ${issue.refillId} clinicId: ${issue.actualClinicId} → ${issue.patientClinicId}`);
            await prisma.refillQueue.update({
              where: { id: issue.refillId },
              data: { clinicId: issue.patientClinicId },
            });
          }
        }
        
        console.log('✅ Refill fixes applied');
      }
    }
  }

  console.log('');
  console.log('Audit completed at:', new Date().toISOString());
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
