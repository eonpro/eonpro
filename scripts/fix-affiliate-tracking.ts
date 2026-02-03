/**
 * Fix Affiliate Tracking Script
 * 
 * Diagnoses and fixes missing affiliate tracking records.
 * 
 * Usage:
 *   npx tsx scripts/fix-affiliate-tracking.ts diagnose JACOB10
 *   npx tsx scripts/fix-affiliate-tracking.ts fix JACOB10
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  console.log(`\n========================================`);
  console.log(`Diagnosing affiliate code: ${normalizedCode}`);
  console.log(`========================================\n`);

  // 1. Check AffiliateRefCode (modern system)
  console.log('1. Checking AffiliateRefCode (modern system)...');
  const refCode = await prisma.affiliateRefCode.findFirst({
    where: { refCode: normalizedCode },
    include: {
      affiliate: {
        select: { id: true, displayName: true, status: true, clinicId: true }
      },
      clinic: { select: { id: true, name: true } }
    }
  });

  if (refCode) {
    console.log(`   ✓ Found: affiliateId=${refCode.affiliateId}, clinicId=${refCode.clinicId}`);
    console.log(`     Affiliate: ${refCode.affiliate.displayName} (${refCode.affiliate.status})`);
    console.log(`     Clinic: ${refCode.clinic.name} (id=${refCode.clinic.id})`);
    console.log(`     isActive: ${refCode.isActive}`);
  } else {
    console.log(`   ✗ NOT FOUND in modern AffiliateRefCode table`);
  }

  // 2. Check Influencer (legacy system)
  console.log('\n2. Checking Influencer (legacy system)...');
  const influencer = await prisma.influencer.findFirst({
    where: { promoCode: normalizedCode },
    select: { id: true, name: true, status: true, clinicId: true }
  });

  if (influencer) {
    console.log(`   ✓ Found: id=${influencer.id}, name=${influencer.name}`);
    console.log(`     Status: ${influencer.status}, clinicId=${influencer.clinicId}`);
  } else {
    console.log(`   ✗ NOT FOUND in legacy Influencer table`);
  }

  // 3. Check AffiliateTouch records (modern tracking)
  console.log('\n3. Checking AffiliateTouch records (modern tracking)...');
  const touches = await prisma.affiliateTouch.findMany({
    where: { refCode: normalizedCode },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      clinicId: true,
      convertedPatientId: true,
      convertedAt: true
    }
  });

  console.log(`   Found ${touches.length} touch records`);
  touches.forEach(t => {
    console.log(`     - Touch #${t.id}: created=${t.createdAt.toISOString()}, clinicId=${t.clinicId}, patientId=${t.convertedPatientId}`);
  });

  // 4. Check ReferralTracking records (legacy tracking)
  console.log('\n4. Checking ReferralTracking records (legacy tracking)...');
  const referrals = await prisma.referralTracking.findMany({
    where: { promoCode: normalizedCode },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      patientId: true,
      clinicId: true,
      influencerId: true
    }
  });

  console.log(`   Found ${referrals.length} referral records`);
  referrals.forEach(r => {
    console.log(`     - Referral #${r.id}: created=${r.createdAt.toISOString()}, patientId=${r.patientId}, clinicId=${r.clinicId}`);
  });

  // 5. Find patients with this code in their tags
  console.log('\n5. Finding patients with this code in tags...');
  // tags is a Json field, use array_contains for searching
  const patientsWithTag = await prisma.patient.findMany({
    where: {
      tags: { array_contains: [normalizedCode] }
    },
    select: { id: true, patientId: true, firstName: true, lastName: true, clinicId: true, createdAt: true, attributionRefCode: true, tags: true }
  });

  // Also check for prefixed tags
  const patientsWithAffiliateTag = await prisma.patient.findMany({
    where: {
      tags: { array_contains: [`affiliate:${normalizedCode}`] }
    },
    select: { id: true, patientId: true, firstName: true, lastName: true, clinicId: true, createdAt: true, attributionRefCode: true, tags: true }
  });

  const patientsWithInfluencerTag = await prisma.patient.findMany({
    where: {
      tags: { array_contains: [`influencer:${normalizedCode}`] }
    },
    select: { id: true, patientId: true, firstName: true, lastName: true, clinicId: true, createdAt: true, attributionRefCode: true, tags: true }
  });

  const allPatients = [...patientsWithTag, ...patientsWithAffiliateTag, ...patientsWithInfluencerTag];
  const uniquePatients = Array.from(new Map(allPatients.map(p => [p.id, p])).values());

  console.log(`   Found ${uniquePatients.length} patients with this code tag`);
  uniquePatients.forEach(p => {
    console.log(`     - Patient #${p.id} (${p.patientId}): ${p.firstName} ${p.lastName}`);
    console.log(`       clinicId=${p.clinicId}, created=${p.createdAt.toISOString()}`);
    console.log(`       attributionRefCode=${p.attributionRefCode || 'none'}`);
  });

  // 6. Summary and recommendations
  console.log('\n========================================');
  console.log('DIAGNOSIS SUMMARY');
  console.log('========================================');
  
  const issues: string[] = [];
  
  if (!refCode) {
    issues.push('No AffiliateRefCode exists - modern tracking cannot work');
  } else if (!refCode.isActive) {
    issues.push('AffiliateRefCode is not active');
  } else if (refCode.affiliate.status !== 'ACTIVE') {
    issues.push(`Affiliate status is ${refCode.affiliate.status}, not ACTIVE`);
  }

  if (!influencer) {
    issues.push('No Influencer record exists - legacy tracking cannot work');
  }

  if (touches.length === 0 && referrals.length === 0) {
    issues.push('NO tracking records exist in either system!');
  }

  const patientsWithoutTracking = uniquePatients.filter(p => {
    const hasTouch = touches.some(t => t.convertedPatientId === p.id);
    const hasReferral = referrals.some(r => r.patientId === p.id);
    return !hasTouch && !hasReferral;
  });

  if (patientsWithoutTracking.length > 0) {
    issues.push(`${patientsWithoutTracking.length} patient(s) have the tag but no tracking record`);
    patientsWithoutTracking.forEach(p => {
      console.log(`\n   MISSING TRACKING for Patient #${p.id} (${p.firstName} ${p.lastName})`);
      console.log(`   Run: npx tsx scripts/fix-affiliate-tracking.ts fix ${normalizedCode} ${p.id}`);
    });
  }

  if (issues.length === 0) {
    console.log('\n✓ No issues found - tracking appears to be working correctly');
  } else {
    console.log('\n✗ Issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }

  return { refCode, influencer, touches, referrals, patientsWithoutTracking };
}

async function fixTracking(code: string, patientId?: number) {
  const normalizedCode = code.trim().toUpperCase();
  console.log(`\n========================================`);
  console.log(`Fixing affiliate tracking for: ${normalizedCode}`);
  console.log(`========================================\n`);

  // Get the AffiliateRefCode
  const refCode = await prisma.affiliateRefCode.findFirst({
    where: { refCode: normalizedCode },
    include: {
      affiliate: { select: { id: true, displayName: true, status: true } }
    }
  });

  if (!refCode) {
    console.log('ERROR: No AffiliateRefCode found. Cannot create tracking.');
    console.log('You need to create the affiliate and ref code first.');
    return;
  }

  // Find patients to fix
  let patientsToFix: Array<{ id: number; patientId: string | null; firstName: string; lastName: string; clinicId: number }>;

  if (patientId) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, patientId: true, firstName: true, lastName: true, clinicId: true }
    });
    if (!patient) {
      console.log(`ERROR: Patient #${patientId} not found`);
      return;
    }
    patientsToFix = [patient];
  } else {
    // Find all patients with the tag but no tracking
    const allPatientsWithTag = await prisma.patient.findMany({
      where: {
        OR: [
          { tags: { array_contains: [normalizedCode] } },
          { tags: { array_contains: [`affiliate:${normalizedCode}`] } },
          { tags: { array_contains: [`influencer:${normalizedCode}`] } }
        ]
      },
      select: { id: true, patientId: true, firstName: true, lastName: true, clinicId: true }
    });

    // Filter to only those without tracking
    const existingTouches = await prisma.affiliateTouch.findMany({
      where: { 
        refCode: normalizedCode,
        convertedPatientId: { in: allPatientsWithTag.map(p => p.id) }
      },
      select: { convertedPatientId: true }
    });

    const existingReferrals = await prisma.referralTracking.findMany({
      where: {
        promoCode: normalizedCode,
        patientId: { in: allPatientsWithTag.map(p => p.id) }
      },
      select: { patientId: true }
    });

    const trackedPatientIds = new Set([
      ...existingTouches.map(t => t.convertedPatientId),
      ...existingReferrals.map(r => r.patientId)
    ]);

    patientsToFix = allPatientsWithTag.filter(p => !trackedPatientIds.has(p.id));
  }

  if (patientsToFix.length === 0) {
    console.log('No patients need fixing - all have tracking records');
    return;
  }

  console.log(`Found ${patientsToFix.length} patient(s) to fix:\n`);

  for (const patient of patientsToFix) {
    console.log(`Creating AffiliateTouch for Patient #${patient.id} (${patient.firstName} ${patient.lastName})...`);

    try {
      const touch = await prisma.affiliateTouch.create({
        data: {
          clinicId: refCode.clinicId,
          affiliateId: refCode.affiliateId,
          refCode: normalizedCode,
          touchType: 'POSTBACK',
          landingPage: '/intake/backfill',
          utmSource: 'backfill',
          utmMedium: 'script',
          utmCampaign: 'fix_tracking',
          convertedPatientId: patient.id,
          convertedAt: new Date(),
          visitorFingerprint: `backfill-${patient.id}-${Date.now()}`,
        }
      });

      console.log(`   ✓ Created AffiliateTouch #${touch.id}`);

      // Also update patient attribution if missing
      const currentPatient = await prisma.patient.findUnique({
        where: { id: patient.id },
        select: { attributionAffiliateId: true }
      });

      if (!currentPatient?.attributionAffiliateId) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: {
            attributionAffiliateId: refCode.affiliateId,
            attributionRefCode: normalizedCode,
            attributionFirstTouchAt: new Date()
          }
        });
        console.log(`   ✓ Updated patient attribution`);
      }

    } catch (error) {
      console.log(`   ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n✓ Fix complete! Refresh the Code Performance page to see updated stats.');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const code = args[1];
  const patientId = args[2] ? parseInt(args[2], 10) : undefined;

  if (!command || !code) {
    console.log('Usage:');
    console.log('  npx tsx scripts/fix-affiliate-tracking.ts diagnose <CODE>');
    console.log('  npx tsx scripts/fix-affiliate-tracking.ts fix <CODE> [PATIENT_ID]');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/fix-affiliate-tracking.ts diagnose JACOB10');
    console.log('  npx tsx scripts/fix-affiliate-tracking.ts fix JACOB10');
    console.log('  npx tsx scripts/fix-affiliate-tracking.ts fix JACOB10 1399');
    process.exit(1);
  }

  try {
    if (command === 'diagnose') {
      await diagnoseCode(code);
    } else if (command === 'fix') {
      await fixTracking(code, patientId);
    } else {
      console.log(`Unknown command: ${command}`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
