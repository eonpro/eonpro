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

    // If the document has data stored in the database, return it
    if (document.data) {
      let buffer: Buffer;
      
      if (Buffer.isBuffer(document.data)) {
        buffer = document.data;
      } else if (typeof document.data === 'object' && 'type' in document.data && document.data.type === 'Buffer') {
        // Handle Prisma's JSON representation of Buffer
        buffer = Buffer.from((document.data as any).data);
      } else {
        // Try to convert to buffer if it's in some other format
        buffer = Buffer.from(document.data as any);
      }

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': document.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${document.filename || 'document'}"`,
        },
      });
    }

    // If there's an external URL, redirect to it
    if (document.externalUrl) {
      return NextResponse.redirect(document.externalUrl);
    }

    return NextResponse.json(
      { error: 'Document content not available' },
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
