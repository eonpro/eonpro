import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { PatientDocumentCategory } from "@prisma/client";

/**
 * GET /api/patients/[id]/intake
 * Retrieve intake data for a patient
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.clinicId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    // Find the intake document
    const intakeDoc = await prisma.patientDocument.findFirst({
      where: {
        patientId,
        clinicId: session.user.clinicId,
        category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!intakeDoc) {
      return NextResponse.json({ intakeData: null });
    }

    // Parse intake data from the document
    let intakeData = null;
    if (intakeDoc.data) {
      try {
        let rawData = intakeDoc.data;
        if (Buffer.isBuffer(rawData)) {
          rawData = rawData.toString("utf8");
        } else if (typeof rawData === "object" && rawData.type === "Buffer") {
          rawData = Buffer.from(rawData.data).toString("utf8");
        }
        if (typeof rawData === "string") {
          const trimmed = rawData.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            intakeData = JSON.parse(trimmed);
          }
        }
      } catch {
        // Not JSON data
      }
    }

    return NextResponse.json({
      documentId: intakeDoc.id,
      intakeData,
      createdAt: intakeDoc.createdAt,
      updatedAt: intakeDoc.updatedAt,
    });
  } catch (error) {
    logger.error("Error fetching intake data:", error);
    return NextResponse.json({ error: "Failed to fetch intake data" }, { status: 500 });
  }
}

/**
 * PUT /api/patients/[id]/intake
 * Update intake data for a patient (or create if none exists)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.clinicId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    // Verify patient belongs to clinic
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: session.user.clinicId },
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const body = await request.json();
    const { answers } = body;

    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "Invalid intake data" }, { status: 400 });
    }

    // Find existing intake document
    let intakeDoc = await prisma.patientDocument.findFirst({
      where: {
        patientId,
        clinicId: session.user.clinicId,
        category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
      },
      orderBy: { createdAt: "desc" },
    });

    // Build intake data structure
    const intakeDataToStore = {
      submissionId: intakeDoc?.sourceSubmissionId || `manual-${Date.now()}`,
      sections: [],
      answers: Object.entries(answers).map(([id, value]) => ({
        id,
        label: id,
        value,
      })),
      source: "manual_entry",
      clinicId: session.user.clinicId,
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email || session.user.id,
    };

    // Merge with existing data if present
    if (intakeDoc?.data) {
      try {
        let existingData: any = {};
        let rawData = intakeDoc.data;
        if (Buffer.isBuffer(rawData)) {
          rawData = rawData.toString("utf8");
        } else if (typeof rawData === "object" && rawData.type === "Buffer") {
          rawData = Buffer.from(rawData.data).toString("utf8");
        }
        if (typeof rawData === "string") {
          const trimmed = rawData.trim();
          if (trimmed.startsWith("{")) {
            existingData = JSON.parse(trimmed);
          }
        }

        // Preserve original submission info
        if (existingData.submissionId) {
          intakeDataToStore.submissionId = existingData.submissionId;
        }
        if (existingData.source && existingData.source !== "manual_entry") {
          intakeDataToStore.source = existingData.source;
        }

        // Merge answers - new values override existing
        const existingAnswers = existingData.answers || [];
        const answerMap = new Map<string, any>();
        
        for (const ans of existingAnswers) {
          if (ans.id) answerMap.set(ans.id, ans);
        }
        
        for (const ans of intakeDataToStore.answers) {
          answerMap.set(ans.id, ans);
        }
        
        intakeDataToStore.answers = Array.from(answerMap.values());
      } catch {
        // Keep new data as-is
      }
    }

    const dataBuffer = Buffer.from(JSON.stringify(intakeDataToStore), "utf8");

    if (intakeDoc) {
      // Update existing document
      intakeDoc = await prisma.patientDocument.update({
        where: { id: intakeDoc.id },
        data: { data: dataBuffer },
      });
      logger.info(`Updated intake data for patient ${patientId}, doc ${intakeDoc.id}`);
    } else {
      // Create new intake document
      intakeDoc = await prisma.patientDocument.create({
        data: {
          patientId,
          clinicId: session.user.clinicId,
          filename: `intake-manual-${Date.now()}.json`,
          mimeType: "application/json",
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          data: dataBuffer,
          source: "manual_entry",
          sourceSubmissionId: intakeDataToStore.submissionId,
        },
      });
      logger.info(`Created intake document for patient ${patientId}, doc ${intakeDoc.id}`);
    }

    return NextResponse.json({
      success: true,
      documentId: intakeDoc.id,
      message: "Intake data saved successfully",
    });
  } catch (error) {
    logger.error("Error saving intake data:", error);
    return NextResponse.json({ error: "Failed to save intake data" }, { status: 500 });
  }
}
