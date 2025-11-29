import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  logger.info('Checking for MedLink webhook data...\n');
  
  try {
    // Find all patients
    const allPatients = await prisma.patient.findMany({
      include: {
        documents: {
          where: {
            category: 'MEDICAL_INTAKE_FORM'
          },
          select: {
            id: true,
            sourceSubmissionId: true,
            createdAt: true
          }
        }
      }
    });
    
    // Filter for MedLink patients
    const patients = allPatients.filter(p => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const hasMedLinkTag = tags.some(tag => 
        tag.toLowerCase().includes('medlink') || 
        tag.toLowerCase().includes('intake')
      );
      const hasMedLinkNote = p.notes && p.notes.includes('MedLink');
      return hasMedLinkTag || hasMedLinkNote;
    });

    logger.info(`Found ${patients.length} patients from MedLink\n`);

    patients.forEach(patient => {
      logger.info('---');
      logger.info(`Patient: ${patient.firstName} ${patient.lastName}`);
      logger.info(`Email: ${patient.email}`);
      logger.info(`ID: ${patient.id}`);
      logger.info(`Tags: ${JSON.stringify(patient.tags)}`);
      logger.info(`Documents: ${patient.documents.length}`);
      if (patient.documents.length > 0) {
        patient.documents.forEach(doc => {
          logger.info(`  - Submission ID: ${doc.sourceSubmissionId}`);
          logger.info(`  - Created: ${doc.createdAt}`);
        });
      }
    });

    // Check specifically for Alejandra
    logger.info('\n--- Checking Alejandra Martinez specifically ---');
    const alejandra = await prisma.patient.findFirst({
      where: {
        firstName: 'Alejandra',
        lastName: 'Martinez'
      }
    });

    if (alejandra) {
      logger.info(`Found Alejandra (ID: ${alejandra.id})`);
      logger.info(`Tags: ${JSON.stringify(alejandra.tags)}`);
      logger.info(`Notes: ${alejandra.notes || 'None'}`);
      logger.info(`Created: ${alejandra.createdAt}`);
      
      // Check all documents, not just intake forms
      const allDocs = await prisma.patientDocument.findMany({
        where: { patientId: alejandra.id }
      });
      logger.info(`Total documents: ${allDocs.length}`);
    }

  } catch (error) {
    logger.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
