import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { retrieveFile, deleteFile } from '@/lib/storage/secure-storage';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { isS3Enabled, STORAGE_CONFIG } from '@/lib/integrations/aws/s3Config';
import { downloadFromS3, deleteFromS3 } from '@/lib/integrations/aws/s3Service';

// Helper to create safe Content-Disposition header value
function getSafeContentDisposition(filename: string, defaultName: string = 'document'): string {
  const name = filename || defaultName;
  // Remove non-ASCII characters for the basic filename
  const safeFilename = name.replace(/[^\x20-\x7E]/g, '_');
  // URL-encode the full filename for UTF-8 support
  const encodedFilename = encodeURIComponent(name);
  return `inline; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;
}

// GET /api/patients/[id]/documents/[documentId] - Serve document securely
export const GET = withAuthParams(
  async (
    request: NextRequest,
    user: any,
    context: { params: Promise<{ id: string; documentId: string }> }
  ) => {
    try {
      const params = await context.params;
      const patientId = parseInt(params.id);
      const documentId = parseInt(params.documentId);

      if (isNaN(patientId) || isNaN(documentId)) {
        return NextResponse.json({ error: 'Invalid patient or document ID' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      const tenant404 = ensureTenantResource(patient, clinicId);
      if (tenant404) return tenant404;
      if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      if (user.role === 'patient' && (!user.patientId || patient.id !== user.patientId)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
        documentId,
      });

      const document: any = await prisma.patientDocument.findFirst({
        where: {
          id: documentId,
          patientId: patientId,
        },
        select: {
          id: true,
          patientId: true,
          clinicId: true,
          filename: true,
          mimeType: true,
          category: true,
          createdAt: true,
          data: true,
          s3DataKey: true,
          externalUrl: true,
          source: true,
          sourceSubmissionId: true,
        },
      });

      if (!document) return tenantNotFoundResponse();

      logger.debug(
        `Found document ${documentId}: externalUrl=${document.externalUrl}, hasData=${!!document.data}, mimeType=${document.mimeType}`
      );

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
            logger.debug(
              `Serving PDF from database for document ${documentId}, size: ${buffer.length} bytes`
            );

            return new NextResponse(new Uint8Array(buffer), {
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': getSafeContentDisposition(document.filename, 'document.pdf'),
                'Content-Length': buffer.length.toString(),
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, max-age=3600',
              },
            });
          }

          // For other binary files (images, etc.)
          if (document.mimeType && !document.mimeType.includes('json')) {
            logger.debug(
              `Serving binary file from database for document ${documentId}, mimeType: ${document.mimeType}`
            );

            return new NextResponse(new Uint8Array(buffer), {
              headers: {
                'Content-Type': document.mimeType,
                'Content-Disposition': getSafeContentDisposition(document.filename, 'document'),
                'Content-Length': buffer.length.toString(),
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, max-age=3600',
              },
            });
          }

          // If data looks like JSON, this is a legacy document that needs PDF regeneration
          const firstChar = buffer.toString('utf8', 0, 1);
          if (firstChar === '{' || firstChar === '[') {
            logger.warn(
              `Document ${documentId} has JSON in data field (legacy). PDF needs regeneration.`
            );
            return NextResponse.json(
              {
                error:
                  'This document was created before PDF storage was implemented. Use the regenerate endpoint to create the PDF.',
                documentId,
                needsRegeneration: true,
              },
              { status: 404 }
            );
          }
        }
      }

      // PRIORITY 2: Try external URL (S3, secure storage) as fallback
      if (document.externalUrl && !document.externalUrl.startsWith('database://')) {
        try {
          logger.info(`Attempting to retrieve document from: ${document.externalUrl}`);

          let fileData: Buffer;
          let fileMimeType: string | undefined;

          // Check if this is an S3 key - look for common S3 path patterns
          const isS3Key =
            document.externalUrl.startsWith('patients/') ||
            document.externalUrl.startsWith(STORAGE_CONFIG.PATHS.PATIENTS + '/') ||
            document.externalUrl.match(/^[a-z-]+\/\d+\/[a-z-]+\//) !== null;

          if (isS3Enabled() && isS3Key) {
            // Download from S3
            logger.info(`Downloading from S3 with key: ${document.externalUrl}`);
            try {
              fileData = await downloadFromS3(document.externalUrl);
              fileMimeType = document.mimeType;
              logger.info(`Successfully downloaded ${fileData.length} bytes from S3`);
            } catch (s3Error: any) {
              logger.error('S3 download failed:', {
                error: s3Error.message,
                key: document.externalUrl,
              });
              return NextResponse.json(
                { error: `Failed to retrieve document from storage: ${s3Error.message}` },
                { status: 500 }
              );
            }
          } else {
            // Local secure storage
            const file = await retrieveFile(document.externalUrl, patientId);
            fileData = file.data;
            fileMimeType = file.mimeType || document.mimeType;
          }

          return new NextResponse(new Uint8Array(fileData), {
            headers: {
              'Content-Type': fileMimeType || 'application/octet-stream',
              'Content-Disposition': getSafeContentDisposition(document.filename, 'document'),
              'Content-Length': fileData.length.toString(),
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
            },
          });
        } catch (error: any) {
          logger.error('Error retrieving from external storage:', {
            error: error.message,
            externalUrl: document.externalUrl,
          });
          return NextResponse.json(
            { error: `Failed to retrieve document: ${error.message}` },
            { status: 500 }
          );
        }
      }

      // No valid document source found — check if legacy JSON data exists that could be regenerated
      const hasLegacyData = document.data && (() => {
        const buf = document.data;
        if (!buf || (Buffer.isBuffer(buf) && buf.length === 0)) return false;
        const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        if (raw.length === 0) return false;
        const ch = raw.toString('utf8', 0, 1);
        return ch === '{' || ch === '[';
      })();

      logger.warn(
        `Document ${documentId} has no servable content. externalUrl: ${document.externalUrl}, dataSize: ${document.data?.length || 0}`
      );
      return NextResponse.json(
        {
          error: 'Document file not available. PDF may need to be regenerated.',
          documentId,
          needsRegeneration: hasLegacyData,
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
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff', 'patient'] }
);

export const DELETE = withAuthParams(
  async (
    request: NextRequest,
    user: any,
    context: { params: Promise<{ id: string; documentId: string }> }
  ) => {
    try {
      const params = await context.params;
      const patientId = parseInt(params.id);
      const documentId = parseInt(params.documentId);

      if (isNaN(patientId) || isNaN(documentId)) {
        return NextResponse.json({ error: 'Invalid patient or document ID' }, { status: 400 });
      }

      // Only providers and admins can delete documents
      if (user.role === 'patient') {
        return NextResponse.json({ error: 'Patients cannot delete documents' }, { status: 403 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicIdDel = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicIdDel)) return tenantNotFoundResponse();

      // Log deletion for audit
      logger.api('DELETE', `/api/patients/${patientId}/documents/${documentId}`, {
        userId: user.id,
        userRole: user.role,
        patientId,
        documentId,
      });

      // Fetch the document to get the file path
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
          externalUrl: true,
          data: true,
        },
      });

      if (!document) return tenantNotFoundResponse();

      // Delete the file from storage (S3 or local)
      if (document.externalUrl) {
        try {
          // Check if this is an S3 key
          const isS3Key =
            document.externalUrl.startsWith(STORAGE_CONFIG.PATHS.PATIENTS + '/') ||
            document.externalUrl.startsWith('patients/') ||
            document.externalUrl.includes('/medical-records/') ||
            document.externalUrl.includes('/lab-results/') ||
            document.externalUrl.includes('/prescriptions/') ||
            document.externalUrl.includes('/other/');

          if (isS3Enabled() && isS3Key) {
            await deleteFromS3(document.externalUrl);
            logger.info('Deleted file from S3', { s3Key: document.externalUrl, documentId });
          } else {
            await deleteFile(document.externalUrl, patientId);
          }
        } catch (error: any) {
          logger.error('Error deleting file from storage:', error);
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
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff'] }
);
