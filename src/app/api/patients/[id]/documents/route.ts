import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { PatientDocumentCategory } from '@prisma/client';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { storeFile, isAllowedFileType } from '@/lib/storage/secure-storage';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

export const GET = withAuthParams(async (
  request: NextRequest,
  user: any,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const resolvedParams = await params;
    const patientId = parseInt(resolvedParams.id);

    if (isNaN(patientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }
    
    // Check patient access
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true }
    });
    
    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }
    
    // Patients can only access their own documents
    // Check if user is a patient and if their patientId matches
    if (user.role === 'patient' && user.patientId !== patientId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }
    
    // Check clinic access
    if (user.clinicId && patient.clinicId !== user.clinicId) {
      return NextResponse.json(
        { error: 'Patient not in your clinic' },
        { status: 403 }
      );
    }
    
    // Log access for audit
    logger.api('GET', `/api/patients/${patientId}/documents`, {
      userId: user.id,
      userRole: user.role,
      patientId
    });

    const documents = await prisma.patientDocument.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        category: true,
        mimeType: true,
        createdAt: true,
        externalUrl: true,
      },
    });

    // Transform the documents to match the frontend interface
    const formattedDocuments = documents.map((doc: any) => ({
      id: doc.id,
      filename: doc.filename || 'Untitled Document',
      category: doc.category || 'other',
      mimeType: doc.mimeType || 'application/octet-stream',
      uploadedAt: doc.createdAt.toISOString(),
      url: doc.externalUrl,
    }));

    return NextResponse.json(formattedDocuments);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: `Failed to fetch documents: ${errorMessage}` },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'provider', 'patient'] });

export const POST = withAuthParams(async (
  request: NextRequest,
  user: any,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const resolvedParams = await params;
    const patientId = parseInt(resolvedParams.id);

    if (isNaN(patientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }
    
    // Check patient access
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true }
    });
    
    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }
    
    // Only providers and admins can upload documents (patients can't upload their own)
    if (user.role === 'patient') {
      return NextResponse.json(
        { error: 'Patients cannot upload documents' },
        { status: 403 }
      );
    }
    
    // Check clinic access
    if (user.clinicId && patient.clinicId !== user.clinicId) {
      return NextResponse.json(
        { error: 'Patient not in your clinic' },
        { status: 403 }
      );
    }
    
    // Log upload for audit
    logger.api('POST', `/api/patients/${patientId}/documents`, {
      userId: user.id,
      userRole: user.role,
      patientId
    });

    // Parse the form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const category = formData.get('category') as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const uploadedDocuments = [];

    for (const file of files) {
      // Validate file type
      if (!isAllowedFileType(file.type)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.type}` },
          { status: 400 }
        );
      }
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Store file securely outside public directory
      const storedFile = await storeFile(
        buffer,
        file.name,
        category || 'general',
        {
          patientId,
          clinicId: patient.clinicId || undefined,
          uploadedBy: user.id,
          mimeType: file.type || 'application/octet-stream'
        }
      );
      
      // Save document record to database (no longer storing file data in DB)
      const document = await prisma.patientDocument.create({
        data: {
          patientId,
          clinicId: patient.clinicId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          category: (category as PatientDocumentCategory) || PatientDocumentCategory.OTHER,
          source: 'upload',
          // Store the secure path, not a public URL
          externalUrl: storedFile.path,
        },
      });

      uploadedDocuments.push({
        id: document.id,
        filename: document.filename || 'Untitled Document',
        category: document.category,
        mimeType: document.mimeType || 'application/octet-stream',
        uploadedAt: document.createdAt.toISOString(),
        size: storedFile.size,
        // Don't expose the actual file path to the client
        url: `/api/patients/${patientId}/documents/${document.id}`,
      });
    }

    return NextResponse.json(uploadedDocuments);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error uploading documents:', error);
    return NextResponse.json(
      { error: `Failed to upload documents: ${errorMessage}` },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'provider'] });