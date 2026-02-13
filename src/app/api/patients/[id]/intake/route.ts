import { NextResponse, NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { PatientDocumentCategory } from '@prisma/client';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';

/**
 * GET /api/patients/[id]/intake
 * Retrieve intake data for a patient
 */
export const GET = withAuthParams(
  async (request: NextRequest, user: any, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id, 10);

      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      // Find the intake document
      const intakeDoc = await prisma.patientDocument.findFirst({
        where: {
          patientId,
          clinicId: user.clinicId,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!intakeDoc) {
        return NextResponse.json({ intakeData: null });
      }

      // Parse intake data from the document
      let intakeData = null;
      if (intakeDoc.data) {
        try {
          let rawData: any = intakeDoc.data;
          // Handle Uint8Array (Prisma 6.x returns Bytes as Uint8Array)
          if (rawData instanceof Uint8Array) {
            rawData = Buffer.from(rawData).toString('utf8');
          } else if (Buffer.isBuffer(rawData)) {
            rawData = rawData.toString('utf8');
          } else if (typeof rawData === 'object' && rawData.type === 'Buffer') {
            rawData = Buffer.from(rawData.data).toString('utf8');
          }
          if (typeof rawData === 'string') {
            const trimmed = rawData.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              intakeData = JSON.parse(trimmed);
            }
          }
        } catch {
          // Not JSON data
        }
      }

      return NextResponse.json({
        documentId: intakeDoc.id,
        intakeData,
        createdAt: intakeDoc.createdAt,
        updatedAt: intakeDoc.updatedAt,
      });
    } catch (error) {
      logger.error('Error fetching intake data:', error);
      return NextResponse.json({ error: 'Failed to fetch intake data' }, { status: 500 });
    }
  }
);

/**
 * PUT /api/patients/[id]/intake
 * Update intake data for a patient (or create if none exists)
 */
export const PUT = withAuthParams(
  async (request: NextRequest, user: any, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id, 10);

      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      // Verify patient belongs to clinic
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: user.clinicId },
      });

      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      const body = await request.json();
      const { answers } = body;

      if (!answers || typeof answers !== 'object') {
        return NextResponse.json({ error: 'Invalid intake data' }, { status: 400 });
      }

      // Find existing intake document
      let intakeDoc = await prisma.patientDocument.findFirst({
        where: {
          patientId,
          clinicId: user.clinicId,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Build intake data structure
      const intakeDataToStore: any = {
        submissionId: intakeDoc?.sourceSubmissionId || `manual-${Date.now()}`,
        sections: [],
        answers: Object.entries(answers).map(([id, value]) => ({
          id,
          label: id,
          value,
        })),
        source: 'manual_entry',
        clinicId: user.clinicId,
        receivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      };

      // Merge with existing data if present
      if (intakeDoc?.data) {
        try {
          let existingData: any = {};
          let rawData: any = intakeDoc.data;
          // Handle Uint8Array (Prisma 6.x returns Bytes as Uint8Array)
          if (rawData instanceof Uint8Array) {
            rawData = Buffer.from(rawData).toString('utf8');
          } else if (Buffer.isBuffer(rawData)) {
            rawData = rawData.toString('utf8');
          } else if (typeof rawData === 'object' && rawData.type === 'Buffer') {
            rawData = Buffer.from(rawData.data).toString('utf8');
          }
          if (typeof rawData === 'string') {
            const trimmed = rawData.trim();
            if (trimmed.startsWith('{')) {
              existingData = JSON.parse(trimmed);
            }
          }

          // Preserve original submission info
          if (existingData.submissionId) {
            intakeDataToStore.submissionId = existingData.submissionId;
          }
          if (existingData.source && existingData.source !== 'manual_entry') {
            intakeDataToStore.source = existingData.source;
          }

          // Merge answers - new values override existing
          const existingAnswers = existingData.answers || [];
          const answerMap = new Map<string, any>();

          for (const ans of existingAnswers) {
            if (ans.id) answerMap.set(ans.id, ans);
          }

          for (const ans of intakeDataToStore.answers) {
            answerMap.set(ans.id, ans);
          }

          intakeDataToStore.answers = Array.from(answerMap.values());
        } catch {
          // Keep new data as-is
        }
      }

      const dataBuffer = Buffer.from(JSON.stringify(intakeDataToStore), 'utf8');

      if (intakeDoc) {
        // Update existing document
        intakeDoc = await prisma.patientDocument.update({
          where: { id: intakeDoc.id },
          data: { data: dataBuffer },
        });
        logger.info(`Updated intake data for patient ${patientId}, doc ${intakeDoc.id}`);
      } else {
        // Create new intake document
        intakeDoc = await prisma.patientDocument.create({
          data: {
            patientId,
            clinicId: user.clinicId,
            filename: `intake-manual-${Date.now()}.json`,
            mimeType: 'application/json',
            category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
            data: dataBuffer,
            source: 'manual_entry',
            sourceSubmissionId: intakeDataToStore.submissionId,
          },
        });
        logger.info(`Created intake document for patient ${patientId}, doc ${intakeDoc.id}`);
      }

      // Invalidate the patient page cache
      revalidatePath(`/patients/${patientId}`);

      return NextResponse.json({
        success: true,
        documentId: intakeDoc.id,
        message: 'Intake data saved successfully',
      });
    } catch (error) {
      logger.error('Error saving intake data:', error);
      return NextResponse.json({ error: 'Failed to save intake data' }, { status: 500 });
    }
  }
);
