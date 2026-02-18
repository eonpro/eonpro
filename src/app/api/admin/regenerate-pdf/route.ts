import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { generateIntakePdf } from '@/services/intakePdfService';
import type { NormalizedIntake } from '@/lib/heyflow/types';
import { readIntakeData } from '@/lib/storage/document-data-store';

/**
 * POST /api/admin/regenerate-pdf
 * Regenerate PDF for documents that have intakeData but no valid PDF in data field
 *
 * Body: { documentId: number } or { patientId: number } or { all: true }
 */
export const POST = withAuthParams(
  async (request: NextRequest, user: any) => {
    try {
      const body = await request.json();
      const { documentId, patientId, all } = body;

      logger.info(`[PDF REGENERATION] Request from user ${user.id}:`, {
        documentId,
        patientId,
        all,
      });

      // Build query based on parameters
      let documents;

      const documentSelect = {
        id: true as const,
        patientId: true as const,
        clinicId: true as const,
        filename: true as const,
        mimeType: true as const,
        category: true as const,
        createdAt: true as const,
        data: true as const,
        s3DataKey: true as const,
        externalUrl: true as const,
        source: true as const,
        sourceSubmissionId: true as const,
        patient: true as const,
      };

      if (documentId) {
        // Regenerate specific document
        documents = await prisma.patientDocument.findMany({
          where: {
            id: documentId,
            category: 'MEDICAL_INTAKE_FORM',
          },
          select: documentSelect,
          take: 10,
        });
      } else if (patientId) {
        // Regenerate all documents for a patient
        documents = await prisma.patientDocument.findMany({
          where: {
            patientId,
            category: 'MEDICAL_INTAKE_FORM',
          },
          select: documentSelect,
          take: 100,
        });
      } else if (all) {
        // Regenerate all intake documents
        // Limit to 100 at a time to prevent timeout
        documents = await prisma.patientDocument.findMany({
          where: {
            category: 'MEDICAL_INTAKE_FORM',
          },
          select: documentSelect,
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
          let intakeDataSource: any = null;

          try {
            const parsed = await readIntakeData(doc);
            if (parsed && typeof parsed === 'object') {
              intakeDataSource = parsed;
            }
          } catch {
            // Not JSON or read failed — will fall back to patient record below
          }

          // If data is already PDF or we don't have intake JSON, use patient info
          if (!intakeDataSource) {
            // Create minimal intake from patient record
            intakeDataSource = {
              submissionId: doc.sourceSubmissionId || `regen-${doc.id}`,
              patient: {
                firstName: doc.patient.firstName,
                lastName: doc.patient.lastName,
                email: doc.patient.email,
                phone: doc.patient.phone,
                dob: doc.patient.dob,
                gender: doc.patient.gender,
                address1: doc.patient.address1,
                city: doc.patient.city,
                state: doc.patient.state,
                zip: doc.patient.zip,
              },
              sections: [
                {
                  title: 'Patient Information',
                  entries: [
                    { label: 'Name', value: `${doc.patient.firstName} ${doc.patient.lastName}` },
                    { label: 'Email', value: doc.patient.email || '' },
                    { label: 'Phone', value: doc.patient.phone || '' },
                  ],
                },
              ],
              answers: [],
            };
          }

          // Build NormalizedIntake from stored data
          const intake: NormalizedIntake = {
            submissionId:
              intakeDataSource.submissionId || doc.sourceSubmissionId || `regen-${doc.id}`,
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
          // Note: intakeData, pdfGeneratedAt, intakeVersion require DB migration
          await prisma.patientDocument.update({
            where: { id: doc.id },
            data: {
              data: pdfBuffer,
              externalUrl: null, // Clear any legacy external URL
            },
          });

          logger.info(
            `[PDF REGENERATION] Successfully regenerated document ${doc.id}, ${pdfBuffer.length} bytes`
          );
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

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

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
  },
  { roles: ['super_admin', 'admin'] }
);

/**
 * GET /api/admin/regenerate-pdf
 * Get count of documents that need regeneration
 */
export const GET = withAuthParams(
  async (request: NextRequest, user: any) => {
    try {
      // Count total intake documents
      const totalIntake = await prisma.patientDocument.count({
        where: {
          category: 'MEDICAL_INTAKE_FORM',
        },
      });

      // Count documents with data (have PDF bytes)
      const withData = await prisma.patientDocument.count({
        where: {
          category: 'MEDICAL_INTAKE_FORM',
          data: { not: null },
        },
      });

      // Count documents without data (missing PDF)
      const needsRegeneration = totalIntake - withData;

      return NextResponse.json({
        totalIntakeDocuments: totalIntake,
        withValidPdf: withData,
        needsRegeneration,
        percentValid: totalIntake > 0 ? Math.round((withData / totalIntake) * 100) : 100,
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[PDF REGENERATION] Error getting stats:', error);
      return NextResponse.json(
        { error: `Failed to get regeneration stats: ${errorMessage}` },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin'] }
);
