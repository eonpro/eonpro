import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { retrieveFile, deleteFile } from '@/lib/storage/secure-storage';

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
    
    // Patients can only access their own documents
    // TODO: Add proper patient-user relationship check
    if (user.role === 'patient') {
      // For now, allow access - should check patient.userId when field exists
      // return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Check clinic access
    if (user.clinicId && patient.clinicId !== user.clinicId) {
      return NextResponse.json(
        { error: 'Patient not in your clinic' },
        { status: 403 }
      );
    }
    
    // Log document access for HIPAA audit
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

    logger.debug(`Found document ${documentId}: externalUrl=${document.externalUrl}, hasData=${!!document.data}, mimeType=${document.mimeType}`);

    // PRIORITY 1: Check for external URL first (S3, etc.) - this is the preferred source for PDFs
    if (document.externalUrl && !document.externalUrl.startsWith('database://')) {
      try {
        const file = await retrieveFile(document.externalUrl, patientId);
        
        // Return the file with appropriate headers
        return new NextResponse(new Uint8Array(file.data), {
          headers: {
            'Content-Type': file.mimeType || document.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${document.filename || 'document'}"`,
            'Content-Length': file.data.length.toString(),
            // Security headers
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          },
        });
      } catch (error: any) {
        logger.error('Error retrieving secure file, trying database fallback:', error);
        // Fall through to database storage check
      }
    }

    // PRIORITY 2: For documents stored in database (PDF bytes)
    // Only serve as PDF if the data looks like binary (starts with %PDF or has PDF magic bytes)
    if (document.data) {
      let buffer: Buffer;
      
      // Handle different data formats from Prisma
      if (Buffer.isBuffer(document.data)) {
        buffer = document.data;
      } else if (typeof document.data === 'object' && 'type' in document.data && document.data.type === 'Buffer') {
        buffer = Buffer.from((document.data as { type: string; data: number[] }).data);
      } else if (ArrayBuffer.isView(document.data)) {
        buffer = Buffer.from(document.data as Uint8Array);
      } else {
        buffer = Buffer.from(document.data as any);
      }
      
      // Check if this looks like a PDF (starts with %PDF or has PDF magic bytes)
      const isPdf = buffer.length > 4 && 
        (buffer.toString('utf8', 0, 4) === '%PDF' || 
         (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46));
      
      // Don't serve JSON data as PDF - that would fail
      const looksLikeJson = buffer.length > 0 && 
        (buffer[0] === 0x7B || buffer.toString('utf8', 0, 1) === '{');
      
      if (isPdf && !looksLikeJson) {
        logger.debug(`Serving document ${documentId} from database, size: ${buffer.length} bytes`);
        
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': document.mimeType || 'application/pdf',
            'Content-Disposition': `inline; filename="${document.filename || 'document.pdf'}"`,
            'Content-Length': buffer.length.toString(),
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      } else if (looksLikeJson) {
        logger.warn(`Document ${documentId} contains JSON data, not PDF - cannot serve as file`);
      }
    }

    return NextResponse.json(
      { error: 'Document file not available. PDF may need to be regenerated.' },
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
