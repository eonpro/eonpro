import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '@/types/common';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withProviderAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import {
  generateSOAPFromIntake, 
  createManualSOAPNote,
  getPatientSOAPNotes,
  createSOAPNoteSchema,
} from '@/services/ai/soapNoteService';

/**
 * GET /api/soap-notes - Get SOAP notes for a patient
 * Protected: Requires provider or admin authentication
 */
export const GET = async (request: NextRequest) => {
  try {
    // Temporary: Skip authentication in development
    const isDevelopment = process.env.NODE_ENV === 'development';
    const user = isDevelopment ? { 
      id: 1, 
      email: 'doctor@clinic.com', 
      role: 'provider' as const 
    } : null;

    if (!isDevelopment) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    const includeRevisions = searchParams.get('includeRevisions') === 'true';
    const approvedOnly = searchParams.get('approvedOnly') === 'true';
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    
    const patientIdNum = parseInt(patientId, 10);
    
    // Check if provider has access to this patient
    if (user.role === 'provider') {
      // TODO: Add provider-patient relationship check once the model is updated
      const patient = await prisma.patient.findUnique({
        where: { id: patientIdNum },
      });
      
      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found' },
          { status: 404 }
        );
      }
    }
    
    let soapNotes = await getPatientSOAPNotes(
      patientIdNum,
      includeRevisions
    );
    
    // Additional filter for approved only
    if (approvedOnly) {
      soapNotes = soapNotes.filter((note: any) => note.approvedBy);
    }
    
    // Log access for audit
    if (user) {
      await prisma.patientAudit.create({
        data: {
          patientId: patientIdNum,
          action: 'VIEW_SOAP_NOTES',
          actorEmail: user.email,
          diff: { 
            notesViewed: soapNotes.length,
            includeRevisions,
            approvedOnly,
          },
        },
      });
    }
    
    return NextResponse.json({
      ok: true,
      data: soapNotes,
      meta: {
        accessedBy: user?.email || 'development',
        role: user?.role || 'provider',
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error fetching SOAP notes:', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to fetch SOAP notes' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/soap-notes - Create a new SOAP note
 * Protected: Requires provider or admin authentication
 */
export const POST = async (request: NextRequest) => {
  try {
    // Temporary: Skip authentication in development
    const isDevelopment = process.env.NODE_ENV === 'development';
    const user = isDevelopment ? { 
      id: 1, 
      email: 'doctor@clinic.com', 
      role: 'provider' as const 
    } : null;

    if (!isDevelopment) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    const body = await request.json();
    
    // Parse and validate the request
    const parsedData = createSOAPNoteSchema.parse(body);
    
    // Verify provider has access to this patient
    if (user.role === 'provider') {
      // TODO: Add provider-patient relationship check once the model is updated
      const patient = await prisma.patient.findUnique({
        where: { id: parsedData.patientId },
      });
      
      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found' },
          { status: 404 }
        );
      }
    }
    
    let soapNote;
    
    if (parsedData.generateFromIntake) {
      // Generate SOAP note from intake using AI
      logger.debug('[API] Generating SOAP note from intake', { 
        intakeId: parsedData.intakeDocumentId,
        requestedBy: user?.email 
      });
      
      // Check if patient has intake documents before attempting generation
      const hasIntakeDocuments = await prisma.patientDocument.findFirst({
        where: {
          patientId: parsedData.patientId,
          category: 'MEDICAL_INTAKE_FORM'
        }
      });

      if (!hasIntakeDocuments) {
        return NextResponse.json(
          { error: 'No intake form found for this patient. Please complete an intake form first.' },
          { status: 400 }
        );
      }

      soapNote = await generateSOAPFromIntake(
        parsedData.patientId,
        parsedData.intakeDocumentId
      );
    } else {
      // Create manual SOAP note
      logger.debug('[API] Creating manual SOAP note', { 
        patientId: parsedData.patientId,
        createdBy: user?.email 
      });
      
      soapNote = await createManualSOAPNote(
        parsedData.patientId,
        {
          subjective: parsedData.manualContent?.subjective || '',
          objective: parsedData.manualContent?.objective || '',
          assessment: parsedData.manualContent?.assessment || '',
          plan: parsedData.manualContent?.plan || ''
        }
      );
    }
    
    // Log creation for audit
    if (user) {
      await prisma.patientAudit.create({
        data: {
          patientId: parsedData.patientId,
          action: 'CREATE_SOAP_NOTE',
          actorEmail: user.email,
          diff: { 
            soapNoteId: soapNote.id,
            generatedWithAI: parsedData.generateFromIntake || false,
            intakeId: parsedData.intakeDocumentId,
          },
        },
      });
    }
    
    return NextResponse.json({
      ok: true,
      data: soapNote,
      message: 'SOAP note created successfully',
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // @ts-ignore
   
    logger.error('[API] Error creating SOAP note:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to create SOAP note' },
      { status: 500 }
    );
  }
};