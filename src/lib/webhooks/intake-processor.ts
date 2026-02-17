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

import { PatientDocumentCategory, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateIntakePdf } from '@/services/intakePdfService';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { attributeFromIntake, tagPatientWithReferralCodeOnly } from '@/services/affiliate/attributionService';
import { generatePatientId } from '@/lib/patients';
import { buildPatientSearchIndex } from '@/lib/utils/search';
import type { NormalizedIntake, NormalizedPatient } from '@/lib/heyflow/types';
import { storeIntakeData } from '@/lib/storage/document-data-store';

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
  weightLog: {
    id: number;
    weight: number;
    source: string;
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

    logger.info(
      `[INTAKE ${this.requestId}] Processing ${this.source} intake for ${normalized.patient.email}`
    );

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

    // Step 4: Create initial weight log from intake data
    let weightLog = null;
    if (!options.isPartialSubmission) {
      try {
        weightLog = await this.createInitialWeightLog(normalized, patient);
      } catch (error: any) {
        this.errors.push(`Weight log creation failed: ${error.message}`);
        logger.error(`[INTAKE ${this.requestId}] Weight log creation failed:`, error);
      }
    }

    // Step 5: Generate SOAP note (if requested and document exists)
    let soapNote = null;
    if (options.generateSoapNote !== false && document && !options.isPartialSubmission) {
      try {
        soapNote = await this.generateSoapNote(patient.id, document.id);
      } catch (error: any) {
        this.errors.push(`SOAP generation failed: ${error.message}`);
        logger.error(`[INTAKE ${this.requestId}] SOAP generation failed:`, error);
      }
    }

    // Step 6: Track referral (if promo code provided)
    if (options.promoCode) {
      try {
        await this.trackReferralAttribution(patient.id, options.promoCode, clinicId, options.referralSource);
      } catch (error: any) {
        this.errors.push(`Referral tracking failed: ${error.message}`);
      }
    }

    // Step 7: Create audit log
    await this.createAuditLog(patient, document, soapNote, weightLog, options);

    const processingTimeMs = Date.now() - this.startTime;
    logger.info(
      `[INTAKE ${this.requestId}] Completed in ${processingTimeMs}ms with ${this.errors.length} errors`
    );

    return {
      success: true,
      patient: {
        id: patient.id,
        patientId: patient.patientId,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        isNew,
      },
      document: document
        ? {
            id: document.id,
            filename: document.filename,
            pdfSizeBytes: document.pdfSizeBytes,
          }
        : null,
      soapNote: soapNote
        ? {
            id: soapNote.id,
            status: 'DRAFT',
          }
        : null,
      weightLog: weightLog
        ? {
            id: weightLog.id,
            weight: weightLog.weight,
            source: weightLog.source,
          }
        : null,
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
    if (
      patientData.firstName !== 'Unknown' &&
      patientData.lastName !== 'Unknown' &&
      patientData.dob
    ) {
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
      const existingTags = Array.isArray(existingPatient.tags)
        ? (existingPatient.tags as string[])
        : [];
      const mergedTags = [...new Set([...existingTags, ...allTags])];

      const updateSearchIndex = buildPatientSearchIndex({
        ...patientData,
        patientId: existingPatient.patientId,
      });
      const patient = await prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          ...patientData,
          tags: mergedTags,
          notes: this.appendNotes(existingPatient.notes, normalized.submissionId),
          searchIndex: updateSearchIndex,
        },
      });

      logger.info(`[INTAKE ${this.requestId}] Updated patient: ${patient.id}`);
      return { patient, isNew: false };
    } else {
      // Create new patient - use clinic-specific counter
      const patientNumber = await this.getNextPatientId(clinicId ?? undefined);
      const searchIndex = buildPatientSearchIndex({
        ...patientData,
        patientId: patientNumber,
      });

      const patient = await prisma.patient.create({
        data: {
          ...patientData,
          patientId: patientNumber,
          clinicId: clinicId!,
          tags: allTags,
          notes: `Created via ${this.source} intake ${normalized.submissionId}`,
          source: 'webhook',
          searchIndex,
          sourceMetadata: {
            type: this.source,
            submissionId: normalized.submissionId,
            timestamp: new Date().toISOString(),
          },
        },
      });

      logger.info(
        `[INTAKE ${this.requestId}] Created patient: ${patient.id} (${patient.patientId})`
      );
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
      select: { id: true },
    });

    // Dual-write: S3 + DB `data` column (Phase 3.3)
    const { s3DataKey, dataBuffer: intakeDataBuffer } = await storeIntakeData(
      intakeDataToStore,
      { documentId: existingDocument?.id, patientId: patient.id, clinicId }
    );

    let document;
    if (existingDocument) {
      document = await prisma.patientDocument.update({
        where: { id: existingDocument.id },
        data: {
          filename,
          data: intakeDataBuffer,
          ...(s3DataKey != null ? { s3DataKey } : {}),
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
          ...(s3DataKey != null ? { s3DataKey } : {}),
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
   * Track referral/promo code in the affiliate system
   */
  private async trackReferralAttribution(
    patientId: number,
    promoCode: string,
    clinicId: number | null,
    referralSource?: string
  ): Promise<void> {
    const normalizedCode = promoCode.trim().toUpperCase();

    if (!clinicId) {
      logger.warn(`[INTAKE ${this.requestId}] Cannot track affiliate attribution without clinicId`, {
        promoCode: normalizedCode,
      });
      return;
    }

    try {
      const attribution = await attributeFromIntake(
        patientId,
        normalizedCode,
        clinicId,
        this.source
      );

      if (attribution) {
        logger.info(`[INTAKE ${this.requestId}] Affiliate attribution created`, {
          affiliateId: attribution.affiliateId,
          refCode: attribution.refCode,
          touchId: attribution.touchId,
        });
      } else {
        // No AffiliateRefCode exists yet - tag patient for later reconciliation
        const tagged = await tagPatientWithReferralCodeOnly(patientId, normalizedCode, clinicId);
        if (tagged) {
          logger.info(`[INTAKE ${this.requestId}] Profile tagged with referral code (no affiliate yet): ${normalizedCode}`);
        } else {
          logger.debug(
            `[INTAKE ${this.requestId}] No affiliate match for code: ${normalizedCode}`
          );
        }
      }
    } catch (error) {
      logger.warn(`[INTAKE ${this.requestId}] Affiliate attribution failed:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    patient: any,
    document: any,
    soapNote: any,
    weightLog: any,
    options: ProcessIntakeOptions
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: options.isPartialSubmission
            ? 'PARTIAL_INTAKE_RECEIVED'
            : 'PATIENT_INTAKE_RECEIVED',
          resource: 'Patient',
          resourceId: patient.id,
          userId: 0,
          details: {
            source: this.source,
            requestId: this.requestId,
            documentId: document?.id,
            soapNoteId: soapNote?.id,
            weightLogId: weightLog?.id,
            isPartial: options.isPartialSubmission,
            errors: this.errors.length > 0 ? this.errors : undefined,
          },
          ipAddress: 'webhook',
        },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`[INTAKE ${this.requestId}] Audit log failed:`, { error: errMsg });
    }
  }

  /**
   * Create initial weight log entry from intake data
   * This creates a real database record so weight appears in progress charts
   */
  private async createInitialWeightLog(
    normalized: NormalizedIntake,
    patient: any
  ): Promise<{ id: number; weight: number; source: string } | null> {
    // Extract weight from intake data
    const weight = this.extractWeightFromIntake(normalized);

    if (!weight) {
      logger.debug(`[INTAKE ${this.requestId}] No weight found in intake data`);
      return null;
    }

    // Check if patient already has weight logs to avoid duplicates
    // (e.g., if this is an existing patient with updated intake)
    const existingLogs = await prisma.patientWeightLog.findMany({
      where: { patientId: patient.id },
      take: 1,
      orderBy: { recordedAt: 'asc' },
    });

    // If patient already has weight logs, check if we should skip
    if (existingLogs.length > 0) {
      const oldestLog = existingLogs[0];
      // Skip if there's already a weight log from intake source
      if (oldestLog.source === 'intake') {
        logger.debug(`[INTAKE ${this.requestId}] Patient already has intake weight log`);
        return null;
      }
      // Skip if there's already a very similar weight (within 1 lb and 24 hours)
      const timeDiff = Math.abs(new Date().getTime() - new Date(oldestLog.recordedAt).getTime());
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (Math.abs(oldestLog.weight - weight) < 1 && timeDiff < oneDayMs) {
        logger.debug(`[INTAKE ${this.requestId}] Similar weight log already exists`);
        return null;
      }
    }

    // Create the weight log entry
    const weightLog = await prisma.patientWeightLog.create({
      data: {
        patientId: patient.id,
        weight,
        unit: 'lbs',
        notes: 'Initial weight from intake form',
        source: 'intake',
        recordedAt: normalized.submittedAt || new Date(),
      },
    });

    logger.info(
      `[INTAKE ${this.requestId}] Created initial weight log: ${weightLog.id} (${weight} lbs)`
    );
    return { id: weightLog.id, weight: weightLog.weight, source: weightLog.source };
  }

  /**
   * Extract weight value from normalized intake data
   * Searches through sections and answers for weight-related fields
   */
  private extractWeightFromIntake(normalized: NormalizedIntake): number | null {
    const weightLabels = [
      'starting weight',
      'current weight',
      'weight (lbs)',
      'weight',
      'your weight',
      'body weight',
    ];

    // Helper to check if label matches weight-related fields
    const isWeightLabel = (label: string): boolean => {
      const normalizedLabel = label.toLowerCase().trim();
      return weightLabels.some((wl) => normalizedLabel.includes(wl));
    };

    // Helper to parse weight value
    const parseWeight = (value: string | any): number | null => {
      if (!value) return null;
      const strValue = String(value).trim();
      if (!strValue) return null;

      // Extract numeric value (handles "150 lbs", "150", etc.)
      const numericValue = parseFloat(strValue.replace(/[^0-9.]/g, ''));

      // Validate reasonable weight range (10-1000 lbs)
      if (isNaN(numericValue) || numericValue < 10 || numericValue > 1000) {
        return null;
      }

      return numericValue;
    };

    // Search in sections
    for (const section of normalized.sections) {
      for (const entry of section.entries) {
        if (isWeightLabel(entry.label)) {
          const weight = parseWeight(entry.value);
          if (weight) {
            logger.debug(
              `[INTAKE ${this.requestId}] Found weight in section "${section.title}": ${weight}`
            );
            return weight;
          }
        }
      }
    }

    // Search in flat answers array
    for (const answer of normalized.answers) {
      if (isWeightLabel(answer.label)) {
        const weight = parseWeight(answer.value);
        if (weight) {
          logger.debug(`[INTAKE ${this.requestId}] Found weight in answers: ${weight}`);
          return weight;
        }
      }
    }

    return null;
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
      state: String(patient.state || '')
        .toUpperCase()
        .trim(),
      zip: String(patient.zip || '').trim(),
    };
  }

  // Patient ID generation uses the shared utility from @/lib/patients
  // which handles clinic prefixes (e.g., EON-123, WEL-456)
  private async getNextPatientId(clinicId: number = 1): Promise<string> {
    return generatePatientId(clinicId);
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
