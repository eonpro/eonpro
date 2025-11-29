import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnoseMissingIntakes() {
  try {
    logger.info('\n=== DIAGNOSIS: WHY INTAKE FORMS ARE MISSING ===\n');
    
    // Get patients without intake forms created recently
    const cutoffDate = new Date('2025-11-23'); // Focus on recent patients
    const patientsWithoutIntakes = await prisma.patient.findMany({
      where: {
        createdAt: { gte: cutoffDate },
        documents: {
          none: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.info(`Found ${patientsWithoutIntakes.length} patients without intakes since ${cutoffDate.toDateString()}\n`);

    // Check patterns in the data
    for (const patient of patientsWithoutIntakes) {
      logger.info(`\n--- ${patient.firstName} ${patient.lastName} (ID: ${patient.id}) ---`);
      logger.info(`Created: ${patient.createdAt.toLocaleString()}`);
      logger.info(`Email: ${patient.email}`);
      logger.info(`Phone: ${patient.phone}`);
      
      // Check if this patient has any documents at all
      const allDocs = await prisma.patientDocument.findMany({
        where: { patientId: patient.id }
      });
      logger.info(`Total documents: ${allDocs.length}`);
      
      // Check if there's a referral tracking entry
      const referral = await prisma.referralTracking.findFirst({
        where: { patientId: patient.id }
      });
      
      if (referral) {
        const influencer = await prisma.influencer.findUnique({
          where: { id: referral.influencerId }
        });
        logger.info(`⚠️  Created via REFERRAL from: ${influencer?.name} (${influencer?.promoCode})`);
        logger.info(`   Referral created: ${referral.createdAt.toLocaleString()}`);
      }
      
      // Check patient ID format
      if (patient.patientId) {
        logger.info(`Patient ID: ${patient.patientId}`);
      }
      
      // Check metadata
      if (patient.metadata) {
        logger.info(`Metadata: ${JSON.stringify(patient.metadata)}`);
      }
      
      // Determine likely creation method
      if (referral) {
        logger.info(`\n🔍 DIAGNOSIS: Created through REFERRAL LINK, not Heyflow webhook`);
      } else if (patient.email.includes('example.com')) {
        logger.info(`\n🔍 DIAGNOSIS: Test patient, likely created manually`);
      } else if (!patient.metadata || Object.keys(patient.metadata).length === 0) {
        logger.info(`\n🔍 DIAGNOSIS: No metadata - possibly created via API or admin interface`);
      } else {
        logger.info(`\n🔍 DIAGNOSIS: Unknown creation method - webhook may have failed`);
      }
    }

    // Summary of findings
    logger.info('\n\n=== SUMMARY ===\n');
    
    const referralCount = await Promise.all(
      patientsWithoutIntakes.map(async p => {
        const ref = await prisma.referralTracking.findFirst({
          where: { patientId: p.id }
        });
        return ref ? 1 : 0;
      })
    );
    
    const totalReferrals = referralCount.reduce((a, b) => a + b, 0);
    const testAccounts = patientsWithoutIntakes.filter(p => p.email.includes('example.com')).length;
    const unknownOrigin = patientsWithoutIntakes.length - totalReferrals - testAccounts;
    
    logger.info(`Patients created via referral links: ${totalReferrals}`);
    logger.info(`Test accounts: ${testAccounts}`);
    logger.info(`Unknown origin (possible webhook failures): ${unknownOrigin}`);
    
    if (unknownOrigin > 0) {
      logger.info('\n⚠️  WARNING: ${unknownOrigin} patients have unknown origin.');
      logger.info('These may be legitimate webhook failures that need investigation.');
      
      const unknownPatients = [];
      for (const patient of patientsWithoutIntakes) {
        const ref = await prisma.referralTracking.findFirst({
          where: { patientId: patient.id }
        });
        if (!ref && !patient.email.includes('example.com')) {
          unknownPatients.push(patient);
        }
      }
      
      logger.info('\nPatients with potential webhook failures:');
      unknownPatients.forEach(p => {
        logger.info(`  - ${p.firstName} ${p.lastName} (${p.email}) - ${p.createdAt.toLocaleString()}`);
      });
    }

  } catch (error) {
    logger.error('Error diagnosing missing intakes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseMissingIntakes();
