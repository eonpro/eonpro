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

    // Fetch the document
    const document: any = await prisma.patientDocument.findFirst({
      where: {
        id: documentId,
        patientId: patientId,
        clinicId: patient.clinicId
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // For documents stored in database (indicated by database:// URL or data field exists)
    // Check data first since it's the primary storage for Vercel deployments
    if (document.data) {
      let buffer: Buffer;
      
      // Handle different data formats from Prisma
      if (Buffer.isBuffer(document.data)) {
        buffer = document.data;
      } else if (typeof document.data === 'object' && 'type' in document.data && document.data.type === 'Buffer') {
        // Handle Prisma's JSON representation of Buffer
        buffer = Buffer.from((document.data as { type: string; data: number[] }).data);
      } else if (ArrayBuffer.isView(document.data)) {
        // Handle Uint8Array or similar
        buffer = Buffer.from(document.data as Uint8Array);
      } else {
        // Last resort - try to convert whatever it is
        buffer = Buffer.from(document.data as any);
      }
      
      logger.debug(`Serving document ${documentId} from database, size: ${buffer.length} bytes`);
      
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': document.mimeType || 'application/pdf',
          'Content-Disposition': `inline; filename="${document.filename || 'document.pdf'}"`,
          'Content-Length': buffer.length.toString(),
          // Security headers
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // Retrieve file from secure/external storage (non-database URLs)
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
        logger.error('Error retrieving secure file:', error);
        return NextResponse.json(
          { error: 'Document file not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Document has no associated file' },
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
}, { roles: ['admin', 'provider', 'patient'] });

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
        clinicId: patient.clinicId
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
}, { roles: ['admin', 'provider'] });
