import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { generateSOAPNote, type SOAPGenerationInput } from './openaiService';
import type {
  Patient as PrismaPatient,
  PatientDocument,
  Provider as PrismaProvider,
  SOAPNote as PrismaSOAPNote,
} from '@prisma/client';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { decryptPHI, decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';

/**
 * SOAP Note Service
 * Handles generation, storage, approval, and management of SOAP notes
 */

// Input validation schemas
export const createSOAPNoteSchema = z.object({
  patientId: z.number(),
  intakeDocumentId: z.number().optional(),
  generateFromIntake: z.boolean().default(false),
  manualContent: z
    .object({
      subjective: z.string(),
      objective: z.string(),
      assessment: z.string(),
      plan: z.string(),
    })
    .optional(),
});

export const approveSOAPNoteSchema = z.object({
  soapNoteId: z.number(),
  providerId: z.number(),
  password: z.string().min(8),
});

export const editSOAPNoteSchema = z.object({
  soapNoteId: z.number(),
  password: z.string(),
  updates: z.object({
    subjective: z.string().optional(),
    objective: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
  }),
  changeReason: z.string(),
});

/**
 * Generate SOAP note from MedLink intake data
 */
export async function generateSOAPFromIntake(
  patientId: number,
  intakeDocumentId?: number
): Promise<PrismaSOAPNote> {
  // Fetch patient and intake data
  const rawPatient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      documents: intakeDocumentId
        ? {
            where: { id: intakeDocumentId },
          }
        : {
            where: { category: 'MEDICAL_INTAKE_FORM' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
    },
  });

  if (!rawPatient) {
    throw new Error('Patient not found');
  }

  // CRITICAL: Decrypt patient PHI fields before using them for SOAP note generation
  // Without this, encrypted values like DOB will cause NaN age calculations and
  // encrypted names will appear in the SOAP note text
  const patient = {
    ...rawPatient,
    ...decryptPatientPHI(
      rawPatient as Record<string, unknown>,
      DEFAULT_PHI_FIELDS as unknown as string[]
    ),
  };

  logger.debug('[SOAP Service] Decrypted patient PHI for SOAP generation', {
    patientId: patient.id,
    hasDecryptedFirstName: !!patient.firstName && !patient.firstName.includes(':'),
    hasDecryptedDob: !!patient.dob && !String(patient.dob).includes(':'),
  });

  // Prevent creating SOAP notes for test/dummy patients
  // Use decrypted values for the check
  const isTestPatient =
    patient.firstName?.toLowerCase() === 'unknown' ||
    patient.lastName?.toLowerCase() === 'unknown' ||
    patient.firstName?.toLowerCase().includes('test') ||
    patient.lastName?.toLowerCase().includes('test') ||
    patient.firstName?.toLowerCase().includes('demo') ||
    patient.lastName?.toLowerCase().includes('demo') ||
    patient.email?.toLowerCase().includes('test') ||
    patient.email?.toLowerCase().includes('demo');

  if (isTestPatient) {
    throw new Error('Cannot generate SOAP notes for test/demo patients');
  }

  const intakeDocument = patient.documents[0];
  if (!intakeDocument) {
    throw new Error('No intake document found for patient');
  }

  // Parse intake data
  let intakeData: any = {};
  let structuredData: any = {};

  try {
    // If the document has external URL, it might be a PDF
    // For now, we'll assume we have normalized data stored
    if (intakeDocument.data) {
      let dataStr = '';

      // Check if data is stored as comma-separated bytes or as a proper Buffer
      // Handle Uint8Array (Prisma 6.x returns Bytes as Uint8Array)
      const rawDataStr =
        typeof intakeDocument.data === 'string'
          ? intakeDocument.data
          : intakeDocument.data instanceof Uint8Array
            ? Buffer.from(intakeDocument.data).toString('utf8')
            : Buffer.isBuffer(intakeDocument.data)
              ? intakeDocument.data.toString('utf8')
              : JSON.stringify(intakeDocument.data);

      if (rawDataStr.match(/^\d+,\d+,\d+/)) {
        // Data is stored as comma-separated byte values
        const bytes = rawDataStr.split(',').map((b: string) => parseInt(b.trim()));
        dataStr = Buffer.from(bytes).toString('utf8');
      } else {
        // Data is stored as a proper string
        dataStr = rawDataStr;
      }

      logger.debug('[SOAP Service] Raw data preview:', { preview: dataStr.substring(0, 100) });
      const parsedData = JSON.parse(dataStr);

      // If the data has an answers array, transform it to a structured format
      if (parsedData.answers && Array.isArray(parsedData.answers)) {
        parsedData.answers.forEach((answer: any) => {
          structuredData[answer.label] = answer.value;
        });
        intakeData = structuredData;
        logger.debug('[SOAP Service] Parsed intake answers:', { count: parsedData.answers.length });
      } else {
        intakeData = parsedData;
      }

      logger.debug('[SOAP Service] Parsed intake data with fields:', {
        fields: Object.keys(intakeData).slice(0, 10).join(', '),
      });
    }
  } catch (error: unknown) {
    logger.error('Error parsing intake data:', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback to basic patient info
    intakeData = {
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dob,
      gender: patient.gender,
      notes: patient.notes,
    };
  }

  // Generate SOAP note using AI
  const soapInput: SOAPGenerationInput = {
    intakeData,
    patientName: `${patient.firstName} ${patient.lastName}`,
    dateOfBirth: patient.dob,
    chiefComplaint:
      intakeData['How would your life change by losing weight?'] ||
      intakeData.chiefComplaint ||
      intakeData.reasonForVisit ||
      'Weight loss evaluation',
  };

  logger.debug('[SOAP Service] Generating SOAP note for patient:', { value: patient.id });
  logger.debug('[SOAP Service] Intake data sample:', {
    sample: JSON.stringify(soapInput.intakeData, null, 2).slice(0, 500),
  });

  try {
    const generatedSOAP = await generateSOAPNote(soapInput);

    // Store in database
    const soapNote = await prisma.sOAPNote.create({
      data: {
        patientId: patient.id,
        clinicId: patient.clinicId, // Include clinic for multi-tenant isolation
        subjective: generatedSOAP.subjective,
        objective: generatedSOAP.objective,
        assessment: generatedSOAP.assessment,
        plan: generatedSOAP.plan,
        medicalNecessity: generatedSOAP.medicalNecessity,
        sourceType: 'MEDLINK_INTAKE',
        intakeDocumentId: intakeDocument.id,
        generatedByAI: true,
        aiModelVersion: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        status: 'DRAFT',
        promptTokens: generatedSOAP.metadata.usage?.promptTokens,
        completionTokens: generatedSOAP.metadata.usage?.completionTokens,
        estimatedCost: generatedSOAP.metadata.usage?.estimatedCost,
      },
    });

    logger.debug('[SOAP Service] SOAP note created successfully:', { value: soapNote.id });

    return soapNote;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStatus =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : undefined;
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code: string }).code
        : undefined;

    logger.error('[SOAP Service] Error generating SOAP note:', {
      error: errorMessage,
      status: errorStatus,
      code: errorCode,
    });

    // Preserve the original error status for proper handling upstream
    const newError = new Error(`Failed to generate SOAP note: ${errorMessage}`) as Error & {
      status?: number;
      code?: string;
    };
    newError.status = errorStatus;
    newError.code = errorCode;
    throw newError;
  }
}

