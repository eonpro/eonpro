import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const resolvedParams = await params;
    const patientId = parseInt(resolvedParams.id);
    const documentId = parseInt(resolvedParams.documentId);

    if (isNaN(patientId) || isNaN(documentId)) {
      return NextResponse.json(
        { error: 'Invalid patient or document ID' },
        { status: 400 }
      );
    }

    // Fetch the document
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

    // PRIORITY 1: If there's a valid external URL (S3), redirect to it
    if (document.externalUrl && !document.externalUrl.startsWith('database://')) {
      return NextResponse.redirect(document.externalUrl);
    }

    // PRIORITY 2: If the document has PDF data stored in the database, return it
    if (document.data) {
      let buffer: Buffer;
      
      if (Buffer.isBuffer(document.data)) {
        buffer = document.data;
      } else if (typeof document.data === 'object' && 'type' in document.data && document.data.type === 'Buffer') {
        buffer = Buffer.from((document.data as any).data);
      } else {
        buffer = Buffer.from(document.data as any);
      }

      // Check if this looks like a PDF vs JSON
      const isPdf = buffer.length > 4 && 
        (buffer.toString('utf8', 0, 4) === '%PDF' || 
         (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46));
      const looksLikeJson = buffer.length > 0 && 
        (buffer[0] === 0x7B || buffer.toString('utf8', 0, 1) === '{');

      if (isPdf && !looksLikeJson) {
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': document.mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${document.filename || 'document'}"`,
          },
        });
      }
    }

    return NextResponse.json(
      { error: 'PDF document not available. File may need to be regenerated.' },
      { status: 404 }
    );
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error downloading document:', error);
    return NextResponse.json(
      { error: `Failed to download document: ${errorMessage}` },
      { status: 500 }
    );
  }
}
