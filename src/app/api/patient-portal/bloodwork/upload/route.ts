/**
 * Patient portal: upload Quest bloodwork PDF and parse into lab report.
 * Patient can only upload for themselves (user.patientId).
 * Rate limited; errors return structured codes for ops (parse vs storage vs validation).
 * Uses Node runtime to support pdf-parse and native dependencies.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { createBloodworkReportFromPdf } from '@/lib/bloodwork/service';
import { logPHICreate } from '@/lib/audit/hipaa-audit';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { rateLimit } from '@/lib/rateLimit';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

const bloodworkUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many uploads. Please try again in 15 minutes.',
});

async function postHandler(req: NextRequest, user: { id: number; role: string; patientId?: number }) {
  if (!user.patientId) {
    return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Use multipart/form-data with a "file" field containing the PDF.' },
      { status: 400 }
    );
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'File must be a PDF (Quest Diagnostics lab report)' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be under 15MB' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const patient = await prisma.patient.findUnique({
    where: { id: user.patientId },
    select: { id: true, clinicId: true },
  });
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }
  if (patient.clinicId == null) {
    return NextResponse.json(
      { error: 'Your account must be assigned to a clinic before uploading lab reports.' },
      { status: 400 }
    );
  }

  try {
    const result = await createBloodworkReportFromPdf({
      patientId: patient.id,
      clinicId: patient.clinicId,
      pdfBuffer: buffer,
      filename: file.name || 'quest-lab-report.pdf',
      mimeType: file.type,
      uploadedByUserId: user.id,
    });
    await logPHICreate(req, { id: user.id, role: user.role, clinicId: patient.clinicId }, 'LabReport', result.labReportId, patient.id, {
      documentId: result.documentId,
      resultCount: result.resultCount,
    });
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
    return handleApiError(err, {
      route: 'POST /api/patient-portal/bloodwork/upload',
      context: { userId: user.id, patientId: user.patientId },
    });
  }
}

export const POST = bloodworkUploadRateLimit(withAuth(postHandler, { roles: ['patient'] }));