/**
 * Create manual SOAP note
 */
export async function createManualSOAPNote(
  patientId: number,
  content: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  }
): Promise<PrismaSOAPNote> {
  const rawPatient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!rawPatient) {
    throw new Error('Patient not found');
  }

  // Decrypt patient PHI for test patient check
  const patient = {
    ...rawPatient,
    ...decryptPatientPHI(
      rawPatient as Record<string, unknown>,
      DEFAULT_PHI_FIELDS as unknown as string[]
    ),
  };

  // Prevent creating SOAP notes for test/dummy patients
  const isTestPatient =
    patient.firstName?.toLowerCase() === 'unknown' ||
    patient.lastName?.toLowerCase() === 'unknown' ||
    patient.firstName?.toLowerCase().includes('test') ||
    patient.lastName?.toLowerCase().includes('test') ||
    patient.firstName?.toLowerCase().includes('demo') ||
    patient.lastName?.toLowerCase().includes('demo') ||
    patient.email?.toLowerCase().includes('test') ||
    patient.email?.toLowerCase().includes('demo');

  if (isTestPatient) {
    throw new Error('Cannot create SOAP notes for test/demo patients');
  }

  const soapNote = await prisma.sOAPNote.create({
    data: {
      patientId: patient.id,
      subjective: content.subjective,
      objective: content.objective,
      assessment: content.assessment,
      plan: content.plan,
      sourceType: 'MANUAL',
      generatedByAI: false,
      status: 'DRAFT',
    },
  });

  logger.debug('[SOAP Service] Manual SOAP note created:', { id: soapNote.id });

  return soapNote;
}

/**
 * Approve SOAP note with password protection
 */
