/**
 * AI Scribe - SOAP Generation from Transcript API
 * 
 * Generates SOAP notes from transcribed telehealth sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  generateSOAPFromTranscript,
  saveScribeSOAPNote,
  generateConversationSummary,
  extractMedicationChanges,
  checkForRedFlags,
} from '@/lib/ai-scribe/soap-from-transcript.service';
import { completeSession } from '@/lib/ai-scribe/transcription.service';
import { prisma } from '@/lib/db';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';

const generateSOAPSchema = z.object({
  sessionId: z.string().optional(),
  transcript: z.string().optional(),
  patientId: z.number(),
  providerId: z.number(),
  appointmentId: z.number().optional(),
  visitType: z.string().optional(),
  chiefComplaint: z.string().optional(),
  saveNote: z.boolean().default(true),
  checkRedFlags: z.boolean().default(true),
});

/**
 * POST /api/ai-scribe/generate-soap
 * Generate SOAP note from transcript or session
 */
export const POST = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = generateSOAPSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const {
        sessionId,
        transcript: providedTranscript,
        patientId,
        providerId,
        appointmentId,
        visitType,
        chiefComplaint,
        saveNote,
        checkRedFlags,
      } = parsed.data;

      let transcript: string;
      let segments: any[] = [];

      // Get transcript either from session or direct input
      if (sessionId) {
        const sessionResult = await completeSession(sessionId);
        transcript = sessionResult.transcript;
        segments = sessionResult.segments;
      } else if (providedTranscript) {
        transcript = providedTranscript;
      } else {
        return NextResponse.json(
          { error: 'Either sessionId or transcript is required' },
          { status: 400 }
        );
      }

      // Get patient context
      const rawPatient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: {
          weightLogs: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!rawPatient) {
        return NextResponse.json(
          { error: 'Patient not found' },
          { status: 404 }
        );
      }

      // Decrypt patient PHI before using for SOAP generation
      const patient = {
        ...rawPatient,
        ...decryptPatientPHI(rawPatient as Record<string, unknown>, DEFAULT_PHI_FIELDS as unknown as string[]),
      };

      // Build patient context for better SOAP generation
      const patientContext = {
        name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
        dob: patient.dob,
        recentVitals: patient.weightLogs[0] ? {
          weight: patient.weightLogs[0].weight,
        } : undefined,
      };

      // Check for red flags first if requested
      let redFlagsResult: { hasRedFlags: boolean; flags: any[]; recommendation: string } | null = null;
      if (checkRedFlags) {
        redFlagsResult = await checkForRedFlags(transcript);
      }

      // Generate SOAP note
      const soapNote = await generateSOAPFromTranscript({
        transcript,
        segments,
        patientId,
        providerId,
        appointmentId,
        visitType,
        chiefComplaint,
        patientContext,
      });

      // Generate additional insights
      const [summary, medicationChanges] = await Promise.all([
        generateConversationSummary(transcript),
        extractMedicationChanges(transcript),
      ]);

      // Save to database if requested
      let savedNote: { id: number } | null = null;
      if (saveNote) {
        savedNote = await saveScribeSOAPNote(
          patientId,
          providerId,
          soapNote,
          appointmentId,
          sessionId
        );
      }

      logger.info('SOAP note generated from transcript', {
        patientId,
        providerId,
        appointmentId,
        savedNoteId: savedNote?.id,
        hasRedFlags: redFlagsResult?.hasRedFlags,
      });

      return NextResponse.json({
        success: true,
        soapNote: {
          ...soapNote,
          id: savedNote?.id,
        },
        summary,
        medicationChanges,
        redFlags: redFlagsResult,
        metadata: {
          transcriptWordCount: transcript.split(/\s+/).length,
          segmentCount: segments.length,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to generate SOAP from transcript', { error: errorMessage });
      return NextResponse.json(
        { error: 'SOAP generation failed', details: errorMessage },
        { status: 500 }
      );
    }
  }
);

/**
 * GET /api/ai-scribe/generate-soap
 * Get scribe-generated SOAP notes for a patient
 */
export const GET = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const patientId = searchParams.get('patientId');

      if (!patientId) {
        return NextResponse.json(
          { error: 'patientId is required' },
          { status: 400 }
        );
      }

      const soapNotes = await prisma.sOAPNote.findMany({
        where: {
          patientId: parseInt(patientId),
          sourceType: 'AI_GENERATED',
        },
        include: {
          approvedByProvider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        soapNotes,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get scribe SOAP notes', { error: errorMessage });
      return NextResponse.json(
        { error: 'Failed to get SOAP notes' },
        { status: 500 }
      );
    }
  }
);
