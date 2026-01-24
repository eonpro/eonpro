/**
 * Unified Intake Processor
 * 
 * This module provides a centralized way to process intake form submissions
 * from multiple sources (Heyflow, MedLink, WeightLossIntake, Internal).
 * 
 * Usage:
 *   const processor = new IntakeProcessor({ source: 'heyflow' });
 *   const result = await processor.process(normalizedIntake, options);
 */

import { PatientDocumentCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateIntakePdf } from "@/services/intakePdfService";
import { generateSOAPFromIntake } from "@/services/ai/soapNoteService";
import { trackReferral } from "@/services/influencerService";
import type { NormalizedIntake, NormalizedPatient } from "@/lib/heyflow/types";

export type IntakeSource = 'heyflow' | 'medlink' | 'weightlossintake' | 'eonpro' | 'internal';

export interface ProcessIntakeOptions {
  clinicId?: number;
  clinicSubdomain?: string;
  isPartialSubmission?: boolean;
  generateSoapNote?: boolean;
  tags?: string[];
  promoCode?: string;
  referralSource?: string;
}

export interface ProcessIntakeResult {
  success: boolean;
  patient: {
    id: number;
    patientId: string | null;
    name: string;
    email: string;
    isNew: boolean;
  };
  document: {
    id: number;
    filename: string;
    pdfSizeBytes: number;
  } | null;
  soapNote: {
    id: number;
    status: string;
  } | null;
  errors: string[];
  processingTimeMs: number;
}

export class IntakeProcessor {
  private source: IntakeSource;
  private requestId: string;
  private errors: string[] = [];
  private startTime: number = Date.now();

  constructor(options: { source: IntakeSource; requestId?: string }) {
    this.source = options.source;
    this.requestId = options.requestId || crypto.randomUUID();
  }

  /**
   * Process an intake form submission
   */
  async process(
    normalized: NormalizedIntake,
    options: ProcessIntakeOptions = {}
  ): Promise<ProcessIntakeResult> {
    this.startTime = Date.now();
    this.errors = [];

    logger.info(`[INTAKE ${this.requestId}] Processing ${this.source} intake for ${normalized.patient.email}`);

    // Step 1: Resolve clinic
    const clinicId = await this.resolveClinic(options);

    // Step 2: Upsert patient
    const { patient, isNew } = await this.upsertPatient(normalized, clinicId, options);

    // Step 3: Generate and store PDF
    let document = null;
    try {
      document = await this.generateAndStoreDocument(normalized, patient, clinicId);
    } catch (error: any) {
      this.errors.push(`PDF generation failed: ${error.message}`);
      logger.error(`[INTAKE ${this.requestId}] PDF generation failed:`, error);
    }

    // Step 4: Generate SOAP note (if requested and document exists)
    let soapNote = null;
    if (options.generateSoapNote !== false && document && !options.isPartialSubmission) {
      try {
        soapNote = await this.generateSoapNote(patient.id, document.id);
      } catch (error: any) {
        this.errors.push(`SOAP generation failed: ${error.message}`);
        logger.error(`[INTAKE ${this.requestId}] SOAP generation failed:`, error);
      }
    }

    // Step 5: Track referral (if promo code provided)
    if (options.promoCode) {
      try {
        await this.trackReferral(patient.id, options.promoCode, options.referralSource);
      } catch (error: any) {
        this.errors.push(`Referral tracking failed: ${error.message}`);
      }
    }

    // Step 6: Create audit log
    await this.createAuditLog(patient, document, soapNote, options);

    const processingTimeMs = Date.now() - this.startTime;
    logger.info(`[INTAKE ${this.requestId}] Completed in ${processingTimeMs}ms with ${this.errors.length} errors`);

    return {
      success: true,
      patient: {
        id: patient.id,
        patientId: patient.patientId,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        isNew,
      },
      document: document ? {
        id: document.id,
        filename: document.filename,
        pdfSizeBytes: document.pdfSizeBytes,
      } : null,
      soapNote: soapNote ? {
        id: soapNote.id,
        status: 'DRAFT',
      } : null,
      errors: this.errors,
      processingTimeMs,
    };
  }

