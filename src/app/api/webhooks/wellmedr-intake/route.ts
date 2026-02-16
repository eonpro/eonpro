import { NextRequest } from 'next/server';
import { PatientDocumentCategory, Clinic, Patient, Prisma } from '@prisma/client';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { normalizeWellmedrPayload, isCheckoutComplete } from '@/lib/wellmedr/intakeNormalizer';
import type { WellmedrPayload } from '@/lib/wellmedr/types';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storeIntakePdf } from '@/services/storage/intakeStorage';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { attributeFromIntakeExtended, tagPatientWithReferralCodeOnly } from '@/services/affiliate/attributionService';
import { notificationService } from '@/services/notification';
import { logger } from '@/lib/logger';
import { createHash } from 'crypto';
import { recordSuccess, recordError, recordAuthFailure } from '@/lib/webhooks/monitor';
import { isDLQConfigured, queueFailedSubmission } from '@/lib/queue/deadLetterQueue';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';
import { generatePatientId } from '@/lib/patients';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { buildPatientSearchIndex } from '@/lib/utils/search';

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
 * WELLMEDR INTAKE Webhook - WELLMEDR CLINIC ONLY
 *
 * This webhook receives patient intake form submissions from https://intake.wellmedr.com
 * via Airtable automation.
 *
 * CRITICAL: ALL data is isolated to the WELLMEDR clinic - no other clinic can access these patients.
 *
 * RELIABILITY FEATURES:
 *   - Every step wrapped in try-catch
 *   - Graceful fallbacks for non-critical failures
 *   - Patient creation ALWAYS succeeds (even with minimal data)
 *   - PDF generation failure doesn't block patient creation
 *   - Detailed error logging for debugging
 *   - Idempotent - same submission won't create duplicates
 *
 * Endpoint: POST /api/webhooks/wellmedr-intake
 *
 * Authentication:
 *   - Header: x-webhook-secret, x-api-key, or Authorization: Bearer
 *
 * Created: 2026-01-24
 */

// ═══════════════════════════════════════════════════════════════════
// WELLMEDR CLINIC ISOLATION - CRITICAL SECURITY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
// These values ensure ALL data goes ONLY to the Wellmedr clinic.
// DO NOT CHANGE without understanding the security implications.
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';
const EXPECTED_WELLMEDR_CLINIC_ID = process.env.WELLMEDR_CLINIC_ID
  ? parseInt(process.env.WELLMEDR_CLINIC_ID, 10)
  : null;

