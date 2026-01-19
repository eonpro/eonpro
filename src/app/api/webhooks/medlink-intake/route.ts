import { NextRequest } from "next/server";
import { PatientDocumentCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { upsertPatientFromIntake } from "@/lib/medlink/patientService";
import { generateIntakePdf } from "@/services/intakePdfService";
import { storeIntakePdf } from "@/services/storage/intakeStorage";
import { generateSOAPFromIntake } from "@/services/ai/soapNoteService";
import { trackReferral } from "@/services/influencerService";
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  // Log all incoming headers for debugging
  logger.debug("[MEDLINK WEBHOOK] Incoming request headers:");
  req.headers.forEach((value, key) => {
    logger.debug(`  ${key}: ${key.toLowerCase().includes('secret') || key.toLowerCase().includes('auth') ? '[REDACTED]' : value}`);
  });

  const configuredSecret = process.env.MEDLINK_WEBHOOK_SECRET;
  if (!configuredSecret) {
    logger.warn("[MEDLINK WEBHOOK] No secret configured, accepting all requests");
  }

  // Check multiple possible authentication methods
  const xMedLinkSecret = req.headers.get("x-medlink-secret");
  const authorization = req.headers.get("authorization");
  const xWebhookSecret = req.headers.get("x-webhook-secret");
  const xMedLinkSignature = req.headers.get("x-medlink-signature");
  
  // Log authentication attempt
  logger.debug("[MEDLINK WEBHOOK] Auth check:", {
    hasXMedLinkSecret: !!xMedLinkSecret,
    hasAuthorization: !!authorization,
    hasXWebhookSecret: !!xWebhookSecret,
    hasXMedLinkSignature: !!xMedLinkSignature,
    configuredSecret: !!configuredSecret
  });

  // Verify the webhook secret if configured
  if (configuredSecret) {
    const isValid = 
      xMedLinkSecret === configuredSecret ||
      xWebhookSecret === configuredSecret ||
      authorization === `Bearer ${configuredSecret}` ||
      authorization === configuredSecret;

    if (!isValid) {
      logger.warn("[MEDLINK WEBHOOK] Authentication failed");
      // For now, just log but don't reject to help debug
    }
  }

  const payload = await req.json();

  if (!payload) {
    logger.error("No payload received");
    return Response.json({ error: "No payload" }, { status: 400 });
  }

  // Log raw payload for debugging
  logger.debug("[MEDLINK WEBHOOK] Raw payload received:");
  logger.debug("Data:", { json: JSON.stringify(payload, null, 2) });
  logger.debug("[MEDLINK WEBHOOK] Payload type:", { type: typeof payload });
  logger.debug("[MEDLINK WEBHOOK] Payload keys:", { keys: Object.keys(payload as any) });

  try {
    const normalized = normalizeMedLinkPayload(payload);
    logger.debug("[MEDLINK WEBHOOK] Normalized successfully:");
    logger.debug("  - Submission ID:", { value: normalized.submissionId });
    logger.debug("  - Sections:", { count: normalized.sections.length });

    // Store the normalized intake data for later display (including answers for vitals)
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      patient: normalized.patient,
      source: "medlink-intake",
      receivedAt: new Date().toISOString(),
    };

    // Upsert patient
    const patient = await upsertPatientFromIntake(normalized);

    // Process referral tracking for influencer promo codes
    const promoCodeEntry = normalized.answers?.find(
      entry => entry.label?.toLowerCase().includes('promo') || 
              entry.label?.toLowerCase().includes('referral') ||
              entry.label?.toLowerCase().includes('discount') ||
              entry.id === 'promo_code' ||
              entry.id === 'referral_code'
    );

    if (promoCodeEntry?.value) {
      const promoCode = promoCodeEntry.value.trim().toUpperCase();
      const referralSourceEntry = normalized.answers?.find(
        entry => entry.label?.toLowerCase().includes('how did you hear') ||
                entry.label?.toLowerCase().includes('referral source') ||
                entry.id === 'referral_source'
      );
      
      logger.debug(`[MEDLINK WEBHOOK] Found promo code: ${promoCode} for patient ${patient.id}`);
      
      await trackReferral(
        patient.id,
        promoCode,
        referralSourceEntry?.value || 'medlink-intake',
        {
          submissionId: normalized.submissionId,
          intakeDate: normalized.submittedAt,
          patientEmail: patient.email
        }
      );
    }

    // Generate PDF
    const pdfContent = await generateIntakePdf(normalized, patient);

    // Prepare PDF for storage
    const stored = await storeIntakePdf({
      patientId: patient.id,
      submissionId: normalized.submissionId,
      pdfBuffer: pdfContent,
    });

    // Check if this intake document already exists
    const existingDocument = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
    });

    let patientDocument;
    if (existingDocument) {
      // Update the existing document
      patientDocument = await prisma.patientDocument.update({
        where: { id: existingDocument.id },
        data: {
          filename: stored.filename,
          data: stored.pdfBuffer,  // Store PDF bytes directly
          intakeData: intakeDataToStore,  // Store intake JSON separately
          pdfGeneratedAt: new Date(),
          intakeVersion: "medlink-v2",
          externalUrl: null,  // Clear legacy external URL
        },
      });
    } else {
      // Create a new document
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          filename: stored.filename,
          mimeType: "application/pdf",
          source: "medlink",
          sourceSubmissionId: normalized.submissionId,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          data: stored.pdfBuffer,  // Store PDF bytes directly
          intakeData: intakeDataToStore,  // Store intake JSON separately
          pdfGeneratedAt: new Date(),
          intakeVersion: "medlink-v2",
        },
      });
    }

    // Generate SOAP note from the intake asynchronously
    let soapNoteId = null;
    try {
      logger.debug("[MEDLINK WEBHOOK] Generating SOAP note for patient:", { value: patient.id });
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.debug("[MEDLINK WEBHOOK] SOAP note generated successfully:", { value: soapNoteId });
    } catch (error: any) {
    // @ts-ignore
   
      logger.error("[MEDLINK WEBHOOK] Failed to generate SOAP note:", { error });
      // Don't fail the webhook if SOAP generation fails
    }

    return Response.json({ 
      ok: true,
      patientId: patient.id,
      documentId: patientDocument.id,
      soapNoteId,
      pdfSizeBytes: stored.pdfBuffer.length,
    }, { status: 200 });
  } catch (err: any) {
    // @ts-ignore
   
    logger.error("Failed to process MedLink webhook", { error: err });
    return Response.json({ error: "Failed to process intake" }, { status: 500 });
  }
}