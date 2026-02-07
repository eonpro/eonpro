/**
 * Patient portal: upload Quest bloodwork PDF and parse into lab report.
 * Patient can only upload for themselves (user.patientId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { createBloodworkReportFromPdf } from '@/lib/bloodwork/service';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
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

    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { id: true, clinicId: true },
    });
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const result = await createBloodworkReportFromPdf({
      patientId: patient.id,
      clinicId: patient.clinicId,
      pdfBuffer: buffer,
      filename: file.name || 'quest-lab-report.pdf',
      mimeType: file.type,
      uploadedByUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      labReportId: result.labReportId,
      documentId: result.documentId,
      resultCount: result.resultCount,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    logger.error('Bloodwork upload failed', { userId: user.id, patientId: user.patientId, error: message });
    return NextResponse.json(
      { error: message.startsWith('Failed') ? message : 'Failed to process lab report. Please ensure the file is a valid Quest Diagnostics PDF.' },
      { status: 400 }
    );
  }
}, { roles: ['patient'] });
