import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { 
  getSOAPNoteById,
  approveSOAPNote,
  lockSOAPNote,
  editApprovedSOAPNote,
  formatSOAPNote,
  approveSOAPNoteSchema,
  editSOAPNoteSchema,
} from '@/services/ai/soapNoteService';

/**
 * GET /api/soap-notes/[id] - Get a specific SOAP note
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(request.url);
    const includeRevisions = searchParams.get('includeRevisions') === 'true';
    const format = searchParams.get('format');
    
    const soapNoteId = parseInt(resolvedParams.id, 10);
    
    const soapNote = await getSOAPNoteById(soapNoteId, includeRevisions);
    
    if (format === 'text') {
      // Return formatted text version
      const formatted = formatSOAPNote(soapNote);
      return new NextResponse(formatted, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
    
    return NextResponse.json({
      ok: true,
      data: soapNote,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error fetching SOAP note:', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to fetch SOAP note' },
      { status: error.message === 'SOAP note not found' ? 404 : 500 }
    );
  }
}

/**
 * PATCH /api/soap-notes/[id] - Update a SOAP note (edit or approve)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const soapNoteId = parseInt(resolvedParams.id, 10);
    
    // Determine action type
    if (body.action === 'approve') {
      // Approve SOAP note
      const validated = approveSOAPNoteSchema.parse({
        ...body,
        soapNoteId,
      });
      
      const approved = await approveSOAPNote(
        soapNoteId,
        validated.providerId,
        validated.password
      );
      
      return NextResponse.json({
        ok: true,
        data: approved,
        message: 'SOAP note approved successfully',
      });
      
    } else if (body.action === 'lock') {
      // Lock SOAP note
      const locked = await lockSOAPNote(
        soapNoteId,
        body.providerId
      );
      
      return NextResponse.json({
        ok: true,
        data: locked,
        message: 'SOAP note locked successfully',
      });
      
    } else if (body.action === 'edit') {
      // Edit approved SOAP note
      const validated = editSOAPNoteSchema.parse({
        ...body,
        soapNoteId,
      });
      
      const edited = await editApprovedSOAPNote(
        soapNoteId,
        validated.password,
        validated.updates,
        body.editorEmail || 'unknown',
        validated.changeReason
      );
      
      return NextResponse.json({
        ok: true,
        data: edited,
        message: 'SOAP note updated successfully',
      });
      
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be approve, lock, or edit' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // @ts-ignore
   
    logger.error('[API] Error updating SOAP note:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    if (errorMessage === 'Invalid password') {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to update SOAP note' },
      { status: 500 }
    );
  }
}
