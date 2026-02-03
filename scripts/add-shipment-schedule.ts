/**
 * Add Multi-Shipment Schedule for Patients
 * =========================================
 * 
 * This script creates multi-shipment schedules for patients with long-term packages
 * (6-month, 12-month) that need to be split due to medication BUD (Beyond Use Date).
 * 
 * Usage:
 *   npx ts-node scripts/add-shipment-schedule.ts --patientId=123 --months=12
 *   npx ts-node scripts/add-shipment-schedule.ts --patientName="Racheal Young" --months=12
 * 
 * Options:
 *   --patientId     Patient database ID
 *   --patientName   Patient full name (searches for match)
 *   --months        Package duration in months (default: 12)
 *   --budDays       Beyond Use Date in days (default: 90)
 *   --medication    Medication name (default: "Tirzepatide injection")
 *   --planName      Plan name (default: "12 Month Supply")
 *   --dryRun        Show what would be created without creating (default: false)
 */

import { PrismaClient } from '@prisma/client';
import { decryptPHI } from '@/lib/security/phi-encryption';

const prisma = new PrismaClient();

// Parse command line arguments
function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  process.argv.slice(2).forEach(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    args[key] = value || 'true';
  });
  return args;
}

// Calculate shipments needed
function calculateShipmentsNeeded(packageMonths: number, budDays: number): number {
  const totalDays = packageMonths * 30;
  return Math.ceil(totalDays / budDays);
}

// Calculate shipment dates
function calculateShipmentDates(startDate: Date, totalShipments: number, budDays: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < totalShipments; i++) {
    const shipmentDate = new Date(startDate);
    shipmentDate.setDate(shipmentDate.getDate() + (i * budDays));
    dates.push(shipmentDate);
  }
  return dates;
}

async function findPatientByName(name: string): Promise<any[]> {
  const [firstName, ...lastNameParts] = name.trim().split(/\s+/);
  const lastName = lastNameParts.join(' ');
  
  // Get all patients and decrypt to search
  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      clinicId: true,
      phone: true,
    },
  });

  const matches: any[] = [];
  
  for (const patient of patients) {
    try {
      const decryptedFirst = await decryptPHI(patient.firstName);
      const decryptedLast = await decryptPHI(patient.lastName);
      
      const firstMatch = decryptedFirst.toLowerCase().includes(firstName.toLowerCase());
      const lastMatch = !lastName || decryptedLast.toLowerCase().includes(lastName.toLowerCase());
      
      if (firstMatch && lastMatch) {
        matches.push({
          ...patient,
          decryptedFirstName: decryptedFirst,
          decryptedLastName: decryptedLast,
        });
      }
    } catch {
      // Skip patients with decryption issues
    }
  }
  
  return matches;
}

