/**
 * Admin/Provider: upload Quest bloodwork PDF for a patient.
 * Rate limited; errors return structured codes (parse vs storage vs validation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { createBloodworkReportFromPdf } from '@/lib/bloodwork/service';
import { logPHICreate } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

const bloodworkUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many uploads. Please try again in 15 minutes.',
});

type Params = { params: Promise<{ id: string }> };

async function postHandler(
  req: NextRequest,
  user: { id: number; role: string; clinicId?: number | null },
  { params }: Params
) {
  const { id } = await params;
  const patientId = parseInt(id, 10);
  if (isNaN(patientId)) {
    return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, clinicId: true },
  });
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }
  if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (formErr) {
    return NextResponse.json(
      { error: 'Invalid request body. Use multipart/form-data with a "file" field containing the PDF.' },
      { status: 400 }
    );
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: 'No PDF file provided. Upload a file using the "file" field (multipart/form-data).' },
      { status: 400 }
    );
  }

  const isPdfByType = file.type === 'application/pdf';
  const isPdfByName = (file.name || '').toLowerCase().endsWith('.pdf');
  if (!isPdfByType && !isPdfByName) {
    return NextResponse.json(
      { error: 'File must be a PDF (Quest Diagnostics lab report)' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be under 15MB' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = isPdfByType ? file.type : 'application/pdf';
  const filename = file.name?.trim() || 'quest-lab-report.pdf';

  try {
    const result = await createBloodworkReportFromPdf({
      patientId: patient.id,
      clinicId: patient.clinicId,
      pdfBuffer: buffer,
      filename,
      mimeType,
      uploadedByUserId: user.id,
    });
    try {
      await logPHICreate(req, { id: user.id, role: user.role, clinicId: user.clinicId }, 'LabReport', result.labReportId, patient.id, {
        documentId: result.documentId,
        resultCount: result.resultCount,
      });
    } catch (auditErr) {
      logger.warn('Bloodwork upload PHI audit log failed', {
        patientId,
        labReportId: result.labReportId,
        error: auditErr instanceof Error ? auditErr.message : 'Unknown',
      });
    }
    return NextResponse.json(
      {
        success: true,
        labReportId: result.labReportId,
        documentId: result.documentId,
        resultCount: result.resultCount,
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('Bloodwork upload failed', {
      route: 'POST /api/patients/[id]/bloodwork/upload',
      userId: user.id,
      patientId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return handleApiError(err, {
      route: 'POST /api/patients/[id]/bloodwork/upload',
      context: { userId: user.id, patientId },
    });
  }
}

const authHandler = withAuthParams(postHandler, {
  roles: ['admin', 'provider', 'staff', 'super_admin'],
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return bloodworkUploadRateLimit((r: NextRequest) => authHandler(r, context))(req);
}
