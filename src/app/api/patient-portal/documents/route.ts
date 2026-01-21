/**
 * Patient Portal - Document Upload API
 *
 * Allows patients to upload documents to their profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { PatientDocumentCategory } from '@prisma/client';

const uploadDocumentSchema = z.object({
  patientId: z.number(),
  filename: z.string().min(1),
  mimeType: z.string(),
  category: z.enum([
    'MEDICAL_INTAKE_FORM',
    'MEDICAL_RECORDS',
    'LAB_RESULTS',
    'INSURANCE',
    'CONSENT_FORMS',
    'PRESCRIPTIONS',
    'IMAGING',
    'OTHER',
  ]),
  data: z.string().optional(), // Base64 encoded data
  externalUrl: z.string().url().optional(),
});

/**
 * GET /api/patient-portal/documents
 * Get patient's documents
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const category = searchParams.get('category');

    // For patient role, only allow access to their own documents
    let patientIdToQuery: number;
    if (user.role === 'patient') {
      if (!user.patientId) {
        return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
      }
      patientIdToQuery = user.patientId;
    } else if (patientId) {
      patientIdToQuery = parseInt(patientId);
    } else {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    const where: any = { patientId: patientIdToQuery };
    if (category) {
      where.category = category as PatientDocumentCategory;
    }

    const documents = await prisma.patientDocument.findMany({
      where,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        category: true,
        source: true,
        createdAt: true,
        // Don't return the actual data for listing
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    logger.error('Failed to fetch patient documents', { error });
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
});

/**
 * POST /api/patient-portal/documents
 * Upload a new document
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const parsed = uploadDocumentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // For patient role, only allow upload to their own profile
    let patientId = parsed.data.patientId;
    if (user.role === 'patient') {
      if (!user.patientId) {
        return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
      }
      patientId = user.patientId;
    }

    // Verify patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Validate file size (if base64 data provided)
    if (parsed.data.data) {
      const sizeInBytes = Buffer.from(parsed.data.data, 'base64').length;
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (sizeInBytes > maxSize) {
        return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
      }
    }

    // Create document record
    const document = await prisma.patientDocument.create({
      data: {
        patientId,
        clinicId: patient.clinicId,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        category: parsed.data.category as PatientDocumentCategory,
        source: 'patient_upload',
        data: parsed.data.data ? Buffer.from(parsed.data.data, 'base64') : null,
        externalUrl: parsed.data.externalUrl,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        category: true,
        createdAt: true,
      },
    });

    logger.info('Patient document uploaded', {
      documentId: document.id,
      patientId,
      category: parsed.data.category,
      uploadedBy: user.id,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    logger.error('Failed to upload document', { error });
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
});

/**
 * DELETE /api/patient-portal/documents
 * Delete a document (patients can only delete their own uploads)
 */
export const DELETE = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    // Get document
    const document = await prisma.patientDocument.findUnique({
      where: { id: parseInt(documentId) },
      select: { id: true, patientId: true, source: true },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // For patient role, only allow deletion of their own uploads
    if (user.role === 'patient') {
      if (document.patientId !== user.patientId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      if (document.source !== 'patient_upload') {
        return NextResponse.json(
          { error: 'You can only delete documents you uploaded' },
          { status: 403 }
        );
      }
    }

    await prisma.patientDocument.delete({
      where: { id: parseInt(documentId) },
    });

    logger.info('Patient document deleted', {
      documentId,
      deletedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete document', { error });
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
});