// Startup validation - log warning if env var not set
if (!EXPECTED_WELLMEDR_CLINIC_ID) {
  logger.warn(
    '[WELLMEDR-INTAKE] WELLMEDR_CLINIC_ID env var not set - will use dynamic lookup only'
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

  logger.info(`[WELLMEDR-INTAKE ${requestId}] Webhook received`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: AUTHENTICATE (CRITICAL - fail fast)
  // ═══════════════════════════════════════════════════════════════════
  const configuredSecret = process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET;

  if (!configuredSecret) {
    logger.error(`[WELLMEDR-INTAKE ${requestId}] CRITICAL: No webhook secret configured!`);
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
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] Authentication FAILED`);
    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    recordAuthFailure('wellmedr-intake', ipAddress, providedSecret || undefined);
    return Response.json(
      { error: 'Unauthorized', code: 'INVALID_SECRET', requestId },
      { status: 401 }
    );
  }

  logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ Authenticated`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: GET WELLMEDR CLINIC (CRITICAL - fail fast)
  // ═══════════════════════════════════════════════════════════════════
  let clinicId: number;
  try {
    // Select only needed fields for backwards compatibility with schema changes
    // Use basePrisma since we haven't resolved clinic context yet
    const wellmedrClinic = await withRetry<{
      id: number;
      name: string;
      subdomain: string | null;
    } | null>(() =>
      basePrisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: WELLMEDR_CLINIC_SUBDOMAIN },
            { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
            { name: { contains: 'Wellmedr', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
        },
      })
    );

    if (!wellmedrClinic) {
      logger.error(`[WELLMEDR-INTAKE ${requestId}] CRITICAL: Wellmedr clinic not found!`);
      recordError('wellmedr-intake', 'Wellmedr clinic not found in database', { requestId });
      return Response.json(
        { error: 'Clinic not found', code: 'CLINIC_NOT_FOUND', requestId },
        { status: 500 }
      );
    }

    clinicId = wellmedrClinic.id;

    // ═══════════════════════════════════════════════════════════════════
    // RUNTIME ASSERTION: Validate clinic ID matches expected value
    // This prevents accidental data leaks to wrong clinic
    // ═══════════════════════════════════════════════════════════════════
    if (EXPECTED_WELLMEDR_CLINIC_ID && clinicId !== EXPECTED_WELLMEDR_CLINIC_ID) {
      logger.error(`[WELLMEDR-INTAKE ${requestId}] SECURITY ALERT: Clinic ID mismatch!`, {
        expected: EXPECTED_WELLMEDR_CLINIC_ID,
        found: clinicId,
        clinicName: wellmedrClinic.name,
        clinicSubdomain: wellmedrClinic.subdomain,
      });
      recordError(
        'wellmedr-intake',
        `SECURITY: Clinic ID mismatch - expected ${EXPECTED_WELLMEDR_CLINIC_ID}, got ${clinicId}`,
        {
          requestId,
          expected: EXPECTED_WELLMEDR_CLINIC_ID,
          found: clinicId,
        }
      );
      return Response.json(
        { error: 'Clinic configuration error', code: 'CLINIC_ID_MISMATCH', requestId },
        { status: 500 }
      );
    }

    // Validate subdomain matches expected pattern
    if (!wellmedrClinic.subdomain?.toLowerCase().includes('wellmedr')) {
      logger.error(`[WELLMEDR-INTAKE ${requestId}] SECURITY ALERT: Clinic subdomain mismatch!`, {
        expected: 'wellmedr',
        found: wellmedrClinic.subdomain,
      });
      recordError('wellmedr-intake', `SECURITY: Clinic subdomain mismatch`, { requestId });
      return Response.json(
        { error: 'Clinic configuration error', code: 'CLINIC_SUBDOMAIN_MISMATCH', requestId },
        { status: 500 }
      );
    }

    logger.info(
      `[WELLMEDR-INTAKE ${requestId}] ✓ CLINIC VERIFIED: ID=${clinicId}, Name="${wellmedrClinic.name}", Subdomain="${wellmedrClinic.subdomain}"`
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INTAKE ${requestId}] Database error finding clinic:`, {
      error: errMsg,
    });
    recordError(
      'wellmedr-intake',
      `Database error: ${err instanceof Error ? err.message : 'Unknown'}`,
      { requestId }
    );

    // Queue to DLQ for retry - get raw body for requeueing
    if (isDLQConfigured()) {
      try {
        const rawBody = await req.clone().text();
        const payload = safeParseJSON(rawBody) || {};
        await queueFailedSubmission(
          payload,
          'wellmedr-intake',
          `Database error: ${err instanceof Error ? err.message : 'Unknown'}`,
          { submissionId: requestId }
        );
        logger.info(`[WELLMEDR-INTAKE ${requestId}] Queued to DLQ for retry`);
      } catch (dlqErr) {
        const dlqErrMsg = dlqErr instanceof Error ? dlqErr.message : 'Unknown error';
        logger.error(`[WELLMEDR-INTAKE ${requestId}] Failed to queue to DLQ:`, {
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
  // STEP 2.5+: Run remaining steps within tenant (clinic) context
  // This is REQUIRED for all clinic-isolated model operations
  // (patient, patientDocument, auditLog, notification, etc.)
  // ═══════════════════════════════════════════════════════════════════
  const rawBody = await req.text();

  return runWithClinicContext(clinicId, async () => {
  // ═══════════════════════════════════════════════════════════════════
  // STEP 2.5: IDEMPOTENCY CHECK
  // ═══════════════════════════════════════════════════════════════════
  const idempotencyKey = `wellmedr-intake_${createHash('sha256').update(rawBody).digest('hex')}`;

  const existingIdempotencyRecord = await prisma.idempotencyRecord.findUnique({
    where: { key: idempotencyKey },
  }).catch((err) => {
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] Idempotency lookup failed, proceeding`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  });

  if (existingIdempotencyRecord) {
    logger.info(`[WELLMEDR-INTAKE ${requestId}] Duplicate webhook detected, returning cached response`, {
      idempotencyKey,
      originalCreatedAt: existingIdempotencyRecord.createdAt,
    });
    return Response.json(
      { received: true, status: 'duplicate', requestId, originalResponse: existingIdempotencyRecord.responseBody },
      { status: existingIdempotencyRecord.responseStatus }
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: PARSE PAYLOAD (with graceful handling)
  // ═══════════════════════════════════════════════════════════════════
  let payload: WellmedrPayload = {};
  try {
    const text = rawBody;
    payload = (safeParseJSON(text) || {}) as WellmedrPayload;

    // Log payload structure
    const allKeys = Object.keys(payload);
    logger.info(`[WELLMEDR-INTAKE ${requestId}] Payload:`, {
      keys: allKeys.slice(0, 20),
      totalKeys: allKeys.length,
      submissionId: payload['submission-id'] || payload.submissionId,
      checkoutCompleted: payload['Checkout Completed'],
      hasEmail: !!payload['email'],
      hasFirstName: !!payload['first-name'],
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
      logger.info(`[WELLMEDR-INTAKE ${requestId}] Address fields found:`, {
        keys: addressKeys,
        values: addressData,
      });
    } else {
      logger.warn(
        `[WELLMEDR-INTAKE ${requestId}] ⚠️ No address fields found in payload! Only State field will be used.`
      );
    }

    // Log state field specifically
    const stateValue =
      payload['state'] ||
      payload['State'] ||
      payload['Address [State]'] ||
      payload['id-38a5bae0-state'] ||
      payload['id-38a5bae0-state_code'];
    logger.info(`[WELLMEDR-INTAKE ${requestId}] State field:`, {
      stateValue,
      hasState: !!stateValue,
    });
  } catch (err) {
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] Failed to parse payload, using empty object`);
    errors.push('Failed to parse JSON payload');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: NORMALIZE DATA (with fallbacks)
  // ═══════════════════════════════════════════════════════════════════
  let normalized;
  try {
    normalized = normalizeWellmedrPayload(payload);
    logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ Payload normalized successfully`);

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
    logger.info(`[WELLMEDR-INTAKE ${requestId}] Extracted address:`, {
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
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] Normalization failed, using fallback:`, {
      error: errMsg,
    });
    errors.push('Normalization failed, using fallback data');
    normalized = {
      submissionId: `fallback-${requestId}`,
      submittedAt: new Date(),
      patient: {
        firstName: 'Unknown',
        lastName: 'Lead',
        email: `unknown-${Date.now()}@intake.wellmedr.com`,
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
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: DETERMINE SUBMISSION TYPE (based on Checkout Completed)
  // ═══════════════════════════════════════════════════════════════════
  const isComplete = isCheckoutComplete(payload);
  const isPartialSubmission = !isComplete;

  logger.info(
    `[WELLMEDR-INTAKE ${requestId}] Type: ${isComplete ? 'COMPLETE' : 'PARTIAL'}, Checkout: ${payload['Checkout Completed']}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: UPSERT PATIENT (with retry and fallbacks)
  // ═══════════════════════════════════════════════════════════════════
  let patient: any;
  let isNewPatient = false;

  const patientData = normalizePatientData(normalized.patient);

  // Build tags
  const baseTags = ['wellmedr-intake', 'wellmedr', 'glp1'];
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
      `[${new Date().toISOString()}] ${isPartialSubmission ? 'PARTIAL' : 'COMPLETE'}: ${normalized.submissionId}`
    );

    // Add GLP-1 specific notes if available
    if (payload['glp1-last-30'] === 'Yes' || payload['glp1-last-30'] === 'yes') {
      const glp1Type = payload['glp1-last-30-medication-type'] || 'Unknown';
      const glp1Dose = payload['glp1-last-30-medication-dose-mg'] || 'Unknown';
      parts.push(`Recent GLP-1: ${glp1Type} ${glp1Dose}mg`);
    }

    // Add contraindication flags
    if (payload['men2-history'] === 'Yes' || payload['men2-history'] === 'yes') {
      parts.push('⚠️ MEN2 HISTORY - GLP-1 CONTRAINDICATION');
    }

    return parts.join('\n');
  };

  try {
    // ═══════════════════════════════════════════════════════════════════
    // ROBUST PATIENT LOOKUP - Check multiple criteria to avoid duplicates
    // ═══════════════════════════════════════════════════════════════════
    // NOTE: Patient PHI (email, phone, name) is ENCRYPTED in the database.
    // We must fetch patients and decrypt to compare, not use SQL WHERE clauses.

    let existingPatient: Patient | null = null;

    // Fetch recent patients from this clinic to check for duplicates
    // (fetching all would be too slow, so limit to recent 500)
    const recentPatients = await withRetry<Patient[]>(() =>
      prisma.patient.findMany({
        where: { clinicId: clinicId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      })
    );

    // Decrypt and compare each patient's PHI to find match
    const searchEmail = patientData.email?.toLowerCase().trim();
    const searchPhone = patientData.phone;
    const searchFirstName = patientData.firstName?.toLowerCase().trim();
    const searchLastName = patientData.lastName?.toLowerCase().trim();
    const searchDob = patientData.dob;

    for (const p of recentPatients) {
      const decryptedEmail = safeDecrypt(p.email)?.toLowerCase().trim();
      const decryptedPhone = safeDecrypt(p.phone);
      const decryptedFirstName = safeDecrypt(p.firstName)?.toLowerCase().trim();
      const decryptedLastName = safeDecrypt(p.lastName)?.toLowerCase().trim();
      const decryptedDob = safeDecrypt(p.dob);

      // 1. Match by email (strongest - skip placeholder emails)
      if (
        searchEmail &&
        searchEmail !== 'unknown@example.com' &&
        decryptedEmail &&
        decryptedEmail === searchEmail
      ) {
        existingPatient = p;
        logger.debug(`[WELLMEDR-INTAKE ${requestId}] Found patient match by email: ${p.id}`);
        break;
      }

      // 2. Match by phone (skip placeholder phones)
      if (
        searchPhone &&
        searchPhone !== '0000000000' &&
        decryptedPhone &&
        decryptedPhone === searchPhone
      ) {
        existingPatient = p;
        logger.debug(`[WELLMEDR-INTAKE ${requestId}] Found patient match by phone: ${p.id}`);
        break;
      }

      // 3. Match by name + DOB (for patients who changed email/phone)
      if (
        searchFirstName &&
        searchFirstName !== 'unknown' &&
        searchLastName &&
        searchLastName !== 'unknown' &&
        searchDob &&
        searchDob !== '1900-01-01' &&
        decryptedFirstName === searchFirstName &&
        decryptedLastName === searchLastName &&
        decryptedDob === searchDob
      ) {
        existingPatient = p;
        logger.debug(`[WELLMEDR-INTAKE ${requestId}] Found patient match by name+DOB: ${p.id}`);
        break;
      }
    }

    if (!existingPatient) {
      logger.debug(`[WELLMEDR-INTAKE ${requestId}] No existing patient found, will create new`);
    }

    if (existingPatient) {
      // ═══════════════════════════════════════════════════════════════════
      // UPDATE EXISTING PATIENT (or merge into stub from invoice webhook)
      // ═══════════════════════════════════════════════════════════════════
      const existingTags = Array.isArray(existingPatient.tags)
        ? (existingPatient.tags as string[])
        : [];
      const wasPartial = existingTags.includes('partial-lead');
      const wasStub = existingTags.includes('stub-from-invoice');
      const upgradedFromPartial = wasPartial && !isPartialSubmission;

      let updatedTags = mergeTags(existingPatient.tags, submissionTags);
      if (upgradedFromPartial) {
        updatedTags = updatedTags.filter(
          (t: string) => t !== 'partial-lead' && t !== 'needs-followup'
        );
        logger.info(`[WELLMEDR-INTAKE ${requestId}] ⬆ Upgrading from partial to complete`);
      }

      // Merge stub patient: remove stub tags, add merge note
      if (wasStub) {
        updatedTags = updatedTags.filter(
          (t: string) => t !== 'stub-from-invoice' && t !== 'needs-intake-merge'
        );
        updatedTags.push('merged-from-stub');
        logger.info(
          `[WELLMEDR-INTAKE ${requestId}] ⬆ MERGING stub patient (created by invoice webhook) with full intake data`
        );
      }

      const updateSearchIndex = buildPatientSearchIndex({
        ...patientData,
        patientId: existingPatient!.patientId,
      });
      patient = await withRetry(() =>
        prisma.patient.update({
          where: { id: existingPatient!.id },
          data: {
            ...patientData,
            tags: updatedTags,
            notes: buildNotes(existingPatient!.notes),
            searchIndex: updateSearchIndex,
          },
        })
      );
      logger.info(
        `[WELLMEDR-INTAKE ${requestId}] ✓ ${wasStub ? 'Merged stub → full' : 'Updated'} patient: ${patient.id} → WELLMEDR CLINIC ONLY (clinicId=${clinicId})`
      );
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // CREATE NEW PATIENT - with retry on patientId conflict
      // ═══════════════════════════════════════════════════════════════════
      const MAX_RETRIES = 5;
      let retryCount = 0;
      let created = false;

      while (!created && retryCount < MAX_RETRIES) {
        try {
          const patientNumber = await getNextPatientId(clinicId);
          const searchIndex = buildPatientSearchIndex({
            ...patientData,
            patientId: patientNumber,
          });
          patient = await prisma.patient.create({
            data: {
              ...patientData,
              patientId: patientNumber,
              clinicId: clinicId,
              tags: submissionTags,
              notes: buildNotes(null),
              source: 'webhook',
              searchIndex,
              sourceMetadata: {
                type: 'wellmedr-intake',
                submissionId: normalized.submissionId,
                checkoutCompleted: isComplete,
                intakeUrl: 'https://intake.wellmedr.com',
                timestamp: new Date().toISOString(),
                clinicId,
                clinicName: 'Wellmedr',
              },
            },
          });
          isNewPatient = true;
          created = true;
          logger.info(
            `[WELLMEDR-INTAKE ${requestId}] ✓ Created patient: ${patient.id} (${patient.patientId}) → WELLMEDR CLINIC ONLY (clinicId=${clinicId})`
          );
        } catch (createErr: any) {
          // Check if this is a unique constraint violation on patientId
          if (createErr?.code === 'P2002' && createErr?.meta?.target?.includes('patientId')) {
            retryCount++;
            logger.warn(
              `[WELLMEDR-INTAKE ${requestId}] PatientId conflict, retrying (${retryCount}/${MAX_RETRIES})...`
            );

            // Wait a bit before retrying to avoid race conditions
            await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));

            // If this keeps happening, the patient might actually exist - try to find them again
            if (retryCount >= 3) {
              const refetchPatient = await prisma.patient.findFirst({
                where: {
                  clinicId: clinicId,
                  OR: [{ email: patientData.email }, { phone: patientData.phone }],
                },
              });

              if (refetchPatient) {
                // Found the patient on re-check - update instead
                const retrySearchIndex = buildPatientSearchIndex({
                  ...patientData,
                  patientId: refetchPatient.patientId,
                });
                patient = await prisma.patient.update({
                  where: { id: refetchPatient.id },
                  data: {
                    ...patientData,
                    tags: mergeTags(refetchPatient.tags, submissionTags),
                    notes: buildNotes(refetchPatient.notes),
                    searchIndex: retrySearchIndex,
                  },
                });
                created = true;
                logger.info(
                  `[WELLMEDR-INTAKE ${requestId}] ✓ Found and updated patient on retry: ${patient.id}`
                );
              }
            }
          } else {
            // Not a patientId conflict - rethrow
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
    const errorStack = err instanceof Error ? err.stack : undefined;
    const prismaError = (err as any)?.code || (err as any)?.meta;

    logger.error(`[WELLMEDR-INTAKE ${requestId}] CRITICAL: Patient upsert failed:`, {
      error: errorMsg,
      ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
      prismaCode: (err as any)?.code,
      prismaMeta: (err as any)?.meta,
      patientData: {
        email: patientData?.email,
        firstName: patientData?.firstName,
        lastName: patientData?.lastName,
        clinicId,
      },
    });
    recordError('wellmedr-intake', `Patient creation failed: ${errorMsg}`, { requestId });

    // Queue to DLQ for retry
    if (isDLQConfigured()) {
      try {
        await queueFailedSubmission(
          payload,
          'wellmedr-intake',
          `Patient creation failed: ${errorMsg}`,
          {
            patientEmail: normalized?.patient?.email,
            submissionId: normalized?.submissionId || requestId,
          }
        );
        logger.info(`[WELLMEDR-INTAKE ${requestId}] Queued to DLQ for retry`);
      } catch (dlqErr) {
        logger.error(`[WELLMEDR-INTAKE ${requestId}] Failed to queue to DLQ:`, dlqErr);
      }
    }

    return Response.json(
      {
        error: `Failed to create patient: ${errorMsg}`,
        code: 'PATIENT_ERROR',
        requestId,
        message: errorMsg,
        prismaError: prismaError || null,
        debug: {
          clinicId,
          patientEmail: patientData?.email,
        },
        partialSuccess: false,
        queued: isDLQConfigured(),
      },
      { status: 500 }
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: GENERATE PDF (non-critical - continue on failure)
  // ═══════════════════════════════════════════════════════════════════
  let pdfContent: Buffer | null = null;
  try {
    pdfContent = await generateIntakePdf(normalized, patient);
    logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ PDF: ${pdfContent.byteLength} bytes`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] PDF generation failed (continuing):`, {
      error: errMsg,
    });
    errors.push('PDF generation failed');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: PREPARE PDF FOR STORAGE (non-critical - continue on failure)
  // ═══════════════════════════════════════════════════════════════════
  let stored: { filename: string; pdfBuffer: Buffer } | null = null;
  if (pdfContent) {
    try {
      stored = await storeIntakePdf({
        patientId: patient.id,
        submissionId: normalized.submissionId,
        pdfBuffer: pdfContent,
      });
      logger.debug(
        `[WELLMEDR-INTAKE ${requestId}] ✓ PDF prepared: ${stored.filename}, ${stored.pdfBuffer.length} bytes`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WELLMEDR-INTAKE ${requestId}] PDF preparation failed (continuing):`, {
        error: errMsg,
      });
      errors.push('PDF preparation failed');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 9: UPLOAD PDF TO S3 (if available and S3 is configured)
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
            source: 'wellmedr-intake',
            clinic: 'wellmedr',
          },
        });
        pdfExternalUrl = s3Result.url;
        logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ PDF uploaded to S3: ${s3Result.key}`);
      } else {
        logger.debug(
          `[WELLMEDR-INTAKE ${requestId}] S3 not configured, PDF stored in database only`
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WELLMEDR-INTAKE ${requestId}] S3 upload failed (continuing):`, {
        error: errMsg,
      });
      errors.push('S3 PDF upload failed');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 10: CREATE DOCUMENT RECORD WITH INTAKE DATA (CRITICAL FOR DISPLAY)
  // ═══════════════════════════════════════════════════════════════════
  let patientDocument: any = null;
  try {
    const existingDoc = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
    });

    // Capture consent and metadata from request headers
    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const consentTimestamp = new Date().toISOString();

    // Store intake data as JSON for display on Intake tab
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      source: 'wellmedr-intake',
      intakeUrl: 'https://intake.wellmedr.com',
      clinicId: clinicId,
      receivedAt: consentTimestamp,
      pdfGenerated: !!pdfContent,
      pdfUrl: pdfExternalUrl,
      // Wellmedr-specific fields
      checkoutCompleted: isComplete,
      glp1History: {
        usedLast30Days: payload['glp1-last-30'],
        medicationType: payload['glp1-last-30-medication-type'],
        doseMg: payload['glp1-last-30-medication-dose-mg'],
      },
      contraindications: {
        men2History: payload['men2-history'],
        bariatric: payload['bariatric'],
      },
      // Consent data
      hipaaAgreement: payload['hipaa-agreement'],
      ipAddress,
      userAgent,
      consentTimestamp,
    };

    if (existingDoc) {
      patientDocument = await prisma.patientDocument.update({
        where: { id: existingDoc.id },
        data: {
          filename: stored?.filename || `wellmedr-intake-${normalized.submissionId}.json`,
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          externalUrl: pdfExternalUrl || existingDoc.externalUrl,
        },
      });
      logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ Updated document: ${patientDocument.id}`);
    } else {
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId: clinicId,
          filename: stored?.filename || `wellmedr-intake-${normalized.submissionId}.json`,
          mimeType: 'application/json',
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          externalUrl: pdfExternalUrl,
          source: 'wellmedr-intake',
          sourceSubmissionId: normalized.submissionId,
        },
      });
      logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ Created document: ${patientDocument.id}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INTAKE ${requestId}] Document record failed:`, { error: errMsg });
    errors.push('Document record creation failed');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 11: GENERATE SOAP NOTE (only for COMPLETE submissions)
  // ═══════════════════════════════════════════════════════════════════
  let soapNoteId: number | null = null;

  // Only generate SOAP for complete submissions with a document
  if (!isPartialSubmission && patientDocument) {
    try {
      logger.debug(`[WELLMEDR-INTAKE ${requestId}] Generating SOAP note...`);
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.info(`[WELLMEDR-INTAKE ${requestId}] ✓ SOAP Note generated: ID ${soapNoteId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WELLMEDR-INTAKE ${requestId}] SOAP generation failed (non-fatal):`, {
        error: errMsg,
      });
      errors.push(`SOAP generation failed: ${errMsg}`);
    }
  } else if (isPartialSubmission) {
    logger.debug(
      `[WELLMEDR-INTAKE ${requestId}] Skipping SOAP for partial submission (Checkout not completed)`
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 12: TRACK PROMO CODE (non-critical)
  // ═══════════════════════════════════════════════════════════════════
  // Check for promo code in various possible fields
  const promoCode =
    payload['promo-code'] ||
    payload['promoCode'] ||
    payload['referral-code'] ||
    payload['referralCode'];

  if (promoCode) {
    const code = String(promoCode).trim().toUpperCase();
    try {
      const result = await attributeFromIntakeExtended(patient.id, code, clinicId, 'wellmedr-intake');
      if (result.success) {
        logger.info(`[WELLMEDR-INTAKE ${requestId}] ✓ Affiliate attribution: ${code} -> affiliateId=${result.affiliateId}`);
      } else {
        const tagged = await tagPatientWithReferralCodeOnly(patient.id, code, clinicId);
        if (tagged) {
          logger.info(`[WELLMEDR-INTAKE ${requestId}] ✓ Profile tagged with referral code (no affiliate yet): ${code}`);
        } else {
          logger.debug(`[WELLMEDR-INTAKE ${requestId}] No affiliate match for code: ${code}`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WELLMEDR-INTAKE ${requestId}] Affiliate tracking failed:`, { error: errMsg });
      errors.push(`Affiliate tracking failed: ${code}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 13: AUDIT LOG (non-critical)
  // ═══════════════════════════════════════════════════════════════════
  try {
    await prisma.auditLog.create({
      data: {
        action: isPartialSubmission ? 'PARTIAL_INTAKE_RECEIVED' : 'PATIENT_INTAKE_RECEIVED',
        resource: 'Patient',
        resourceId: patient.id,
        userId: 0,
        details: {
          source: 'wellmedr-intake',
          submissionId: normalized.submissionId,
          checkoutCompleted: isComplete,
          clinicId,
          clinicName: 'Wellmedr',
          isNewPatient,
          isPartialSubmission,
          documentId: patientDocument?.id,
          soapNoteId: soapNoteId,
          errors: errors.length > 0 ? errors : undefined,
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'webhook',
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] Audit log failed:`, { error: errMsg });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUCCESS RESPONSE
  // ═══════════════════════════════════════════════════════════════════
  const duration = Date.now() - startTime;

  // Record success for monitoring
  recordSuccess('wellmedr-intake', duration);

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
        message: `${patientDisplayName} completed intake and is ready for prescription review.`,
        actionUrl: `/provider/prescription-queue?patientId=${patient.id}`,
        metadata: {
          patientId: patient.id,
          patientName: patientDisplayName,
          submissionId: normalized.submissionId,
        },
        sourceType: 'webhook',
        sourceId: `wellmedr-intake-${normalized.submissionId}`,
      });
      logger.debug(`[WELLMEDR-INTAKE ${requestId}] ✓ Sent notification to providers`);
    } catch (notifyError) {
      // Non-blocking - log but don't fail webhook
      logger.warn(`[WELLMEDR-INTAKE ${requestId}] Failed to send provider notification`, {
        error: notifyError instanceof Error ? notifyError.message : 'Unknown error',
      });
    }
  }

  logger.info(
    `[WELLMEDR-INTAKE ${requestId}] ✓ SUCCESS in ${duration}ms (${errors.length} warnings)`
  );

  // Record idempotency key for duplicate detection
  await prisma.idempotencyRecord.create({
    data: {
      key: idempotencyKey,
      resource: 'wellmedr-intake',
      responseStatus: 200,
      responseBody: { success: true, requestId, patientId: patient.id, submissionId: normalized.submissionId },
    },
  }).catch((err) => {
    logger.warn(`[WELLMEDR-INTAKE ${requestId}] Failed to store idempotency record`, { error: err instanceof Error ? err.message : String(err) });
  });

  // Response format for Airtable integration
  return Response.json({
    success: true,
    requestId,

    // ═══════════════════════════════════════════════════════════════════
    // BIDIRECTIONAL SYNC FIELDS - Store these in Airtable!
    // ═══════════════════════════════════════════════════════════════════
    eonproPatientId: patient.patientId, // Formatted ID like "000059"
    eonproDatabaseId: patient.id, // Database ID
    submissionId: normalized.submissionId,

    // Detailed patient info
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
    // Clinic info
    clinic: {
      id: clinicId,
      name: 'Wellmedr',
    },
    // Metadata
    processingTimeMs: duration,
    processingTime: `${duration}ms`,
    message: isNewPatient ? 'Patient created successfully' : 'Patient updated successfully',
    warnings: errors.length > 0 ? errors : undefined,

    // Legacy field names (for backwards compatibility)
    patientId: patient.id,
  });
  }); // end runWithClinicContext
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
// which handles clinic prefixes (e.g., WEL-123, EON-456)
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

  // Try MM/DD/YYYY format
  const slashParts = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashParts) {
    const [, mm, dd, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Try MMDDYYYY format
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
    endpoint: '/api/webhooks/wellmedr-intake',
    clinic: 'Wellmedr',
    clinicIsolation: {
      enforced: true,
      expectedClinicId: EXPECTED_WELLMEDR_CLINIC_ID || 'dynamic-lookup',
      subdomain: WELLMEDR_CLINIC_SUBDOMAIN,
      note: 'ALL data from this webhook goes ONLY to Wellmedr clinic',
    },
    intakeUrl: 'https://intake.wellmedr.com',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    configured: !!process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET,
  });
}
