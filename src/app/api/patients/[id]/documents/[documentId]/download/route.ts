import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { retrieveFile } from '@/lib/storage/secure-storage';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/domains/shared/errors';

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
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
};

type Params = {
  params: Promise<{ id: string; documentId: string }>;
};

const downloadDocumentHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id);
      const documentId = parseInt(resolvedParams.documentId);

      if (isNaN(patientId) || isNaN(documentId)) {
        throw new BadRequestError('Invalid patient or document ID');
      }

      // Authorization: patients can only download their own documents
      if (user.role === 'patient' && user.patientId !== patientId) {
        await auditLog(request, {
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          clinicId: user.clinicId,
          eventType: AuditEventType.PHI_VIEW,
          resourceType: 'PatientDocument',
          resourceId: documentId,
          action: 'DOWNLOAD_DENIED',
          outcome: 'FAILURE',
          reason: 'Patient attempted to access another patient document',
        });
        throw new ForbiddenError('Access denied');
      }

      // HIPAA Audit: Log document access
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.DOCUMENT_VIEW,
        resourceType: 'PatientDocument',
        resourceId: documentId,
        patientId: patientId,
        action: 'DOWNLOAD',
        outcome: 'SUCCESS',
      });

      // Fetch the document
      // Use explicit select to avoid referencing columns not yet in production (e.g. s3DataKey)
      const document: any = await prisma.patientDocument.findFirst({
        where: {
          id: documentId,
          patientId: patientId,
        },
        select: {
          id: true,
          patientId: true,
          filename: true,
          mimeType: true,
          category: true,
          data: true,
          externalUrl: true,
        },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      logger.debug(
        `Download request for document ${documentId}, hasData: ${!!document.data}, externalUrl: ${document.externalUrl}`
      );

      // PRIORITY 1: Serve from database 'data' field (preferred for PDFs)
      if (document.data) {
        const buffer = toBuffer(document.data);

        if (buffer && buffer.length > 0) {
          // Check if it's a PDF or other binary
          if (isPdfBuffer(buffer) || (document.mimeType && !document.mimeType.includes('json'))) {
            logger.debug(
              `Serving download from database for document ${documentId}, size: ${buffer.length} bytes`
            );

            return new NextResponse(new Uint8Array(buffer), {
              headers: {
                'Content-Type': document.mimeType || 'application/pdf',
                'Content-Disposition': `attachment; filename="${document.filename || 'document.pdf'}"`,
                'Content-Length': buffer.length.toString(),
              },
            });
          }

          // If data looks like JSON, this is a legacy document
          const firstChar = buffer.toString('utf8', 0, 1);
          if (firstChar === '{' || firstChar === '[') {
            logger.warn(
              `Document ${documentId} has JSON in data field (legacy). PDF needs regeneration.`
            );
            return NextResponse.json(
              {
                error: 'This document needs PDF regeneration.',
                documentId,
                needsRegeneration: true,
              },
              { status: 404 }
            );
          }
        }
      }

      // PRIORITY 2: Try external URL (S3, secure storage)
      if (document.externalUrl && !document.externalUrl.startsWith('database://')) {
        try {
          logger.debug(`Attempting download from external URL: ${document.externalUrl}`);
          const file = await retrieveFile(document.externalUrl, patientId);

          return new NextResponse(new Uint8Array(file.data), {
            headers: {
              'Content-Type': file.mimeType || document.mimeType || 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${document.filename || 'document'}"`,
              'Content-Length': file.data.length.toString(),
            },
          });
        } catch (error: any) {
          logger.error('Error retrieving from external storage:', error);
        }
      }

      return NextResponse.json(
        {
          error: 'PDF document not available. File may need to be regenerated.',
          documentId,
          needsRegeneration: !!document.intakeData,
        },
        { status: 404 }
      );
    } catch (error: unknown) {
      return handleApiError(error, { route: 'GET /api/patients/[id]/documents/[documentId]/download' });
    }
  }
);

export const GET = downloadDocumentHandler;
