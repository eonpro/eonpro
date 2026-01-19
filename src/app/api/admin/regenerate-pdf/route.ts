import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { generateIntakePdf } from '@/services/intakePdfService';
import type { NormalizedIntake } from '@/lib/heyflow/types';

/**
 * POST /api/admin/regenerate-pdf
 * Regenerate PDF for documents that have intakeData but no valid PDF in data field
 * 
 * Body: { documentId: number } or { patientId: number } or { all: true }
 */
export const POST = withAuthParams(async (
  request: NextRequest,
  user: any
) => {
  try {
    const body = await request.json();
    const { documentId, patientId, all } = body;

    logger.info(`[PDF REGENERATION] Request from user ${user.id}:`, { documentId, patientId, all });

    // Build query based on parameters
    let documents;
    
    if (documentId) {
      // Regenerate specific document
      documents = await prisma.patientDocument.findMany({
        where: {
          id: documentId,
          category: 'MEDICAL_INTAKE_FORM',
        },
        include: {
          patient: true,
        },
      });
    } else if (patientId) {
      // Regenerate all documents for a patient
      documents = await prisma.patientDocument.findMany({
        where: {
          patientId,
          category: 'MEDICAL_INTAKE_FORM',
        },
        include: {
          patient: true,
        },
      });
    } else if (all) {
      // Regenerate all documents that need it (have intakeData but no valid PDF)
      // Limit to 100 at a time to prevent timeout
      documents = await prisma.patientDocument.findMany({
        where: {
          category: 'MEDICAL_INTAKE_FORM',
          intakeData: { not: null },
        },
        include: {
          patient: true,
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      return NextResponse.json(
        { error: 'Provide documentId, patientId, or all: true' },
        { status: 400 }
      );
    }

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No documents found to regenerate',
        regenerated: 0,
      });
    }

    const results: Array<{
      documentId: number;
      success: boolean;
      error?: string;
      pdfSize?: number;
    }> = [];

    for (const doc of documents) {
      try {
        // Check if we have intake data to regenerate from
        let intakeDataSource = doc.intakeData;
        
        // If no intakeData, try to parse from legacy data field
        if (!intakeDataSource && doc.data) {
          try {
            const buffer = Buffer.isBuffer(doc.data) 
              ? doc.data 
              : Buffer.from((doc.data as any).data || doc.data);
            const str = buffer.toString('utf8').trim();
            if (str.startsWith('{') || str.startsWith('[')) {
              intakeDataSource = JSON.parse(str);
            }
          } catch {
            // Not JSON, can't regenerate
          }
        }

        if (!intakeDataSource) {
          results.push({
            documentId: doc.id,
            success: false,
            error: 'No intake data available for regeneration',
          });
          continue;
        }

        // Build NormalizedIntake from stored data
        const intake: NormalizedIntake = {
          submissionId: intakeDataSource.submissionId || doc.sourceSubmissionId || `regen-${doc.id}`,
          submittedAt: new Date(intakeDataSource.receivedAt || doc.createdAt),
          patient: intakeDataSource.patient || {
            firstName: doc.patient.firstName,
            lastName: doc.patient.lastName,
            email: doc.patient.email,
            phone: doc.patient.phone,
            dob: doc.patient.dob,
            gender: doc.patient.gender,
            address1: doc.patient.address1,
            address2: doc.patient.address2 || '',
            city: doc.patient.city,
            state: doc.patient.state,
            zip: doc.patient.zip,
          },
          sections: intakeDataSource.sections || [],
          answers: intakeDataSource.answers || [],
        };

        // Generate new PDF
        logger.debug(`[PDF REGENERATION] Generating PDF for document ${doc.id}...`);
        const pdfBuffer = await generateIntakePdf(intake, doc.patient);
        
        // Update document with new PDF
        await prisma.patientDocument.update({
          where: { id: doc.id },
          data: {
            data: pdfBuffer,
            intakeData: intakeDataSource, // Ensure intakeData is stored
            pdfGeneratedAt: new Date(),
            intakeVersion: `regenerated-${new Date().toISOString().split('T')[0]}`,
          },
        });

        logger.info(`[PDF REGENERATION] Successfully regenerated document ${doc.id}, ${pdfBuffer.length} bytes`);
        results.push({
          documentId: doc.id,
          success: true,
          pdfSize: pdfBuffer.length,
        });
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[PDF REGENERATION] Failed for document ${doc.id}:`, error);
        results.push({
          documentId: doc.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Regenerated ${successCount} PDFs, ${failCount} failed`,
      regenerated: successCount,
      failed: failCount,
      results,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PDF REGENERATION] Error:', error);
    return NextResponse.json(
      { error: `Failed to regenerate PDFs: ${errorMessage}` },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin'] });

/**
 * GET /api/admin/regenerate-pdf
 * Get count of documents that need regeneration
 */
export const GET = withAuthParams(async (
  request: NextRequest,
  user: any
) => {
  try {
    // Count documents that have intakeData but might need PDF regeneration
    const needsRegeneration = await prisma.patientDocument.count({
      where: {
        category: 'MEDICAL_INTAKE_FORM',
        OR: [
          // Has intakeData but no pdfGeneratedAt (never had PDF generated properly)
          {
            intakeData: { not: null },
            pdfGeneratedAt: null,
          },
          // Has intakeData but data is null/empty
          {
            intakeData: { not: null },
            data: null,
          },
        ],
      },
    });

    // Count total intake documents
    const totalIntake = await prisma.patientDocument.count({
      where: {
        category: 'MEDICAL_INTAKE_FORM',
      },
    });

    // Count documents with valid PDFs
    const withValidPdf = await prisma.patientDocument.count({
      where: {
        category: 'MEDICAL_INTAKE_FORM',
        pdfGeneratedAt: { not: null },
      },
    });

    return NextResponse.json({
      totalIntakeDocuments: totalIntake,
      withValidPdf,
      needsRegeneration,
      percentValid: totalIntake > 0 ? Math.round((withValidPdf / totalIntake) * 100) : 100,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PDF REGENERATION] Error getting stats:', error);
    return NextResponse.json(
      { error: `Failed to get regeneration stats: ${errorMessage}` },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin'] });
