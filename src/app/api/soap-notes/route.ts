import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '@/types/common';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, runWithClinicContext } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import {
  generateSOAPFromIntake,
  createManualSOAPNote,
  getPatientSOAPNotes,
  createSOAPNoteSchema,
} from '@/services/ai/soapNoteService';

/**
 * GET /api/soap-notes - Get SOAP notes for a patient
 * Protected: Requires provider or admin authentication with clinic context
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
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

      // Run with clinic context for proper isolation
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const result = await runWithClinicContext(clinicId, async () => {
        // Check if provider has access to this patient (clinic isolation handles this)
        const patient = await prisma.patient.findUnique({
          where: { id: patientIdNum },
        });

        if (!patient) {
          return { error: 'Patient not found or access denied', status: 404 };
        }

        let soapNotes = await getPatientSOAPNotes(
          patientIdNum,
          includeRevisions
        );

        // Additional filter for approved only
        if (approvedOnly) {
          soapNotes = soapNotes.filter((note: any) => note.approvedBy);
        }

        return { soapNotes, patient };
      });

      if ('error' in result) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      // HIPAA Audit: Log PHI access
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'SOAPNote',
        patientId: patientIdNum,
        action: 'VIEW_SOAP_NOTES',
        outcome: 'SUCCESS',
        metadata: {
          notesViewed: result.soapNotes.length,
          includeRevisions,
          approvedOnly,
        },
      });

      return NextResponse.json({
        ok: true,
        data: result.soapNotes,
        meta: {
          accessedBy: user.email,
          role: user.role,
        }
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[API] Error fetching SOAP notes:', error);
      return NextResponse.json(
        { error: errorMessage || 'Failed to fetch SOAP notes' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);

/**
 * POST /api/soap-notes - Create a new SOAP note
 * Protected: Requires provider or admin authentication with clinic context
 */
export const POST = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const body = await request.json();

      // Parse and validate the request
      const parsedData = createSOAPNoteSchema.parse(body);

      // Run with clinic context for proper isolation
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const result = await runWithClinicContext(clinicId, async () => {
        // Verify provider has access to this patient (clinic isolation handles this)
        const patient = await prisma.patient.findUnique({
          where: { id: parsedData.patientId },
        });

        if (!patient) {
          return { error: 'Patient not found or access denied', status: 404 };
        }

        let soapNote;

        if (parsedData.generateFromIntake) {
          // Generate SOAP note from intake using AI
          logger.debug('[API] Generating SOAP note from intake', {
            intakeId: parsedData.intakeDocumentId,
            requestedBy: user.email
          });

          // Check if patient has intake documents before attempting generation
          const hasIntakeDocuments = await prisma.patientDocument.findFirst({
            where: {
              patientId: parsedData.patientId,
              category: 'MEDICAL_INTAKE_FORM'
            }
          });

          if (!hasIntakeDocuments) {
            return {
              error: 'No intake form found for this patient. Please complete an intake form first.',
              status: 400
            };
          }

          soapNote = await generateSOAPFromIntake(
            parsedData.patientId,
            parsedData.intakeDocumentId
          );
        } else {
          // Create manual SOAP note
          logger.debug('[API] Creating manual SOAP note', {
            patientId: parsedData.patientId,
            createdBy: user.email
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

        return { soapNote, parsedData };
      });

      if ('error' in result) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      // HIPAA Audit: Log PHI creation
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_CREATE,
        resourceType: 'SOAPNote',
        resourceId: result.soapNote.id,
        patientId: result.parsedData.patientId,
        action: 'CREATE_SOAP_NOTE',
        outcome: 'SUCCESS',
        metadata: {
          generatedWithAI: result.parsedData.generateFromIntake || false,
          intakeId: result.parsedData.intakeDocumentId,
        },
      });

      return NextResponse.json({
        ok: true,
        data: result.soapNote,
        message: 'SOAP note created successfully',
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('[API] Error creating SOAP note:', {
        message: errorMessage,
        status: error.status,
        code: error.code,
      });

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.errors },
          { status: 400 }
        );
      }

      // Handle OpenAI rate limit errors (429)
      if (error.status === 429 ||
          errorMessage.toLowerCase().includes('rate limit') ||
          errorMessage.toLowerCase().includes('ratelimit') ||
          errorMessage.toLowerCase().includes('too many requests') ||
          errorMessage.includes('429')) {
        return NextResponse.json(
          {
            error: 'OpenAI API is busy. Please wait 30 seconds and try again.',
            code: 'RATE_LIMIT',
            retryAfter: 30,
          },
          { status: 429 }
        );
      }

      // Handle OpenAI API busy/overloaded errors
      if (error.status === 503 || errorMessage.includes('overloaded') || errorMessage.includes('busy')) {
        return NextResponse.json(
          {
            error: 'AI service is temporarily unavailable. Please try again in a moment.',
            code: 'SERVICE_UNAVAILABLE',
            retryAfter: 15,
          },
          { status: 503 }
        );
      }

      // Handle OpenAI API key/auth errors
      if (error.status === 401 || errorMessage.includes('API key')) {
        logger.error('[SOAP Notes] OpenAI API key issue - check configuration');
        return NextResponse.json(
          { error: 'AI service configuration error. Please contact support.' },
          { status: 500 }
        );
      }

      // Handle internal rate limit
      if (errorMessage.includes('Internal rate limit')) {
        return NextResponse.json(
          {
            error: errorMessage,
            code: 'INTERNAL_RATE_LIMIT',
            retryAfter: 30,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorMessage || 'Failed to create SOAP note' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);