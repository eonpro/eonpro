import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function generatePatientSourceReport() {
  try {
    logger.info('\n==============================================');
    logger.info('    COMPREHENSIVE PATIENT SOURCE REPORT');
    logger.info('==============================================\n');

    // Get all patients with all their data
    const patients = await prisma.patient.findMany({
      include: {
        documents: {
          where: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        },
        referrals: {
          include: {
            influencer: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Analyze source distribution
    const sourceSummary = {
      webhook: [],
      webhook_failed: [],
      api: [],
      manual: [],
      referral: [],
      unknown: []
    };

    // Analyze each patient
    for (const patient of patients) {
      let detectedSource = patient.source || 'unknown';
      
      // If source field is not set, try to detect source
      if (!patient.source || patient.source === 'manual') {
        // Primary indicator: has intake form = webhook
        if (patient.documents.length > 0) {
          detectedSource = 'webhook';
        } 
        // Has referral tracking = referral
        else if (patient.referrals.length > 0) {
          detectedSource = 'referral';
        } 
        // Check notes for webhook indication
        else if (patient.notes?.includes('Created via MedLink')) {
          detectedSource = 'webhook_failed'; // Webhook attempted but no PDF
        } 
        // Check tags for influencer
        else if (patient.tags && JSON.stringify(patient.tags).includes('influencer:')) {
          detectedSource = 'referral';
        }
        // Everything else without intake = manual/API
        else {
          detectedSource = 'manual';
        }
      }

      const patientInfo = {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        createdAt: patient.createdAt,
        source: patient.source,
        detectedSource,
        hasIntakeForm: patient.documents.length > 0,
        hasReferral: patient.referrals.length > 0,
        referrer: patient.referrals[0]?.influencer?.name,
        promoCode: patient.referrals[0]?.promoCode,
        notes: patient.notes,
        sourceMetadata: patient.sourceMetadata,
        patientId: patient.patientId
      };

      if (sourceSummary[detectedSource]) {
        sourceSummary[detectedSource].push(patientInfo);
      } else {
        sourceSummary.unknown.push(patientInfo);
      }
    }

    // Print summary statistics
    logger.info('📊 SOURCE DISTRIBUTION SUMMARY');
    logger.info('─────────────────────────────────────────────');
    logger.info(`Total Patients: ${patients.length}`);
    logger.info('');
    logger.info(`✅ Webhook Success:       ${sourceSummary.webhook.length} patients (${((sourceSummary.webhook.length / patients.length) * 100).toFixed(1)}%)`);
    logger.info(`⚠️  Webhook Failed:       ${sourceSummary.webhook_failed.length} patients (${((sourceSummary.webhook_failed.length / patients.length) * 100).toFixed(1)}%)`);
    logger.info(`📱 API:                   ${sourceSummary.api.length} patients (${((sourceSummary.api.length / patients.length) * 100).toFixed(1)}%)`);
    logger.info(`👤 Manual:                ${sourceSummary.manual.length} patients (${((sourceSummary.manual.length / patients.length) * 100).toFixed(1)}%)`);
    logger.info(`🎯 Referral:              ${sourceSummary.referral.length} patients (${((sourceSummary.referral.length / patients.length) * 100).toFixed(1)}%)`);
    logger.info(`❓ Unknown:               ${sourceSummary.unknown.length} patients (${((sourceSummary.unknown.length / patients.length) * 100).toFixed(1)}%)`);

    // Detailed webhook analysis
    logger.info('\n\n🌐 WEBHOOK PATIENTS (HEYFLOW SUBMISSIONS)');
    logger.info('─────────────────────────────────────────────');
    if (sourceSummary.webhook.length > 0) {
      logger.info('These patients came through the Heyflow intake form:\n');
      sourceSummary.webhook.forEach(p => {
        logger.info(`  ✓ ${p.name} (${p.email})`);
        logger.info(`    Created: ${p.createdAt.toLocaleString()}`);
        logger.info(`    Has PDF: ${p.hasIntakeForm ? 'Yes' : 'No'}`);
        if (p.sourceMetadata?.submissionId) {
          logger.info(`    Submission ID: ${p.sourceMetadata.submissionId}`);
        }
        logger.info('');
      });
    } else {
      logger.info('No patients from webhooks found.');
    }

    // Referral analysis
    logger.info('\n🎯 REFERRAL PATIENTS');
    logger.info('─────────────────────────────────────────────');
    if (sourceSummary.referral.length > 0) {
      logger.info('These patients came through influencer referrals:\n');
      sourceSummary.referral.forEach(p => {
        logger.info(`  ✓ ${p.name} (${p.email})`);
        logger.info(`    Created: ${p.createdAt.toLocaleString()}`);
        logger.info(`    Referred by: ${p.referrer || 'Unknown'}`);
        logger.info(`    Promo Code: ${p.promoCode || 'N/A'}`);
        logger.info('');
      });
    } else {
      logger.info('No referral patients found.');
    }

    // Manual/API analysis
    logger.info('\n👤 MANUAL/API PATIENTS');
    logger.info('─────────────────────────────────────────────');
    const manualAndApi = [...sourceSummary.manual, ...sourceSummary.api];
    if (manualAndApi.length > 0) {
      logger.info('These patients were created directly (not via webhook):\n');
      manualAndApi.forEach(p => {
        logger.info(`  ✓ ${p.name} (${p.email})`);
        logger.info(`    Created: ${p.createdAt.toLocaleString()}`);
        logger.info(`    Patient ID: ${p.patientId || 'None'}`);
        logger.info(`    Source: ${p.source || 'Not specified'}`);
        logger.info('');
      });
    } else {
      logger.info('No manual/API patients found.');
    }

    // Unknown source analysis
    if (sourceSummary.unknown.length > 0) {
      logger.info('\n❓ UNKNOWN SOURCE PATIENTS');
      logger.info('─────────────────────────────────────────────');
      logger.info('These patients have unclear creation sources:\n');
      sourceSummary.unknown.forEach(p => {
        logger.info(`  ? ${p.name} (${p.email})`);
        logger.info(`    Created: ${p.createdAt.toLocaleString()}`);
        logger.info(`    Notes: ${p.notes || 'None'}`);
        logger.info('');
      });
    }

    // Time-based analysis
    logger.info('\n\n📅 CREATION TIMELINE');
    logger.info('─────────────────────────────────────────────');
    const byDate = {};
    patients.forEach(p => {
      const date = p.createdAt.toDateString();
      if (!byDate[date]) {
        byDate[date] = {
          total: 0,
          webhook: 0,
          referral: 0,
          manual: 0,
          api: 0,
          unknown: 0
        };
      }
      byDate[date].total++;
      
      // Determine source
      let source = p.source || 'unknown';
      if (!p.source || p.source === 'manual') {
        if (p.documents.some(d => d.category === 'MEDICAL_INTAKE_FORM')) {
          source = 'webhook';
        } else if (p.referrals?.length > 0) {
          source = 'referral';
        } else {
          source = 'manual';
        }
      }
      
      byDate[date][source] = (byDate[date][source] || 0) + 1;
    });

    Object.entries(byDate)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .forEach(([date, counts]) => {
        logger.info(`\n${date}:`);
        logger.info(`  Total: ${counts.total} patients`);
        if (counts.webhook > 0) logger.info(`    - Webhook: ${counts.webhook}`);
        if (counts.referral > 0) logger.info(`    - Referral: ${counts.referral}`);
        if (counts.manual > 0) logger.info(`    - Manual: ${counts.manual}`);
        if (counts.api > 0) logger.info(`    - API: ${counts.api}`);
        if (counts.unknown > 0) logger.info(`    - Unknown: ${counts.unknown}`);
      });

    // Recommendations
    logger.info('\n\n💡 RECOMMENDATIONS');
    logger.info('─────────────────────────────────────────────');
    
    if (sourceSummary.unknown.length > 0 || sourceSummary.manual.length > 5) {
      logger.info('1. ⚠️  Many patients have unclear sources. Consider:');
      logger.info('   - Implementing source tracking for all creation methods');
      logger.info('   - Auditing manual patient creation processes');
      logger.info('   - Adding logging to track patient creation sources\n');
    }

    const webhookSuccess = sourceSummary.webhook.filter(p => p.hasIntakeForm).length;
    const webhookTotal = sourceSummary.webhook.length;
    if (webhookTotal > 0) {
      const successRate = (webhookSuccess / webhookTotal) * 100;
      logger.info(`2. 📊 Webhook Success Rate: ${successRate.toFixed(1)}%`);
      if (successRate < 100) {
        logger.info('   - Some webhook patients missing intake forms');
        logger.info('   - Check PDF generation process\n');
      }
    }

    if (sourceSummary.referral.length > 0) {
      logger.info(`3. 🎯 Referral System: ${sourceSummary.referral.length} patients from referrals`);
      const uniqueReferrers = new Set(sourceSummary.referral.map(p => p.referrer).filter(Boolean));
      logger.info(`   - ${uniqueReferrers.size} active influencers`);
      logger.info('   - Consider tracking conversion rates per influencer\n');
    }

    // Data quality check
    const patientsWithoutPatientId = patients.filter(p => !p.patientId);
    if (patientsWithoutPatientId.length > 0) {
      logger.info(`4. 🔍 Data Quality: ${patientsWithoutPatientId.length} patients missing Patient ID`);
      logger.info('   - Review patient creation process');
      logger.info('   - Consider backfilling missing Patient IDs\n');
    }

    logger.info('\n==============================================');
    logger.info('          REPORT GENERATED SUCCESSFULLY');
    logger.info('==============================================\n');

  } catch (error) {
    logger.error('Error generating report:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generatePatientSourceReport();
