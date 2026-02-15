import { NextRequest } from 'next/server';
import { PatientDocumentCategory, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  normalizeOvertimePayload,
  extractPromoCode,
  isCheckoutComplete,
  detectTreatmentType,
} from '@/lib/overtime/intakeNormalizer';
import { getTagsForTreatment, TREATMENT_TYPE_LABELS } from '@/lib/overtime/treatmentTypes';
import type { OvertimePayload, OvertimeTreatmentType } from '@/lib/overtime/types';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storeIntakePdf } from '@/services/storage/intakeStorage';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import {
  attributeFromIntake,
  tagPatientWithReferralCodeOnly,
  attributeByRecentTouch,
} from '@/services/affiliate/attributionService';
import { notificationService } from '@/services/notification';
import { logger } from '@/lib/logger';
import { recordSuccess, recordError, recordAuthFailure } from '@/lib/webhooks/monitor';
import { isDLQConfigured, queueFailedSubmission } from '@/lib/queue/deadLetterQueue';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';
import { generatePatientId } from '@/lib/patients';
import { decryptPHI } from '@/lib/security/phi-encryption';

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

/**
 * OVERTIME MEN'S CLINIC INTAKE Webhook
 *
 * This webhook receives patient intake form submissions from Heyflow via Airtable
 * for 6 different treatment types:
 * 1. Weight Loss
 * 2. Peptides
 * 3. NAD+
 * 4. Better Sex
 * 5. Testosterone Replacement
 * 6. Baseline/Bloodwork
 *
 * CRITICAL: ALL data is isolated to the Overtime clinic (subdomain: ot)
 *
 * AFFILIATE TRACKING:
 * - Extracts PROMO CODE / INFLUENCER CODE from payload
 * - Links to existing affiliate/influencer in EONPRO
 * - Tracks referral for commission reporting
 *
 * Endpoint: POST /api/webhooks/overtime-intake
 *
 * Authentication:
 *   - Header: x-webhook-secret, x-api-key, or Authorization: Bearer
 *
 * Created: 2026-02-01
 */

// ═══════════════════════════════════════════════════════════════════
// OVERTIME CLINIC ISOLATION - CRITICAL SECURITY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
const OVERTIME_CLINIC_SUBDOMAIN = 'ot';
const EXPECTED_OVERTIME_CLINIC_ID = process.env.OVERTIME_CLINIC_ID
  ? parseInt(process.env.OVERTIME_CLINIC_ID, 10)
  : null;

// Startup validation
if (!EXPECTED_OVERTIME_CLINIC_ID) {
  logger.warn(
    '[OVERTIME-INTAKE] OVERTIME_CLINIC_ID env var not set - will use dynamic lookup only'
  );
}

// Retry helper for database operations
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}

