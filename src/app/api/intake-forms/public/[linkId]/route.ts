/**
 * Public API Routes for Intake Forms
 * GET: Get form details for a patient to fill out
 * POST: Submit form responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFormByLinkId, submitFormResponses } from '@/lib/intake-forms/service';
import { generatePDFOnSubmission } from '@/lib/intake-forms/pdf-generator';
import { sendIntakeFormNotifications } from '@/lib/intake-forms/notifications';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';

const INTAKE_SUBMIT_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 10,           // 10 submissions per hour per IP
  blockDuration: 30 * 60 * 1000, // 30 min block
};

interface RouteParams {
  params: Promise<{
    linkId: string;
  }>;
}

// Validation schema for form submission
const submitSchema = z.object({
  responses: z.array(
    z.object({
      questionId: z.number().int().positive(),
      answer: z.string().max(10000).optional(),
      fileUrl: z.string().url().max(2000).optional(),
    })
  ).max(500),
  patientInfo: z
    .object({
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
      email: z.string().email().max(255).optional(),
      phone: z.string().max(20).optional(),
    })
    .optional(),
  signature: z.string().max(500000).optional(),
});

/**
 * GET /api/intake-forms/public/[linkId]
 * Get form details for a patient to fill out
 * No authentication required - accessed via unique link
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { linkId } = await params;

    if (!linkId) {
      return NextResponse.json({ error: 'Invalid form link' }, { status: 400 });
    }

    const formLink = await getFormByLinkId(linkId);

    // Transform the data for the frontend
    const formData = {
      id: formLink.id,
      template: {
        id: formLink.template.id,
        name: formLink.template.name,
        description: formLink.template.description,
        questions: formLink.template.questions,
      },
      patientEmail: formLink.patientEmail,
      patientPhone: formLink.patientPhone,
      expiresAt: formLink.expiresAt,
      isCompleted: formLink.submission?.status === 'completed',
      completedAt: formLink.submission?.completedAt,
    };

    return NextResponse.json({
      form: formData,
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to get public form', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Return user-friendly error messages
    if (errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: 'This form link is invalid or does not exist' },
        { status: 404 }
      );
    }

    if (errorMessage.includes('expired')) {
      return NextResponse.json({ error: 'This form link has expired' }, { status: 410 });
    }

    if (errorMessage.includes('no longer active')) {
      return NextResponse.json({ error: 'This form has already been submitted' }, { status: 410 });
    }

    return NextResponse.json({ error: 'Failed to load form' }, { status: 500 });
  }
}

/**
 * POST /api/intake-forms/public/[linkId]
 * Submit form responses
 * No authentication required - accessed via unique link
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(req, INTAKE_SUBMIT_RATE_LIMIT);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        {
          status: 429,
          headers: retryAfter ? { 'Retry-After': String(Math.ceil(retryAfter / 1000)) } : {},
        }
      );
    }

    const { linkId } = await params;

    if (!linkId) {
      return NextResponse.json({ error: 'Invalid form link' }, { status: 400 });
    }

    const body = await req.json();

    // Validate the request body
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid form data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { responses, patientInfo, signature } = parsed.data;

    // Get client metadata
    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const metadata: any = {
      ipAddress,
      userAgent,
      submittedAt: new Date().toISOString(),
      signature,
    };

    // Submit the form responses (ensure answer is always a string)
    const cleanedResponses = responses.map((r: any) => ({
      questionId: r.questionId,
      answer: r.answer || '',
      fileUrl: r.fileUrl,
    }));

    const result = await submitFormResponses(linkId, cleanedResponses, patientInfo, metadata);

    // Generate PDF asynchronously (don't wait for it)
    generatePDFOnSubmission(result.submission.id).catch((err) => {
      logger.error('Failed to generate PDF for submission', {
        submissionId: result.submission.id,
        error: err,
      });
    });

    // Send notifications asynchronously (don't wait for them)
    sendIntakeFormNotifications({
      submissionId: result.submission.id,
      notifyProvider: true,
      notifyAdmin: true,
      notifyPatient: true,
    }).catch((err) => {
      logger.error('Failed to send notifications for submission', {
        submissionId: result.submission.id,
        error: err,
      });
    });

    return NextResponse.json({
      message: 'Thank you! Your form has been submitted successfully.',
      submissionId: result.submission.id,
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to submit public form', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Return user-friendly error messages
    if (errorMessage.includes('already been submitted')) {
      return NextResponse.json({ error: 'This form has already been submitted' }, { status: 400 });
    }

    if (errorMessage.includes('expired')) {
      return NextResponse.json({ error: 'This form link has expired' }, { status: 410 });
    }

    return NextResponse.json(
      { error: 'Failed to submit form. Please try again.' },
      { status: 500 }
    );
  }
}
