/**
 * API v1 Intakes Endpoint
 * 
 * Receives intake submissions from external platforms.
 * This is an alternative to the webhook endpoint, used by the EMR client.
 * 
 * POST /api/v1/intakes - Submit an intake
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { generateIntakePdf } from "@/services/intakePdfService";
import { storeIntakePdf } from "@/services/storage/intakeStorage";
import { generateSOAPFromIntake } from "@/services/ai/soapNoteService";
import { logger } from '@/lib/logger';
import { PatientDocumentCategory } from "@prisma/client";

export async function POST(req: NextRequest) {
  const requestId = `v1-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();
  
  logger.info(`[V1 INTAKES ${requestId}] Received intake submission`);
  
  // Verify authentication
  const secret = req.headers.get("x-webhook-secret") || 
                 req.headers.get("x-api-secret") ||
                 req.headers.get("authorization")?.replace("Bearer ", "");
  
  const expectedSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  
  if (!expectedSecret) {
    return Response.json({ 
      success: false, 
      error: "Server not configured" 
    }, { status: 500 });
  }
  
  if (!secret || secret !== expectedSecret) {
    return Response.json({ 
      success: false, 
      error: "Unauthorized" 
    }, { status: 401 });
  }
  
  try {
    const payload = await req.json();
    
    // Normalize the payload
    const normalized = normalizeMedLinkPayload(payload);
    
    // Find EONMEDS clinic
    const clinic = await prisma.clinic.findFirst({
      where: { 
        OR: [
          { subdomain: "eonmeds" },
          { name: { contains: "EONMEDS", mode: "insensitive" } },
          { name: { contains: "EONMeds", mode: "insensitive" } },
        ]
      },
    });
    
    const clinicId = clinic?.id || 3;
    
    // Create or update patient
    let patient = await prisma.patient.findFirst({
      where: { email: normalized.email },
    });
    
    const isNewPatient = !patient;
    
    if (patient) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: {
          firstName: normalized.firstName || patient.firstName,
          lastName: normalized.lastName || patient.lastName,
          phone: normalized.phone || patient.phone,
          dateOfBirth: normalized.dateOfBirth ? new Date(normalized.dateOfBirth) : patient.dateOfBirth,
          gender: normalized.gender || patient.gender,
          address: normalized.address || patient.address,
          city: normalized.city || patient.city,
          state: normalized.state || patient.state,
          zipCode: normalized.zipCode || patient.zipCode,
          clinicId,
          tags: { push: "v1-intake" },
        },
      });
    } else {
      const patientCount = await prisma.patient.count();
      const patientId = String(patientCount + 1).padStart(6, "0");
      
      patient = await prisma.patient.create({
        data: {
          patientId,
          firstName: normalized.firstName || "Unknown",
          lastName: normalized.lastName || "Patient",
          email: normalized.email || `unknown-${Date.now()}@intake.local`,
          phone: normalized.phone,
          dateOfBirth: normalized.dateOfBirth ? new Date(normalized.dateOfBirth) : undefined,
          gender: normalized.gender,
          address: normalized.address,
          city: normalized.city,
          state: normalized.state,
          zipCode: normalized.zipCode,
          clinicId,
          status: "ACTIVE",
          tags: ["v1-intake", "complete-intake"],
        },
      });
    }
    
    // Generate PDF
    let documentId: number | null = null;
    try {
      const pdfContent = await generateIntakePdf(normalized, patient);
      const stored = await storeIntakePdf({
        patientId: patient.id,
        submissionId: normalized.submissionId,
        pdfBuffer: pdfContent,
      });
      
      // Prepare intake data to store
      const intakeDataToStore = {
        submissionId: normalized.submissionId,
        sections: normalized.sections,
        answers: normalized.answers || [],
        source: "v1-intakes",
        receivedAt: new Date().toISOString(),
      };
      
      const doc = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId,
          filename: stored.filename,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          mimeType: "application/pdf",
          data: stored.pdfBuffer,  // Store PDF bytes directly
          intakeData: intakeDataToStore,  // Store intake JSON separately
          pdfGeneratedAt: new Date(),
          intakeVersion: "v1-intakes-v2",
          sourceSubmissionId: normalized.submissionId,
        },
      });
      documentId = doc.id;
    } catch (err) {
      logger.warn(`[V1 INTAKES ${requestId}] PDF generation failed:`, err);
    }
    
    // Generate SOAP Note
    let soapNoteId: number | null = null;
    if (documentId) {
      try {
        const soapNote = await generateSOAPFromIntake(patient.id, documentId);
        soapNoteId = soapNote.id;
      } catch (err) {
        logger.warn(`[V1 INTAKES ${requestId}] SOAP generation failed:`, err);
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`[V1 INTAKES ${requestId}] Success in ${duration}ms`);
    
    return Response.json({
      success: true,
      requestId,
      data: {
        submissionId: normalized.submissionId,
        patientId: patient.id,
        documentId,
        soapNoteId,
        isNewPatient,
        clinic: clinic?.name || "EONMEDS",
      },
      processingTime: `${duration}ms`,
    });
    
  } catch (error: any) {
    logger.error(`[V1 INTAKES ${requestId}] Error:`, error);
    return Response.json({
      success: false,
      error: error.message || "Internal server error",
      requestId,
    }, { status: 500 });
  }
}
