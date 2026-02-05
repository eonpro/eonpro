import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { retrieveFile, deleteFile } from '@/lib/storage/secure-storage';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { isS3Enabled, STORAGE_CONFIG } from '@/lib/integrations/aws/s3Config';
import { downloadFromS3, deleteFromS3 } from '@/lib/integrations/aws/s3Service';

// GET /api/patients/[id]/documents/[documentId] - Serve document securely
export const GET = withAuthParams(async (
  request: NextRequest,
  user: any,
  context: { params: Promise<{ id: string; documentId: string }> }
) => {
  try {
    const params = await context.params;
    const patientId = parseInt(params.id);
    const documentId = parseInt(params.documentId);

    if (isNaN(patientId) || isNaN(documentId)) {
      return NextResponse.json(
        { error: 'Invalid patient or document ID' },
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
    
    // SECURITY: Patients can only access their own documents
    // Verify patient ownership via user.patientId
    if (user.role === 'patient') {
      const userPatientId = user.patientId;
      if (!userPatientId || patient.id !== userPatientId) {
        logger.security('Patient attempted to access another patient\'s document', {
          userId: user.id,
          userPatientId,
          requestedPatientId: patient.id,
          documentId,
        });
        return NextResponse.json(
          { error: 'Access denied - you can only access your own documents' },
          { status: 403 }
        );
      }
    }
    
    // Check clinic access for non-patient roles
    if (user.role !== 'patient' && user.clinicId && patient.clinicId !== user.clinicId) {
      logger.security('Cross-clinic document access attempt', {
        userId: user.id,
        userClinicId: user.clinicId,
        patientClinicId: patient.clinicId,
        documentId,
      });
      return NextResponse.json(
        { error: 'Patient not in your clinic' },
        { status: 403 }
      );
    }
    
    // HIPAA Audit: Log document access
    try {
      await auditLog(request, {
        eventType: AuditEventType.DOCUMENT_VIEW,
        userId: user.id,
        userRole: user.role,
        patientId,
        resourceType: 'PatientDocument',
        resourceId: documentId.toString(),
        clinicId: patient.clinicId,
        action: 'view_document',
        outcome: 'SUCCESS',
        metadata: {
          accessMethod: 'api',
        },
      });
    } catch (auditError) {
      // Log but don't fail the request for audit errors
      logger.error('Failed to create HIPAA audit log', { error: auditError });
    }

    // Log document access
    logger.api('GET', `/api/patients/${patientId}/documents/${documentId}`, {
      userId: user.id,
      userRole: user.role,
      patientId,
      documentId
    });

    // Fetch the document - just check it belongs to the patient
    // The patient access check above already ensures the user has permission
    const document: any = await prisma.patientDocument.findFirst({
      where: {
        id: documentId,
        patientId: patientId,
      },
    });

    if (!document) {
      logger.warn(`Document ${documentId} not found for patient ${patientId}`);
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    logger.debug(`Found document ${documentId}: externalUrl=${document.externalUrl}, hasData=${!!document.data}, hasIntakeData=${!!document.intakeData}, mimeType=${document.mimeType}`);

    // Helper to convert data field to Buffer
    const toBuffer = (data: any): Buffer | null => {
      if (!data) return null;
      if (Buffer.isBuffer(data)) return data;
      if (typeof data === 'object' && 'type' in data && data.type === 'Buffer') {
        return Buffer.from(data.data);
      }
      if (ArrayBuffer.isView(data)) return Buffer.from(data as Uint8Array);
      return Buffer.from(data);
    };

    // Helper to check if buffer is a PDF
    const isPdfBuffer = (buffer: Buffer): boolean => {
      if (buffer.length < 4) return false;
      // Check for %PDF magic bytes
      return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    };

    // PRIORITY 1: Serve from database 'data' field (preferred for PDFs)
    if (document.data) {
      const buffer = toBuffer(document.data);
      
      if (buffer && buffer.length > 0) {
        // Check if it's a PDF
        if (isPdfBuffer(buffer)) {
          logger.debug(`Serving PDF from database for document ${documentId}, size: ${buffer.length} bytes`);
          
          return new NextResponse(new Uint8Array(buffer), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${document.filename || 'document.pdf'}"`,
              'Content-Length': buffer.length.toString(),
              'X-Content-Type-Options': 'nosniff',
              'Cache-Control': 'private, max-age=3600',
            },
          });
        }
        
        // For other binary files (images, etc.)
        if (document.mimeType && !document.mimeType.includes('json')) {
          logger.debug(`Serving binary file from database for document ${documentId}, mimeType: ${document.mimeType}`);
          
          return new NextResponse(new Uint8Array(buffer), {
            headers: {
              'Content-Type': document.mimeType,
              'Content-Disposition': `inline; filename="${document.filename || 'document'}"`,
              'Content-Length': buffer.length.toString(),
              'X-Content-Type-Options': 'nosniff',
              'Cache-Control': 'private, max-age=3600',
            },
          });
        }
        
        // If data looks like JSON, this is a legacy document that needs PDF regeneration
        const firstChar = buffer.toString('utf8', 0, 1);
        if (firstChar === '{' || firstChar === '[') {
          logger.warn(`Document ${documentId} has JSON in data field (legacy). PDF needs regeneration.`);
          return NextResponse.json(
            { 
              error: 'This document was created before PDF storage was implemented. Use the regenerate endpoint to create the PDF.',
              documentId,
              needsRegeneration: true
            },
            { status: 404 }
          );
        }
      }
    }

    // PRIORITY 2: Try external URL (S3, secure storage) as fallback
    if (document.externalUrl && !document.externalUrl.startsWith('database://')) {
      try {
        logger.debug(`Attempting to retrieve from external URL: ${document.externalUrl}`);
        const file = await retrieveFile(document.externalUrl, patientId);
        
        return new NextResponse(new Uint8Array(file.data), {
          headers: {
            'Content-Type': file.mimeType || document.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${document.filename || 'document'}"`,
            'Content-Length': file.data.length.toString(),
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          },
        });
      } catch (error: any) {
        logger.error('Error retrieving from external storage:', error);
      }
    }

    // No valid document source found
    logger.warn(`Document ${documentId} has no servable content. externalUrl: ${document.externalUrl}, dataSize: ${document.data?.length || 0}`);
    return NextResponse.json(
      { 
        error: 'Document file not available. PDF may need to be regenerated.',
        documentId,
        hasIntakeData: !!document.intakeData,
        needsRegeneration: !!document.intakeData
      },
      { status: 404 }
    );
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error serving document:', error);
    return NextResponse.json(
      { error: `Failed to serve document: ${errorMessage}` },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin', 'provider', 'patient'] });

export const DELETE = withAuthParams(async (
  request: NextRequest,
  user: any,
  context: { params: Promise<{ id: string; documentId: string }> }
) => {
  try {
    const params = await context.params;
    const patientId = parseInt(params.id);
    const documentId = parseInt(params.documentId);

    if (isNaN(patientId) || isNaN(documentId)) {
      return NextResponse.json(
        { error: 'Invalid patient or document ID' },
        { status: 400 }
      );
    }
    
    // Only providers and admins can delete documents
    if (user.role === 'patient') {
      return NextResponse.json(
        { error: 'Patients cannot delete documents' },
        { status: 403 }
      );
    }
    
    // Check patient and clinic access
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
    
    if (user.clinicId && patient.clinicId !== user.clinicId) {
      return NextResponse.json(
        { error: 'Patient not in your clinic' },
        { status: 403 }
      );
    }
    
    // Log deletion for audit
    logger.api('DELETE', `/api/patients/${patientId}/documents/${documentId}`, {
      userId: user.id,
      userRole: user.role,
      patientId,
      documentId
    });

    // Fetch the document to get the file path
    const document: any = await prisma.patientDocument.findFirst({
      where: {
        id: documentId,
        patientId: patientId,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Delete the file from secure storage
    if (document.externalUrl) {
      try {
        await deleteFile(document.externalUrl, patientId);
      } catch (error: any) {
        logger.error('Error deleting file from secure storage:', error);
        // Continue even if file deletion fails
      }
    }

    // Delete the document record from database
    await prisma.patientDocument.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error deleting document:', error);
    return NextResponse.json(
      { error: `Failed to delete document: ${errorMessage}` },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin', 'provider'] });
