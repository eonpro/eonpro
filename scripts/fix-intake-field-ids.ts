#!/usr/bin/env npx tsx
import { PrismaClient, PatientDocumentCategory } from '@prisma/client';
import { logger } from '../src/lib/logger';

import { generateIntakePdf } from '../src/services/intakePdfService';
import { storeIntakePdf } from '../src/services/storage/intakeStorage';
import path from 'path';
import { promises as fs } from 'fs';

const prisma = new PrismaClient();

// Map human-readable labels to the field IDs expected by the PDF generator
const FIELD_ID_MAPPING: Record<string, { id: string; label: string }> = {
  // Motivation & Consent
  "How would your life change by losing weight?": { id: "id-3fa4d158", label: "How would your life change by losing weight?" },
  "Terms of Use / Consents": { id: "id-f69d896b", label: "Terms of Use / Consents" },
  "Consent to Treatment": { id: "id-f69d896b", label: "Terms of Use / Consents" },
  "State of Residence": { id: "select-83c9e357", label: "State of Residence" },
  "Marketing Consent": { id: "id-e48dcf94", label: "Marketing Consent" },
  "18+ Disclosure": { id: "id-e48dcf94", label: "Marketing Consent" },
  "HIPAA Acknowledgment": { id: "id-e48dcf94", label: "Marketing Consent" },
  
  // Vitals & Goals
  "Ideal Weight": { id: "id-cf20e7c9", label: "Ideal Weight" },
  "Current Weight": { id: "id-703227a8", label: "Starting Weight" },
  "Starting Weight": { id: "id-703227a8", label: "Starting Weight" },
  "Height": { id: "id-3a7e6f11", label: "Height (feet)" },
  "BMI": { id: "bmi", label: "BMI" },
  "Weight Loss Goal": { id: "lbs to lose", label: "Pounds to Lose" },
  
  // Lifestyle & Activity
  "Daily Physical Activity": { id: "id-74efb442", label: "Daily Physical Activity" },
  "Physical Activity Level": { id: "id-74efb442", label: "Daily Physical Activity" },
  "Alcohol Intake": { id: "id-d560c374", label: "Alcohol Intake" },
  
  // Medical & Mental Health History
  "Mental Health Diagnosis": { id: "id-d79f4058", label: "Mental Health Diagnosis" },
  "Mental Health Details": { id: "id-2835be1b", label: "Mental Health Details" },
  "Chronic Illness": { id: "id-2ce042cd", label: "Chronic Illness" },
  "Chronic Illness Details": { id: "id-481f7d3f", label: "Chronic Illness Details" },
  "Chronic Diseases History": { id: "id-c6194df4", label: "Chronic Diseases History" },
  "Current Conditions": { id: "id-aa863a43", label: "Current Conditions" },
  "Medical Conditions": { id: "id-aa863a43", label: "Current Conditions" },
  "Family History": { id: "id-49e5286f", label: "Family History" },
  "Medullary Thyroid Cancer History": { id: "id-88c19c78", label: "Medullary Thyroid Cancer History" },
  "MEN Type-2 History": { id: "id-4bacb2db", label: "MEN Type-2 History" },
  "Gastroparesis History": { id: "id-eee84ce3", label: "Gastroparesis History" },
  "Type 2 Diabetes": { id: "id-22f7904b", label: "Type 2 Diabetes" },
  "Pregnant or Breastfeeding": { id: "id-4dce53c7", label: "Pregnant or Breastfeeding" },
  "Surgeries or Procedures": { id: "id-ddff6d53", label: "Surgeries or Procedures" },
  "Blood Pressure": { id: "mc-819b3225", label: "Blood Pressure" },
  "Weight Loss Procedures": { id: "id-c4320836", label: "Weight Loss Procedures" },
  "Allergies": { id: "id-3e6b8a5b", label: "Allergies" },
  "List of Allergies": { id: "id-04e1c88e", label: "List of Allergies" },
  
  // Medications & GLP-1 History
  "GLP-1 Medication History": { id: "id-d2f1eaa4", label: "GLP-1 Medication History" },
  "Previous GLP-1 Experience": { id: "id-d2f1eaa4", label: "GLP-1 Medication History" },
  "Side Effects When Starting Medication": { id: "id-6a9fff95", label: "Side Effects When Starting Medication" },
  "Interested in Personalized Plan for Side Effects": { id: "id-4b98a487", label: "Interested in Personalized Plan for Side Effects" },
  "Current GLP-1 Medication": { id: "id-c5f1c21a", label: "Current GLP-1 Medication" },
  "Semaglutide Dose": { id: "id-5001f3ff", label: "Semaglutide Dose" },
  "Semaglutide Side Effects": { id: "id-9d592571", label: "Semaglutide Side Effects" },
  "Semaglutide Success": { id: "id-5e696841", label: "Semaglutide Success" },
  "Satisfied with Current GLP-1 Dose": { id: "id-f38d521b", label: "Satisfied with Current GLP-1 Dose" },
  "Current Medications/Supplements": { id: "id-d95d25bd", label: "Current Medications/Supplements" },
  "Current Medications": { id: "id-d95d25bd", label: "Current Medications/Supplements" },
  "Medication/Supplement Details": { id: "id-bc8ed703", label: "Medication/Supplement Details" },
  "Tirzepatide Dose": { id: "id-57f65753", label: "Tirzepatide Dose" },
  "Tirzepatide Success": { id: "id-0fdd1b5a", label: "Tirzepatide Success" },
  "Tirzepatide Side Effects": { id: "id-709d58cb", label: "Tirzepatide Side Effects" },
  
  // Referral Source
  "How did you hear about us?": { id: "id-345ac6b2", label: "How did you hear about us?" },
};