  /**
   * Resolve clinic ID from options
   */
  private async resolveClinic(options: ProcessIntakeOptions): Promise<number | null> {
    if (options.clinicId) {
      return options.clinicId;
    }

    if (options.clinicSubdomain) {
      const clinic = await prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: options.clinicSubdomain },
            { name: { contains: options.clinicSubdomain, mode: 'insensitive' } },
          ],
        },
      });

      if (clinic) {
        return clinic.id;
      }
      
      logger.warn(`[INTAKE ${this.requestId}] Clinic not found: ${options.clinicSubdomain}`);
    }

    return null;
  }

  /**
   * Upsert patient from normalized intake data
   */
  private async upsertPatient(
    normalized: NormalizedIntake,
    clinicId: number | null,
    options: ProcessIntakeOptions
  ): Promise<{ patient: any; isNew: boolean }> {
    const patientData = this.normalizePatientData(normalized.patient);
    
    // Build match filters
    const matchFilters: Prisma.PatientWhereInput[] = [];
    
    if (patientData.email && patientData.email !== 'unknown@example.com') {
      matchFilters.push({ email: patientData.email });
    }
    if (patientData.phone && patientData.phone !== '0000000000') {
      matchFilters.push({ phone: patientData.phone });
    }
    if (patientData.firstName !== 'Unknown' && patientData.lastName !== 'Unknown' && patientData.dob) {
      matchFilters.push({
        firstName: patientData.firstName,
        lastName: patientData.lastName,
        dob: patientData.dob,
      });
    }

    // Find existing patient
    let existingPatient = null;
    if (matchFilters.length > 0) {
      const whereClause: Prisma.PatientWhereInput = { OR: matchFilters };
      if (clinicId) {
        whereClause.clinicId = clinicId;
      }
      
      existingPatient = await prisma.patient.findFirst({ where: whereClause });
    }

    // Build tags
    const baseTags = [this.source];
    const allTags = [...baseTags, ...(options.tags || [])];
    if (options.isPartialSubmission) {
      allTags.push('partial-lead', 'needs-followup');
    }

    if (existingPatient) {
      // Update existing patient
      const existingTags = Array.isArray(existingPatient.tags) ? existingPatient.tags as string[] : [];
      const mergedTags = [...new Set([...existingTags, ...allTags])];

      const patient = await prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          ...patientData,
          tags: mergedTags,
          notes: this.appendNotes(existingPatient.notes, normalized.submissionId),
        },
      });

      logger.info(`[INTAKE ${this.requestId}] Updated patient: ${patient.id}`);
      return { patient, isNew: false };
    } else {
      // Create new patient - use clinic-specific counter
      const patientNumber = await this.getNextPatientId(clinicId);
      
      const patient = await prisma.patient.create({
        data: {
          ...patientData,
          patientId: patientNumber,
          clinicId,
          tags: allTags,
          notes: `Created via ${this.source} intake ${normalized.submissionId}`,
          source: 'webhook',
          sourceMetadata: {
            type: this.source,
            submissionId: normalized.submissionId,
            timestamp: new Date().toISOString(),
          },
        },
      });

      logger.info(`[INTAKE ${this.requestId}] Created patient: ${patient.id} (${patient.patientId})`);
      return { patient, isNew: true };
    }
  }

  /**
   * Generate PDF and store document
   */
  private async generateAndStoreDocument(
    normalized: NormalizedIntake,
    patient: any,
    clinicId: number | null
  ): Promise<{ id: number; filename: string; pdfSizeBytes: number }> {
    // Generate PDF
    logger.debug(`[INTAKE ${this.requestId}] Generating PDF...`);
    const pdfBuffer = await generateIntakePdf(normalized, patient);
    logger.debug(`[INTAKE ${this.requestId}] PDF generated: ${pdfBuffer.length} bytes`);

    // Generate filename
    const timestamp = Date.now();
    const cleanSubmissionId = normalized.submissionId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30);
    const filename = `patient_${patient.id}_${this.source}-intake-${timestamp}.pdf`;

    // Store intake data for display
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      patient: normalized.patient,
      source: this.source,
      receivedAt: new Date().toISOString(),
    };

    // Check for existing document
    const existingDocument = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
    });

    // Store intake JSON for display (PDF bytes require DB migration for intakeData field)
    const intakeDataBuffer = Buffer.from(JSON.stringify(intakeDataToStore), 'utf8');
    
    let document;
    if (existingDocument) {
      document = await prisma.patientDocument.update({
        where: { id: existingDocument.id },
        data: {
          filename,
          data: intakeDataBuffer,
        },
      });
    } else {
      document = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId,
          filename,
          mimeType: 'application/pdf',
          source: this.source,
          sourceSubmissionId: normalized.submissionId,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          data: intakeDataBuffer,
        },
      });
    }

    logger.info(`[INTAKE ${this.requestId}] Document stored: ${document.id}`);
    return { id: document.id, filename, pdfSizeBytes: pdfBuffer.length };
  }

  /**
   * Generate SOAP note from intake
   */
  private async generateSoapNote(patientId: number, documentId: number): Promise<{ id: number }> {
    logger.debug(`[INTAKE ${this.requestId}] Generating SOAP note...`);
    const soapNote = await generateSOAPFromIntake(patientId, documentId);
    logger.info(`[INTAKE ${this.requestId}] SOAP note generated: ${soapNote.id}`);
    return { id: soapNote.id };
  }

  /**
   * Track referral/promo code
   */
  private async trackReferral(patientId: number, promoCode: string, referralSource?: string): Promise<void> {
    await trackReferral(
      patientId,
      promoCode.trim().toUpperCase(),
      referralSource || this.source,
      {
        source: this.source,
        timestamp: new Date().toISOString(),
      }
    );
    logger.info(`[INTAKE ${this.requestId}] Referral tracked: ${promoCode}`);
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    patient: any,
    document: any,
    soapNote: any,
    options: ProcessIntakeOptions
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: options.isPartialSubmission ? 'PARTIAL_INTAKE_RECEIVED' : 'PATIENT_INTAKE_RECEIVED',
          tableName: 'Patient',
          recordId: patient.id,
          userId: 0,
          diff: JSON.stringify({
            source: this.source,
            requestId: this.requestId,
            documentId: document?.id,
            soapNoteId: soapNote?.id,
            isPartial: options.isPartialSubmission,
            errors: this.errors.length > 0 ? this.errors : undefined,
          }),
          ipAddress: 'webhook',
        },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`[INTAKE ${this.requestId}] Audit log failed:`, { error: errMsg });
    }
  }

  // Helper methods
  private normalizePatientData(patient: NormalizedPatient) {
    return {
      firstName: this.capitalize(patient.firstName) || 'Unknown',
      lastName: this.capitalize(patient.lastName) || 'Unknown',
      email: patient.email?.toLowerCase()?.trim() || 'unknown@example.com',
      phone: this.sanitizePhone(patient.phone),
      dob: this.normalizeDate(patient.dob),
      gender: this.normalizeGender(patient.gender),
      address1: String(patient.address1 || '').trim(),
      address2: String(patient.address2 || '').trim(),
      city: String(patient.city || '').trim(),
      state: String(patient.state || '').toUpperCase().trim(),
      zip: String(patient.zip || '').trim(),
    };
  }

  private async getNextPatientId(clinicId: number = 1): Promise<string> {
    try {
      const counter = await prisma.patientCounter.upsert({
        where: { clinicId },
        create: { clinicId, current: 1 },
        update: { current: { increment: 1 } },
      });
      return counter.current.toString().padStart(6, '0');
    } catch {
      return `${this.source.toUpperCase().slice(0, 3)}${Date.now().toString().slice(-8)}`;
    }
  }

  private sanitizePhone(value?: string): string {
    if (!value) return '0000000000';
    const digits = String(value).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }
    return digits || '0000000000';
  }

  private normalizeGender(value?: string): string {
    if (!value) return 'm';
    const lower = String(value).toLowerCase().trim();
    if (lower === 'f' || lower === 'female' || lower === 'woman') return 'f';
    if (lower.startsWith('f') || lower.startsWith('w')) return 'f';
    return 'm';
  }

  private normalizeDate(value?: string): string {
    if (!value) return '1900-01-01';
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const slashParts = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashParts) {
      const [, mm, dd, yyyy] = slashParts;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    const parts = str.replace(/[^0-9]/g, '').match(/(\d{2})(\d{2})(\d{4})/);
    if (parts) {
      const [, mm, dd, yyyy] = parts;
      return `${yyyy}-${mm}-${dd}`;
    }

    return '1900-01-01';
  }

  private capitalize(value?: string): string {
    if (!value) return '';
    return String(value)
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  private appendNotes(existing: string | null | undefined, submissionId: string): string {
    const suffix = `Synced from ${this.source} ${submissionId}`;
    if (!existing) return suffix;
    if (existing.includes(submissionId)) return existing;
    return `${existing}\n${suffix}`;
  }
}
