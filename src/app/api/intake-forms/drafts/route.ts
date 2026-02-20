/**
 * POST /api/intake-forms/drafts — Upsert a draft (by sessionId).
 * GET  /api/intake-forms/drafts?sessionId=... — Load a specific draft by session.
 *
 * Public endpoint (no auth required). The Zustand store calls this on every
 * step completion to persist progress server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { encryptPHI, decryptPHI, isEncrypted } from '@/lib/security/phi-encryption';
import { z } from 'zod';

const DRAFT_TTL_DAYS = 30;

const PHI_RESPONSE_KEYS = new Set([
  'firstName', 'lastName', 'email', 'phone', 'dob', 'dateOfBirth',
  'street', 'apartment', 'city', 'state', 'zip', 'address',
  'ssn', 'insurance_id', 'allergies', 'medications', 'medical_conditions',
]);

function encryptDraftResponses(responses: Record<string, unknown>): Record<string, unknown> {
  const encrypted = { ...responses };
  for (const key of Object.keys(encrypted)) {
    if (PHI_RESPONSE_KEYS.has(key)) {
      const val = encrypted[key];
      if (typeof val === 'string' && val.length > 0 && !isEncrypted(val)) {
        encrypted[key] = encryptPHI(val);
      }
    }
  }
  return encrypted;
}

function decryptDraftResponses(responses: Record<string, unknown>): Record<string, unknown> {
  const decrypted = { ...responses };
  for (const key of Object.keys(decrypted)) {
    if (PHI_RESPONSE_KEYS.has(key)) {
      const val = decrypted[key];
      if (typeof val === 'string' && val.length > 0 && isEncrypted(val)) {
        try {
          decrypted[key] = decryptPHI(val);
        } catch {
          decrypted[key] = '[Encrypted]';
        }
      }
    }
  }
  return decrypted;
}

const upsertSchema = z.object({
  sessionId: z.string().min(1),
  templateId: z.string().min(1),
  clinicSlug: z.string().min(1),
  currentStep: z.string().min(1),
  completedSteps: z.array(z.string()),
  responses: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sessionId, templateId, clinicSlug, currentStep, completedSteps, responses } =
      parsed.data;

    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: clinicSlug }, { customDomain: clinicSlug }],
      },
      select: { id: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const numericTemplateId = parseInt(templateId.replace('template-', ''), 10);
    if (isNaN(numericTemplateId)) {
      const template = await prisma.intakeFormTemplate.findFirst({
        where: { clinicId: clinic.id, isActive: true, treatmentType: templateId },
        select: { id: true },
      });
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      await upsertDraft(sessionId, clinic.id, template.id, currentStep, completedSteps, responses);
    } else {
      await upsertDraft(sessionId, clinic.id, numericTemplateId, currentStep, completedSteps, responses);
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/intake-forms/drafts' });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId query param required' },
        { status: 400 },
      );
    }

    const draft = await prisma.intakeFormDraft.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        currentStep: true,
        completedSteps: true,
        responses: true,
        startedAt: true,
        lastSavedAt: true,
        status: true,
        template: {
          select: { name: true, treatmentType: true },
        },
      },
    });

    if (!draft || draft.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const decryptedDraft = {
      ...draft,
      responses: decryptDraftResponses(draft.responses as Record<string, unknown>),
    };

    return NextResponse.json({ draft: decryptedDraft });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/intake-forms/drafts' });
  }
}

async function upsertDraft(
  sessionId: string,
  clinicId: number,
  templateId: number,
  currentStep: string,
  completedSteps: string[],
  responses: Record<string, unknown>,
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DRAFT_TTL_DAYS);

  const encryptedResponses = encryptDraftResponses(responses);

  await prisma.intakeFormDraft.upsert({
    where: { sessionId },
    create: {
      sessionId,
      clinicId,
      templateId,
      currentStep,
      completedSteps,
      responses: encryptedResponses as any,
      expiresAt,
      status: 'IN_PROGRESS',
    },
    update: {
      currentStep,
      completedSteps,
      responses: encryptedResponses as any,
      expiresAt,
    },
  });
}