async function fixIntakeFieldIds() {
  logger.info("Fixing intake field IDs to match PDF generator expectations...\n");

  const documents = await prisma.patientDocument.findMany({
    where: {
      category: PatientDocumentCategory.MEDICAL_INTAKE_FORM
    },
    include: {
      patient: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  logger.info(`Found ${documents.length} intake documents to process.\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const doc of documents) {
    try {
      logger.info(`Processing ${doc.patient.firstName} ${doc.patient.lastName} (ID: ${doc.id})...`);
      
      // Parse existing data
      let intakeData: any = {};
      if (doc.data) {
        const dataStr = doc.data.toString('utf8');
        if (dataStr.includes(',') && dataStr.split(',').every(v => !isNaN(parseInt(v.trim())))) {
          // Comma-separated bytes format
          const bytes = dataStr.split(',').map(b => parseInt(b.trim()));
          const buffer = Buffer.from(bytes);
          intakeData = JSON.parse(buffer.toString('utf8'));
        } else if (Buffer.isBuffer(doc.data)) {
          intakeData = JSON.parse(doc.data.toString('utf8'));
        } else {
          intakeData = JSON.parse(dataStr);
        }
      }

      if (!intakeData.answers || intakeData.answers.length === 0) {
        logger.info(`  ⚠️ No answers found, skipping.`);
        skippedCount++;
        continue;
      }

      // Check if already has field IDs (starts with id-, select-, mc-, etc.)
      const hasFieldIds = intakeData.answers.some((a: any) => 
        a.id && (a.id.startsWith('id-') || a.id.startsWith('select-') || 
                 a.id.startsWith('mc-') || a.id === 'bmi' || a.id === 'lbs to lose')
      );

      if (hasFieldIds) {
        logger.info(`  ✅ Already has field IDs, skipping.`);
        skippedCount++;
        continue;
      }

      logger.info(`  Converting ${intakeData.answers.length} answers to field IDs...`);

      // Convert answers to have proper field IDs
      const fixedAnswers = intakeData.answers.map((answer: any) => {
        const mapping = FIELD_ID_MAPPING[answer.label];
        if (mapping) {
          return {
            id: mapping.id,
            label: mapping.label,
            value: answer.value
          };
        }
        // Keep original if no mapping found
        return answer;
      });

      // Update intake data
      const fixedIntakeData = {
        ...intakeData,
        answers: fixedAnswers,
        submissionId: doc.sourceSubmissionId || `fixed-${doc.id}`,
        submittedAt: doc.createdAt
      };

      // Update document in database
      await prisma.patientDocument.update({
        where: { id: doc.id },
        data: {
          data: Buffer.from(JSON.stringify(fixedIntakeData), 'utf8')
        }
      });

      // Regenerate PDF with fixed data
      logger.info(`  Generating new PDF...`);
      const pdfContent = await generateIntakePdf(fixedIntakeData, doc.patient);
      
      // Save the new PDF
      const publicIntakeDir = path.join(process.cwd(), 'public', 'intake-pdfs');
      await fs.mkdir(publicIntakeDir, { recursive: true });
      
      const filename = path.basename(doc.externalUrl || `patient_${doc.patientId}_${doc.sourceSubmissionId || doc.id}.pdf`);
      const filepath = path.join(publicIntakeDir, filename);
      await fs.writeFile(filepath, pdfContent);
      
      logger.info(`  ✅ Fixed and regenerated PDF`);
      fixedCount++;

    } catch (error: any) {
      logger.error(`  ❌ Error: ${error.message}`);
      errorCount++;
    }
  }

  logger.info(`\n✅ Complete!`);
  logger.info(`  Fixed: ${fixedCount} documents`);
  logger.info(`  Skipped: ${skippedCount} documents`);
  logger.info(`  Errors: ${errorCount} documents`);
}

fixIntakeFieldIds()
  .catch((e) => {
    logger.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