async function createShipmentSchedule(
  patientId: number,
  clinicId: number,
  packageMonths: number,
  budDays: number,
  medicationName: string,
  planName: string,
  dryRun: boolean
): Promise<void> {
  const totalShipments = calculateShipmentsNeeded(packageMonths, budDays);
  const startDate = new Date();
  const shipmentDates = calculateShipmentDates(startDate, totalShipments, budDays);

  console.log(`\n📦 Creating shipment schedule:`);
  console.log(`   Patient ID: ${patientId}`);
  console.log(`   Package: ${packageMonths} months`);
  console.log(`   BUD: ${budDays} days`);
  console.log(`   Total shipments: ${totalShipments}`);
  console.log(`   Medication: ${medicationName}`);
  console.log(`   Plan: ${planName}`);
  console.log(`\n📅 Shipment schedule:`);
  
  shipmentDates.forEach((date, i) => {
    console.log(`   Shipment ${i + 1}/${totalShipments}: ${date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`);
  });

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN - No records created. Remove --dryRun to create.`);
    return;
  }

  // Create refill queue entries in a transaction
  const createdRefills = await prisma.$transaction(async (tx) => {
    const refills: any[] = [];
    let parentRefillId: number | null = null;

    for (let i = 0; i < totalShipments; i++) {
      const shipmentNumber = i + 1;
      const isFirstShipment = i === 0;

      const refill = await tx.refillQueue.create({
        data: {
          clinicId,
          patientId,
          vialCount: Math.ceil(packageMonths / totalShipments),
          refillIntervalDays: budDays,
          nextRefillDate: shipmentDates[i],
          status: isFirstShipment ? 'PENDING_PAYMENT' : 'SCHEDULED',
          medicationName,
          planName,
          shipmentNumber,
          totalShipments,
          parentRefillId,
          budDays,
        },
      });

      if (isFirstShipment) {
        parentRefillId = refill.id;
      }

      refills.push(refill);
    }

    return refills;
  });

  console.log(`\n✅ Created ${createdRefills.length} refill queue entries:`);
  createdRefills.forEach(refill => {
    console.log(`   - RefillQueue ID: ${refill.id} (Shipment ${refill.shipmentNumber}/${refill.totalShipments})`);
  });
}

async function main() {
  const args = parseArgs();
  
  const patientId = args.patientId ? parseInt(args.patientId, 10) : undefined;
  const patientName = args.patientName;
  const packageMonths = parseInt(args.months || '12', 10);
  const budDays = parseInt(args.budDays || '90', 10);
  const medicationName = args.medication || 'Tirzepatide injection';
  const planName = args.planName || `${packageMonths} Month Supply`;
  const dryRun = args.dryRun === 'true';

  console.log('🏥 Multi-Shipment Schedule Creator');
  console.log('===================================');

  if (!patientId && !patientName) {
    console.error('\n❌ Error: Please provide --patientId or --patientName');
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/add-shipment-schedule.ts --patientId=123 --months=12');
    console.log('  npx ts-node scripts/add-shipment-schedule.ts --patientName="Racheal Young" --months=12');
    console.log('\nOptions:');
    console.log('  --patientId     Patient database ID');
    console.log('  --patientName   Patient full name');
    console.log('  --months        Package duration (default: 12)');
    console.log('  --budDays       Beyond Use Date in days (default: 90)');
    console.log('  --medication    Medication name (default: "Tirzepatide injection")');
    console.log('  --planName      Plan name (default: "12 Month Supply")');
    console.log('  --dryRun        Preview without creating');
    process.exit(1);
  }

  let targetPatient: { id: number; clinicId: number; name?: string } | undefined;

  if (patientId) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });
    
    if (!patient) {
      console.error(`\n❌ Patient with ID ${patientId} not found`);
      process.exit(1);
    }
    
    targetPatient = { id: patient.id, clinicId: patient.clinicId };
    console.log(`\n✅ Found patient by ID: ${patientId}`);
  } else if (patientName) {
    console.log(`\n🔍 Searching for patient: "${patientName}"...`);
    const matches = await findPatientByName(patientName);
    
    if (matches.length === 0) {
      console.error(`\n❌ No patient found matching "${patientName}"`);
      process.exit(1);
    }
    
    if (matches.length > 1) {
      console.log(`\n⚠️  Multiple patients found:`);
      matches.forEach((m, i) => {
        console.log(`   ${i + 1}. ID: ${m.id} - ${m.decryptedFirstName} ${m.decryptedLastName} (Clinic: ${m.clinicId})`);
      });
      console.log(`\nPlease use --patientId to specify which patient.`);
      process.exit(1);
    }
    
    targetPatient = {
      id: matches[0].id,
      clinicId: matches[0].clinicId,
      name: `${matches[0].decryptedFirstName} ${matches[0].decryptedLastName}`,
    };
    console.log(`✅ Found patient: ${targetPatient.name} (ID: ${targetPatient.id})`);
  }

  if (!targetPatient) {
    console.error('\n❌ Could not determine target patient');
    process.exit(1);
  }

  await createShipmentSchedule(
    targetPatient.id,
    targetPatient.clinicId,
    packageMonths,
    budDays,
    medicationName,
    planName,
    dryRun
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n❌ Error:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