// Safe JSON parse
function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info(`[OVERTIME-INTAKE ${requestId}] Webhook received`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: AUTHENTICATE (CRITICAL - fail fast)
  // ═══════════════════════════════════════════════════════════════════
  const configuredSecret = process.env.OVERTIME_INTAKE_WEBHOOK_SECRET;

  if (!configuredSecret) {
    logger.error(`[OVERTIME-INTAKE ${requestId}] CRITICAL: No webhook secret configured!`);
    return Response.json(
      { error: 'Server configuration error', code: 'NO_SECRET_CONFIGURED', requestId },
      { status: 500 }
    );
  }

  const providedSecret =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (providedSecret !== configuredSecret) {
    logger.warn(`[OVERTIME-INTAKE ${requestId}] Authentication FAILED`);
    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    recordAuthFailure('overtime-intake', ipAddress, providedSecret || undefined);
    return Response.json(
      { error: 'Unauthorized', code: 'INVALID_SECRET', requestId },
      { status: 401 }
    );
  }

  logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ Authenticated`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: GET OVERTIME CLINIC (CRITICAL - fail fast)
  // ═══════════════════════════════════════════════════════════════════
  let clinicId: number;
  let clinicName: string = "Overtime Men's Clinic";

  try {
    const overtimeClinic = await withRetry<{
      id: number;
      name: string;
      subdomain: string | null;
    } | null>(() =>
      prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: OVERTIME_CLINIC_SUBDOMAIN },
            { subdomain: { contains: 'ot', mode: 'insensitive' } },
            { name: { contains: 'Overtime', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
        },
      })
    );

    if (!overtimeClinic) {
      logger.error(`[OVERTIME-INTAKE ${requestId}] CRITICAL: Overtime clinic not found!`);
      recordError('overtime-intake', 'Overtime clinic not found in database', { requestId });
      return Response.json(
        { error: 'Clinic not found', code: 'CLINIC_NOT_FOUND', requestId },
        { status: 500 }
      );
    }

    clinicId = overtimeClinic.id;
    clinicName = overtimeClinic.name;

    // Runtime assertion: Validate clinic ID matches expected value
    if (EXPECTED_OVERTIME_CLINIC_ID && clinicId !== EXPECTED_OVERTIME_CLINIC_ID) {
      logger.error(`[OVERTIME-INTAKE ${requestId}] SECURITY ALERT: Clinic ID mismatch!`, {
        expected: EXPECTED_OVERTIME_CLINIC_ID,
        found: clinicId,
        clinicName: overtimeClinic.name,
        clinicSubdomain: overtimeClinic.subdomain,
      });
      recordError(
        'overtime-intake',
        `SECURITY: Clinic ID mismatch - expected ${EXPECTED_OVERTIME_CLINIC_ID}, got ${clinicId}`,
        {
          requestId,
          expected: EXPECTED_OVERTIME_CLINIC_ID,
          found: clinicId,
        }
      );
      return Response.json(
        { error: 'Clinic configuration error', code: 'CLINIC_ID_MISMATCH', requestId },
        { status: 500 }
      );
    }

    logger.info(
      `[OVERTIME-INTAKE ${requestId}] ✓ CLINIC VERIFIED: ID=${clinicId}, Name="${overtimeClinic.name}", Subdomain="${overtimeClinic.subdomain}"`
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[OVERTIME-INTAKE ${requestId}] Database error finding clinic:`, {
      error: errMsg,
    });
    recordError(
      'overtime-intake',
      `Database error: ${err instanceof Error ? err.message : 'Unknown'}`,
      { requestId }
    );

    if (isDLQConfigured()) {
      try {
        const rawBody = await req.clone().text();
        const payload = safeParseJSON(rawBody) || {};
        await queueFailedSubmission(
          payload,
          'overtime-intake',
          `Database error: ${err instanceof Error ? err.message : 'Unknown'}`,
          { submissionId: requestId }
        );
        logger.info(`[OVERTIME-INTAKE ${requestId}] Queued to DLQ for retry`);
      } catch (dlqErr) {
        const dlqErrMsg = dlqErr instanceof Error ? dlqErr.message : 'Unknown error';
        logger.error(`[OVERTIME-INTAKE ${requestId}] Failed to queue to DLQ:`, {
          error: dlqErrMsg,
        });
      }
    }

    return Response.json(
      { error: 'Database error', code: 'DB_ERROR', requestId, queued: isDLQConfigured() },
      { status: 500 }
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: PARSE PAYLOAD
  // ═══════════════════════════════════════════════════════════════════
  let payload: OvertimePayload = {} as OvertimePayload;
  try {
    const text = await req.text();
    payload = (safeParseJSON(text) || {}) as OvertimePayload;

    // Log all keys for debugging
    const allKeys = Object.keys(payload);
    logger.info(`[OVERTIME-INTAKE ${requestId}] Payload:`, {
      keys: allKeys.slice(0, 20),
      totalKeys: allKeys.length,
      submissionId: payload['submission-id'] || payload.submissionId,
      treatmentType: payload.treatmentType || payload['treatment-type'],
      hasEmail: !!payload['email'],
      hasFirstName: !!payload['first-name'] || !!payload['firstName'] || !!payload['First name'],
      hasPromoCode: !!(
        payload['promo-code'] ||
        payload['PROMO CODE'] ||
        payload['influencer-code']
      ),
    });

    // Log address-related fields for debugging
    const addressKeys = allKeys.filter(
      (k) =>
        k.toLowerCase().includes('address') ||
        k.toLowerCase().includes('street') ||
        k.toLowerCase().includes('city') ||
        k.toLowerCase().includes('zip') ||
        k.toLowerCase().includes('postal') ||
        k.includes('38a5bae0') || // Heyflow address component
        k.includes('0d142f9e') // Heyflow apartment component
    );

    if (addressKeys.length > 0) {
      const addressData: Record<string, unknown> = {};
      for (const key of addressKeys) {
        const value = payload[key as keyof typeof payload];
        addressData[key] = typeof value === 'string' ? value.substring(0, 100) : value;
      }
      logger.info(`[OVERTIME-INTAKE ${requestId}] Address fields found:`, {
        keys: addressKeys,
        values: addressData,
      });
    } else {
      logger.warn(
        `[OVERTIME-INTAKE ${requestId}] ⚠️ No address fields found in payload! Only State field will be used.`
      );
    }

    // Log state field specifically
    const stateValue =
      payload['state'] ||
      payload['State'] ||
      payload['Address [State]'] ||
      payload['id-38a5bae0-state'] ||
      payload['id-38a5bae0-state_code'];
    logger.info(`[OVERTIME-INTAKE ${requestId}] State field:`, {
      stateValue,
      hasState: !!stateValue,
    });
  } catch (err) {
    logger.warn(`[OVERTIME-INTAKE ${requestId}] Failed to parse payload, using empty object`);
    errors.push('Failed to parse JSON payload');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: DETECT TREATMENT TYPE
  // ═══════════════════════════════════════════════════════════════════
  const treatmentType: OvertimeTreatmentType = detectTreatmentType(payload);
  const treatmentLabel = TREATMENT_TYPE_LABELS[treatmentType];
  logger.info(
    `[OVERTIME-INTAKE ${requestId}] Treatment Type: ${treatmentLabel} (${treatmentType})`
  );

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: NORMALIZE DATA
  // ═══════════════════════════════════════════════════════════════════
  let normalized;
  try {
    normalized = normalizeOvertimePayload(payload);
    logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ Payload normalized successfully`);

    // Log extracted address data
    const extractedAddress = {
      address1: normalized.patient.address1,
      address2: normalized.patient.address2,
      city: normalized.patient.city,
      state: normalized.patient.state,
      zip: normalized.patient.zip,
    };
    const hasFullAddress = !!(
      extractedAddress.address1 &&
      extractedAddress.city &&
      extractedAddress.state &&
      extractedAddress.zip
    );
    logger.info(`[OVERTIME-INTAKE ${requestId}] Extracted address:`, {
      ...extractedAddress,
      hasFullAddress,
      onlyHasState: !!(
        extractedAddress.state &&
        !extractedAddress.address1 &&
        !extractedAddress.city &&
        !extractedAddress.zip
      ),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[OVERTIME-INTAKE ${requestId}] Normalization failed, using fallback:`, {
      error: errMsg,
    });
    errors.push('Normalization failed, using fallback data');
    normalized = {
      submissionId: `fallback-${requestId}`,
      submittedAt: new Date(),
      patient: {
        firstName: 'Unknown',
        lastName: 'Lead',
        email: `unknown-${Date.now()}@intake.overtime.io`,
        phone: '',
        dob: '',
        gender: '',
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
      },
      sections: [],
      answers: [],
      treatmentType,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: DETERMINE SUBMISSION TYPE
  // ═══════════════════════════════════════════════════════════════════
  const isComplete = isCheckoutComplete(payload);
  const isPartialSubmission = !isComplete;

  logger.info(`[OVERTIME-INTAKE ${requestId}] Type: ${isComplete ? 'COMPLETE' : 'PARTIAL'}`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: UPSERT PATIENT
  // ═══════════════════════════════════════════════════════════════════
  let patient: any;
  let isNewPatient = false;

  const patientData = normalizePatientData(normalized.patient);

  // Build tags based on treatment type
  const baseTags = getTagsForTreatment(treatmentType);
  const submissionTags = isPartialSubmission
    ? [...baseTags, 'partial-lead', 'needs-followup']
    : [...baseTags, 'complete-intake'];

  // Build notes
  const buildNotes = (existing: string | null | undefined) => {
    const parts: string[] = [];
    if (existing && !existing.includes(normalized.submissionId)) {
      parts.push(existing);
    }
    parts.push(
      `[${new Date().toISOString()}] ${isPartialSubmission ? 'PARTIAL' : 'COMPLETE'} - ${treatmentLabel}: ${normalized.submissionId}`
    );
    return parts.join('\n');
  };

  try {
    // Build comprehensive lookup conditions
    const lookupConditions: Prisma.PatientWhereInput[] = [];

    if (patientData.email && patientData.email !== 'unknown@example.com') {
      lookupConditions.push({ email: { equals: patientData.email, mode: 'insensitive' } });
    }

    if (patientData.phone && patientData.phone !== '0000000000') {
      lookupConditions.push({ phone: patientData.phone });
    }

    if (
      patientData.firstName !== 'Unknown' &&
      patientData.lastName !== 'Unknown' &&
      patientData.dob !== '1900-01-01'
    ) {
      lookupConditions.push({
        firstName: { equals: patientData.firstName, mode: 'insensitive' },
        lastName: { equals: patientData.lastName, mode: 'insensitive' },
        dob: patientData.dob,
      });
    }

    let existingPatient: any = null;

    if (lookupConditions.length > 0) {
      existingPatient = await withRetry(() =>
        prisma.patient.findFirst({
          where: {
            clinicId: clinicId,
            OR: lookupConditions,
          },
        })
      );
    }

    if (existingPatient) {
      // Update existing patient
      const existingTags = Array.isArray(existingPatient.tags)
        ? (existingPatient.tags as string[])
        : [];
      let updatedTags = mergeTags(existingPatient.tags, submissionTags);

      // Remove partial tags if upgrading to complete
      if (existingTags.includes('partial-lead') && !isPartialSubmission) {
        updatedTags = updatedTags.filter(
          (t: string) => t !== 'partial-lead' && t !== 'needs-followup'
        );
        logger.info(`[OVERTIME-INTAKE ${requestId}] ⬆ Upgrading from partial to complete`);
      }

      patient = await withRetry(() =>
        prisma.patient.update({
          where: { id: existingPatient!.id },
          data: {
            ...patientData,
            tags: updatedTags,
            notes: buildNotes(existingPatient!.notes),
          },
        })
      );
      logger.info(
        `[OVERTIME-INTAKE ${requestId}] ✓ Updated patient: ${patient.id} → OVERTIME CLINIC ONLY (clinicId=${clinicId})`
      );
    } else {
      // Create new patient with retry on patientId conflict
      const MAX_RETRIES = 5;
      let retryCount = 0;
      let created = false;

      while (!created && retryCount < MAX_RETRIES) {
        try {
          const patientNumber = await getNextPatientId(clinicId);
          patient = await prisma.patient.create({
            data: {
              ...patientData,
              patientId: patientNumber,
              clinicId: clinicId,
              tags: submissionTags,
              notes: buildNotes(null),
              source: 'webhook',
              sourceMetadata: {
                type: 'overtime-intake',
                treatmentType,
                treatmentLabel,
                submissionId: normalized.submissionId,
                checkoutCompleted: isComplete,
                timestamp: new Date().toISOString(),
                clinicId,
                clinicName,
              },
            },
          });
          isNewPatient = true;
          created = true;
          logger.info(
            `[OVERTIME-INTAKE ${requestId}] ✓ Created patient: ${patient.id} (${patient.patientId}) → OVERTIME CLINIC ONLY (clinicId=${clinicId})`
          );
        } catch (createErr: any) {
          if (createErr?.code === 'P2002' && createErr?.meta?.target?.includes('patientId')) {
            retryCount++;
            logger.warn(
              `[OVERTIME-INTAKE ${requestId}] PatientId conflict, retrying (${retryCount}/${MAX_RETRIES})...`
            );
            await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));

            if (retryCount >= 3 && lookupConditions.length > 0) {
              const refetchPatient = await prisma.patient.findFirst({
                where: {
                  clinicId: clinicId,
                  OR: lookupConditions,
                },
              });

              if (refetchPatient) {
                patient = await prisma.patient.update({
                  where: { id: refetchPatient.id },
                  data: {
                    ...patientData,
                    tags: mergeTags(refetchPatient.tags, submissionTags),
                    notes: buildNotes(refetchPatient.notes),
                  },
                });
                created = true;
                logger.info(
                  `[OVERTIME-INTAKE ${requestId}] ✓ Found and updated patient on retry: ${patient.id}`
                );
              }
            }
          } else {
            throw createErr;
          }
        }
      }

      if (!created) {
        throw new Error(
          `Failed to create patient after ${MAX_RETRIES} retries due to patientId conflicts`
        );
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[OVERTIME-INTAKE ${requestId}] CRITICAL: Patient upsert failed:`, {
      error: errorMsg,
      patientData: {
        email: patientData?.email,
        firstName: patientData?.firstName,
        lastName: patientData?.lastName,
        clinicId,
      },
    });
    recordError('overtime-intake', `Patient creation failed: ${errorMsg}`, { requestId });

    if (isDLQConfigured()) {
      try {
        await queueFailedSubmission(
          payload,
          'overtime-intake',
          `Patient creation failed: ${errorMsg}`,
          {
            patientEmail: normalized?.patient?.email,
            submissionId: normalized?.submissionId || requestId,
            treatmentType,
          }
        );
        logger.info(`[OVERTIME-INTAKE ${requestId}] Queued to DLQ for retry`);
      } catch (dlqErr) {
        logger.error(`[OVERTIME-INTAKE ${requestId}] Failed to queue to DLQ:`, dlqErr);
      }
    }

    return Response.json(
      {
        error: `Failed to create patient: ${errorMsg}`,
        code: 'PATIENT_ERROR',
        requestId,
        partialSuccess: false,
        queued: isDLQConfigured(),
      },
      { status: 500 }
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: GENERATE PDF (non-critical)
  // ═══════════════════════════════════════════════════════════════════
  let pdfContent: Buffer | null = null;
  try {
    pdfContent = await generateIntakePdf(normalized, patient);
    logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ PDF: ${pdfContent.byteLength} bytes`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[OVERTIME-INTAKE ${requestId}] PDF generation failed (continuing):`, {
      error: errMsg,
    });
    errors.push('PDF generation failed');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 9: STORE PDF (non-critical)
  // ═══════════════════════════════════════════════════════════════════
  let stored: { filename: string; pdfBuffer: Buffer } | null = null;
  if (pdfContent) {
    try {
      stored = await storeIntakePdf({
        patientId: patient.id,
        submissionId: normalized.submissionId,
        pdfBuffer: pdfContent,
      });
      logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ PDF prepared: ${stored.filename}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[OVERTIME-INTAKE ${requestId}] PDF preparation failed (continuing):`, {
        error: errMsg,
      });
      errors.push('PDF preparation failed');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 10: UPLOAD PDF TO S3 (if configured)
  // ═══════════════════════════════════════════════════════════════════
  let pdfExternalUrl: string | null = null;
  if (pdfContent && stored) {
    try {
      if (isS3Enabled()) {
        const s3Result = await uploadToS3({
          file: pdfContent,
          fileName: stored.filename,
          category: FileCategory.INTAKE_FORMS,
          patientId: patient.id,
          contentType: 'application/pdf',
          metadata: {
            submissionId: normalized.submissionId,
            patientEmail: normalized.patient.email,
            source: 'overtime-intake',
            treatmentType,
            clinic: 'overtime',
          },
        });
        pdfExternalUrl = s3Result.url;
        logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ PDF uploaded to S3: ${s3Result.key}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[OVERTIME-INTAKE ${requestId}] S3 upload failed (continuing):`, {
        error: errMsg,
      });
      errors.push('S3 PDF upload failed');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 11: CREATE DOCUMENT RECORD
  // ═══════════════════════════════════════════════════════════════════
  let patientDocument: any = null;
  try {
    const existingDoc = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
    });

    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const consentTimestamp = new Date().toISOString();

    // Store raw payload keys for affiliate debugging (helps diagnose missing fields)
    const rawPayloadKeys = Object.keys(payload);
    const rawAffiliateFields: Record<string, string> = {};
    for (const key of rawPayloadKeys) {
      const lower = key.toLowerCase().replace(/\s+/g, '');
      if (lower.includes('url') || lower.includes('ref') || lower.includes('promo') || lower.includes('affiliate')) {
        const val = payload[key as keyof typeof payload];
        if (val && typeof val === 'string') {
          rawAffiliateFields[key] = val.substring(0, 300);
        }
      }
    }

    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      source: 'overtime-intake',
      treatmentType,
      treatmentLabel,
      clinicId: clinicId,
      receivedAt: consentTimestamp,
      pdfGenerated: !!pdfContent,
      pdfUrl: pdfExternalUrl,
      checkoutCompleted: isComplete,
      promoCode: extractPromoCode(payload),
      ipAddress,
      userAgent,
      consentTimestamp,
      // Debug: raw payload structure for affiliate troubleshooting
      _debug: {
        payloadKeyCount: rawPayloadKeys.length,
        payloadKeys: rawPayloadKeys,
        affiliateRelatedFields: rawAffiliateFields,
      },
    };

    if (existingDoc) {
      patientDocument = await prisma.patientDocument.update({
        where: { id: existingDoc.id },
        data: {
          filename: stored?.filename || `overtime-intake-${normalized.submissionId}.json`,
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          externalUrl: pdfExternalUrl || existingDoc.externalUrl,
        },
      });
      logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ Updated document: ${patientDocument.id}`);
    } else {
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId: clinicId,
          filename: stored?.filename || `overtime-intake-${normalized.submissionId}.json`,
          mimeType: 'application/json',
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          externalUrl: pdfExternalUrl,
          source: 'overtime-intake',
          sourceSubmissionId: normalized.submissionId,
        },
      });
      logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ Created document: ${patientDocument.id}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[OVERTIME-INTAKE ${requestId}] Document record failed:`, { error: errMsg });
    errors.push('Document record creation failed');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 12: GENERATE SOAP NOTE (only for complete submissions)
  // ═══════════════════════════════════════════════════════════════════
  let soapNoteId: number | null = null;

  if (!isPartialSubmission && patientDocument) {
    try {
      logger.debug(`[OVERTIME-INTAKE ${requestId}] Generating SOAP note...`);
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.info(`[OVERTIME-INTAKE ${requestId}] ✓ SOAP Note generated: ID ${soapNoteId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[OVERTIME-INTAKE ${requestId}] SOAP generation failed (non-fatal):`, {
        error: errMsg,
      });
      errors.push(`SOAP generation failed: ${errMsg}`);
    }
  } else if (isPartialSubmission) {
    logger.debug(`[OVERTIME-INTAKE ${requestId}] Skipping SOAP for partial submission`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 13: TRACK PROMO CODE / AFFILIATE REFERRAL (CRITICAL FOR AFFILIATE PROGRAM)
  // ═══════════════════════════════════════════════════════════════════
  // -----------------------------------------------------------------------
  // CRITICAL AFFILIATE DIAGNOSTICS — Log everything for attribution debugging
  // -----------------------------------------------------------------------
  const allPayloadKeys = Object.keys(payload);

  // Find ALL fields that might contain affiliate data (case-insensitive search)
  const affiliateRelevantFields: Record<string, string> = {};
  for (const key of allPayloadKeys) {
    const lower = key.toLowerCase();
    if (
      lower.includes('url') ||
      lower.includes('referr') ||
      lower.includes('ref') ||
      lower.includes('promo') ||
      lower.includes('affiliate') ||
      lower.includes('influencer') ||
      lower.includes('recommend') ||
      lower.includes('partner') ||
      lower.includes('code')
    ) {
      const val = payload[key];
      if (val && typeof val === 'string') {
        affiliateRelevantFields[key] = val.substring(0, 300);
      }
    }
  }

  logger.info(`[OVERTIME-INTAKE ${requestId}] AFFILIATE DIAG — Payload has ${allPayloadKeys.length} keys:`, {
    allKeys: allPayloadKeys,
    affiliateRelevantFields,
    hasUrlWithParams: allPayloadKeys.some(k => k.toLowerCase().replace(/\s+/g, '') === 'urlwithparameters'),
    hasUrl: allPayloadKeys.some(k => k.toLowerCase().trim() === 'url'),
    hasReferrer: allPayloadKeys.some(k => k.toLowerCase().trim() === 'referrer'),
  });

  const promoCode = extractPromoCode(payload);
  let referralTracked = false;
  let modernAffiliateTracked = false;

  logger.info(`[OVERTIME-INTAKE ${requestId}] Extracted promo code: ${promoCode || '(none)'}`);

  if (promoCode) {
    // Track in affiliate system (Affiliate/AffiliateTouch tables)
    // This enables the affiliate dashboard, commission tracking, and payouts
    try {
      const result = await attributeFromIntake(patient.id, promoCode, clinicId, 'overtime-intake');
      if (result) {
        referralTracked = true;
        modernAffiliateTracked = true;
        logger.info(
          `[OVERTIME-INTAKE ${requestId}] ✓ Affiliate Tracked: ${result.refCode} -> affiliateId=${result.affiliateId}`
        );
      } else {
        // No AffiliateRefCode exists yet (e.g. code from Airtable "Who recommended OT Mens Health to you?")
        // Tag the profile with the code so we can reconcile later when the code is created
        const tagged = await tagPatientWithReferralCodeOnly(patient.id, promoCode, clinicId);
        if (tagged) {
          referralTracked = true;
          logger.info(
            `[OVERTIME-INTAKE ${requestId}] ✓ Profile tagged with referral code (no affiliate yet): ${promoCode}`
          );
        } else {
          logger.debug(
            `[OVERTIME-INTAKE ${requestId}] No affiliate match for code: ${promoCode}`
          );
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[OVERTIME-INTAKE ${requestId}] Affiliate tracking failed:`, {
        error: errMsg,
        promoCode,
      });
      errors.push(`Affiliate tracking failed: ${promoCode}`);
    }
  } else {
    // No promo code found — try fallback attribution via referrer URL or recent touch
    try {
      const referrerUrl = (payload['Referrer'] || payload['referrer'] || '') as string;
      const fallback = await attributeByRecentTouch(patient.id, referrerUrl || null, clinicId);
      if (fallback) {
        referralTracked = true;
        modernAffiliateTracked = true;
        logger.info(
          `[OVERTIME-INTAKE ${requestId}] ✓ Fallback affiliate attribution: ${fallback.refCode} -> affiliateId=${fallback.affiliateId}`
        );
      }
    } catch (fallbackErr) {
      const errMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
      logger.warn(`[OVERTIME-INTAKE ${requestId}] Fallback attribution failed:`, { error: errMsg });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 14: AUDIT LOG
  // ═══════════════════════════════════════════════════════════════════
  try {
    await prisma.auditLog.create({
      data: {
        action: isPartialSubmission ? 'PARTIAL_INTAKE_RECEIVED' : 'PATIENT_INTAKE_RECEIVED',
        resource: 'Patient',
        resourceId: patient.id,
        userId: 0,
        details: {
          source: 'overtime-intake',
          submissionId: normalized.submissionId,
          treatmentType,
          treatmentLabel,
          checkoutCompleted: isComplete,
          clinicId,
          clinicName,
          isNewPatient,
          isPartialSubmission,
          documentId: patientDocument?.id,
          soapNoteId,
          promoCode,
          referralTracked,
          modernAffiliateTracked,
          errors: errors.length > 0 ? errors : undefined,
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'webhook',
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[OVERTIME-INTAKE ${requestId}] Audit log failed:`, { error: errMsg });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUCCESS RESPONSE
  // ═══════════════════════════════════════════════════════════════════
  const duration = Date.now() - startTime;
  recordSuccess('overtime-intake', duration);

  // Decrypt patient PHI for display in notifications and response
  const decryptedFirstName = safeDecrypt(patient.firstName) || 'Patient';
  const decryptedLastName = safeDecrypt(patient.lastName) || '';
  const decryptedEmail = safeDecrypt(patient.email) || '';
  const patientDisplayName = `${decryptedFirstName} ${decryptedLastName}`.trim();

  // ═══════════════════════════════════════════════════════════════════
  // NOTIFY PROVIDERS - New patient ready for prescription
  // ═══════════════════════════════════════════════════════════════════
  if (isComplete && isNewPatient) {
    try {
      await notificationService.notifyProviders({
        clinicId,
        category: 'PRESCRIPTION',
        priority: 'HIGH',
        title: 'New Patient Ready for Rx',
        message: `${patientDisplayName} completed ${treatmentLabel} intake and is ready for prescription review.`,
        actionUrl: `/provider/prescription-queue?patientId=${patient.id}`,
        metadata: {
          patientId: patient.id,
          patientName: patientDisplayName,
          treatmentType,
          treatmentLabel,
          submissionId: normalized.submissionId,
        },
        sourceType: 'webhook',
        sourceId: `overtime-intake-${normalized.submissionId}`,
      });
      logger.debug(`[OVERTIME-INTAKE ${requestId}] ✓ Sent notification to providers`);
    } catch (notifyError) {
      // Non-blocking - log but don't fail webhook
      logger.warn(`[OVERTIME-INTAKE ${requestId}] Failed to send provider notification`, {
        error: notifyError instanceof Error ? notifyError.message : 'Unknown error',
      });
    }
  }

  logger.info(
    `[OVERTIME-INTAKE ${requestId}] ✓ SUCCESS in ${duration}ms (${errors.length} warnings)`
  );

  return Response.json({
    success: true,
    requestId,

    // ═══════════════════════════════════════════════════════════════════
    // BIDIRECTIONAL SYNC FIELDS - Store these in Airtable!
    // ═══════════════════════════════════════════════════════════════════
    eonproPatientId: patient.patientId,
    eonproDatabaseId: patient.id,
    submissionId: normalized.submissionId,

    // Treatment info
    treatment: {
      type: treatmentType,
      label: treatmentLabel,
    },

    // Patient info
    patient: {
      id: patient.id,
      patientId: patient.patientId,
      name: patientDisplayName,
      email: decryptedEmail,
      isNew: isNewPatient,
    },

    // Submission details
    submission: {
      checkoutCompleted: isComplete,
      isPartial: isPartialSubmission,
    },

    // Document info
    document: patientDocument
      ? {
          id: patientDocument.id,
          filename: stored?.filename,
          pdfUrl: pdfExternalUrl,
        }
      : null,

    // SOAP note (if generated)
    soapNote: soapNoteId
      ? {
          id: soapNoteId,
          status: 'DRAFT',
        }
      : null,

    // Affiliate tracking
    affiliate: promoCode
      ? {
          code: promoCode,
          legacyTracked: referralTracked,
          modernTracked: modernAffiliateTracked,
        }
      : null,

    // Clinic info
    clinic: {
      id: clinicId,
      name: clinicName,
    },

    // Metadata
    processingTimeMs: duration,
    processingTime: `${duration}ms`,
    message: isNewPatient ? 'Patient created successfully' : 'Patient updated successfully',
    warnings: errors.length > 0 ? errors : undefined,

    // Legacy field names
    patientId: patient.id,
  });
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function normalizePatientData(patient: any) {
  return {
    firstName: capitalize(patient.firstName) || 'Unknown',
    lastName: capitalize(patient.lastName) || 'Unknown',
    email: patient.email?.toLowerCase()?.trim() || 'unknown@example.com',
    phone: sanitizePhone(patient.phone),
    dob: normalizeDate(patient.dob),
    gender: normalizeGender(patient.gender),
    address1: String(patient.address1 || '').trim(),
    address2: String(patient.address2 || '').trim(),
    city: String(patient.city || '').trim(),
    state: String(patient.state || '')
      .toUpperCase()
      .trim(),
    zip: String(patient.zip || '').trim(),
  };
}

// Patient ID generation now uses the shared utility from @/lib/patients
// which handles clinic prefixes (e.g., OT-123, EON-456)
async function getNextPatientId(clinicId: number): Promise<string> {
  return generatePatientId(clinicId);
}

function sanitizePhone(value?: string) {
  if (!value) return '0000000000';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits || '0000000000';
}

function normalizeGender(value?: string) {
  if (!value) return 'm';
  const lower = String(value).toLowerCase().trim();
  if (lower === 'f' || lower === 'female' || lower === 'woman') return 'f';
  if (lower === 'm' || lower === 'male' || lower === 'man') return 'm';
  if (lower.startsWith('f') || lower.startsWith('w')) return 'f';
  return 'm';
}

function normalizeDate(value?: string) {
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

function capitalize(value?: string) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function mergeTags(existing: any, incoming: string[]) {
  const current = Array.isArray(existing) ? (existing as string[]) : [];
  const merged = new Set([...current, ...incoming]);
  return Array.from(merged).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  return Response.json({
    status: 'ok',
    endpoint: '/api/webhooks/overtime-intake',
    clinic: "Overtime Men's Clinic",
    clinicIsolation: {
      enforced: true,
      expectedClinicId: EXPECTED_OVERTIME_CLINIC_ID || 'dynamic-lookup',
      subdomain: OVERTIME_CLINIC_SUBDOMAIN,
      note: "ALL data from this webhook goes ONLY to Overtime Men's Clinic",
    },
    treatmentTypes: [
      'weight_loss',
      'peptides',
      'nad_plus',
      'better_sex',
      'testosterone',
      'baseline_bloodwork',
    ],
    affiliateTracking: {
      enabled: true,
      fields: ['promo-code', 'PROMO CODE', 'influencer-code', 'INFLUENCER CODE'],
    },
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    configured: !!process.env.OVERTIME_INTAKE_WEBHOOK_SECRET,
  });
}
