import { NextRequest } from "next/server";
import { PatientDocumentCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { upsertPatientFromIntake } from "@/lib/medlink/patientService";
import { generateIntakePdf } from "@/services/intakePdfService";
import { storeIntakePdf } from "@/services/storage/intakeStorage";
import { generateSOAPFromIntake } from "@/services/ai/soapNoteService";
import { logger } from '@/lib/logger';

/**
 * EONPRO Intake Webhook - EONMEDS CLINIC ONLY
 * 
 * This webhook receives patient intake form submissions from external platforms.
 * ALL patients are automatically assigned to the EONMEDS clinic.
 * 
 * Endpoint: POST /api/webhooks/eonpro-intake
 * 
 * Authentication:
 *   - Header: x-webhook-secret: YOUR_SECRET
 *   - Or: Authorization: Bearer YOUR_SECRET
 * 
 * Payload Format (Recommended):
 * {
 *   "submissionId": "unique-submission-id",
 *   "submittedAt": "2024-01-15T10:30:00Z",
 *   "data": {
 *     "firstName": "John",
 *     "lastName": "Doe",
 *     "email": "john.doe@example.com",
 *     "phone": "5551234567",
 *     "dateOfBirth": "1990-01-15",
 *     "gender": "Male",
 *     "streetAddress": "123 Main St",
 *     "city": "Miami",
 *     "state": "FL",
 *     "zipCode": "33101",
 *     "currentMedications": "Metformin 500mg",
 *     "allergies": "Penicillin",
 *     "medicalConditions": "Type 2 Diabetes",
 *     "reasonForVisit": "Weight management consultation",
 *     "chiefComplaint": "Difficulty losing weight",
 *     "medicalHistory": "Diagnosed with diabetes in 2020",
 *     "familyHistory": "Father had heart disease",
 *     "currentSymptoms": "Fatigue, increased thirst",
 *     "weight": "220",
 *     "height": "5'10\"",
 *     // ... any additional fields
 *   }
 * }
 * 
 * Alternative Format (Sections):
 * {
 *   "submissionId": "unique-id",
 *   "sections": [
 *     {
 *       "title": "Personal Information",
 *       "fields": [
 *         { "id": "firstName", "label": "First Name", "value": "John" },
 *         { "id": "lastName", "label": "Last Name", "value": "Doe" }
 *       ]
 *     },
 *     {
 *       "title": "Medical History",
 *       "fields": [
 *         { "id": "allergies", "label": "Allergies", "value": "Penicillin" }
 *       ]
 *     }
 *   ]
 * }
 */

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  logger.debug(`[EONPRO INTAKE ${requestId}] Incoming webhook request`);

  // Check authentication
  const configuredSecret = process.env.EONPRO_INTAKE_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
  const authorization = req.headers.get("authorization");
  const xWebhookSecret = req.headers.get("x-webhook-secret");
  const xApiKey = req.headers.get("x-api-key");

  if (configuredSecret) {
    const isValid = 
      xWebhookSecret === configuredSecret ||
      xApiKey === configuredSecret ||
      authorization === `Bearer ${configuredSecret}` ||
      authorization === configuredSecret;

    if (!isValid) {
      logger.warn(`[EONPRO INTAKE ${requestId}] Authentication failed`);
      return Response.json(
        { error: "Unauthorized", message: "Invalid or missing webhook secret" },
        { status: 401 }
      );
    }
    logger.debug(`[EONPRO INTAKE ${requestId}] Authentication successful`);
  } else {
    logger.warn(`[EONPRO INTAKE ${requestId}] No webhook secret configured - accepting request`);
  }

  // Parse payload
  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    logger.error(`[EONPRO INTAKE ${requestId}] Invalid JSON payload`, { error: err });
    return Response.json(
      { error: "Invalid JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object") {
    logger.error(`[EONPRO INTAKE ${requestId}] Empty or invalid payload`);
    return Response.json(
      { error: "Invalid payload", message: "Payload must be a non-empty object" },
      { status: 400 }
    );
  }

  logger.debug(`[EONPRO INTAKE ${requestId}] Payload received`, {
    keys: Object.keys(payload),
    hasData: !!payload.data,
    hasSections: !!payload.sections,
    submissionId: payload.submissionId || payload.submission_id || "auto-generated"
  });

  try {
    // Get EONMEDS clinic (all patients go here)
    const eonmedsClinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: 'eonmeds' },
          { name: { contains: 'EONMEDS', mode: 'insensitive' } },
        ],
      },
    });

    if (!eonmedsClinic) {
      logger.error(`[EONPRO INTAKE ${requestId}] CRITICAL: EONMEDS clinic not found!`);
      return Response.json(
        { error: "Configuration error", message: "EONMEDS clinic not configured" },
        { status: 500 }
      );
    }

    const clinicId = eonmedsClinic.id;
    logger.debug(`[EONPRO INTAKE ${requestId}] Using clinic: ${eonmedsClinic.name} (ID: ${clinicId})`);

    // Normalize the intake payload
    const normalized = normalizeMedLinkPayload(payload);
    
    logger.debug(`[EONPRO INTAKE ${requestId}] Normalized intake data`, {
      submissionId: normalized.submissionId,
      sectionsCount: normalized.sections.length,
      answersCount: normalized.answers.length,
      patientEmail: normalized.patient.email,
      patientName: `${normalized.patient.firstName} ${normalized.patient.lastName}`
    });

    // Store intake data for later display
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      source: "eonpro-intake",
      clinicId: clinicId,
      clinicName: eonmedsClinic.name,
      receivedAt: new Date().toISOString(),
    };

    // Upsert patient (creates or updates based on email) - ALWAYS to EONMEDS clinic
    const patient = await upsertPatientFromIntake(normalized, { 
      clinicId, 
      tags: ['eonpro-intake', 'eonmeds'] 
    });
    logger.debug(`[EONPRO INTAKE ${requestId}] Patient upserted`, {
      patientId: patient.id,
      isNew: !patient.createdAt || patient.createdAt === patient.updatedAt
    });

    // Generate PDF from intake data
    const pdfContent = await generateIntakePdf(normalized, patient);
    logger.debug(`[EONPRO INTAKE ${requestId}] PDF generated`);

    // Store PDF
    const stored = await storeIntakePdf({
      patientId: patient.id,
      submissionId: normalized.submissionId,
      pdfBuffer: pdfContent,
    });
    logger.debug(`[EONPRO INTAKE ${requestId}] PDF stored`, { path: stored.publicPath });

    // Check for existing document with same submission ID
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
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
          updatedAt: new Date(),
        },
      });
      logger.debug(`[EONPRO INTAKE ${requestId}] Document updated`, { documentId: patientDocument.id });
    } else {
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId: clinicId,
          filename: stored.filename,
          mimeType: "application/pdf",
          source: "eonpro-intake",
          sourceSubmissionId: normalized.submissionId,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          externalUrl: stored.publicPath,
          data: Buffer.from(JSON.stringify(intakeDataToStore), 'utf8'),
        },
      });
      logger.debug(`[EONPRO INTAKE ${requestId}] Document created`, { documentId: patientDocument.id });
    }

    // Generate SOAP note asynchronously (optional - won't fail the webhook)
    let soapNoteId = null;
    try {
      logger.debug(`[EONPRO INTAKE ${requestId}] Generating SOAP note...`);
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.debug(`[EONPRO INTAKE ${requestId}] SOAP note generated`, { soapNoteId });
    } catch (error: any) {
      logger.error(`[EONPRO INTAKE ${requestId}] SOAP generation failed (non-fatal)`, { error });
    }

    const response = {
      success: true,
      requestId,
      data: {
        patientId: patient.id,
        documentId: patientDocument.id,
        soapNoteId,
        submissionId: normalized.submissionId,
        pdfUrl: stored.publicPath,
        patientCreated: !existingDocument,
      },
      clinic: {
        id: clinicId,
        name: eonmedsClinic.name,
      },
      message: "Intake processed successfully"
    };

    logger.debug(`[EONPRO INTAKE ${requestId}] Webhook completed successfully`);
    return Response.json(response, { status: 200 });

  } catch (err: any) {
    logger.error(`[EONPRO INTAKE ${requestId}] Failed to process intake`, {
      error: err.message,
      stack: err.stack
    });
    
    return Response.json({
      success: false,
      requestId,
      error: "Processing failed",
      message: err.message || "Failed to process intake data"
    }, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  return Response.json({
    status: "healthy",
    endpoint: "/api/webhooks/eonpro-intake",
    method: "POST",
    version: "1.0",
    documentation: "/docs/EONPRO_INTAKE_WEBHOOK.md"
  });
}
