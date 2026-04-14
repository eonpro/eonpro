/**
 * POST /api/intake-links/generate
 *
 * Creates a shareable intake link attributed to a sales rep.
 * Supports both the questionnaire flow (/intake/link/{id}) and the
 * wizard flow (/intake/{clinic}/{template}?ref=CODE).
 *
 * Any authenticated staff-level user can create links. Admins can
 * assign a sales rep; sales reps default to themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma, prisma, runWithClinicContext } from '@/lib/db';
import { createFormLink } from '@/lib/intake-forms/service';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const generateLinkSchema = z
  .object({
    flowType: z.enum(['questionnaire', 'wizard']),
    templateId: z.number().positive().optional(),
    clinicSlug: z.string().min(1).max(100).optional(),
    templateSlug: z.string().min(1).max(100).optional(),
    salesRepId: z.number().positive().optional(),
    patientEmail: z.string().email().max(255).optional(),
    patientPhone: z.string().max(20).optional(),
  })
  .refine(
    (data) => {
      if (data.flowType === 'questionnaire') return !!data.templateId;
      return true;
    },
    { message: 'templateId is required for questionnaire flow', path: ['templateId'] }
  )
  .refine(
    (data) => {
      if (data.flowType === 'wizard') return !!data.clinicSlug && !!data.templateSlug;
      return true;
    },
    { message: 'clinicSlug and templateSlug are required for wizard flow', path: ['clinicSlug'] }
  );

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = generateLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      flowType,
      templateId,
      clinicSlug,
      templateSlug,
      salesRepId,
      patientEmail,
      patientPhone,
    } = parsed.data;

    const effectiveSalesRepId = salesRepId ?? (user.role === 'sales_rep' ? user.id : undefined);

    if (effectiveSalesRepId && effectiveSalesRepId !== user.id) {
      const repUser = await basePrisma.user.findUnique({
        where: { id: effectiveSalesRepId },
        select: { id: true, role: true },
      });
      if (!repUser) {
        return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
      }
    }

    const requestHost = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = requestHost
      ? `${protocol}://${requestHost}`
      : process.env.NEXT_PUBLIC_APP_URL || '';

    if (flowType === 'questionnaire') {
      return await handleQuestionnaire({
        templateId: templateId!,
        patientEmail: patientEmail || '',
        patientPhone,
        salesRepId: effectiveSalesRepId,
        createdById: user.id,
        clinicId: user.clinicId,
        baseUrl,
      });
    }

    return await handleWizard({
      clinicSlug: clinicSlug!,
      templateSlug: templateSlug!,
      salesRepId: effectiveSalesRepId,
      createdById: user.id,
      userClinicId: user.clinicId,
      baseUrl,
    });
  } catch (error) {
    logger.error('[IntakeLinks Generate] Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to generate intake link' }, { status: 500 });
  }
}

async function handleQuestionnaire(opts: {
  templateId: number;
  patientEmail: string;
  patientPhone?: string;
  salesRepId?: number;
  createdById: number;
  clinicId?: number;
  baseUrl: string;
}) {
  const link = await createFormLink({
    templateId: opts.templateId,
    patientEmail: opts.patientEmail || 'pending@intake.local',
    patientPhone: opts.patientPhone,
    createdById: opts.createdById,
    salesRepId: opts.salesRepId,
    clinicId: opts.clinicId ?? undefined,
    metadata: {
      generatedVia: 'intake-links-generate',
      createdById: opts.createdById,
      salesRepId: opts.salesRepId,
    },
  });

  const fullUrl = `${opts.baseUrl}/intake/link/${link.id}`;

  logger.info('[IntakeLinks Generate] Questionnaire link created', {
    linkId: link.id,
    createdById: opts.createdById,
    salesRepId: opts.salesRepId,
  });

  return NextResponse.json({
    success: true,
    flowType: 'questionnaire',
    url: fullUrl,
    linkId: link.id,
    expiresAt: link.expiresAt,
    salesRepId: opts.salesRepId ?? null,
  });
}

async function handleWizard(opts: {
  clinicSlug: string;
  templateSlug: string;
  salesRepId?: number;
  createdById: number;
  userClinicId?: number;
  baseUrl: string;
}) {
  const clinic = await basePrisma.clinic.findFirst({
    where: {
      OR: [{ subdomain: opts.clinicSlug }, { customDomain: opts.clinicSlug }],
    },
    select: { id: true, subdomain: true },
  });

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
  }

  let refCode: string | undefined;

  if (opts.salesRepId) {
    refCode = await ensureSalesRepRefCode(opts.salesRepId, clinic.id);
  }

  let fullUrl = `${opts.baseUrl}/intake/${opts.clinicSlug}/${opts.templateSlug}`;
  if (refCode) {
    fullUrl += `?ref=${encodeURIComponent(refCode)}`;
  }

  logger.info('[IntakeLinks Generate] Wizard link created', {
    clinicSlug: opts.clinicSlug,
    templateSlug: opts.templateSlug,
    createdById: opts.createdById,
    salesRepId: opts.salesRepId,
    refCode,
  });

  return NextResponse.json({
    success: true,
    flowType: 'wizard',
    url: fullUrl,
    refCode: refCode ?? null,
    salesRepId: opts.salesRepId ?? null,
  });
}

/**
 * Finds an active ref code for the sales rep in the given clinic,
 * or auto-creates one if none exist.
 */
async function ensureSalesRepRefCode(salesRepId: number, clinicId: number): Promise<string> {
  return runWithClinicContext(clinicId, async () => {
    const existing = await prisma.salesRepRefCode.findFirst({
      where: { salesRepId, clinicId, isActive: true },
      select: { refCode: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) return existing.refCode;

    const user = await basePrisma.user.findUnique({
      where: { id: salesRepId },
      select: { firstName: true, lastName: true },
    });

    const namePart = (user?.firstName || user?.lastName || 'REP')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase();

    const MAX_ATTEMPTS = 10;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
      const refCode = `${namePart}${randomPart}`;
      try {
        await prisma.salesRepRefCode.create({
          data: { clinicId, salesRepId, refCode, description: 'Auto-generated', isActive: true },
        });
        return refCode;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new Error('Unable to generate unique ref code');
  });
}

export const POST = withAuth(handler, {
  roles: ['super_admin', 'admin', 'provider', 'staff', 'sales_rep', 'pharmacy_rep'],
});
