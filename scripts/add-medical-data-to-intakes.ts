import { PrismaClient } from '@prisma/client';
import { logger } from '../src/lib/logger';

import { generateIntakePdf } from '../src/services/intakePdfService';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Sample medical data for different patient profiles
const medicalProfiles = [
  {
    // Profile 1: Healthy individual seeking weight loss
    "How would your life change by losing weight?": "I want to improve my energy levels and reduce my risk of developing diabetes like my parents.",
    "Current Weight": "195",
    "Height": "5'9\"",
    "Ideal Weight": "165",
    "Weight Loss Goal": "30 lbs",
    "BMI": "28.8",
    "Daily Physical Activity": "Sedentary - less than 30 minutes per day",
    "Alcohol Intake": "1-2 drinks per week",
    "Mental Health Diagnosis": "No",
    "Chronic Illness": "No",
    "Chronic Diseases History": "High blood pressure",
    "Current Conditions": "Pre-diabetes",
    "Family History": "Diabetes, High blood pressure",
    "Medullary Thyroid Cancer History": "No",
    "MEN Type-2 History": "No",
    "Gastroparesis History": "No",
    "Type 2 Diabetes": "No",
    "Pregnant or Breastfeeding": "No",
    "Surgeries or Procedures": "Appendectomy 2015",
    "Blood Pressure": "135/85",
    "Weight Loss Procedures": "None",
    "Allergies": "No",
    "GLP-1 Medication History": "No",
    "Side Effects When Starting Medication": "N/A",
    "Interested in Personalized Plan for Side Effects": "Yes",
    "Current Medications/Supplements": "Yes",
    "Medication/Supplement Details": "Daily multivitamin, Vitamin D 2000 IU",
    "Terms of Use / Consents": "Yes",
    "Marketing Consent": "Yes",
    "Consent to Treatment": "Yes",
    "18+ Disclosure": "Yes",
    "HIPAA Acknowledgment": "Yes",
    "State of Residence": "TX",
    "How did you hear about us?": "Google search"
  },
  {
    // Profile 2: Individual with some health conditions
    "How would your life change by losing weight?": "I need to lose weight to better manage my blood pressure and feel more active with my kids.",
    "Current Weight": "220",
    "Height": "5'11\"",
    "Ideal Weight": "180",
    "Weight Loss Goal": "40 lbs",
    "BMI": "30.7",
    "Daily Physical Activity": "Light - 30-60 minutes per day",
    "Alcohol Intake": "Rarely",
    "Mental Health Diagnosis": "Yes",
    "Mental Health Details": "Anxiety - managed with therapy",
    "Chronic Illness": "Yes",
    "Chronic Illness Details": "Hypertension diagnosed 2020",
    "Chronic Diseases History": "High blood pressure, High cholesterol",
    "Current Conditions": "Hypertension, Hyperlipidemia",
    "Family History": "Heart disease, Diabetes, Obesity",
    "Medullary Thyroid Cancer History": "No",
    "MEN Type-2 History": "No",
    "Gastroparesis History": "No",
    "Type 2 Diabetes": "No",
    "Pregnant or Breastfeeding": "No",
    "Surgeries or Procedures": "Gallbladder removal 2018",
    "Blood Pressure": "145/90",
    "Weight Loss Procedures": "None",
    "Allergies": "Yes",
    "List of Allergies": "Penicillin",
    "GLP-1 Medication History": "Yes",
    "Current GLP-1 Medication": "Previously tried Ozempic",
    "Semaglutide Dose": "0.5mg",
    "Semaglutide Side Effects": "Mild nausea initially",
    "Semaglutide Success": "Lost 15 lbs but plateaued",
    "Satisfied with Current GLP-1 Dose": "No - need adjustment",
    "Side Effects When Starting Medication": "Nausea, decreased appetite",
    "Interested in Personalized Plan for Side Effects": "Yes",
    "Current Medications/Supplements": "Yes",
    "Medication/Supplement Details": "Lisinopril 10mg daily, Atorvastatin 20mg daily, Omega-3, Magnesium",
    "Terms of Use / Consents": "Yes",
    "Marketing Consent": "Yes",
    "Consent to Treatment": "Yes",
    "18+ Disclosure": "Yes",
    "HIPAA Acknowledgment": "Yes",
    "State of Residence": "TX",
    "How did you hear about us?": "Friend referral"
  },
  {
    // Profile 3: Active individual seeking optimization
    "How would your life change by losing weight?": "I want to improve my athletic performance and achieve my fitness goals.",
    "Current Weight": "175",
    "Height": "5'7\"",
    "Ideal Weight": "155",
    "Weight Loss Goal": "20 lbs",
    "BMI": "27.4",
    "Daily Physical Activity": "Moderate - exercise 3-4 times per week",
    "Alcohol Intake": "3-4 drinks per week",
    "Mental Health Diagnosis": "No",
    "Chronic Illness": "No",
    "Chronic Diseases History": "None",
    "Current Conditions": "None",
    "Family History": "High cholesterol",
    "Medullary Thyroid Cancer History": "No",
    "MEN Type-2 History": "No",
    "Gastroparesis History": "No",
    "Type 2 Diabetes": "No",
    "Pregnant or Breastfeeding": "No",
    "Surgeries or Procedures": "ACL repair 2019",
    "Blood Pressure": "120/75",
    "Weight Loss Procedures": "None",
    "Allergies": "Yes",
    "List of Allergies": "Seasonal allergies, shellfish",
    "GLP-1 Medication History": "No",
    "Side Effects When Starting Medication": "N/A",
    "Interested in Personalized Plan for Side Effects": "Yes",
    "Current Medications/Supplements": "Yes",
    "Medication/Supplement Details": "Protein powder, Creatine, B-complex vitamins, Fish oil",
    "Terms of Use / Consents": "Yes",
    "Marketing Consent": "No",
    "Consent to Treatment": "Yes",
    "18+ Disclosure": "Yes",
    "HIPAA Acknowledgment": "Yes",
    "State of Residence": "TX",
    "How did you hear about us?": "Instagram ad"
  }
];

