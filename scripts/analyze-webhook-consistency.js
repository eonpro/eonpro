import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeWebhookConsistency() {
  try {
    // Get all patients with intake forms
    const patientsWithIntakes = await prisma.patient.findMany({
      where: {
        documents: {
          some: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        }
      },
      include: {
        documents: {
          where: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.info('\n=== WEBHOOK CONSISTENCY ANALYSIS ===\n');
    logger.info(`Patients with intake forms: ${patientsWithIntakes.length}`);
    
    // Get all patients
    const allPatients = await prisma.patient.count();
    logger.info(`Total patients in database: ${allPatients}`);
    logger.info(`Success rate: ${((patientsWithIntakes.length / allPatients) * 100).toFixed(1)}%`);

    // Analyze timing patterns
    logger.info('\n--- Webhook Processing Timeline ---');
    
    // Group by hour to see patterns
    const byHour = {};
    const byDay = {};
    
    patientsWithIntakes.forEach(patient => {
      const hour = patient.createdAt.getHours();
      const day = patient.createdAt.toDateString();
      
      if (!byHour[hour]) byHour[hour] = 0;
      if (!byDay[day]) byDay[day] = [];
      
      byHour[hour]++;
      byDay[day].push(patient);
    });

    logger.info('\n--- Patients Created by Day ---');
    Object.entries(byDay)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .forEach(([day, patients]) => {
        logger.info(`${day}: ${patients.length} patients with intakes`);
        patients.forEach(p => {
          const timeDiff = p.documents[0] ? 
            (p.documents[0].createdAt - p.createdAt) / 1000 : 
            'N/A';
          logger.info(`  - ${p.firstName} ${p.lastName} (PDF created ${timeDiff !== 'N/A' ? timeDiff + 's after patient' : timeDiff})`);
        });
      });

    // Check for recent failures
    const recentPatients = await prisma.patient.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        documents: {
          where: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.info('\n--- Last 24 Hours ---');
    logger.info(`Total patients created: ${recentPatients.length}`);
    const withIntakes = recentPatients.filter(p => p.documents.length > 0);
    const withoutIntakes = recentPatients.filter(p => p.documents.length === 0);
    
    logger.info(`With intake forms: ${withIntakes.length}`);
    logger.info(`Without intake forms: ${withoutIntakes.length}`);
    
    if (withoutIntakes.length > 0) {
      logger.info('\nPatients missing intake forms:');
      withoutIntakes.forEach(p => {
        logger.info(`  - ${p.firstName} ${p.lastName} (${p.email}) - Created: ${p.createdAt.toLocaleString()}`);
      });
    }

    // Check for duplicate submissions
    const emailCounts = {};
    const patients = await prisma.patient.findMany();
    patients.forEach(p => {
      if (!emailCounts[p.email]) emailCounts[p.email] = 0;
      emailCounts[p.email]++;
    });

    const duplicates = Object.entries(emailCounts).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      logger.info('\n--- Duplicate Emails (possible resubmissions) ---');
      duplicates.forEach(([email, count]) => {
        logger.info(`  ${email}: ${count} patients`);
      });
    }

    // Check the test webhook we sent
    const testPatient = await prisma.patient.findFirst({
      where: {
        email: 'medical.test@example.com'
      },
      include: {
        documents: true
      }
    });

    if (testPatient) {
      logger.info('\n--- Test Webhook Status ---');
      logger.info(`Test patient created: ${testPatient.createdAt.toLocaleString()}`);
      logger.info(`Has intake form: ${testPatient.documents.some(d => d.category === 'MEDICAL_INTAKE_FORM') ? 'Yes' : 'No'}`);
      logger.info(`Total documents: ${testPatient.documents.length}`);
    }

    // Check webhook timestamps vs patient creation
    logger.info('\n--- Processing Delay Analysis ---');
    const delays = [];
    patientsWithIntakes.forEach(patient => {
      if (patient.documents[0]) {
        const delay = (patient.documents[0].createdAt - patient.createdAt) / 1000;
        delays.push(delay);
      }
    });

    if (delays.length > 0) {
      const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
      const maxDelay = Math.max(...delays);
      const minDelay = Math.min(...delays);
      
      logger.info(`Average PDF creation delay: ${avgDelay.toFixed(2)} seconds`);
      logger.info(`Max delay: ${maxDelay.toFixed(2)} seconds`);
      logger.info(`Min delay: ${minDelay.toFixed(2)} seconds`);
    }

  } catch (error) {
    logger.error('Error analyzing webhook consistency:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeWebhookConsistency();
