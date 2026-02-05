/**
 * Affiliate Reporting Diagnostic Script
 * 
 * This script performs a comprehensive analysis of the affiliate tracking system
 * to identify data gaps and issues that may cause reporting to show empty data.
 * 
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/diagnose-affiliate-reporting.ts
 * 
 * Or with tsx:
 *   npx tsx scripts/diagnose-affiliate-reporting.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DiagnosticResult {
  category: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  message: string;
  details?: any;
}

const results: DiagnosticResult[] = [];

function log(result: DiagnosticResult) {
  results.push(result);
  const icon = result.status === 'OK' ? '✓' : result.status === 'WARNING' ? '⚠' : '✗';
  const color = result.status === 'OK' ? '\x1b[32m' : result.status === 'WARNING' ? '\x1b[33m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m [${result.category}] ${result.message}`);
  if (result.details && Object.keys(result.details).length > 0) {
    console.log('  Details:', JSON.stringify(result.details, null, 2).split('\n').map(l => '    ' + l).join('\n'));
  }
}

async function diagnose() {
  console.log('='.repeat(80));
  console.log('AFFILIATE REPORTING DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log('');

  // ============================================================================
  // 1. Check Modern Affiliate System Tables
  // ============================================================================
  console.log('\n--- MODERN AFFILIATE SYSTEM ---\n');

  // Count Affiliates
  const affiliateCount = await prisma.affiliate.count();
  const activeAffiliateCount = await prisma.affiliate.count({ where: { status: 'ACTIVE' } });
  
  if (affiliateCount === 0) {
    log({
      category: 'Affiliates',
      status: 'ERROR',
      message: 'No affiliates found in the Affiliate table',
      details: { total: affiliateCount }
    });
  } else {
    log({
      category: 'Affiliates',
      status: 'OK',
      message: `Found ${affiliateCount} affiliates (${activeAffiliateCount} active)`,
      details: { total: affiliateCount, active: activeAffiliateCount }
    });
  }

  // Count Ref Codes
  const refCodeCount = await prisma.affiliateRefCode.count();
  const activeRefCodeCount = await prisma.affiliateRefCode.count({ where: { isActive: true } });

  if (refCodeCount === 0) {
    log({
      category: 'RefCodes',
      status: 'ERROR',
      message: 'No ref codes found in AffiliateRefCode table',
      details: { total: refCodeCount }
    });
  } else {
    log({
      category: 'RefCodes',
      status: 'OK',
      message: `Found ${refCodeCount} ref codes (${activeRefCodeCount} active)`,
      details: { total: refCodeCount, active: activeRefCodeCount }
    });
  }

  // Count Touches (tracking records)
  const touchCount = await prisma.affiliateTouch.count();
  const convertedTouchCount = await prisma.affiliateTouch.count({
    where: { convertedAt: { not: null } }
  });
  const last30DaysTouches = await prisma.affiliateTouch.count({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
  });

  if (touchCount === 0) {
    log({
      category: 'Tracking',
      status: 'WARNING',
      message: 'No tracking records (AffiliateTouch) found - tracking may not be working',
      details: { total: touchCount }
    });
  } else {
    log({
      category: 'Tracking',
      status: 'OK',
      message: `Found ${touchCount} tracking records (${convertedTouchCount} converted, ${last30DaysTouches} in last 30 days)`,
      details: { total: touchCount, converted: convertedTouchCount, last30Days: last30DaysTouches }
    });
  }

  // Count Commission Events
  const commissionCount = await prisma.affiliateCommissionEvent.count();
  const pendingCommissions = await prisma.affiliateCommissionEvent.count({ where: { status: 'PENDING' } });
  const approvedCommissions = await prisma.affiliateCommissionEvent.count({ where: { status: 'APPROVED' } });
  const paidCommissions = await prisma.affiliateCommissionEvent.count({ where: { status: 'PAID' } });

  if (commissionCount === 0) {
    log({
      category: 'Commissions',
      status: 'WARNING',
      message: 'No commission events found - either no payments or attribution not working',
      details: { total: commissionCount }
    });
  } else {
    log({
      category: 'Commissions',
      status: 'OK',
      message: `Found ${commissionCount} commission events`,
      details: { total: commissionCount, pending: pendingCommissions, approved: approvedCommissions, paid: paidCommissions }
    });
  }

  // Count Commission Plans
  const planCount = await prisma.affiliateCommissionPlan.count();
  const activePlanCount = await prisma.affiliateCommissionPlan.count({ where: { isActive: true } });

  if (planCount === 0) {
    log({
      category: 'Plans',
      status: 'ERROR',
      message: 'No commission plans found - affiliates cannot earn commissions without plans',
      details: { total: planCount }
    });
  } else {
    log({
      category: 'Plans',
      status: 'OK',
      message: `Found ${planCount} commission plans (${activePlanCount} active)`,
      details: { total: planCount, active: activePlanCount }
    });
  }

  // ============================================================================
  // 2. Check Legacy Influencer System
  // ============================================================================
  console.log('\n--- LEGACY INFLUENCER SYSTEM ---\n');

  const influencerCount = await prisma.influencer.count();
  const activeInfluencerCount = await prisma.influencer.count({ where: { status: 'ACTIVE' } });

  if (influencerCount > 0) {
    log({
      category: 'Legacy',
      status: 'WARNING',
      message: `Found ${influencerCount} legacy Influencers (${activeInfluencerCount} active) - may need migration`,
      details: { total: influencerCount, active: activeInfluencerCount }
    });

    // List legacy influencers
    const influencers = await prisma.influencer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, promoCode: true, clinicId: true },
      take: 10
    });

    console.log('  Sample legacy influencers:');
    influencers.forEach(i => {
      console.log(`    - ${i.name} (${i.promoCode}) [clinicId: ${i.clinicId}]`);
    });
  } else {
    log({
      category: 'Legacy',
      status: 'OK',
      message: 'No legacy Influencer records found',
      details: {}
    });
  }

  // ============================================================================
  // 3. Check for Migration Gaps
  // ============================================================================
  console.log('\n--- MIGRATION GAPS ---\n');

  // Find Influencers without corresponding AffiliateRefCodes
  const influencerCodes = await prisma.influencer.findMany({
    where: { status: 'ACTIVE' },
    select: { promoCode: true, name: true, clinicId: true }
  });

  const affiliateRefCodes = await prisma.affiliateRefCode.findMany({
    select: { refCode: true }
  });
  const affiliateCodeSet = new Set(affiliateRefCodes.map(r => r.refCode.toUpperCase()));

  const unmigrated = influencerCodes.filter(i => !affiliateCodeSet.has(i.promoCode.toUpperCase()));

  if (unmigrated.length > 0) {
    log({
      category: 'Migration',
      status: 'ERROR',
      message: `${unmigrated.length} legacy Influencer codes not in modern AffiliateRefCode table`,
      details: { count: unmigrated.length, codes: unmigrated.slice(0, 5).map(u => u.promoCode) }
    });
    console.log('  Unmigrated codes:');
    unmigrated.slice(0, 10).forEach(u => {
      console.log(`    - ${u.promoCode} (${u.name})`);
    });
  } else if (influencerCount > 0) {
    log({
      category: 'Migration',
      status: 'OK',
      message: 'All legacy Influencer codes are in modern system',
      details: {}
    });
  }

  // ============================================================================
  // 4. Check Patient Attribution
  // ============================================================================
  console.log('\n--- PATIENT ATTRIBUTION ---\n');

  const patientsWithAttribution = await prisma.patient.count({
    where: { attributionAffiliateId: { not: null } }
  });

  const totalPatients = await prisma.patient.count();

  log({
    category: 'Attribution',
    status: patientsWithAttribution > 0 ? 'OK' : 'WARNING',
    message: `${patientsWithAttribution} of ${totalPatients} patients have affiliate attribution`,
    details: { withAttribution: patientsWithAttribution, total: totalPatients }
  });

  // ============================================================================
  // 5. Check Affiliates Without Commission Plans
  // ============================================================================
  console.log('\n--- PLAN ASSIGNMENTS ---\n');

  const affiliatesWithPlans = await prisma.affiliate.count({
    where: {
      planAssignments: {
        some: {
          effectiveTo: null // Currently active assignment
        }
      }
    }
  });

  const affiliatesWithoutPlans = affiliateCount - affiliatesWithPlans;

  if (affiliatesWithoutPlans > 0) {
    log({
      category: 'PlanAssignment',
      status: 'WARNING',
      message: `${affiliatesWithoutPlans} affiliates have no active commission plan`,
      details: { withPlans: affiliatesWithPlans, withoutPlans: affiliatesWithoutPlans }
    });

    // List affiliates without plans
    const noPlanAffiliates = await prisma.affiliate.findMany({
      where: {
        planAssignments: {
          none: {
            effectiveTo: null
          }
        }
      },
      select: { id: true, displayName: true },
      take: 5
    });

    if (noPlanAffiliates.length > 0) {
      console.log('  Affiliates without plans:');
      noPlanAffiliates.forEach(a => {
        console.log(`    - ${a.displayName} (ID: ${a.id})`);
      });
    }
  } else if (affiliateCount > 0) {
    log({
      category: 'PlanAssignment',
      status: 'OK',
      message: 'All affiliates have active commission plans',
      details: {}
    });
  }

  // ============================================================================
  // 6. Check Recent Intake Promo Codes
  // ============================================================================
  console.log('\n--- RECENT INTAKE PROMO CODES ---\n');

  // Find recent patients with referralTracking (legacy system)
  const recentReferrals = await prisma.referralTracking.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    select: {
      promoCode: true,
      patientId: true,
      createdAt: true,
      patient: {
        select: {
          attributionAffiliateId: true,
          attributionRefCode: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  if (recentReferrals.length > 0) {
    log({
      category: 'RecentIntakes',
      status: 'OK',
      message: `${recentReferrals.length} referrals in last 30 days`,
      details: { count: recentReferrals.length }
    });

    console.log('  Recent referrals (legacy ReferralTracking):');
    recentReferrals.forEach(r => {
      const hasModernAttrib = r.patient?.attributionAffiliateId ? 'Yes' : 'No';
      console.log(`    - ${r.promoCode} (Patient: ${r.patientId}, Modern Attribution: ${hasModernAttrib})`);
    });

    // Check how many have modern attribution
    const withModernAttrib = recentReferrals.filter(r => r.patient?.attributionAffiliateId).length;
    if (withModernAttrib < recentReferrals.length) {
      log({
        category: 'RecentIntakes',
        status: 'WARNING',
        message: `${recentReferrals.length - withModernAttrib} recent referrals missing modern attribution`,
        details: { withModern: withModernAttrib, total: recentReferrals.length }
      });
    }
  } else {
    log({
      category: 'RecentIntakes',
      status: 'WARNING',
      message: 'No referrals in last 30 days',
      details: {}
    });
  }

  // ============================================================================
  // 7. Check Clinic-RefCode Alignment
  // ============================================================================
  console.log('\n--- CLINIC-REFCODE ALIGNMENT ---\n');

  const clinicsWithRefCodes = await prisma.affiliateRefCode.groupBy({
    by: ['clinicId'],
    _count: true
  });

  const totalClinics = await prisma.clinic.count();

  if (clinicsWithRefCodes.length < totalClinics) {
    const clinicsWithCodes = new Set(clinicsWithRefCodes.map(c => c.clinicId));
    const allClinics = await prisma.clinic.findMany({
      select: { id: true, name: true }
    });
    const clinicsWithoutCodes = allClinics.filter(c => !clinicsWithCodes.has(c.id));

    log({
      category: 'ClinicAlignment',
      status: 'WARNING',
      message: `${clinicsWithoutCodes.length} clinics have no affiliate ref codes`,
      details: {
        withCodes: clinicsWithRefCodes.length,
        withoutCodes: clinicsWithoutCodes.length,
        clinicsWithoutCodes: clinicsWithoutCodes.slice(0, 5).map(c => c.name)
      }
    });
  } else if (totalClinics > 0) {
    log({
      category: 'ClinicAlignment',
      status: 'OK',
      message: 'All clinics have affiliate ref codes',
      details: { clinicsWithCodes: clinicsWithRefCodes.length }
    });
  }

  // ============================================================================
  // 8. Summary
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80) + '\n');

  const errors = results.filter(r => r.status === 'ERROR').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  const ok = results.filter(r => r.status === 'OK').length;

  console.log(`Total checks: ${results.length}`);
  console.log(`\x1b[32m✓ OK: ${ok}\x1b[0m`);
  console.log(`\x1b[33m⚠ Warnings: ${warnings}\x1b[0m`);
  console.log(`\x1b[31m✗ Errors: ${errors}\x1b[0m`);

  if (errors > 0 || warnings > 0) {
    console.log('\n--- RECOMMENDED ACTIONS ---\n');

    if (unmigrated.length > 0) {
      console.log('1. Run migration script to sync legacy Influencers to modern Affiliate system:');
      console.log('   npx tsx scripts/migrate-influencers-to-affiliates.ts');
    }

    if (affiliatesWithoutPlans > 0) {
      console.log('2. Assign commission plans to affiliates without plans');
    }

    if (touchCount === 0) {
      console.log('3. Verify AffiliateTracker component is in app layout');
    }

    if (commissionCount === 0 && touchCount > 0) {
      console.log('4. Check Stripe webhook is calling processPaymentForCommission');
    }
  }

  console.log('\n');
}

diagnose()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
