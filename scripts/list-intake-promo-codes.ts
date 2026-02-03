/**
 * List Promo Codes from OT Intakes
 *
 * This script looks through recent OT patient intakes to find what promo codes
 * have been submitted but may not be tracked in the affiliate system.
 *
 * Usage:
 *   npx tsx scripts/list-intake-promo-codes.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OVERTIME_SUBDOMAIN = 'ot';

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PROMO CODES FROM OT INTAKES`);
  console.log(`${'='.repeat(60)}\n`);

  // Find OT Clinic
  const otClinic = await prisma.clinic.findFirst({
    where: { subdomain: OVERTIME_SUBDOMAIN },
  });

  if (!otClinic) {
    console.error('❌ OT clinic not found!');
    return;
  }

  console.log(`✅ Found OT Clinic: ID=${otClinic.id}`);

  // Get all OT patients to check for affiliate tags
  const allOtPatients = await prisma.patient.findMany({
    where: {
      clinicId: otClinic.id,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      tags: true,
      createdAt: true,
      source: true,
      sourceMetadata: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Filter patients with affiliate/influencer tags
  const patientsWithAffiliateTags = allOtPatients.filter((patient) => {
    const tags = patient.tags as string[] | null;
    if (!tags || !Array.isArray(tags)) return false;
    return tags.some((tag) => 
      tag.startsWith('influencer:') || tag.startsWith('affiliate:')
    );
  });

  // Extract promo codes from tags
  const promoCodeCounts = new Map<string, { count: number; patients: string[] }>();

  for (const patient of patientsWithAffiliateTags) {
    const tags = patient.tags as string[];
    for (const tag of tags) {
      if (tag.startsWith('influencer:') || tag.startsWith('affiliate:')) {
        const code = tag.split(':')[1]?.toUpperCase();
        if (code) {
          const existing = promoCodeCounts.get(code) || { count: 0, patients: [] };
          existing.count++;
          existing.patients.push(`${patient.firstName} ${patient.lastName} (${patient.createdAt.toISOString().split('T')[0]})`);
          promoCodeCounts.set(code, existing);
        }
      }
    }
  }

  // Also check sourceMetadata for promo codes
  const patientsWithSourceMetadata = await prisma.patient.findMany({
    where: {
      clinicId: otClinic.id,
      sourceMetadata: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sourceMetadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  for (const patient of patientsWithSourceMetadata) {
    const metadata = patient.sourceMetadata as any;
    const code = (metadata?.promoCode || metadata?.influencerCode || metadata?.affiliateCode)?.toUpperCase();
    if (code) {
      const existing = promoCodeCounts.get(code) || { count: 0, patients: [] };
      // Only add if not already counted from tags
      const patientName = `${patient.firstName} ${patient.lastName} (${patient.createdAt.toISOString().split('T')[0]})`;
      if (!existing.patients.includes(patientName)) {
        existing.count++;
        existing.patients.push(patientName);
      }
      promoCodeCounts.set(code, existing);
    }
  }

  // Check referral tracking table
  const referralTracking = await prisma.referralTracking.findMany({
    where: {
      OR: [
        { clinicId: otClinic.id },
        {
          influencer: {
            OR: [
              { clinicId: otClinic.id },
              { clinicId: null },
            ],
          },
        },
      ],
    },
    select: {
      promoCode: true,
      patient: {
        select: {
          firstName: true,
          lastName: true,
          clinicId: true,
        },
      },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  for (const ref of referralTracking) {
    if (ref.patient.clinicId !== otClinic.id) continue;
    const code = ref.promoCode.toUpperCase();
    const existing = promoCodeCounts.get(code) || { count: 0, patients: [] };
    const patientName = `${ref.patient.firstName} ${ref.patient.lastName} (${ref.createdAt.toISOString().split('T')[0]})`;
    if (!existing.patients.includes(patientName)) {
      existing.count++;
      existing.patients.push(patientName);
    }
    promoCodeCounts.set(code, existing);
  }

  // Check what's already registered
  const existingRefCodes = await prisma.affiliateRefCode.findMany({
    where: { clinicId: otClinic.id },
    select: { refCode: true },
  });
  const registeredCodes = new Set(existingRefCodes.map((rc: { refCode: string }) => rc.refCode.toUpperCase()));

  const existingInfluencers = await prisma.influencer.findMany({
    where: {
      OR: [
        { clinicId: otClinic.id },
        { clinicId: null },
      ],
    },
    select: { promoCode: true },
  });
  for (const inf of existingInfluencers) {
    registeredCodes.add(inf.promoCode.toUpperCase());
  }

  // Output results
  console.log(`\n📋 PROMO CODES FOUND IN PATIENT DATA:`);
  console.log('-'.repeat(60));

  if (promoCodeCounts.size === 0) {
    console.log('  (no promo codes found in patient data)');
  } else {
    const sortedCodes = Array.from(promoCodeCounts.entries()).sort((a, b) => b[1].count - a[1].count);

    for (const [code, data] of sortedCodes) {
      const isRegistered = registeredCodes.has(code);
      const status = isRegistered ? '✅' : '❌';
      console.log(`\n  ${status} ${code} - ${data.count} use(s) ${isRegistered ? '(REGISTERED)' : '(NOT REGISTERED)'}`);
      for (const patient of data.patients.slice(0, 5)) {
        console.log(`      • ${patient}`);
      }
      if (data.patients.length > 5) {
        console.log(`      • ... and ${data.patients.length - 5} more`);
      }
    }
  }

  // List unregistered codes that need to be added
  const unregisteredCodes = Array.from(promoCodeCounts.entries())
    .filter(([code]) => !registeredCodes.has(code))
    .sort((a, b) => b[1].count - a[1].count);

  if (unregisteredCodes.length > 0) {
    console.log(`\n\n⚠️  UNREGISTERED CODES (${unregisteredCodes.length}) - Need to be added:`);
    console.log('-'.repeat(60));
    for (const [code, data] of unregisteredCodes) {
      console.log(`  ${code} (${data.count} use(s))`);
    }

    console.log(`\n💡 To add an affiliate, run:`);
    console.log(`   npx tsx scripts/add-ot-affiliate.ts --name="Affiliate Name" --email="email@example.com" --code="CODE"`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done!`);
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
