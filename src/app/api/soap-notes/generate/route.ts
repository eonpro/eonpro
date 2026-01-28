/**
 * SOAP Note Generation API
 * 
 * POST /api/soap-notes/generate
 * 
 * Generates a SOAP note for a patient who is paid and ready for prescription
 * but is missing clinical documentation.
 * 
 * This endpoint allows providers to:
 * 1. Generate SOAP from intake documents
 * 2. Generate SOAP from invoice metadata (Heyflow patients)
 * 3. Process batch of patients missing SOAP notes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { 
  ensureSoapNoteExists, 
  processMissingSoapNotes,
  getPatientSoapNote 
} from '@/lib/soap-note-automation';
import { z } from 'zod';

// Validation schema for single patient generation
const generateSoapSchema = z.object({
  patientId: z.number(),
  invoiceId: z.number().optional(),
  force: z.boolean().optional().default(false), // Force regeneration even if exists
});

// Validation schema for batch processing
const batchGenerateSchema = z.object({
  batch: z.literal(true),
  limit: z.number().optional().default(50),
});

/**
 * POST /api/soap-notes/generate
 * 
 * Generate SOAP note for a patient
 * 
 * Body options:
 * 1. Single patient: { patientId: number, invoiceId?: number, force?: boolean }
 * 2. Batch mode: { batch: true, limit?: number }
 */
export const POST = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const body = await request.json();

      // Check if batch mode
      if (body.batch === true) {
        return handleBatchGeneration(request, user, body);
      }

      // Single patient generation
      const parsed = generateSoapSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const { patientId, invoiceId, force } = parsed.data;
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const result = await runWithClinicContext(clinicId, async () => {
        // Verify patient exists and user has access
        const patient = await prisma.patient.findUnique({
          where: { id: patientId },
          select: { id: true, firstName: true, lastName: true, clinicId: true },
        });

        if (!patient) {
          return { error: 'Patient not found or access denied', status: 404 };
        }

        // Check if SOAP note already exists (unless forcing)
        if (!force) {
          const existingSoapNote = await getPatientSoapNote(patientId);
          if (existingSoapNote) {
            return { 
              existingNote: true,
              soapNote: existingSoapNote,
              patient,
            };
          }
        }

        // Generate SOAP note
        const soapResult = await ensureSoapNoteExists(patientId, invoiceId);

        return {
          soapResult,
          patient,
        };
      });

      if ('error' in result) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      // Handle existing note case
      if (result.existingNote) {
        return NextResponse.json({
          ok: true,
          message: 'SOAP note already exists',
          action: 'existing',
          soapNote: {
            id: result.soapNote.id,
            status: result.soapNote.status,
            createdAt: result.soapNote.createdAt,
          },
        });
      }

      // Handle generation result
      const { soapResult, patient } = result;

      if (!soapResult) {
        return NextResponse.json({
          ok: false,
          error: 'Failed to generate SOAP note - unexpected result',
        }, { status: 500 });
      }

      // HIPAA Audit: Log SOAP note generation
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_CREATE,
        resourceType: 'SOAPNote',
        resourceId: soapResult.soapNoteId || undefined,
        patientId: patientId,
        action: 'GENERATE_SOAP_NOTE',
        outcome: soapResult.success ? 'SUCCESS' : 'FAILURE',
        metadata: {
          action: soapResult.action,
          invoiceId,
          error: soapResult.error,
        },
      });

      if (!soapResult.success) {
        return NextResponse.json({
          ok: false,
          error: soapResult.error || 'Failed to generate SOAP note',
          action: soapResult.action,
          message: soapResult.action === 'no_data' 
            ? 'No intake data available. Please add intake form data or create SOAP note manually.'
            : 'SOAP note generation failed. Please try again or create manually.',
        }, { status: 422 });
      }

      logger.info('[API] SOAP note generated successfully', {
        patientId,
        soapNoteId: soapResult.soapNoteId,
        action: soapResult.action,
        requestedBy: user.email,
      });

      return NextResponse.json({
        ok: true,
        message: 'SOAP note generated successfully',
        action: soapResult.action,
        soapNote: {
          id: soapResult.soapNoteId,
          status: soapResult.soapNoteStatus,
        },
        patient: {
          id: patient.id,
          name: `${patient.firstName} ${patient.lastName}`,
        },
      });

    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[API] Error generating SOAP note:', { error: errorMessage });
      
      // Handle rate limit errors gracefully
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        return NextResponse.json(
          { 
            error: 'AI service is busy. Please wait 30 seconds and try again.',
            code: 'RATE_LIMIT',
            retryAfter: 30,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorMessage || 'Failed to generate SOAP note' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }  // Admin can generate, but provider must approve
);

/**
 * Handle batch processing of missing SOAP notes
 */
async function handleBatchGeneration(
  request: NextRequest, 
  user: AuthUser, 
  body: any
): Promise<NextResponse> {
  const parsed = batchGenerateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid batch request', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { limit } = parsed.data;

  // Only super_admin and admin can run batch processing
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Batch processing requires admin permissions' },
      { status: 403 }
    );
  }

  const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

  try {
    const result = await processMissingSoapNotes(clinicId, limit);

    // HIPAA Audit: Log batch processing
    await auditLog(request, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      clinicId: user.clinicId,
      eventType: AuditEventType.PHI_CREATE,
      resourceType: 'SOAPNote',
      action: 'BATCH_GENERATE_SOAP_NOTES',
      outcome: 'SUCCESS',
      metadata: {
        processed: result.processed,
        generated: result.generated,
        failed: result.failed,
        noData: result.noData,
      },
    });

    logger.info('[API] Batch SOAP note processing completed', {
      ...result,
      requestedBy: user.email,
      clinicId,
    });

    return NextResponse.json({
      ok: true,
      message: `Processed ${result.processed} invoices`,
      summary: {
        processed: result.processed,
        generated: result.generated,
        failed: result.failed,
        noData: result.noData,
      },
    });

  } catch (error: any) {
    logger.error('[API] Batch SOAP note processing failed:', { 
      error: error.message,
      clinicId,
    });

    return NextResponse.json(
      { error: 'Batch processing failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/soap-notes/generate
 * 
 * Get count of patients in prescription queue missing SOAP notes
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const whereClause: any = {
        status: 'PAID',
        prescriptionProcessed: false,
        patient: {
          soapNotes: {
            none: {},
          },
        },
      };

      if (clinicId) {
        whereClause.clinicId = clinicId;
      }

      const [missingCount, totalQueueCount] = await Promise.all([
        prisma.invoice.count({ where: whereClause }),
        prisma.invoice.count({
          where: {
            status: 'PAID',
            prescriptionProcessed: false,
            ...(clinicId ? { clinicId } : {}),
          },
        }),
      ]);

      return NextResponse.json({
        ok: true,
        missingSoapNotes: missingCount,
        totalInQueue: totalQueueCount,
        percentageMissing: totalQueueCount > 0 
          ? Math.round((missingCount / totalQueueCount) * 100) 
          : 0,
      });

    } catch (error: any) {
      logger.error('[API] Error getting missing SOAP note count:', { 
        error: error.message 
      });
      return NextResponse.json(
        { error: 'Failed to get missing SOAP note count' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);