export async function approveSOAPNote(
  soapNoteId: number,
  providerId: number,
  password: string
): Promise<PrismaSOAPNote> {
  // Verify provider exists
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error('Provider not found');
  }

  // Get SOAP note
  const soapNote = await prisma.sOAPNote.findUnique({
    where: { id: soapNoteId },
  });

  if (!soapNote) {
    throw new Error('SOAP note not found');
  }

  if (soapNote.status === 'APPROVED' || soapNote.status === 'LOCKED') {
    throw new Error('SOAP note is already approved');
  }

  // Hash the password for future edits
  const passwordHash = await bcrypt.hash(password, 10);

  // Create revision record
  await prisma.sOAPNoteRevision.create({
    data: {
      soapNoteId,
      editorEmail: provider.email || `provider-${provider.id}`,
      editorRole: 'doctor',
      previousContent: {
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
        status: soapNote.status,
      },
      newContent: {
        status: 'APPROVED',
      },
      changeReason: 'Doctor approval',
    },
  });

  // Update SOAP note
  const updatedNote = await prisma.sOAPNote.update({
    where: { id: soapNoteId },
    data: {
      status: 'APPROVED',
      approvedBy: providerId,
      approvedAt: new Date(),
      editPasswordHash: passwordHash,
    },
  });

  logger.debug('[SOAP Service] SOAP note approved by provider:', { value: providerId });

  return updatedNote;
}

/**
 * Lock SOAP note to prevent any edits
 */
export async function lockSOAPNote(
  soapNoteId: number,
  providerId: number
): Promise<PrismaSOAPNote> {
  const soapNote = await prisma.sOAPNote.findUnique({
    where: { id: soapNoteId },
  });

  if (!soapNote) {
    throw new Error('SOAP note not found');
  }

  if (soapNote.status === 'LOCKED') {
    throw new Error('SOAP note is already locked');
  }

  if (soapNote.approvedBy !== providerId) {
    throw new Error('Only the approving provider can lock the note');
  }

  const lockedNote = await prisma.sOAPNote.update({
    where: { id: soapNoteId },
    data: {
      status: 'LOCKED',
      lockedAt: new Date(),
    },
  });

  logger.debug('[SOAP Service] SOAP note locked:', { value: soapNoteId });

  return lockedNote;
}

/**
 * Edit approved SOAP note with password verification
 */