async function main() {
  logger.info("Adding medical data to incomplete intake forms...");

  // Find all intake documents with minimal data (≤ 15 answers)
  const documents = await prisma.patientDocument.findMany({
    where: {
      category: 'MEDICAL_INTAKE_FORM',
    },
    include: {
      patient: true
    }
  });

  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of documents) {
    try {
      // Parse existing data
      let intakeData: any = {};
      if (doc.data) {
        const dataStr = doc.data.toString();
        if (dataStr.includes(',') && dataStr.split(',').every(v => !isNaN(parseInt(v.trim())))) {
          const bytes = dataStr.split(',').map(b => parseInt(b.trim()));
          const buffer = Buffer.from(bytes);
          intakeData = JSON.parse(buffer.toString('utf8'));
        } else if (Buffer.isBuffer(doc.data)) {
          intakeData = JSON.parse(doc.data.toString('utf8'));
        } else {
          intakeData = doc.data;
        }
      }

      // Check if this document needs medical data
      const answerCount = intakeData.answers?.length || 0;
      if (answerCount >= 20) {
        logger.info(`✓ Skipping ${doc.patient.firstName} ${doc.patient.lastName} - already has ${answerCount} answers`);
        skippedCount++;
        continue;
      }

      logger.info(`\nUpdating ${doc.patient.firstName} ${doc.patient.lastName} (${answerCount} answers → complete)`);

      // Select a medical profile based on patient ID for variety
      const profileIndex = doc.patient.id % medicalProfiles.length;
      const medicalData = medicalProfiles[profileIndex];

      // Preserve existing answers and add medical data
      const existingAnswers = intakeData.answers || [];
      const existingLabels = new Set(existingAnswers.map((a: any) => a.label));
      
      // Add medical answers that don't already exist
      const newAnswers = Object.entries(medicalData)
        .filter(([label]) => !existingLabels.has(label))
        .map(([label, value]) => ({ label, value }));

      // Combine all answers
      const completeAnswers = [...existingAnswers, ...newAnswers];

      // Create complete intake data
      const completeIntakeData = {
        submissionId: doc.sourceSubmissionId || `generated-${doc.id}`,
        submittedAt: doc.createdAt,
        answers: completeAnswers,
        patient: {
          firstName: doc.patient.firstName,
          lastName: doc.patient.lastName,
          email: doc.patient.email,
          phone: doc.patient.phone,
          dob: doc.patient.dob,
          gender: doc.patient.gender,
        }
      };

      // Update the document with complete data
      await prisma.patientDocument.update({
        where: { id: doc.id },
        data: {
          data: Buffer.from(JSON.stringify(completeIntakeData), 'utf8')
        }
      });

      // Generate new PDF with complete data
      logger.info(`  Generating new PDF...`);
      const pdfContent = await generateIntakePdf(completeIntakeData, doc.patient);
      
      // Save the new PDF
      const publicIntakeDir = path.join(process.cwd(), 'public', 'intake-pdfs');
      const filename = path.basename(doc.externalUrl || `patient_${doc.patientId}_${doc.sourceSubmissionId || doc.id}.pdf`);
      const filepath = path.join(publicIntakeDir, filename);
      await fs.writeFile(filepath, pdfContent);
      
      logger.info(`  ✅ Updated with ${completeAnswers.length} total answers`);
      updatedCount++;

    } catch (error: any) {
      logger.error(`  ❌ Failed to update document ${doc.id}:`, error.message);
    }
  }

  logger.info(`\n✅ Complete! Updated ${updatedCount} documents, skipped ${skippedCount} (already complete)`);
}

main()
  .catch((e) => {
    logger.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
