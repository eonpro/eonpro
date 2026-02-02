/**
 * Backfill Affiliate Tracking Script
 *
 * This script retroactively creates tracking records for patients
 * who have affiliate codes in their intake but weren't tracked.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/backfill-affiliate-tracking.ts
 */

import { PrismaClient } from '@prisma/client';
import { addDays } from 'date-fns';

const prisma = new PrismaClient();

async function backfillAffiliateTracking() {
  console.log('Starting affiliate tracking backfill...');

  // Find patients with affiliate codes displayed (in their intake data)
  // For now, let's specifically handle the known case: patient 1021 with TEAMSAV

  const patientId = 1021;
  const promoCode = 'TEAMSAV';

  console.log(`Processing patient ${patientId} with code ${promoCode}...`);

  // Step 1: Find the affiliate ref code
  const affiliateRefCode = await prisma.affiliateRefCode.findFirst({
    where: { refCode: promoCode },
    include: { affiliate: { include: { user: true, clinic: true } } },
  });

  if (!affiliateRefCode) {
    console.log(`No AffiliateRefCode found for ${promoCode}, skipping...`);
    return;
  }

  console.log(`Found AffiliateRefCode: ${affiliateRefCode.refCode} -> ${affiliateRefCode.affiliate.displayName}`);

  // Step 2: Check if Influencer exists for this code (legacy system)
  let influencer = await prisma.influencer.findUnique({
    where: { promoCode },
  });

  if (!influencer) {
    // Create legacy Influencer record from Affiliate data
    console.log(`Creating legacy Influencer record for ${promoCode}...`);
    influencer = await prisma.influencer.create({
      data: {
        promoCode,
        name: affiliateRefCode.affiliate.displayName,
        email: affiliateRefCode.affiliate.user.email,
        clinicId: affiliateRefCode.affiliate.clinicId,
        status: 'ACTIVE',
        commissionRate: 0.10,
      },
    });
    console.log(`Created Influencer record: ${influencer.id}`);
  } else {
    console.log(`Influencer already exists: ${influencer.id} (${influencer.name})`);
  }

  // Step 2: Check if ReferralTracking exists for this patient
  const existingTracking = await prisma.referralTracking.findUnique({
    where: { patientId },
  });

  if (existingTracking) {
    console.log(`ReferralTracking already exists for patient ${patientId}`);
  } else {
    // Create ReferralTracking record
    const tracking = await prisma.referralTracking.create({
      data: {
        patientId,
        influencerId: influencer.id,
        promoCode,
        referralSource: 'intake-backfill',
        referralExpiresAt: addDays(new Date(), 90),
        metadata: { backfilled: true, timestamp: new Date().toISOString() },
      },
    });
    console.log(`Created ReferralTracking: ${tracking.id}`);
  }

  // Step 3: Check modern system - AffiliateTouch
  if (affiliateRefCode) {
    // Use a fingerprint based on patient ID for backfill
    const fingerprint = `patient-${patientId}-backfill`;

    // Check if touch exists
    const existingTouch = await prisma.affiliateTouch.findFirst({
      where: {
        visitorFingerprint: fingerprint,
        refCode: promoCode,
      },
    });

    if (existingTouch) {
      console.log(`AffiliateTouch already exists: ${existingTouch.id}`);
    } else {
      // Create touch record
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { clinicId: true },
      });

      if (patient?.clinicId) {
        const touch = await prisma.affiliateTouch.create({
          data: {
            clinicId: patient.clinicId,
            affiliateId: affiliateRefCode.affiliateId,
            refCode: promoCode,
            visitorFingerprint: fingerprint,
            touchType: 'POSTBACK',
            convertedAt: new Date(), // Mark as converted since they completed intake
          },
        });
        console.log(`Created AffiliateTouch: ${touch.id}`);

        // Update patient attribution
        await prisma.patient.update({
          where: { id: patientId },
          data: { attributionAffiliateId: affiliateRefCode.affiliateId },
        });
        console.log(`Updated patient attribution to affiliate ${affiliateRefCode.affiliateId}`);
      }
    }
  }

  console.log('Backfill complete!');
}

backfillAffiliateTracking()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
