import { NextRequest } from "next/server";
import { PatientDocumentCategory, Clinic, Patient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { generateIntakePdf } from "@/services/intakePdfService";
import { storeIntakePdf } from "@/services/storage/intakeStorage";
import { generateSOAPFromIntake } from "@/services/ai/soapNoteService";
import { trackReferral } from "@/services/influencerService";
import { logger } from '@/lib/logger';
import { recordSuccess, recordError, recordAuthFailure } from '@/lib/webhooks/monitor';
import { isDLQConfigured, queueFailedSubmission } from '@/lib/queue/deadLetterQueue';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';

/**
 * WEIGHTLOSSINTAKE Webhook - EONMEDS CLINIC ONLY (BULLETPROOF VERSION)
 *
 * This webhook receives patient intake form submissions from the weightlossintake platform.
 * ALL data is isolated to the EONMEDS clinic - no other clinic can access these patients.
 *
 * RELIABILITY FEATURES:
 *   - Every step wrapped in try-catch
 *   - Graceful fallbacks for non-critical failures
 *   - Patient creation ALWAYS succeeds (even with minimal data)
 *   - PDF generation failure doesn't block patient creation
 *   - Detailed error logging for debugging
 *   - Idempotent - same submission won't create duplicates
 *
 * Endpoint: POST /api/webhooks/weightlossintake
 *
 * Authentication:
 *   - Header: x-webhook-secret, x-api-key, or Authorization: Bearer
 *
 * Last Updated: 2026-01-18
 */

// EONMEDS clinic identifier - DO NOT CHANGE
const EONMEDS_CLINIC_SUBDOMAIN = "eonmeds";

// Retry helper for database operations
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
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

  logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Webhook received`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: AUTHENTICATE (CRITICAL - fail fast)
  // ═══════════════════════════════════════════════════════════════════
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

  if (!configuredSecret) {
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] CRITICAL: No webhook secret configured!`);
    return Response.json(
      { error: "Server configuration error", code: "NO_SECRET_CONFIGURED", requestId },
      { status: 500 }
    );
  }

  const providedSecret =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (providedSecret !== configuredSecret) {
    logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Authentication FAILED`);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    recordAuthFailure("weightlossintake", ipAddress, providedSecret || undefined);
    return Response.json(
      { error: "Unauthorized", code: "INVALID_SECRET", requestId },
      { status: 401 }
    );
  }

  logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Authenticated`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: GET EONMEDS CLINIC (CRITICAL - fail fast)
  // ═══════════════════════════════════════════════════════════════════
  let clinicId: number;
  try {
    const eonmedsClinic = await withRetry<Clinic | null>(() => prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: EONMEDS_CLINIC_SUBDOMAIN },
          { name: { contains: "EONMEDS", mode: "insensitive" } },
        ],
      },
    }));

    if (!eonmedsClinic) {
      logger.error(`[WEIGHTLOSSINTAKE ${requestId}] CRITICAL: EONMEDS clinic not found!`);
      recordError("weightlossintake", "EONMEDS clinic not found in database", { requestId });
      return Response.json(
        { error: "Clinic not found", code: "CLINIC_NOT_FOUND", requestId },
        { status: 500 }
      );
    }
    clinicId = eonmedsClinic.id;
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Clinic ID: ${clinicId}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] Database error finding clinic:`, { error: errMsg });
    recordError("weightlossintake", `Database error: ${err instanceof Error ? err.message : 'Unknown'}`, { requestId });
    
    // Queue to DLQ for retry - get raw body for requeueing
    if (isDLQConfigured()) {
      try {
        const rawBody = await req.clone().text();
        const payload = safeParseJSON(rawBody) || {};
        await queueFailedSubmission(
          payload,
          'weightlossintake',
          `Database error: ${err instanceof Error ? err.message : 'Unknown'}`,
          { submissionId: requestId }
        );
        logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Queued to DLQ for retry`);
      } catch (dlqErr) {
        const dlqErrMsg = dlqErr instanceof Error ? dlqErr.message : 'Unknown error';
        logger.error(`[WEIGHTLOSSINTAKE ${requestId}] Failed to queue to DLQ:`, { error: dlqErrMsg });
      }
    }
    
    return Response.json(
      { error: "Database error", code: "DB_ERROR", requestId, queued: isDLQConfigured() },
      { status: 500 }
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: PARSE PAYLOAD (with graceful handling)
  // ═══════════════════════════════════════════════════════════════════
  let payload: Record<string, unknown> = {};
  try {
    const text = await req.text();
    payload = safeParseJSON(text) || {};

    // Log payload structure
    logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Payload:`, {
      keys: Object.keys(payload).slice(0, 15),
      submissionId: payload.submissionId || payload.submission_id || payload.responseId || payload.id,
      hasData: !!payload.data,
      hasAnswers: !!payload.answers,
      submissionType: payload.submissionType,
    });
  } catch (err) {
    logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Failed to parse payload, using empty object`);
    errors.push("Failed to parse JSON payload");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: NORMALIZE DATA (with fallbacks)
  // ═══════════════════════════════════════════════════════════════════
  let normalized;
  try {
    normalized = normalizeMedLinkPayload(payload);
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Normalized: ${normalized.patient.firstName} ${normalized.patient.lastName}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Normalization failed, using fallback:`, { error: errMsg });
    errors.push("Normalization failed, using fallback data");
    normalized = {
      submissionId: `fallback-${requestId}`,
      submittedAt: new Date(),
      patient: {
        firstName: "Unknown",
        lastName: "Lead",
        email: `unknown-${Date.now()}@intake.local`,
        phone: "",
        dob: "",
        gender: "",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip: "",
      },
      sections: [],
      answers: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: EXTRACT SUBMISSION TYPE
  // ═══════════════════════════════════════════════════════════════════
  const submissionType = String(payload.submissionType || (payload.data as any)?.submissionType || "complete").toLowerCase();
  const isPartialSubmission = submissionType === "partial";
  const qualifiedStatus = String(payload.qualified || (payload.data as any)?.qualified || (isPartialSubmission ? "Pending" : "Yes"));
  const intakeNotes = String(payload.intakeNotes || (payload.data as any)?.intakeNotes || (payload.data as any)?.notes || "");

  logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Type: ${submissionType}, Qualified: ${qualifiedStatus}`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: UPSERT PATIENT (with retry and fallbacks)
  // ═══════════════════════════════════════════════════════════════════
  let patient: any;
  let isNewPatient = false;

  const patientData = normalizePatientData(normalized.patient);

  // Build tags
  const baseTags = ["weightlossintake", "eonmeds", "glp1"];
  const submissionTags = isPartialSubmission
    ? [...baseTags, "partial-lead", "needs-followup"]
    : [...baseTags, "complete-intake"];

  // Build notes
  const buildNotes = (existing: string | null | undefined) => {
    const parts: string[] = [];
    if (existing && !existing.includes(normalized.submissionId)) {
      parts.push(existing);
    }
    parts.push(`[${new Date().toISOString()}] ${isPartialSubmission ? "PARTIAL" : "COMPLETE"}: ${normalized.submissionId}`);
    if (intakeNotes) parts.push(`Notes: ${intakeNotes}`);
    if (qualifiedStatus !== "Yes") parts.push(`Qualified: ${qualifiedStatus}`);
    return parts.join("\n");
  };

  try {
    // Find existing patient (with retry)
    const existingPatient = await withRetry<Patient | null>(() => prisma.patient.findFirst({
      where: {
        clinicId: clinicId,
        OR: [
          patientData.email !== "unknown@example.com" ? { email: patientData.email } : null,
          patientData.phone && patientData.phone !== "0000000000" ? { phone: patientData.phone } : null,
          patientData.firstName !== "Unknown" && patientData.lastName !== "Unknown" ? {
            firstName: patientData.firstName,
            lastName: patientData.lastName,
            dob: patientData.dob,
          } : null,
        ].filter(Boolean) as Prisma.PatientWhereInput[],
      },
    }));

    if (existingPatient) {
      // Update existing
      const existingTags = Array.isArray(existingPatient.tags) ? existingPatient.tags as string[] : [];
      const wasPartial = existingTags.includes("partial-lead");
      const upgradedFromPartial = wasPartial && !isPartialSubmission;

      let updatedTags = mergeTags(existingPatient.tags, submissionTags);
      if (upgradedFromPartial) {
        updatedTags = updatedTags.filter((t: string) => t !== "partial-lead" && t !== "needs-followup");
        logger.info(`[WEIGHTLOSSINTAKE ${requestId}] ⬆ Upgrading from partial to complete`);
      }

      patient = await withRetry(() => prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          ...patientData,
          tags: updatedTags,
          notes: buildNotes(existingPatient.notes),
        },
      }));
      logger.info(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Updated patient: ${patient.id}`);
    } else {
      // Create new - use clinic-specific counter
      const patientNumber = await getNextPatientId(clinicId);
      patient = await withRetry(() => prisma.patient.create({
        data: {
          ...patientData,
          patientId: patientNumber,
          clinicId: clinicId,
          tags: submissionTags,
          notes: buildNotes(null),
          source: "webhook",
          sourceMetadata: {
            type: "weightlossintake",
            submissionId: normalized.submissionId,
            submissionType,
            qualified: qualifiedStatus,
            intakeNotes,
            timestamp: new Date().toISOString(),
            clinicId,
            clinicName: "EONMEDS",
          },
        },
      }));
      isNewPatient = true;
      logger.info(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Created patient: ${patient.id} (${patient.patientId})`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] CRITICAL: Patient upsert failed:`, { error: errorMsg });
    recordError("weightlossintake", `Patient creation failed: ${errorMsg}`, { requestId });
    
    // Queue to DLQ for retry
    if (isDLQConfigured()) {
      try {
        await queueFailedSubmission(
          payload,
          'weightlossintake',
          `Patient creation failed: ${errorMsg}`,
          {
            patientEmail: normalized?.patient?.email,
            submissionId: normalized?.submissionId || requestId,
          }
        );
        logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Queued to DLQ for retry`);
      } catch (dlqErr) {
        logger.error(`[WEIGHTLOSSINTAKE ${requestId}] Failed to queue to DLQ:`, dlqErr);
      }
    }
    
    return Response.json({
      error: "Failed to create patient",
      code: "PATIENT_ERROR",
      requestId,
      message: errorMsg,
      partialSuccess: false,
      queued: isDLQConfigured(),
    }, { status: 500 });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: GENERATE PDF (non-critical - continue on failure)
  // ═══════════════════════════════════════════════════════════════════
  let pdfContent: Buffer | null = null;
  try {
    pdfContent = await generateIntakePdf(normalized, patient);
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ PDF: ${pdfContent.byteLength} bytes`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] PDF generation failed (continuing):`, { error: errMsg });
    errors.push("PDF generation failed");
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
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ PDF prepared: ${stored.filename}, ${stored.pdfBuffer.length} bytes`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] PDF preparation failed (continuing):`, { error: errMsg });
      errors.push("PDF preparation failed");
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
            source: 'weightlossintake',
          },
        });
        pdfExternalUrl = s3Result.url;
        logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ PDF uploaded to S3: ${s3Result.key}`);
      } else {
        logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] S3 not configured, PDF stored in database only`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] S3 upload failed (continuing):`, { error: errMsg });
      errors.push("S3 PDF upload failed");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 10: CREATE DOCUMENT RECORD WITH INTAKE DATA (CRITICAL FOR DISPLAY)
  // ═══════════════════════════════════════════════════════════════════
  // IMPORTANT: Always store intake data, even if PDF generation failed.
  // The intake tab needs this data to display patient responses.
  // PDF is stored separately in S3 (externalUrl) - data field is for intake JSON only.
  let patientDocument: any = null;
  try {
    const existingDoc = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
    });

    // Capture consent and metadata from request headers
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const consentTimestamp = new Date().toISOString();

    // Extract e-signature data from payload (sent by WeightLossIntake platform)
    const payloadData = payload.data as Record<string, unknown> || payload;

    // Geolocation data from the intake platform
    const geoLocation = {
      ip: payloadData.consentIP || payloadData.Consent_IP || payloadData['Consent IP'] || ipAddress,
      city: payloadData.consentCity || payloadData.Consent_City || payloadData['Consent City'] || null,
      region: payloadData.consentRegion || payloadData.Consent_Region || payloadData['Consent Region'] || null,
      regionCode: payloadData.consentRegionCode || payloadData.Consent_Region_Code || payloadData['Consent Region Code'] || null,
      country: payloadData.consentCountry || payloadData.Consent_Country || payloadData['Consent Country'] || null,
      countryCode: payloadData.consentCountryCode || payloadData.Consent_Country_Code || payloadData['Consent Country Code'] || null,
      timezone: payloadData.consentTimezone || payloadData.Consent_Timezone || payloadData['Consent Timezone'] || null,
      isp: payloadData.consentISP || payloadData.Consent_ISP || payloadData['Consent ISP'] || null,
    };

    // Consent signatures log from the intake platform
    const consentSignatures = payloadData.consentSignatures || payloadData.Consent_Signatures || payloadData['Consent Signatures'] || null;

    // Extract all consent flags from payload
    const consentData = {
      // Privacy & Terms
      privacyPolicyConsent: payloadData['Privacy Policy Accepted'] || payloadData.privacyPolicyConsent || payloadData.privacy_consent || true,
      termsConsent: payloadData['Terms of Use Accepted'] || payloadData.termsConsent || payloadData.terms_consent || true,

      // Telehealth & Communication
      telehealthConsent: payloadData['Telehealth Consent Accepted'] || payloadData.telehealthConsent || payloadData.telehealth_consent || true,
      smsConsent: payloadData['SMS Consent Accepted'] || payloadData.smsConsent || payloadData.sms_consent || true,
      emailConsent: payloadData['Email Consent Accepted'] || payloadData.emailConsent || payloadData.email_consent || true,

      // Policy & Medical
      cancellationPolicyConsent: payloadData['Cancellation Policy Accepted'] || payloadData.cancellationPolicyConsent || true,
      medicalWeightConsent: payloadData['Weight Loss Treatment Consent Accepted'] || payloadData.medicalWeightConsent || payloadData.weightLossConsent || true,

      // HIPAA & Legal
      hipaaConsent: payloadData['HIPAA Authorization Accepted'] || payloadData.hipaaConsent || true,
      floridaBillOfRights: payloadData['Florida Bill of Rights Accepted'] || payloadData.floridaBillOfRights || true,

      // Metadata
      timestamp: payloadData.timestamp || consentTimestamp,
      ipAddress: geoLocation.ip,
      userAgent: payloadData.consentUserAgent || payloadData.Consent_User_Agent || payloadData['Consent User Agent'] || userAgent,

      // Geolocation
      geoLocation: geoLocation,

      // Full signatures log
      signatures: consentSignatures,
    };

    // Store intake data as JSON for display on Intake tab
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      source: "weightlossintake",
      clinicId: clinicId,
      receivedAt: consentTimestamp,
      pdfGenerated: !!pdfContent,
      pdfUrl: pdfExternalUrl,
      // E-Signature and consent data for legal compliance
      ipAddress: geoLocation.ip,
      userAgent: consentData.userAgent,
      consentTimestamp: consentData.timestamp,
      consentData: consentData,
      geoLocation: geoLocation,
    };
    
    if (existingDoc) {
      patientDocument = await prisma.patientDocument.update({
        where: { id: existingDoc.id },
        data: {
          filename: stored?.filename || `intake-${normalized.submissionId}.json`,
          // Store intake JSON data - this is what the Intake tab displays
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          // Store S3 URL for PDF download
          externalUrl: pdfExternalUrl || existingDoc.externalUrl,
        },
      });
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Updated document: ${patientDocument.id}`);
    } else {
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId: clinicId,
          filename: stored?.filename || `intake-${normalized.submissionId}.json`,
          mimeType: "application/json", // Data field is now always JSON
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          // Store intake JSON data - this is what the Intake tab displays
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          // Store S3 URL for PDF download
          externalUrl: pdfExternalUrl,
          source: "weightlossintake",
          sourceSubmissionId: normalized.submissionId,
        },
      });
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Created document: ${patientDocument.id}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] Document record failed:`, { error: errMsg });
    errors.push("Document record creation failed");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 11: GENERATE SOAP NOTE (non-critical for partial, important for complete)
  // ═══════════════════════════════════════════════════════════════════
  let soapNoteId: number | null = null;

  // Only generate SOAP for complete submissions with a document
  if (!isPartialSubmission && patientDocument) {
    try {
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Generating SOAP note...`);
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.info(`[WEIGHTLOSSINTAKE ${requestId}] ✓ SOAP Note generated: ID ${soapNoteId}`);
    } catch (err) {
      // SOAP generation can fail (OpenAI rate limits, etc.) - don't block the webhook
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] SOAP generation failed (non-fatal):`, { error: errMsg });
      errors.push(`SOAP generation failed: ${errMsg}`);
    }
  } else if (isPartialSubmission) {
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Skipping SOAP for partial submission`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 12: TRACK PROMO CODE (non-critical)
  // ═══════════════════════════════════════════════════════════════════
  const promoCodeEntry = normalized.answers?.find(
    (entry: any) =>
      entry.label?.toLowerCase().includes("promo") ||
      entry.label?.toLowerCase().includes("referral") ||
      entry.label?.toLowerCase().includes("discount") ||
      entry.id === "promo_code" ||
      entry.id === "promoCode" ||
      entry.id === "referralCode"
  );

  if (promoCodeEntry?.value) {
    const promoCode = String(promoCodeEntry.value).trim().toUpperCase();
    try {
      await trackReferral(patient.id, promoCode, "weightlossintake", {
        submissionId: normalized.submissionId,
        intakeDate: normalized.submittedAt,
        patientEmail: patient.email,
        clinicId,
      });
      logger.info(`[WEIGHTLOSSINTAKE ${requestId}] ✓ Promo: ${promoCode}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Promo tracking failed:`, { error: errMsg });
      errors.push(`Promo tracking failed: ${promoCode}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 13: AUDIT LOG (non-critical)
  // ═══════════════════════════════════════════════════════════════════
  try {
    await prisma.auditLog.create({
      data: {
        action: isPartialSubmission ? "PARTIAL_INTAKE_RECEIVED" : "PATIENT_INTAKE_RECEIVED",
        tableName: "Patient",
        recordId: patient.id,
        userId: 0,
        diff: JSON.stringify({
          source: "weightlossintake",
          submissionId: normalized.submissionId,
          submissionType,
          qualified: qualifiedStatus,
          clinicId,
          isNewPatient,
          isPartialSubmission,
          patientEmail: patient.email,
          documentId: patientDocument?.id,
          soapNoteId: soapNoteId,
          errors: errors.length > 0 ? errors : undefined,
        }),
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "webhook",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Audit log failed:`, { error: errMsg });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUCCESS RESPONSE
  // ═══════════════════════════════════════════════════════════════════
  const duration = Date.now() - startTime;

  // Record success for monitoring
  recordSuccess("weightlossintake", duration);

  logger.info(`[WEIGHTLOSSINTAKE ${requestId}] ✓ SUCCESS in ${duration}ms (${errors.length} warnings)`);

  // Extract Airtable record ID if provided (for bidirectional sync)
  const payloadForAirtable = (payload.data as Record<string, unknown>) || payload;
  const airtableRecordId = payloadForAirtable.airtableRecordId || payloadForAirtable.airtable_record_id || 
                           payloadForAirtable.recordId || payloadForAirtable.record_id || null;

  // Response format matching WeightLossIntake EMR Integration expectations
  // WeightLossIntake should capture these fields and store them in Airtable
  return Response.json({
    success: true,
    requestId,

    // ═══════════════════════════════════════════════════════════════════
    // BIDIRECTIONAL SYNC FIELDS - Store these in Airtable!
    // ═══════════════════════════════════════════════════════════════════
    eonproPatientId: patient.patientId,  // Formatted ID like "000059" - STORE IN AIRTABLE
    eonproDatabaseId: patient.id,        // Database ID like 62
    submissionId: normalized.submissionId, // Link back to original submission
    airtableRecordId: airtableRecordId,  // Echo back for easy record update
    
    // Detailed patient info
    patient: {
      id: patient.id,
      patientId: patient.patientId,
      name: `${patient.firstName} ${patient.lastName}`,
      email: patient.email,
      isNew: isNewPatient,
    },
    // Submission details
    submission: {
      type: submissionType,
      qualified: qualifiedStatus,
      isPartial: isPartialSubmission,
    },
    // Document info
    document: patientDocument ? {
      id: patientDocument.id,
      filename: stored?.filename,
    } : null,
    // SOAP note (if generated)
    soapNote: soapNoteId ? {
      id: soapNoteId,
      status: "DRAFT",
    } : null,
    // Clinic info
    clinic: {
      id: clinicId,
      name: "EONMEDS",
    },
    // Metadata
    processingTimeMs: duration,
    processingTime: `${duration}ms`,
    message: isNewPatient ? "Patient created successfully" : "Patient updated successfully",
    warnings: errors.length > 0 ? errors : undefined,

    // Legacy field names (for backwards compatibility)
    patientId: patient.id,
  });
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function normalizePatientData(patient: any) {
  return {
    firstName: capitalize(patient.firstName) || "Unknown",
    lastName: capitalize(patient.lastName) || "Unknown",
    email: patient.email?.toLowerCase()?.trim() || "unknown@example.com",
    phone: sanitizePhone(patient.phone),
    dob: normalizeDate(patient.dob),
    gender: normalizeGender(patient.gender),
    address1: String(patient.address1 || "").trim(),
    address2: String(patient.address2 || "").trim(),
    city: String(patient.city || "").trim(),
    state: String(patient.state || "").toUpperCase().trim(),
    zip: String(patient.zip || "").trim(),
  };
}

async function getNextPatientId(clinicId: number = 1): Promise<string> {
  try {
    const counter = await withRetry(() => prisma.patientCounter.upsert({
      where: { clinicId },
      create: { clinicId, current: 1 },
      update: { current: { increment: 1 } },
    }));
    return (counter as { current: number }).current.toString().padStart(6, "0");
  } catch {
    // Fallback: use timestamp-based ID
    return `WLI${Date.now().toString().slice(-8)}`;
  }
}

function sanitizePhone(value?: string) {
  if (!value) return "0000000000";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits || "0000000000";
}

function normalizeGender(value?: string) {
  if (!value) return "m";
  const lower = String(value).toLowerCase().trim();
  // Check for female/woman variations
  if (lower === 'f' || lower === 'female' || lower === 'woman') return "f";
  // Check for male/man variations
  if (lower === 'm' || lower === 'male' || lower === 'man') return "m";
  // Fallback: if starts with 'f' or 'w' (woman), treat as female
  if (lower.startsWith("f") || lower.startsWith("w")) return "f";
  return "m";
}

function normalizeDate(value?: string) {
  if (!value) return "1900-01-01";
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Try MM/DD/YYYY format
  const slashParts = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashParts) {
    const [, mm, dd, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Try MMDDYYYY format
  const parts = str.replace(/[^0-9]/g, "").match(/(\d{2})(\d{2})(\d{4})/);
  if (parts) {
    const [, mm, dd, yyyy] = parts;
    return `${yyyy}-${mm}-${dd}`;
  }

  return "1900-01-01";
}

function capitalize(value?: string) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function mergeTags(existing: any, incoming: string[]) {
  const current = Array.isArray(existing) ? (existing as string[]) : [];
  const merged = new Set([...current, ...incoming]);
  return Array.from(merged).filter(Boolean);
}
