import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFailedWebhooks() {
  try {
    // Get patients without intake forms
    const patientsWithoutIntakes = await prisma.patient.findMany({
      where: {
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

    logger.info('\n=== WEBHOOK FAILURE ANALYSIS ===\n');
    logger.info(`Patients without intake forms: ${patientsWithoutIntakes.length}`);
    
    // Group by patterns
    const patterns = {
      testAccounts: [],
      referredPatients: [],
      normalPatients: []
    };
    
    patientsWithoutIntakes.forEach(patient => {
      if (patient.email.includes('test') || patient.email.includes('example.com')) {
        patterns.testAccounts.push(patient);
      } else if (patient.firstName === 'John' && patient.lastName === 'Referred') {
        patterns.referredPatients.push(patient);
      } else {
        patterns.normalPatients.push(patient);
      }
    });

    logger.info('\n--- Failure Patterns ---');
    logger.info(`Test accounts: ${patterns.testAccounts.length}`);
    logger.info(`Referred patients: ${patterns.referredPatients.length}`);
    logger.info(`Normal patients: ${patterns.normalPatients.length}`);

    if (patterns.normalPatients.length > 0) {
      logger.info('\n--- Normal Patients Without Intakes ---');
      patterns.normalPatients.forEach(p => {
        logger.info(`\n${p.firstName} ${p.lastName}`);
        logger.info(`  Email: ${p.email}`);
        logger.info(`  Phone: ${p.phone}`);
        logger.info(`  Created: ${p.createdAt.toLocaleString()}`);
        logger.info(`  ID: ${p.id}`);
      });
    }

    if (patterns.referredPatients.length > 0) {
      logger.info('\n--- Referred Patients (Created via Referral Link) ---');
      patterns.referredPatients.forEach(p => {
        logger.info(`  ${p.firstName} ${p.lastName} - ${p.email} (${p.createdAt.toLocaleString()})`);
      });
      logger.info('\nNote: These were likely created through the referral system, not Heyflow webhooks');
    }

    // Check for recent webhook failures by looking at server logs
    const recentHour = new Date();
    recentHour.setHours(recentHour.getHours() - 1);
    
    const recentPatients = patientsWithoutIntakes.filter(p => p.createdAt > recentHour);
    
    if (recentPatients.length > 0) {
      logger.info('\n--- Last Hour Failures ---');
      recentPatients.forEach(p => {
        logger.info(`  ${p.firstName} ${p.lastName} (${p.email}) - ${new Date() - p.createdAt}ms ago`);
      });
    }

    // Check for specific email patterns that might indicate issues
    const emailPatterns = {
      gmail: 0,
      hotmail: 0,
      yahoo: 0,
      other: 0
    };
    
    patientsWithoutIntakes.forEach(p => {
      if (p.email.includes('@gmail.com')) emailPatterns.gmail++;
      else if (p.email.includes('@hotmail.com')) emailPatterns.hotmail++;
      else if (p.email.includes('@yahoo.com')) emailPatterns.yahoo++;
      else emailPatterns.other++;
    });
    
    logger.info('\n--- Email Provider Distribution (Failed Webhooks) ---');
    Object.entries(emailPatterns).forEach(([provider, count]) => {
      logger.info(`  ${provider}: ${count}`);
    });

    // Check creation time patterns
    const hourDistribution = {};
    patientsWithoutIntakes.forEach(p => {
      const hour = p.createdAt.getHours();
      if (!hourDistribution[hour]) hourDistribution[hour] = 0;
      hourDistribution[hour]++;
    });
    
    logger.info('\n--- Failures by Hour of Day ---');
    Object.entries(hourDistribution)
      .sort((a, b) => a[0] - b[0])
      .forEach(([hour, count]) => {
        logger.info(`  ${hour}:00 - ${count} failures`);
      });

    // Check for duplicate submission attempts
    const duplicateEmails = {};
    const allPatients = await prisma.patient.findMany();
    
    allPatients.forEach(p => {
      if (!duplicateEmails[p.email]) duplicateEmails[p.email] = [];
      duplicateEmails[p.email].push(p);
    });
    
    const multipleSubmissions = Object.entries(duplicateEmails)
      .filter(([_, patients]) => patients.length > 1)
      .filter(([email, _]) => !email.includes('example.com')); // Exclude test emails
    
    if (multipleSubmissions.length > 0) {
      logger.info('\n--- Duplicate Submissions (Possible Retry Attempts) ---');
      multipleSubmissions.forEach(([email, patients]) => {
        const withIntake = patients.some(async p => {
          const docs = await prisma.patientDocument.findMany({
            where: { patientId: p.id, category: 'MEDICAL_INTAKE_FORM' }
          });
          return docs.length > 0;
        });
        logger.info(`  ${email}: ${patients.length} submissions`);
        patients.forEach(p => {
          logger.info(`    - ID ${p.id}: ${p.createdAt.toLocaleString()}`);
        });
      });
    }

  } catch (error) {
    logger.error('Error analyzing failed webhooks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFailedWebhooks();
