import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkWebhookEntries() {
  try {
    // Get all patients ordered by creation date
    const patients = await prisma.patient.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        documents: {
          where: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        }
      }
    });

    logger.info('\n=== WEBHOOK ENTRY ANALYSIS ===\n');
    logger.info(`Total patients in database: ${patients.length}`);
    
    // Group by creation date
    const patientsByDate = {};
    patients.forEach(patient => {
      const date = patient.createdAt.toLocaleDateString();
      if (!patientsByDate[date]) {
        patientsByDate[date] = [];
      }
      patientsByDate[date].push(patient);
    });

    logger.info('\n--- Patients by Creation Date ---');
    Object.entries(patientsByDate).forEach(([date, patientsOnDate]) => {
      logger.info(`\n${date}: ${patientsOnDate.length} patients`);
      patientsOnDate.forEach(patient => {
        const hasIntakeForm = patient.documents.length > 0;
        logger.info(`  - ${patient.firstName} ${patient.lastName} (ID: ${patient.id})${hasIntakeForm ? ' ✓ Has Intake Form' : ' ✗ No Intake Form'}`);
        if (hasIntakeForm) {
          patient.documents.forEach(doc => {
            logger.info(`    └─ ${doc.fileName} (${doc.fileSize} bytes) - Created: ${doc.createdAt.toLocaleString()}`);
          });
        }
      });
    });

    // Check for recent entries (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const recentPatients = patients.filter(p => p.createdAt > oneDayAgo);
    logger.info(`\n--- Last 24 Hours ---`);
    logger.info(`Patients created in last 24 hours: ${recentPatients.length}`);
    
    // Check for recent entries (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const weekPatients = patients.filter(p => p.createdAt > oneWeekAgo);
    logger.info(`Patients created in last 7 days: ${weekPatients.length}`);

    // Check for intake forms
    const intakeForms = await prisma.patientDocument.findMany({
      where: {
        category: 'MEDICAL_INTAKE_FORM'
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        patient: true
      }
    });

    logger.info(`\n--- Intake Forms ---`);
    logger.info(`Total intake forms in database: ${intakeForms.length}`);
    
    // Group intake forms by date
    const formsByDate = {};
    intakeForms.forEach(form => {
      const date = form.createdAt.toLocaleDateString();
      if (!formsByDate[date]) {
        formsByDate[date] = [];
      }
      formsByDate[date].push(form);
    });

    logger.info('\nIntake forms by date:');
    Object.entries(formsByDate).forEach(([date, forms]) => {
      logger.info(`  ${date}: ${forms.length} forms`);
    });

    // Check for the most recent webhook activity
    if (patients.length > 0) {
      const mostRecent = patients[0];
      logger.info(`\n--- Most Recent Patient ---`);
      logger.info(`Name: ${mostRecent.firstName} ${mostRecent.lastName}`);
      logger.info(`Created: ${mostRecent.createdAt.toLocaleString()}`);
      logger.info(`Email: ${mostRecent.email}`);
      logger.info(`Phone: ${mostRecent.phone}`);
      logger.info(`Has Intake Form: ${mostRecent.documents.length > 0 ? 'Yes' : 'No'}`);
    }

    // Check for Patricia Evans specifically (our test patient)
    const patricia = await prisma.patient.findFirst({
      where: {
        email: 'pevans@email.com'
      },
      include: {
        documents: {
          where: {
            category: 'MEDICAL_INTAKE_FORM'
          }
        }
      }
    });

    if (patricia) {
      logger.info(`\n--- Patricia Evans (Test Patient) ---`);
      logger.info(`ID: ${patricia.id}`);
      logger.info(`Created: ${patricia.createdAt.toLocaleString()}`);
      logger.info(`Intake Forms: ${patricia.documents.length}`);
      if (patricia.documents.length > 0) {
        patricia.documents.forEach(doc => {
          logger.info(`  - ${doc.fileName} created at ${doc.createdAt.toLocaleString()}`);
        });
      }
    }

  } catch (error) {
    logger.error('Error checking webhook entries:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWebhookEntries();