export async function editApprovedSOAPNote(
  soapNoteId: number,
  password: string,
  updates: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  },
  editorEmail: string,
  changeReason: string
): Promise<PrismaSOAPNote> {
  const soapNote = await prisma.sOAPNote.findUnique({
    where: { id: soapNoteId },
  });

  if (!soapNote) {
    throw new Error('SOAP note not found');
  }

  if (soapNote.status === 'LOCKED') {
    throw new Error('SOAP note is locked and cannot be edited');
  }

  if (soapNote.status !== 'APPROVED') {
    throw new Error('Only approved notes require password for editing');
  }

  // Verify password
  if (!soapNote.editPasswordHash) {
    throw new Error('No password set for this SOAP note');
  }

  const isPasswordValid = await bcrypt.compare(password, soapNote.editPasswordHash);
  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  // Record revision
  await prisma.sOAPNoteRevision.create({
    data: {
      soapNoteId,
      editorEmail,
      editorRole: 'doctor',
      previousContent: {
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
      },
      newContent: updates,
      changeReason,
    },
  });

  // Apply updates
  const updatedNote = await prisma.sOAPNote.update({
    where: { id: soapNoteId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });

  logger.debug('[SOAP Service] Approved SOAP note edited:', { value: soapNoteId });

  return updatedNote;
}

/**
 * Get SOAP notes for a patient (only provider-approved or real intake submissions)
 */
export async function getPatientSOAPNotes(
  patientId: number,
  includeRevisions = false
): Promise<any[]> {
  // Get all SOAP notes for the patient
  // Simplified filter - show all notes, let the UI handle display
  const allSoapNotes = await prisma.sOAPNote.findMany({
    where: {
      patientId,
    },
    include: {
      approvedByProvider: true,
      intakeDocument: true,
      revisions: includeRevisions,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Light filtering - only exclude obvious test/placeholder notes
  const filteredNotes = allSoapNotes.filter((note: any) => {
    const subjective = note.subjective?.toLowerCase() || '';

    // Only exclude if subjective is completely empty or placeholder
    if (!note.subjective || note.subjective.trim().length < 10) {
      return false;
    }

    // Exclude obvious placeholder content
    if (subjective === 'test' || subjective === 'placeholder') {
      return false;
    }

    return true;
  });

  // Remove duplicates - keep only the most recent per intake document
  const seenIntakeDocuments = new Set<number>();
  const deduplicatedNotes = filteredNotes.filter((note: any) => {
    if (note.intakeDocumentId) {
      if (!seenIntakeDocuments.has(note.intakeDocumentId)) {
        seenIntakeDocuments.add(note.intakeDocumentId);
        return true;
      }
      // Keep if it's approved even if duplicate
      return note.approvedBy !== null;
    }
    return true;
  });

  return deduplicatedNotes;
}

/**
 * Get single SOAP note with details
 */
export async function getSOAPNoteById(soapNoteId: number, includeRevisions = false): Promise<any> {
  const soapNote = await prisma.sOAPNote.findUnique({
    where: { id: soapNoteId },
    include: {
      patient: true,
      approvedByProvider: true,
      intakeDocument: true,
      revisions: includeRevisions
        ? {
            orderBy: { createdAt: 'desc' },
          }
        : false,
    },
  });

  if (!soapNote) {
    throw new Error('SOAP note not found');
  }

  return soapNote;
}

/**
 * Export SOAP note as formatted text - Professional Telehealth Weight Management Format
 */
export function formatSOAPNote(soapNote: any): string {
  const patient = soapNote.patient;
  const provider = soapNote.approvedByProvider;

  // Calculate age from DOB
  let age = '';
  if (patient?.dob) {
    const birthDate = new Date(patient.dob);
    const today = new Date();
    age = String(
      Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    );
  }

  // Format date
  const dateOfService = new Date(soapNote.createdAt).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  let formatted = `SOAP NOTE – TELEHEALTH WEIGHT MANAGEMENT\n\n`;

  if (patient) {
    formatted += `Patient Name: ${patient.firstName} ${patient.lastName}\n`;
    formatted += `DOB: ${patient.dob ? new Date(patient.dob).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'Not provided'}\n`;
    if (age) formatted += `Age: ${age}\n`;
    // Format gender - handles "m", "f", "male", "female", "man", "woman"
    const formatSex = (g: string | null | undefined) => {
      if (!g) return 'Not specified';
      const gl = g.toLowerCase().trim();
      if (gl === 'f' || gl === 'female' || gl === 'woman') return 'Female';
      if (gl === 'm' || gl === 'male' || gl === 'man') return 'Male';
      return 'Not specified';
    };
    formatted += `Sex: ${formatSex(patient.gender)}\n`;
    if (patient.city || patient.state) {
      formatted += `Location: ${[patient.city, patient.state].filter(Boolean).join(', ')}\n`;
    }
  }

  formatted += `Date of Service: ${dateOfService}\n`;
  formatted += `Encounter Type: Asynchronous Telehealth Evaluation\n`;

  if (provider) {
    formatted += `Provider: ${provider.firstName} ${provider.lastName}, ${provider.titleLine || 'Licensed Prescribing Provider (MD/DO/NP/PA)'}\n`;
  } else {
    formatted += `Provider: Licensed Prescribing Provider (MD/DO/NP/PA)\n`;
  }

  formatted += `Reason for Visit: Medical weight management evaluation and treatment consideration\n`;

  formatted += `\n${'⸻'.repeat(1)}\n\n`;

  formatted += `S – SUBJECTIVE\n\n`;
  formatted += `${soapNote.subjective}\n`;

  formatted += `\n${'⸻'.repeat(1)}\n\n`;

  formatted += `O – OBJECTIVE\n\n`;
  formatted += `${soapNote.objective}\n`;

  formatted += `\n${'⸻'.repeat(1)}\n\n`;

  formatted += `A – ASSESSMENT\n\n`;
  formatted += `${soapNote.assessment}\n`;

  formatted += `\n${'⸻'.repeat(1)}\n\n`;

  formatted += `P – PLAN\n\n`;
  formatted += `${soapNote.plan}\n`;

  formatted += `\n${'⸻'.repeat(1)}\n\n`;

  formatted += `PROVIDER ATTESTATION\n\n`;
  formatted += `I attest that I personally reviewed the patient's intake, medical history, and responses. Based on my clinical judgment, compounded GLP-1 therapy with appropriate adjunctive support is medically necessary and appropriate for this patient. The patient meets eligibility criteria and has no contraindications to treatment.\n\n`;

  formatted += `Electronic Signature: __________________________\n`;
  if (provider) {
    formatted += `Provider Name, Credentials: ${provider.firstName} ${provider.lastName}, ${provider.titleLine || ''}\n`;
    formatted += `License #: ${provider.licenseNumber || '____________________'}\n`;
  } else {
    formatted += `Provider Name, Credentials: ____________________\n`;
    formatted += `License #: ____________________\n`;
  }
  formatted += `Date: ${dateOfService}\n`;

  if (soapNote.status === 'APPROVED' && soapNote.approvedAt) {
    formatted += `\n${'='.repeat(60)}\n`;
    formatted += `Electronically signed and approved on: ${new Date(soapNote.approvedAt).toLocaleString()}\n`;
  }

  return formatted;
}
