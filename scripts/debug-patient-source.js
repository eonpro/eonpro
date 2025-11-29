import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugPatientSource() {
  try {
    // Focus on the 5 patients without intake forms from Nov 23
    const problemPatients = await prisma.patient.findMany({
      where: {
        email: {
          in: [
            'i.rosa7138@gmail.com',
            'isaacalburqueque2@gmail.com',
            'vargasjackeline950@gmail.com',
            'damianalex19823s@gmail.com',
            'mercadorivera.m@gmail.com'
          ]
        }
      },
      include: {
        documents: true,
        referrals: true
      }
    });

    logger.info('\n=== INVESTIGATING MISSING INTAKE FORMS ===\n');
    
    for (const patient of problemPatients) {
      logger.info(`\n${patient.firstName} ${patient.lastName}`);
      logger.info('─'.repeat(40));
      logger.info(`Email: ${patient.email}`);
      logger.info(`Created: ${patient.createdAt.toLocaleString()}`);
      logger.info(`Patient ID: ${patient.patientId}`);
      logger.info(`Documents: ${patient.documents.length}`);
      logger.info(`Referrals: ${patient.referrals.length}`);
      logger.info(`Source field: ${patient.source || 'not set'}`);
      logger.info(`Source Metadata: ${patient.sourceMetadata ? JSON.stringify(patient.sourceMetadata) : 'none'}`);
      logger.info(`Notes: ${patient.notes || 'none'}`);
      logger.info(`Tags: ${patient.tags ? JSON.stringify(patient.tags) : 'none'}`);
      
      // Analyze creation pattern
      logger.info('\nAnalysis:');
      if (patient.documents.length === 0 && patient.referrals.length === 0) {
        logger.info('❌ No intake form, no referral tracking');
        logger.info('➡️  Likely created directly via Admin interface or API');
        logger.info('➡️  NOT created through Heyflow webhook');
        
        // Check sequential patient IDs
        if (patient.patientId) {
          const idNum = parseInt(patient.patientId);
          logger.info(`➡️  Sequential Patient ID: ${patient.patientId} (number ${idNum})`);
        }
      }
    }

    logger.info('\n\n=== CONCLUSION ===');
    logger.info('These 5 patients were NOT created via Heyflow webhooks.');
    logger.info('They were likely created through:');
    logger.info('1. Manual entry in admin interface');
    logger.info('2. Direct API calls to /api/patients');
    logger.info('3. Data import from another system');
    logger.info('\nEvidence:');
    logger.info('- No intake forms (PDFs) exist');
    logger.info('- Sequential patient IDs (000022-000026)');
    logger.info('- Created within minutes of each other');
    logger.info('- No webhook metadata or notes');

  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugPatientSource();
