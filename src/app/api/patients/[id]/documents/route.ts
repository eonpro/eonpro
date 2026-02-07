import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { PatientDocumentCategory } from '@prisma/client';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { storeFile, isAllowedFileType } from '@/lib/storage/secure-storage';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';

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
    // Always use the API route for viewing documents to ensure proper authentication
    const formattedDocuments = documents.map((doc: any) => ({
      id: doc.id,
      filename: doc.filename || 'Untitled Document',
      category: doc.category || 'other',
      mimeType: doc.mimeType || 'application/octet-stream',
      uploadedAt: doc.createdAt.toISOString(),
      // Use the API route URL for proper authentication and serving from database
      url: `/api/patients/${patientId}/documents/${doc.id}`,
      downloadUrl: `/api/patients/${patientId}/documents/${doc.id}/download`,
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
}, { roles: ['admin', 'provider', 'staff', 'patient'] });

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
    const categoryRaw = formData.get('category') as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Map frontend category values to Prisma enum format
    const categoryToPrismaEnum: Record<string, PatientDocumentCategory> = {
      'medical-records': PatientDocumentCategory.MEDICAL_RECORDS,
      'lab-results': PatientDocumentCategory.LAB_RESULTS,
      'prescriptions': PatientDocumentCategory.PRESCRIPTIONS,
      'imaging': PatientDocumentCategory.IMAGING,
      'insurance': PatientDocumentCategory.INSURANCE,
      'consent-forms': PatientDocumentCategory.CONSENT_FORMS,
      'intake-forms': PatientDocumentCategory.MEDICAL_INTAKE_FORM,
      'other': PatientDocumentCategory.OTHER,
      // Also support uppercase format
      'MEDICAL_RECORDS': PatientDocumentCategory.MEDICAL_RECORDS,
      'LAB_RESULTS': PatientDocumentCategory.LAB_RESULTS,
      'PRESCRIPTIONS': PatientDocumentCategory.PRESCRIPTIONS,
      'IMAGING': PatientDocumentCategory.IMAGING,
      'INSURANCE': PatientDocumentCategory.INSURANCE,
      'CONSENT_FORMS': PatientDocumentCategory.CONSENT_FORMS,
      'INTAKE_FORMS': PatientDocumentCategory.MEDICAL_INTAKE_FORM,
      'OTHER': PatientDocumentCategory.OTHER,
    };

    // Normalize category to Prisma enum
    const category = categoryToPrismaEnum[categoryRaw] || PatientDocumentCategory.OTHER;

    const uploadedDocuments: { id: number; filename: string; category: string; mimeType: string; uploadedAt: string; size: number; url: string }[] = [];

    // Map category string/enum to FileCategory for S3 (Prisma enum values are strings at runtime)
    const categoryToFileCategory: Record<string, FileCategory> = {
      'MEDICAL_RECORDS': FileCategory.MEDICAL_RECORDS,
      'LAB_RESULTS': FileCategory.LAB_RESULTS,
      'PRESCRIPTIONS': FileCategory.PRESCRIPTIONS,
      'IMAGING': FileCategory.IMAGING,
      'INSURANCE': FileCategory.INSURANCE,
      'CONSENT_FORMS': FileCategory.CONSENT_FORMS,
      'MEDICAL_INTAKE_FORM': FileCategory.INTAKE_FORMS,
      'INTAKE_FORMS': FileCategory.INTAKE_FORMS,
      'OTHER': FileCategory.OTHER,
    };

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
      
      let storagePath: string;
      let fileSize: number;

      // Use S3 for storage (required in production due to read-only filesystem)
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

      if (isS3Enabled()) {
        // Upload to S3 - use the category enum value as the S3 category (enum is string at runtime)
        const categoryKey = typeof category === 'string' ? category : String(category);
        const s3Category = categoryToFileCategory[categoryKey] || FileCategory.OTHER;
        const s3Result = await uploadToS3({
          file: buffer,
          fileName: file.name,
          category: s3Category,
          patientId,
          metadata: {
            clinicId: patient.clinicId?.toString() || '',
            uploadedBy: user.id.toString(),
          },
          contentType: file.type || 'application/octet-stream',
        });

        // Store S3 key as the path
        storagePath = s3Result.key;
        fileSize = s3Result.size;

        logger.info('Document uploaded to S3', {
          patientId,
          s3Key: s3Result.key,
          clinicId: patient.clinicId,
        });
      } else if (isProduction) {
        // In production without S3, document upload is not supported
        logger.error('Document upload attempted in production without S3 configured', {
          patientId,
          clinicId: patient.clinicId,
          userId: user.id,
        });
        return NextResponse.json(
          {
            error: 'Document upload is not available. Please contact support to enable cloud storage.',
            code: 'STORAGE_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      } else {
        // Development only: use local storage
        const storedFile = await storeFile(
          buffer,
          file.name,
          category.toLowerCase().replace('_', '-'),
          {
            patientId,
            clinicId: patient.clinicId || undefined,
            uploadedBy: user.id,
            mimeType: file.type || 'application/octet-stream'
          }
        );
        storagePath = storedFile.path;
        fileSize = storedFile.size;
      }
      
      // Save document record to database
      const document = await prisma.patientDocument.create({
        data: {
          patientId,
          clinicId: patient.clinicId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          category: category,
          source: 'upload',
          // Store the S3 key or local path
          externalUrl: storagePath,
        },
      });

      uploadedDocuments.push({
        id: document.id,
        filename: document.filename || 'Untitled Document',
        category: document.category,
        mimeType: document.mimeType || 'application/octet-stream',
        uploadedAt: document.createdAt.toISOString(),
        size: fileSize,
        // Don't expose the actual file path to the client
        url: `/api/patients/${patientId}/documents/${document.id}`,
      });
    }

    return NextResponse.json(uploadedDocuments);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error uploading documents', {
      userId: user?.id,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Storage/S3 failures: return 503 so UI can show "storage unavailable" and suggest Bloodwork upload for lab PDFs
    const isStorageError =
      /storage|S3|upload failed|not configured|credentials|bucket/i.test(errorMessage) ||
      (error?.name && /NetworkError|TimeoutError/i.test(error.name));
    const status = isStorageError ? 503 : 500;
    const body: { error: string; code?: string } = {
      error: isStorageError
        ? 'Document storage is temporarily unavailable. For lab results, use the "Bloodwork (Quest)" upload above.'
        : `Failed to upload documents: ${errorMessage}`,
    };
    if (isStorageError) body.code = 'STORAGE_UNAVAILABLE';
    return NextResponse.json(body, { status });
  }
}, { roles: ['admin', 'provider', 'staff'] });