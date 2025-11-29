#!/usr/bin/env npx tsx
import { PrismaClient, PatientDocumentCategory } from '@prisma/client';

import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

async function investigateFailedDocs() {
  logger.info("Investigating failed document fixes...\n");

  // Find all medical intake documents
  const documents = await prisma.patientDocument.findMany({
    where: {
      category: PatientDocumentCategory.MEDICAL_INTAKE_FORM
    },
    include: {
      patient: true
    },
    orderBy: {
      id: 'asc'
    }
  });

  logger.info(`Total intake documents: ${documents.length}\n`);

  // Check for documents without proper patient data
  const docsWithoutPatient = documents.filter(d => !d.patient);
  const docsWithIncompletePatient = documents.filter(d => d.patient && (!d.patient.firstName || !d.patient.lastName));
  
  if (docsWithoutPatient.length > 0) {
    logger.info(`❌ Documents without patient relationship: ${docsWithoutPatient.length}`);
    docsWithoutPatient.forEach(doc => {
      logger.info(`  - Document ID: ${doc.id}, Patient ID: ${doc.patientId}`);
    });
    logger.info();
  }
  
  if (docsWithIncompletePatient.length > 0) {
    logger.info(`⚠️ Documents with incomplete patient data: ${docsWithIncompletePatient.length}`);
    docsWithIncompletePatient.forEach(doc => {
      logger.info(`  - Document ID: ${doc.id}, Patient: ${doc.patient?.firstName || 'No first name'} ${doc.patient?.lastName || 'No last name'}`);
    });
    logger.info();
  }

  // Check for documents that still need field ID fixes
  const docsNeedingFix: any[] = [];
  const docsAlreadyFixed: any[] = [];
  const docsWithErrors: any[] = [];

  for (const doc of documents) {
    try {
      if (!doc.data) {
        docsWithErrors.push({
          id: doc.id,
          patient: doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName}` : 'No patient',
          error: 'No data field'
        });
        continue;
      }

      // Parse the data
      const dataStr = doc.data.toString('utf8');
      let intakeData: any = {};
      
      if (dataStr.includes(',') && dataStr.split(',').every((v: string) => !isNaN(parseInt(v.trim())))) {
        // Comma-separated bytes format
        const bytes = dataStr.split(',').map((b: string) => parseInt(b.trim()));
        const buffer = Buffer.from(bytes);
        intakeData = JSON.parse(buffer.toString('utf8'));
      } else {
        intakeData = JSON.parse(dataStr);
      }

      if (!intakeData.answers || intakeData.answers.length === 0) {
        docsWithErrors.push({
          id: doc.id,
          patient: doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName}` : 'No patient',
          error: 'No answers in data'
        });
        continue;
      }

      // Check if has field IDs
      const hasFieldIds = intakeData.answers.some((a: any) => 
        a.id && (a.id.startsWith('id-') || a.id.startsWith('select-') || 
                 a.id.startsWith('mc-') || a.id === 'bmi' || a.id === 'lbs to lose')
      );

      const docInfo = {
        id: doc.id,
        patient: doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName}` : 'No patient',
        patientId: doc.patientId,
        answerCount: intakeData.answers.length,
        sampleAnswers: intakeData.answers.slice(0, 3).map((a: any) => ({
          id: a.id,
          label: a.label,
          value: a.value?.substring(0, 50) + (a.value?.length > 50 ? '...' : '')
        }))
      };

      if (hasFieldIds) {
        docsAlreadyFixed.push(docInfo);
      } else {
        docsNeedingFix.push(docInfo);
      }
    } catch (error: any) {
      docsWithErrors.push({
        id: doc.id,
        patient: doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName}` : 'No patient',
        error: error.message
      });
    }
  }

  logger.info(`✅ Documents already fixed: ${docsAlreadyFixed.length}`);
  logger.info(`⚠️ Documents needing field ID fix: ${docsNeedingFix.length}`);
  logger.info(`❌ Documents with errors: ${docsWithErrors.length}\n`);

  if (docsNeedingFix.length > 0) {
    logger.info("Documents still needing field ID fixes:");
    docsNeedingFix.forEach(doc => {
      logger.info(`\n  Document ID: ${doc.id}`);
      logger.info(`  Patient: ${doc.patient} (ID: ${doc.patientId})`);
      logger.info(`  Answers: ${doc.answerCount}`);
      logger.info(`  Sample answers:`);
      doc.sampleAnswers.forEach((a: any) => {
        logger.info(`    - ${a.label}: ${a.value} [ID: ${a.id || 'MISSING'}]`);
      });
    });
  }

  if (docsWithErrors.length > 0) {
    logger.info("\nDocuments with errors:");
    docsWithErrors.forEach(doc => {
      logger.info(`  - Document ID: ${doc.id}, Patient: ${doc.patient}, Error: ${doc.error}`);
    });
  }

  // Check if any patients are missing entirely
  const patientIds = documents.map(d => d.patientId);
  const uniquePatientIds = [...new Set(patientIds)];
  
  const patients = await prisma.patient.findMany({
    where: {
      id: {
        in: uniquePatientIds
      }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true
    }
  });
  
  const foundPatientIds = patients.map(p => p.id);
  const missingPatientIds = uniquePatientIds.filter(id => !foundPatientIds.includes(id));
  
  if (missingPatientIds.length > 0) {
    logger.info(`\n❌ Patient records missing from database: ${missingPatientIds.length}`);
    missingPatientIds.forEach(id => {
      const docsForPatient = documents.filter(d => d.patientId === id);
      logger.info(`  - Patient ID: ${id} (${docsForPatient.length} documents)`);
    });
  }
}

investigateFailedDocs()
  .catch((e) => {
    logger.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
