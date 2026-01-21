import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Debug endpoint to check patient documents
 * GET /api/debug/patient-docs/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  // Simple auth check
  if (secret !== process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const patientId = parseInt(id, 10);

  if (isNaN(patientId)) {
    return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
  }

  try {
    // Get patient
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
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Get all documents for this patient
    const documents = await prisma.patientDocument.findMany({
      where: { patientId },
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
      orderBy: { createdAt: 'desc' },
    });

    // Parse document data for display
    type DocumentEntry = (typeof documents)[number];
    const docsWithParsedData = documents.map((doc: DocumentEntry) => {
      let dataPreview: unknown = null;
      let dataType = 'unknown';
      let dataSize = 0;

      if (doc.data) {
        try {
          let rawData: any = doc.data;

          // Handle Uint8Array (Prisma 6.x returns Bytes as Uint8Array)
          if (rawData instanceof Uint8Array) {
            dataSize = rawData.length;
            rawData = Buffer.from(rawData).toString('utf8');
            dataType = 'uint8array';
          } else if (Buffer.isBuffer(rawData)) {
            dataSize = rawData.length;
            rawData = rawData.toString('utf8');
            dataType = 'buffer';
          } else if (typeof rawData === 'object' && rawData.type === 'Buffer') {
            dataSize = rawData.data?.length || 0;
            rawData = Buffer.from(rawData.data).toString('utf8');
            dataType = 'prisma-buffer';
          }

          // Try to parse as JSON
          if (typeof rawData === 'string') {
            const trimmed = rawData.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              const parsed = JSON.parse(trimmed);
              dataType = 'json';
              dataPreview = {
                keys: Object.keys(parsed),
                hasAnswers: !!parsed.answers,
                answersCount: parsed.answers?.length || 0,
                hasSections: !!parsed.sections,
                sectionsCount: parsed.sections?.length || 0,
                source: parsed.source,
                submissionId: parsed.submissionId,
                sampleAnswers: parsed.answers?.slice(0, 5).map((a: any) => ({
                  id: a.id,
                  label: a.label,
                  value: String(a.value).substring(0, 50),
                })),
              };
            } else if (trimmed.startsWith('%PDF')) {
              dataType = 'pdf';
              dataPreview = { note: 'PDF binary data' };
            } else {
              dataType = 'string';
              dataPreview = { preview: trimmed.substring(0, 100) };
            }
          }
        } catch (e: any) {
          dataPreview = { parseError: e.message };
        }
      }

      return {
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        category: doc.category,
        source: doc.source,
        sourceSubmissionId: doc.sourceSubmissionId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        dataType,
        dataSize,
        dataPreview,
      };
    });

    return NextResponse.json({
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        clinicId: patient.clinicId,
      },
      documentsCount: documents.length,
      documents: docsWithParsedData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Database error', message: error.message }, { status: 500 });
  }
}
