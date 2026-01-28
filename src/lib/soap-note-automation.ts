/**
 * SOAP Note Automation Service
 * 
 * Ensures SOAP notes exist for patients who have paid and are ready for prescription.
 * This is a critical clinical documentation requirement.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { generateSOAPNote, type SOAPGenerationInput } from '@/services/ai/openaiService';
import type { SOAPNote, Patient, PatientDocument, Invoice } from '@prisma/client';

export interface EnsureSoapNoteResult {
  success: boolean;
  soapNoteId: number | null;
  soapNoteStatus: string | null;
  action: 'existing' | 'generated' | 'failed' | 'no_data';
  error?: string;
}

/**
 * Check if a patient has a valid SOAP note (not empty/placeholder)
 */
export async function getPatientSoapNote(patientId: number): Promise<SOAPNote | null> {
  const soapNote = await prisma.sOAPNote.findFirst({
    where: {
      patientId,
      // Exclude empty/placeholder notes
      subjective: { not: '' },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Additional validation - ensure content is meaningful
  if (soapNote && soapNote.subjective && soapNote.subjective.length > 20) {
    return soapNote;
  }

  return null;
}

/**
 * Ensure a SOAP note exists for a patient
 * 
 * This function:
 * 1. Checks if patient already has a valid SOAP note
 * 2. If not, attempts to generate from intake document
 * 3. If no intake document, attempts to generate from invoice metadata
 * 4. Returns the result with appropriate status
 */
export async function ensureSoapNoteExists(
  patientId: number,
  invoiceId?: number
): Promise<EnsureSoapNoteResult> {
  const logContext = { patientId, invoiceId };
  
  try {
    // Step 1: Check for existing SOAP note
    const existingSoapNote = await getPatientSoapNote(patientId);
    
    if (existingSoapNote) {
      logger.debug('[SOAP-AUTOMATION] Patient already has SOAP note', {
        ...logContext,
        soapNoteId: existingSoapNote.id,
        status: existingSoapNote.status,
      });
      
      return {
        success: true,
        soapNoteId: existingSoapNote.id,
        soapNoteStatus: existingSoapNote.status,
        action: 'existing',
      };
    }

    // Step 2: Get patient info
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      logger.warn('[SOAP-AUTOMATION] Patient not found', logContext);
      return {
        success: false,
        soapNoteId: null,
        soapNoteStatus: null,
        action: 'failed',
        error: 'Patient not found',
      };
    }

    // Step 2b: Query documents separately to avoid any filtering issues
    const documents = await prisma.patientDocument.findMany({
      where: { 
        patientId,
        category: 'MEDICAL_INTAKE_FORM',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    logger.debug('[SOAP-AUTOMATION] Document query result', {
      ...logContext,
      documentsFound: documents.length,
      patientClinicId: patient.clinicId,
    });

    // Skip test/demo patients
    const isTestPatient = 
      patient.firstName.toLowerCase() === 'unknown' ||
      patient.lastName.toLowerCase() === 'unknown' ||
      patient.firstName.toLowerCase().includes('test') ||
      patient.lastName.toLowerCase().includes('test') ||
      patient.firstName.toLowerCase().includes('demo') ||
      patient.lastName.toLowerCase().includes('demo') ||
      patient.email?.toLowerCase().includes('test') ||
      patient.email?.toLowerCase().includes('demo');

    if (isTestPatient) {
      logger.debug('[SOAP-AUTOMATION] Skipping test/demo patient', logContext);
      return {
        success: false,
        soapNoteId: null,
        soapNoteStatus: null,
        action: 'no_data',
        error: 'Test/demo patient - skipped',
      };
    }

    // Step 3: Try to generate from intake document
    if (documents && documents.length > 0) {
      const intakeDoc = documents[0];
      
      logger.info('[SOAP-AUTOMATION] Generating SOAP note from intake document', {
        ...logContext,
        documentId: intakeDoc.id,
      });

      try {
        const soapNote = await generateSOAPFromIntake(patientId, intakeDoc.id);
        
        logger.info('[SOAP-AUTOMATION] ✓ SOAP note generated successfully', {
          ...logContext,
          soapNoteId: soapNote.id,
        });

        return {
          success: true,
          soapNoteId: soapNote.id,
          soapNoteStatus: soapNote.status,
          action: 'generated',
        };
      } catch (genError: any) {
        logger.error('[SOAP-AUTOMATION] Failed to generate from intake', {
          ...logContext,
          error: genError.message,
          status: genError.status,
          code: genError.code,
        });
        
        // If this is an API error (not a data issue), return the error
        // instead of silently continuing
        const isApiError = genError.status === 429 || // Rate limit
                          genError.status === 401 || // Auth error
                          genError.status === 500 || // Server error
                          genError.code === 'insufficient_quota' ||
                          genError.message?.includes('OpenAI');
        
        if (isApiError) {
          return {
            success: false,
            soapNoteId: null,
            soapNoteStatus: null,
            action: 'failed',
            error: genError.message || 'API error during SOAP generation',
          };
        }
        // Continue to try invoice metadata only if it was a data parsing issue
      }
    }

    // Step 4: Try to generate from invoice metadata (Heyflow patients)
    // Look up invoice by ID or by patient's latest paid invoice
    let invoice = null;
    if (invoiceId) {
      invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      });
    } else {
      // Try to find latest paid invoice for this patient
      invoice = await prisma.invoice.findFirst({
        where: { 
          patientId,
          status: 'PAID',
        },
        orderBy: { paidAt: 'desc' },
      });
    }

    if (invoice?.metadata && typeof invoice.metadata === 'object') {
      const metadata = invoice.metadata as Record<string, unknown>;
      
      // Check if metadata has sufficient intake data
      const hasIntakeData = metadata.weight || metadata.height || 
                           metadata.currentMedications || metadata.allergies ||
                           metadata.medicalConditions || metadata.goals;

      logger.debug('[SOAP-AUTOMATION] Invoice metadata check', {
        ...logContext,
        invoiceId: invoice.id,
        hasIntakeData,
        metadataKeys: Object.keys(metadata).slice(0, 15).join(', '),
      });

      if (hasIntakeData) {
        logger.info('[SOAP-AUTOMATION] Generating SOAP note from invoice metadata', {
          ...logContext,
          hasFields: Object.keys(metadata).slice(0, 10).join(', '),
        });

        try {
          const soapNote = await generateSoapFromInvoiceMetadata(patient, metadata);
          
          logger.info('[SOAP-AUTOMATION] ✓ SOAP note generated from invoice metadata', {
            ...logContext,
            soapNoteId: soapNote.id,
          });

          return {
            success: true,
            soapNoteId: soapNote.id,
            soapNoteStatus: soapNote.status,
            action: 'generated',
          };
        } catch (metaError: any) {
          logger.error('[SOAP-AUTOMATION] Failed to generate from invoice metadata', {
            ...logContext,
            error: metaError.message,
          });
        }
      }
    }

    // Step 5: No data available - flag for manual review
    logger.warn('[SOAP-AUTOMATION] No intake data available for SOAP generation', logContext);
    
    return {
      success: false,
      soapNoteId: null,
      soapNoteStatus: null,
      action: 'no_data',
      error: 'No intake data available - requires manual SOAP note creation',
    };

  } catch (error: any) {
    logger.error('[SOAP-AUTOMATION] Unexpected error ensuring SOAP note', {
      ...logContext,
      error: error.message,
    });

    return {
      success: false,
      soapNoteId: null,
      soapNoteStatus: null,
      action: 'failed',
      error: error.message,
    };
  }
}

/**
 * Generate SOAP note from invoice metadata (for Heyflow/external intake patients)
 */
async function generateSoapFromInvoiceMetadata(
  patient: Patient,
  metadata: Record<string, unknown>
): Promise<SOAPNote> {
  // Build intake data from metadata fields
  const intakeData: Record<string, unknown> = {
    // Patient info
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dob,
    gender: patient.gender,
    
    // From metadata
    weight: metadata.weight,
    height: metadata.height,
    bmi: metadata.bmi,
    goalWeight: metadata.goalWeight || metadata.goal_weight,
    
    // Medical history
    currentMedications: metadata.currentMedications || metadata.current_medications || metadata.medications,
    allergies: metadata.allergies,
    medicalConditions: metadata.medicalConditions || metadata.medical_conditions || metadata.conditions,
    healthConditions: metadata.healthConditions || metadata.health_conditions,
    
    // GLP-1 specific
    glp1History: metadata.glp1_last_30 || metadata.glp1History,
    glp1Medication: metadata.glp1_last_30_medication_type || metadata.glp1Medication,
    glp1Dose: metadata.glp1_last_30_medication_dose_mg || metadata.glp1Dose,
    
    // Treatment preferences
    preferredMedication: metadata.preferred_meds || metadata.preferredMedication || metadata.product,
    medicationType: metadata.medicationType || metadata.medication_type,
    
    // Goals
    primaryGoal: metadata.primary_fitness_goal || metadata.primaryGoal || metadata.goals,
    motivation: metadata.weight_loss_motivation || metadata.motivation,
    
    // Lifestyle
    activityLevel: metadata.activity_level || metadata.activityLevel,
    sleepQuality: metadata.sleep_quality || metadata.sleepQuality,
  };

  // Filter out undefined values
  const cleanedIntakeData = Object.fromEntries(
    Object.entries(intakeData).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  const soapInput: SOAPGenerationInput = {
    intakeData: cleanedIntakeData,
    patientName: `${patient.firstName} ${patient.lastName}`,
    dateOfBirth: patient.dob || undefined,
    chiefComplaint: (metadata.goals as string) || 
                    (metadata.primary_fitness_goal as string) || 
                    'Weight loss evaluation',
  };

  const generatedSOAP = await generateSOAPNote(soapInput);

  // Store in database
  const soapNote = await prisma.sOAPNote.create({
    data: {
      patientId: patient.id,
      clinicId: patient.clinicId,
      subjective: generatedSOAP.subjective,
      objective: generatedSOAP.objective,
      assessment: generatedSOAP.assessment,
      plan: generatedSOAP.plan,
      medicalNecessity: generatedSOAP.medicalNecessity,
      sourceType: 'INVOICE_METADATA',
      generatedByAI: true,
      aiModelVersion: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      status: 'DRAFT',
      promptTokens: generatedSOAP.metadata.usage?.promptTokens,
      completionTokens: generatedSOAP.metadata.usage?.completionTokens,
      estimatedCost: generatedSOAP.metadata.usage?.estimatedCost,
    },
  });

  return soapNote;
}

/**
 * Batch process: Check all paid invoices without SOAP notes
 * Useful for catching up on missed SOAP note generation
 */
export async function processMissingSoapNotes(
  clinicId?: number,
  limit: number = 50
): Promise<{
  processed: number;
  generated: number;
  failed: number;
  noData: number;
  results: EnsureSoapNoteResult[];
}> {
  const whereClause: any = {
    status: 'PAID',
    prescriptionProcessed: false,
    patient: {
      soapNotes: {
        none: {},
      },
    },
  };

  if (clinicId) {
    whereClause.clinicId = clinicId;
  }

  const paidInvoicesWithoutSoap = await prisma.invoice.findMany({
    where: whereClause,
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    take: limit,
    orderBy: { paidAt: 'asc' },
  });

  logger.info(`[SOAP-AUTOMATION] Processing ${paidInvoicesWithoutSoap.length} invoices without SOAP notes`);

  const results: EnsureSoapNoteResult[] = [];
  let generated = 0;
  let failed = 0;
  let noData = 0;

  for (const invoice of paidInvoicesWithoutSoap) {
    const result = await ensureSoapNoteExists(invoice.patientId, invoice.id);
    results.push(result);

    if (result.action === 'generated') generated++;
    else if (result.action === 'failed') failed++;
    else if (result.action === 'no_data') noData++;

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  logger.info('[SOAP-AUTOMATION] Batch processing complete', {
    processed: results.length,
    generated,
    failed,
    noData,
  });

  return {
    processed: results.length,
    generated,
    failed,
    noData,
    results,
  };
}
