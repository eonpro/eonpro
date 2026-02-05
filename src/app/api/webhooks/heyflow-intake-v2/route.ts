import { NextRequest } from "next/server";
import { PatientDocumentCategory, WebhookStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { upsertPatientFromIntake } from "@/lib/medlink/patientService";
import { generateIntakePdf } from "@/services/intakePdfService";
import { storeIntakePdf } from "@/services/storage/intakeStorage";
import { generateSOAPFromIntake } from "@/services/ai/soapNoteService";
import { logWebhookAttempt } from "@/lib/webhookLogger";
import { trackReferral } from "@/services/influencerService";
import { attributeFromIntake } from "@/services/affiliate/attributionService";
import { extractPromoCode } from "@/lib/overtime/intakeNormalizer";
import * as Sentry from "@sentry/nextjs";
import { logger } from '@/lib/logger';

const WEBHOOK_ENDPOINT = "/api/webhooks/heyflow-intake-v2";

// Enhanced authentication check with multiple provider support
function authenticateWebhook(req: NextRequest): { 
  isValid: boolean; 
  authMethod?: string; 
  errorDetails?: string;
} {
  const configuredSecret = process.env.MEDLINK_WEBHOOK_SECRET || process.env.HEYFLOW_WEBHOOK_SECRET;
  
  if (!configuredSecret) {
    // In production, reject requests if no secret is configured
    if (process.env.NODE_ENV === 'production') {
      logger.error("[HEYFLOW V2] SECURITY: No webhook secret configured in production - rejecting request");
      return { isValid: false, errorDetails: "Webhook secret not configured" };
    }
    logger.warn("[HEYFLOW V2] No webhook secret configured - accepting all requests (development mode)");
    return { isValid: true, authMethod: "no-secret-dev" };
  }

  // Check all possible authentication headers
  const authHeaders = {
    "x-heyflow-secret": req.headers.get("x-heyflow-secret"),
    "x-heyflow-signature": req.headers.get("x-heyflow-signature"),
    "x-webhook-secret": req.headers.get("x-webhook-secret"),
    "x-medlink-secret": req.headers.get("x-medlink-secret"),
    "authorization": req.headers.get("authorization"),
    "x-api-key": req.headers.get("x-api-key"),
  };

  // Log which headers are present
  logger.debug("[HEYFLOW V2] Auth headers present:", 
    Object.entries(authHeaders)
      .filter(([_, value]) => value)
      .map(([key]) => key)
  );

  // Check each possible authentication method
  for (const [header, value] of Object.entries(authHeaders)) {
    if (!value) continue;
    
    // Direct match
    if (value === configuredSecret) {
      return { isValid: true, authMethod: header };
    }
    
    // Bearer token match
    if (header === "authorization" && value === `Bearer ${configuredSecret}`) {
      return { isValid: true, authMethod: "authorization-bearer" };
    }
  }

  return { 
    isValid: false, 
    errorDetails: `No matching authentication found. Headers present: ${Object.keys(authHeaders).filter((k: any) => authHeaders[k as keyof typeof authHeaders]).join(", ")}`
  };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let payload: any = null;
  let webhookLogData: any = {
    endpoint: WEBHOOK_ENDPOINT,
    request: req,
    status: WebhookStatus.ERROR,
    statusCode: 500,
  };

  try {
    // === STEP 1: LOG REQUEST ===
    logger.debug(`\n${"=".repeat(60)}`);
    logger.debug(`[HEYFLOW V2] New webhook request at ${new Date().toISOString()}`);
    logger.debug(`[HEYFLOW V2] Method: ${req.method}`);
    logger.debug(`[HEYFLOW V2] URL: ${req.url}`);
    
    // Log headers (with redaction)
    logger.debug("[HEYFLOW V2] Headers:");
    req.headers.forEach((value, key) => {
      const shouldRedact = key.toLowerCase().includes("secret") || 
                           key.toLowerCase().includes("auth") || 
                           key.toLowerCase().includes("token");
      logger.debug(`  ${key}: ${shouldRedact ? "[REDACTED]" : value}`);
    });

    // === STEP 2: AUTHENTICATE ===
    const authResult = authenticateWebhook(req);
    if (!authResult.isValid) {
      logger.error("[HEYFLOW V2] Authentication failed:", authResult.errorDetails);
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = authResult.errorDetails;
      await logWebhookAttempt(webhookLogData);
      
      return Response.json({ 
        error: "Unauthorized", 
        details: authResult.errorDetails 
      }, { status: 401 });
    }

    logger.debug(`[HEYFLOW V2] Authentication successful via: ${authResult.authMethod}`);

    // === STEP 3: PARSE PAYLOAD ===
    try {
      const rawBody = await req.text();
      logger.debug(`[HEYFLOW V2] Raw body length: ${rawBody.length} characters`);
      
      // Try to parse as JSON
      payload = JSON.parse(rawBody);
      webhookLogData.payload = payload;
      
      logger.debug("[HEYFLOW V2] Payload structure:");
      logger.debug(`  Type: ${typeof payload}`);
      logger.debug(`  Keys: ${Object.keys(payload).join(", ")}`);
      
      // Log key payload fields for debugging
      if (payload.responseId) {
        logger.debug(`  Response ID: ${payload.responseId}`);
      }
      if (payload.submissionId) {
        logger.debug(`  Submission ID: ${payload.submissionId}`);
      }
      if (payload.flowId) {
        logger.debug(`  Flow ID: ${payload.flowId}`);
      }
      if (payload.data) {
        logger.debug(`  Data keys: ${Object.keys(payload.data).join(", ")}`);
      }
      if (payload.answers && Array.isArray(payload.answers)) {
        logger.debug(`  Answers count: ${payload.answers.length}`);
      }
      
      // Log first few answers for debugging
      if (payload.answers && payload.answers.length > 0) {
        logger.debug("[HEYFLOW V2] Sample answers:");
        payload.answers.slice(0, { value: 3 }).forEach((answer: any, i: number) => {
          logger.debug(`  [${i}] ${answer.label || answer.question}: ${answer.value}`);
        });
      }
      
    } catch (parseError: any) {
      logger.error("[HEYFLOW V2] Failed to parse JSON payload:", { value: parseError });
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = `JSON parse error: ${parseError}`;
      await logWebhookAttempt(webhookLogData);
      
      return Response.json({ 
        error: "Invalid JSON payload",
        details: String(parseError)
      }, { status: 400 });
    }

    // === STEP 4: NORMALIZE PAYLOAD ===
    let normalized;
    try {
      normalized = normalizeMedLinkPayload(payload);
      logger.debug("[HEYFLOW V2] Normalization successful:");
      logger.debug(`  Submission ID: ${normalized.submissionId}`);
      logger.debug(`  Sections: ${normalized.sections.length}`);
      logger.debug(`  Total answers: ${normalized.answers.length}`);
      
      // Identify patient info
      const patientFields = normalized.answers.filter((a: any) => 
        a.label?.toLowerCase().includes("name") ||
        a.label?.toLowerCase().includes("email") ||
        a.label?.toLowerCase().includes("phone") ||
        a.label?.toLowerCase().includes("birth") ||
        a.label?.toLowerCase().includes("dob")
      );
      
      if (patientFields.length > 0) {
        logger.debug("[HEYFLOW V2] Patient fields found:");
        patientFields.forEach((field: any) => {
          logger.debug(`  ${field.label}: ${field.value}`);
        });
      }
      
    } catch (normalizeError: any) {
      logger.error("[HEYFLOW V2] Failed to normalize payload:", { value: normalizeError });
      webhookLogData.status = WebhookStatus.PROCESSING_ERROR;
      webhookLogData.statusCode = 422;
      webhookLogData.errorMessage = `Normalization error: ${normalizeError}`;
      await logWebhookAttempt(webhookLogData);
      
      // Log to Sentry
      Sentry.captureException(normalizeError, {
        extra: { payload, endpoint: WEBHOOK_ENDPOINT }
      });
      
      return Response.json({ 
        error: "Failed to process payload structure",
        details: String(normalizeError)
      }, { status: 422 });
    }

    // === STEP 5: PROCESS INTAKE ===
    try {
      // Store the normalized intake data (including answers for vitals)
      const intakeDataToStore = {
        submissionId: normalized.submissionId,
        sections: normalized.sections,
        answers: normalized.answers,
        patient: normalized.patient,
        source: "heyflow-intake-v2",
        receivedAt: new Date().toISOString(),
      };

      // Upsert patient
      logger.debug("[HEYFLOW V2] Creating/updating patient...");
      const patient = await upsertPatientFromIntake(normalized);
      logger.debug(`[HEYFLOW V2] Patient ID: ${patient.id}`);

      // Extract and track promo/affiliate code
      const promoCode = extractPromoCode(payload);
      if (promoCode) {
        logger.debug(`[HEYFLOW V2] Found promo code: ${promoCode}`);
        // Track in legacy system (Influencer/ReferralTracking)
        try {
          await trackReferral(patient.id, promoCode);
          logger.debug(`[HEYFLOW V2] Tracked referral in legacy system for code: ${promoCode}`);
        } catch (trackError: any) {
          logger.warn(`[HEYFLOW V2] Failed to track referral in legacy system: ${trackError.message}`);
        }
        // Track in modern system (Affiliate/AffiliateTouch)
        try {
          // Get clinic ID from patient
          const patientRecord = await prisma.patient.findUnique({
            where: { id: patient.id },
            select: { clinicId: true },
          });
          if (patientRecord?.clinicId) {
            const result = await attributeFromIntake(patient.id, promoCode, patientRecord.clinicId, 'heyflow-v2');
            if (result) {
              logger.debug(`[HEYFLOW V2] Tracked attribution in modern system: ${result.refCode}`);
            }
          }
        } catch (modernError: any) {
          logger.warn(`[HEYFLOW V2] Failed to track in modern system: ${modernError.message}`);
        }
      }

      // Generate PDF
      logger.debug("[HEYFLOW V2] Generating PDF...");
      const pdfContent = await generateIntakePdf(normalized, patient);
      logger.debug(`[HEYFLOW V2] PDF generated: ${pdfContent.byteLength} bytes`);

      // Prepare PDF for database storage
      logger.debug("[HEYFLOW V2] Preparing PDF for storage...");
      const stored = await storeIntakePdf({
        patientId: patient.id,
        submissionId: normalized.submissionId,
        pdfBuffer: pdfContent,
      });
      logger.debug(`[HEYFLOW V2] PDF prepared: ${stored.filename}, ${stored.pdfBuffer.length} bytes`);

      // Check for existing document
      const existingDocument = await prisma.patientDocument.findUnique({
        where: { sourceSubmissionId: normalized.submissionId },
      });

      // Create or update patient document
      // Store intake JSON for display (PDF bytes require DB migration for intakeData field)
      let patientDocument;
      if (existingDocument) {
        logger.debug(`[HEYFLOW V2] Updating existing document: ${existingDocument.id}`);
        patientDocument = await prisma.patientDocument.update({
          where: { id: existingDocument.id },
          data: {
            filename: stored.filename,
            data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          },
        });
      } else {
        logger.debug("[HEYFLOW V2] Creating new document...");
        patientDocument = await prisma.patientDocument.create({
          data: {
            patientId: patient.id,
            filename: stored.filename,
            mimeType: "application/pdf",
            source: "heyflow",
            sourceSubmissionId: normalized.submissionId,
            category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
            data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          },
        });
      }
      logger.debug(`[HEYFLOW V2] Document ID: ${patientDocument.id}`);

      // Generate SOAP note asynchronously
      let soapNoteId = null;
      try {
        logger.debug("[HEYFLOW V2] Generating SOAP note...");
        const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
        soapNoteId = soapNote.id;
        logger.debug(`[HEYFLOW V2] SOAP note generated: ${soapNoteId}`);
      } catch (soapError: any) {
        logger.error("[HEYFLOW V2] Failed to generate SOAP note:", { value: soapError });
        // Don't fail the webhook if SOAP generation fails
      }

      // === SUCCESS: Log and return ===
      const processingTimeMs = Date.now() - startTime;
      logger.debug(`[HEYFLOW V2] SUCCESS! Processing time: ${processingTimeMs}ms`);
      
      const responseData = {
        success: true,
        patientId: patient.id,
        documentId: patientDocument.id,
        soapNoteId,
        pdfSizeBytes: stored.pdfBuffer.length,
        processingTimeMs,
      };

      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 200;
      webhookLogData.responseData = responseData;
      webhookLogData.processingTimeMs = processingTimeMs;
      await logWebhookAttempt(webhookLogData);

      // Send success notification if configured
      if (process.env.WEBHOOK_SUCCESS_NOTIFICATION_URL) {
        try {
          await fetch(process.env.WEBHOOK_SUCCESS_NOTIFICATION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webhook: 'heyflow-intake',
              patientId: patient.id,
              submissionId: normalized.submissionId,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (notifyError: any) {
          logger.error("[HEYFLOW V2] Notification failed:", { value: notifyError });
        }
      }

      logger.debug(`${"=".repeat(60)}\n`);
      return Response.json(responseData, { status: 200 });

    } catch (processingError: any) {
      logger.error("[HEYFLOW V2] Processing error:", { value: processingError });
      
      // Log to Sentry with full context
      Sentry.captureException(processingError, {
        extra: {
          payload,
          normalized,
          endpoint: WEBHOOK_ENDPOINT,
        }
      });
      
      webhookLogData.status = WebhookStatus.PROCESSING_ERROR;
      webhookLogData.statusCode = 500;
      webhookLogData.errorMessage = `Processing error: ${processingError}`;
      webhookLogData.processingTimeMs = Date.now() - startTime;
      await logWebhookAttempt(webhookLogData);
      
      logger.debug(`${"=".repeat(60)}\n`);
      return Response.json({ 
        error: "Failed to process intake",
        details: String(processingError)
      }, { status: 500 });
    }

  } catch (unexpectedError: any) {
    // Catch-all for any unexpected errors
    logger.error("[HEYFLOW V2] Unexpected error:", { value: unexpectedError });
    
    Sentry.captureException(unexpectedError, {
      extra: { 
        endpoint: WEBHOOK_ENDPOINT,
        payload 
      }
    });
    
    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = `Unexpected error: ${unexpectedError}`;
    webhookLogData.processingTimeMs = Date.now() - startTime;
    await logWebhookAttempt(webhookLogData);
    
    logger.debug(`${"=".repeat(60)}\n`);
    return Response.json({ 
      error: "Internal server error",
      details: String(unexpectedError)
    }, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  const stats = await import("@/lib/webhookLogger").then(m => 
    m.getWebhookStats(WEBHOOK_ENDPOINT, 7)
  );
  
  return Response.json({
    endpoint: WEBHOOK_ENDPOINT,
    status: "active",
    stats,
    timestamp: new Date().toISOString(),
  });
}
