import { NextRequest } from "next/server";
import { PatientDocumentCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { generateIntakePdf } from "@/services/intakePdfService";
import { storeIntakePdf } from "@/services/storage/intakeStorage";
import { trackReferral } from "@/services/influencerService";
import { logger } from '@/lib/logger';

/**
 * WEIGHTLOSSINTAKE Webhook - EONMEDS CLINIC ONLY
 * 
 * This webhook receives patient intake form submissions from the weightlossintake platform.
 * ALL data is isolated to the EONMEDS clinic - no other clinic can access these patients.
 * 
 * Endpoint: POST /api/webhooks/weightlossintake
 * 
 * Authentication:
 *   - Header: x-webhook-secret: WEIGHTLOSSINTAKE_WEBHOOK_SECRET
 * 
 * Security:
 *   - Hardcoded to EONMEDS clinic (subdomain: eonmeds)
 *   - Patients are created with EONMEDS clinicId
 *   - Patient lookup restricted to EONMEDS clinic
 *   - Complete audit trail
 *   - PDF intake form generated and stored
 * 
 * Last Updated: 2026-01-17
 */

// EONMEDS clinic identifier - DO NOT CHANGE
const EONMEDS_CLINIC_SUBDOMAIN = "eonmeds";

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Webhook received`);

  // === STEP 1: AUTHENTICATE ===
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  
  if (!configuredSecret) {
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] CRITICAL: No webhook secret configured!`);
    return Response.json(
      { error: "Server configuration error", code: "NO_SECRET_CONFIGURED" },
      { status: 500 }
    );
  }

  const providedSecret = 
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (providedSecret !== configuredSecret) {
    logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Authentication FAILED - invalid secret`);
    return Response.json(
      { error: "Unauthorized", code: "INVALID_SECRET" },
      { status: 401 }
    );
  }

  logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Authentication successful`);

  // === STEP 2: GET EONMEDS CLINIC ===
  const eonmedsClinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: EONMEDS_CLINIC_SUBDOMAIN },
        { name: { contains: "EONMEDS", mode: "insensitive" } },
      ],
    },
  });

  if (!eonmedsClinic) {
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] CRITICAL: EONMEDS clinic not found!`);
    return Response.json(
      { error: "Clinic configuration error", code: "CLINIC_NOT_FOUND" },
      { status: 500 }
    );
  }

  const clinicId = eonmedsClinic.id;
  logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Using EONMEDS clinic ID: ${clinicId}`);

  // === STEP 3: PARSE PAYLOAD ===
  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] Invalid JSON payload`, { error: err });
    return Response.json(
      { error: "Invalid JSON", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object") {
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] Empty or invalid payload`);
    return Response.json(
      { error: "Invalid payload", code: "EMPTY_PAYLOAD" },
      { status: 400 }
    );
  }

  logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Payload received`, {
    keys: Object.keys(payload),
    source: payload.source || "weightlossintake",
    submissionId: payload.submissionId || payload.submission_id,
  });

  // === STEP 4: NORMALIZE DATA ===
  try {
    const normalized = normalizeMedLinkPayload(payload);
    
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Normalized intake data`, {
      submissionId: normalized.submissionId,
      sectionsCount: normalized.sections.length,
      answersCount: normalized.answers.length,
      patientEmail: normalized.patient.email,
      patientName: `${normalized.patient.firstName} ${normalized.patient.lastName}`,
    });

    // === STEP 5: UPSERT PATIENT (EONMEDS ONLY) ===
    const patientData = normalizePatientData(normalized.patient);
    
    // Look for existing patient ONLY within EONMEDS clinic
    let existingPatient = await prisma.patient.findFirst({
      where: {
        clinicId: clinicId, // CRITICAL: Only search within EONMEDS
        OR: [
          { email: patientData.email },
          { phone: patientData.phone },
          {
            firstName: patientData.firstName,
            lastName: patientData.lastName,
            dob: patientData.dob,
          },
        ].filter(f => Object.values(f).some(v => v && v !== "unknown@example.com" && v !== "0000000000")),
      },
    });

    let patient;
    let isNewPatient = false;

    if (existingPatient) {
      // Update existing patient
      patient = await prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          ...patientData,
          tags: mergeTags(existingPatient.tags, ["weightlossintake", "eonmeds"]),
          notes: appendNotes(existingPatient.notes, normalized.submissionId),
        },
      });
      logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Updated existing patient: ${patient.id}`);
    } else {
      // Create new patient with EONMEDS clinic
      const patientNumber = await getNextPatientId();
      patient = await prisma.patient.create({
        data: {
          ...patientData,
          patientId: patientNumber,
          clinicId: clinicId, // CRITICAL: Assign to EONMEDS only
          tags: ["weightlossintake", "eonmeds", "glp1"],
          notes: `Created via weightlossintake ${normalized.submissionId}`,
          source: "webhook",
          sourceMetadata: {
            type: "weightlossintake",
            submissionId: normalized.submissionId,
            timestamp: new Date().toISOString(),
            clinicId: clinicId,
            clinicName: "EONMEDS",
          },
        },
      });
      isNewPatient = true;
      logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Created new patient: ${patient.id} (${patientNumber})`);
    }

    // === STEP 6: GENERATE PDF ===
    const pdfContent = await generateIntakePdf(normalized, patient);
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] PDF generated: ${pdfContent.byteLength} bytes`);

    // === STEP 7: STORE PDF ===
    const stored = await storeIntakePdf({
      patientId: patient.id,
      submissionId: normalized.submissionId,
      pdfBuffer: pdfContent,
    });
    logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] PDF stored: ${stored.publicPath}`);

    // === STEP 8: CREATE DOCUMENT RECORD ===
    const existingDocument = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
    });

    let patientDocument;
    if (existingDocument) {
      patientDocument = await prisma.patientDocument.update({
        where: { id: existingDocument.id },
        data: {
          filename: stored.filename,
          externalUrl: stored.publicPath,
          data: pdfContent,
        },
      });
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Updated existing document: ${patientDocument.id}`);
    } else {
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId: clinicId, // EONMEDS clinic isolation
          filename: stored.filename,
          mimeType: "application/pdf",
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          externalUrl: stored.publicPath,
          data: pdfContent,
          source: "weightlossintake",
          sourceSubmissionId: normalized.submissionId,
        },
      });
      
      // Store intake form data separately
      await prisma.intakeForm.create({
        data: {
          patientId: patient.id,
          clinicId: clinicId,
          source: "weightlossintake",
          rawPayload: {
            submissionId: normalized.submissionId,
            sections: normalized.sections,
            source: "weightlossintake",
            clinicId: clinicId,
            receivedAt: new Date().toISOString(),
          },
          status: "COMPLETED",
        },
      }).catch((err) => {
        // IntakeForm creation is optional - don't fail if it errors
        logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] IntakeForm creation failed (non-critical): ${err}`);
      });
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Created document: ${patientDocument.id}`);
    }

    // === STEP 9: TRACK REFERRAL/PROMO CODE ===
    const promoCodeEntry = normalized.answers?.find(
      (entry) =>
        entry.label?.toLowerCase().includes("promo") ||
        entry.label?.toLowerCase().includes("referral") ||
        entry.label?.toLowerCase().includes("discount") ||
        entry.id === "promo_code" ||
        entry.id === "promoCode" ||
        entry.id === "referralCode"
    );

    if (promoCodeEntry?.value) {
      const promoCode = promoCodeEntry.value.trim().toUpperCase();
      logger.debug(`[WEIGHTLOSSINTAKE ${requestId}] Found promo code: ${promoCode}`);
      
      try {
        await trackReferral(
          patient.id,
          promoCode,
          "weightlossintake",
          {
            submissionId: normalized.submissionId,
            intakeDate: normalized.submittedAt,
            patientEmail: patient.email,
            clinicId: clinicId,
          }
        );
        logger.info(`[WEIGHTLOSSINTAKE ${requestId}] Promo code tracked: ${promoCode}`);
      } catch (err) {
        logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Failed to track promo code: ${err}`);
      }
    }

    // === STEP 10: CREATE AUDIT LOG ===
    await prisma.auditLog.create({
      data: {
        action: "PATIENT_INTAKE_RECEIVED",
        tableName: "Patient",
        recordId: patient.id,
        userId: 0, // System action
        diff: JSON.stringify({
          source: "weightlossintake",
          submissionId: normalized.submissionId,
          clinicId: clinicId,
          clinicName: "EONMEDS",
          isNewPatient,
          patientEmail: patient.email,
          documentId: patientDocument.id,
        }),
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "webhook",
      },
    }).catch((err) => {
      logger.warn(`[WEIGHTLOSSINTAKE ${requestId}] Failed to create audit log: ${err}`);
    });

    // === SUCCESS RESPONSE ===
    const duration = Date.now() - startTime;
    logger.info(`[WEIGHTLOSSINTAKE ${requestId}] SUCCESS in ${duration}ms`, {
      patientId: patient.id,
      patientNumber: patient.patientId,
      documentId: patientDocument.id,
      isNewPatient,
      clinicId,
    });

    return Response.json({
      success: true,
      requestId,
      patient: {
        id: patient.id,
        patientId: patient.patientId,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        isNew: isNewPatient,
      },
      document: {
        id: patientDocument.id,
        filename: stored.filename,
        url: stored.publicPath,
      },
      clinic: {
        id: clinicId,
        name: "EONMEDS",
      },
      processingTime: `${duration}ms`,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[WEIGHTLOSSINTAKE ${requestId}] ERROR after ${duration}ms:`, error);
    
    return Response.json(
      {
        error: "Processing failed",
        code: "PROCESSING_ERROR",
        requestId,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// === HELPER FUNCTIONS ===

function normalizePatientData(patient: any) {
  return {
    firstName: capitalize(patient.firstName) || "Unknown",
    lastName: capitalize(patient.lastName) || "Unknown",
    email: patient.email?.toLowerCase() || "unknown@example.com",
    phone: sanitizePhone(patient.phone),
    dob: normalizeDate(patient.dob),
    gender: normalizeGender(patient.gender),
    address1: patient.address1 ?? "",
    address2: patient.address2 ?? "",
    city: patient.city ?? "",
    state: (patient.state ?? "").toUpperCase(),
    zip: patient.zip ?? "",
  };
}

async function getNextPatientId() {
  const counter = await prisma.patientCounter.upsert({
    where: { id: 1 },
    create: { id: 1, current: 1 },
    update: { current: { increment: 1 } },
  });
  return counter.current.toString().padStart(6, "0");
}

function sanitizePhone(value?: string) {
  if (!value) return "0000000000";
  const digits = value.replace(/\D/g, "");
  return digits || "0000000000";
}

function normalizeGender(value?: string) {
  if (!value) return "m";
  const lower = value.toLowerCase();
  if (lower.startsWith("f")) return "f";
  return "m";
}

function normalizeDate(value?: string) {
  if (!value) return "1900-01-01";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.replace(/[^0-9]/g, "").match(/(\d{2})(\d{2})(\d{4})/);
  if (parts) {
    const [, mm, dd, yyyy] = parts;
    return `${yyyy}-${mm}-${dd}`;
  }
  return "1900-01-01";
}

function capitalize(value?: string) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function mergeTags(existing: any, incoming: string[]) {
  const current = Array.isArray(existing) ? (existing as string[]) : [];
  const merged = new Set([...current, ...incoming]);
  return Array.from(merged).filter(Boolean);
}

function appendNotes(existing: string | null | undefined, submissionId: string) {
  const suffix = `Synced from weightlossintake ${submissionId}`;
  if (!existing) return suffix;
  if (existing.includes(submissionId)) return existing;
  return `${existing}\n${suffix}`;
}
