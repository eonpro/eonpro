/**
 * POST /api/intake-forms/submit
 *
 * Direct submission endpoint for the native intake form engine.
 * Validates responses, creates the submission record, runs the existing
 * IntakeProcessor pipeline (patient upsert, PDF, SOAP note, notifications),
 * and transitions LEAD → ACTIVE.
 *
 * Public endpoint (form may be completed by anonymous users).
 * When a patientId is provided via auth token, the submission links to that patient.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { z } from 'zod';
import { IntakeProcessor, type ProcessIntakeOptions } from '@/lib/webhooks/intake-processor';
import type { NormalizedIntake } from '@/lib/heyflow/types';
import { transitionLeadToActive } from '@/domains/intake/services/lead-transition.service';

const submitSchema = z.object({
  sessionId: z.string().min(1),
  templateId: z.string().min(1),
  clinicSlug: z.string().min(1),
  responses: z.record(z.unknown()),
  completedSteps: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sessionId, templateId, clinicSlug, responses, completedSteps } = parsed.data;

    // Resolve clinic
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: clinicSlug }, { customDomain: clinicSlug }],
      },
      select: { id: true, name: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Resolve template
    const numericId = parseInt(templateId.replace('template-', ''), 10);
    const templateWhere = isNaN(numericId)
      ? { clinicId: clinic.id, isActive: true, treatmentType: templateId }
      : { id: numericId, clinicId: clinic.id };

    const template = await prisma.intakeFormTemplate.findFirst({
      where: templateWhere,
      select: { id: true, name: true, treatmentType: true },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const r = responses as Record<string, string | undefined>;

    const normalizedIntake: NormalizedIntake = {
      submissionId: sessionId,
      submittedAt: new Date(),
      patient: {
        firstName: r.firstName || '',
        lastName: r.lastName || '',
        email: r.email || '',
        phone: r.phone || '',
        dob: r.dob || '',
        gender: r.sex || r.gender,
        address1: r.street || r.address1 || '',
        address2: r.apartment || r.address2 || '',
        city: r.city || '',
        state: r.state || '',
        zip: r.zip || '',
      },
      sections: [],
      answers: Object.entries(responses).map(([key, val]) => ({
        id: key,
        label: key,
        value: String(val ?? ''),
      })),
    };

    // Process through the existing pipeline
    const processor = new IntakeProcessor({ source: 'internal' });
    const processOptions: ProcessIntakeOptions = {
      clinicId: clinic.id,
      clinicSubdomain: clinicSlug,
      generateSoapNote: true,
      referralSource: (r.referral_source as string) || undefined,
      promoCode: (r.promo_code as string) || undefined,
    };

    const result = await processor.process(normalizedIntake, processOptions);

    // Mark draft as completed
    try {
      await prisma.intakeFormDraft.updateMany({
        where: { sessionId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED' },
      });
    } catch (draftErr) {
      logger.warn('Failed to mark draft as completed (non-blocking)', {
        sessionId,
        error: draftErr instanceof Error ? draftErr.message : 'Unknown',
      });
    }

    // Transition LEAD → ACTIVE
    if (result.success && result.patient?.id) {
      try {
        await transitionLeadToActive(result.patient.id, clinic.id);
      } catch (err) {
        logger.warn('Lead transition failed (non-blocking)', {
          patientId: result.patient.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    logger.info('Native intake submission processed', {
      sessionId,
      templateId: template.id,
      clinicId: clinic.id,
      patientId: result.patient?.id,
      success: result.success,
      processingTimeMs,
    });

    return NextResponse.json({
      success: result.success,
      submissionId: sessionId,
      patientId: result.patient?.id,
      isNew: result.patient?.isNew,
      errors: result.errors,
      processingTimeMs,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/intake-forms/submit' });
  }
}
