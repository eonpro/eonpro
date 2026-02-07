/**
 * Admin/Provider: upload Quest bloodwork PDF for a patient.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { createBloodworkReportFromPdf } from '@/lib/bloodwork/service';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

type Params = { params: Promise<{ id: string }> };

export const POST = withAuthParams(async (req: NextRequest, user, { params }: Params) => {
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

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF (Quest Diagnostics lab report)' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be under 15MB' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await createBloodworkReportFromPdf({
      patientId: patient.id,
      clinicId: patient.clinicId,
      pdfBuffer: buffer,
      filename: file.name || 'quest-lab-report.pdf',
      mimeType: file.type,
      uploadedByUserId: user.id,
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
    const message = err instanceof Error ? err.message : 'Upload failed';
    logger.error('Bloodwork upload failed', { userId: user.id, patientId, error: message });
    return NextResponse.json(
      { error: message.startsWith('Failed') ? message : 'Failed to process lab report.' },
      { status: 400 }
    );
  }
}, { roles: ['admin', 'provider', 'staff', 'super_admin'] });
