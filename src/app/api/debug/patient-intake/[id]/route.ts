import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * TEMPORARY Debug endpoint - remove after fixing intake issue
 * GET /api/debug/patient-intake/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patientId = parseInt(id, 10);

  if (isNaN(patientId)) {
    return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
  }

  try {
    // Get patient basic info
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        clinicId: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Get intake documents
    const documents = await prisma.patientDocument.findMany({
      where: { 
        patientId,
        category: "MEDICAL_INTAKE_FORM",
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        category: true,
        source: true,
        sourceSubmissionId: true,
        createdAt: true,
        updatedAt: true,
        data: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Parse and analyze each document
    const analyzed = documents.map((doc) => {
      const result: any = {
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        source: doc.source,
        sourceSubmissionId: doc.sourceSubmissionId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        dataAnalysis: {
          hasData: !!doc.data,
          dataType: "none",
          dataSize: 0,
          isValidJson: false,
          jsonKeys: [],
          hasAnswers: false,
          answersCount: 0,
          sampleAnswers: [],
        },
      };

      if (doc.data) {
        try {
          let rawData: any = doc.data;
          
          // Get size
          if (Buffer.isBuffer(rawData)) {
            result.dataAnalysis.dataSize = rawData.length;
            result.dataAnalysis.dataType = "buffer";
            rawData = rawData.toString("utf8");
          } else if (typeof rawData === "object" && rawData.type === "Buffer") {
            result.dataAnalysis.dataSize = rawData.data?.length || 0;
            result.dataAnalysis.dataType = "prisma-buffer";
            rawData = Buffer.from(rawData.data).toString("utf8");
          }

          // Check what we have
          if (typeof rawData === "string") {
            const trimmed = rawData.trim();
            result.dataAnalysis.startsWithChar = trimmed.charAt(0);
            result.dataAnalysis.first100Chars = trimmed.substring(0, 100);
            
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              const parsed = JSON.parse(trimmed);
              result.dataAnalysis.isValidJson = true;
              result.dataAnalysis.jsonKeys = Object.keys(parsed);
              result.dataAnalysis.hasAnswers = Array.isArray(parsed.answers);
              result.dataAnalysis.answersCount = parsed.answers?.length || 0;
              result.dataAnalysis.hasSections = Array.isArray(parsed.sections);
              result.dataAnalysis.sectionsCount = parsed.sections?.length || 0;
              
              if (parsed.answers?.length > 0) {
                result.dataAnalysis.sampleAnswers = parsed.answers.slice(0, 5).map((a: any) => ({
                  id: a.id,
                  label: a.label,
                  value: String(a.value || "").substring(0, 50),
                }));
              }
              
              if (parsed.sections?.length > 0 && parsed.sections[0].entries) {
                result.dataAnalysis.sampleEntries = parsed.sections[0].entries.slice(0, 5).map((e: any) => ({
                  id: e.id,
                  label: e.label,
                  value: String(e.value || "").substring(0, 50),
                }));
              }
            } else if (trimmed.startsWith("%PDF")) {
              result.dataAnalysis.dataType = "pdf-binary";
            } else {
              result.dataAnalysis.dataType = "unknown-string";
            }
          }
        } catch (e: any) {
          result.dataAnalysis.parseError = e.message;
        }
      }

      return result;
    });

    return NextResponse.json({
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        clinicId: patient.clinicId,
      },
      intakeDocumentsCount: documents.length,
      documents: analyzed,
      diagnosis: documents.length === 0 
        ? "NO_INTAKE_DOCUMENTS - Webhook may not be creating documents"
        : analyzed.some(d => d.dataAnalysis.hasAnswers)
          ? "HAS_ANSWERS - Data exists, display issue"
          : "NO_ANSWERS - Documents exist but no answer data",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Database error", message: error.message },
      { status: 500 }
    );
  }
}
