import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  logger.info('Checking patient documents for Alejandra Martinez...\n');
  
  try {
    // Find the patient
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { firstName: 'Alejandra', lastName: 'Martinez' },
          { email: 'alejamartinez.00123@gmail.com' }
        ]
      },
      include: {
        documents: {
          select: {
            id: true,
            filename: true,
            category: true,
            mimeType: true,
            sourceSubmissionId: true,
            createdAt: true,
            data: false // Don't fetch the actual data to keep output readable
          }
        }
      }
    });

    if (!patient) {
      logger.info('Patient not found');
      return;
    }

    logger.info('Patient found:');
    logger.info(`ID: ${patient.id}`);
    logger.info(`Name: ${patient.firstName} ${patient.lastName}`);
    logger.info(`Email: ${patient.email}`);
    logger.info(`Total documents: ${patient.documents.length}\n`);

    if (patient.documents.length > 0) {
      logger.info('Documents:');
      patient.documents.forEach(doc => {
        logger.info('---');
        logger.info(`Document ID: ${doc.id}`);
        logger.info(`Filename: ${doc.filename}`);
        logger.info(`Category: ${doc.category}`);
        logger.info(`MIME Type: ${doc.mimeType}`);
        logger.info(`Submission ID: ${doc.sourceSubmissionId}`);
        logger.info(`Created: ${doc.createdAt}`);
      });

      // Check specifically for intake forms
      const intakeForms = patient.documents.filter(d => d.category === 'MEDICAL_INTAKE_FORM');
      logger.info(`\nIntake forms found: ${intakeForms.length}`);

      // Check if data field is populated (separate query)
      for (const doc of patient.documents) {
        const fullDoc = await prisma.patientDocument.findUnique({
          where: { id: doc.id },
          select: { 
            id: true,
            data: true 
          }
        });
        logger.info(`\nDocument ${doc.id} has data: ${fullDoc.data ? 'YES' : 'NO'}`);
        if (fullDoc.data) {
          const dataType = typeof fullDoc.data;
          logger.info(`Data type: ${dataType}`);
          if (Buffer.isBuffer(fullDoc.data)) {
            logger.info(`Data is a Buffer, length: ${fullDoc.data.length} bytes`);
            // Try to parse first 100 chars
            const preview = fullDoc.data.toString('utf8').substring(0, 100);
            logger.info(`Data preview: ${preview}...`);
          }
        }
      }
    } else {
      logger.info('No documents found for this patient');
    }

  } catch (error) {
    logger.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
