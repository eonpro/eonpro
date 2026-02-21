/**
 * GET /api/intake-forms/config/[clinicSlug]/[templateSlug]
 *
 * Public endpoint — returns the FormConfig JSON for a given clinic + template.
 * No authentication required (intake forms are public-facing).
 * Rate limited to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import type { FormConfig, FormBranding } from '@/domains/intake/types/form-engine';

interface RouteParams {
  params: Promise<{ clinicSlug: string; templateSlug: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { clinicSlug, templateSlug } = await params;

    const clinic = await basePrisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: clinicSlug },
          { customDomain: clinicSlug },
        ],
      },
      select: {
        id: true,
        name: true,
        settings: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    return runWithClinicContext(clinic.id, async () => {
      const template = await prisma.intakeFormTemplate.findFirst({
        where: {
          clinicId: clinic.id,
          isActive: true,
          OR: [
            { treatmentType: templateSlug },
            { name: templateSlug },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const metadata = template.metadata as Record<string, unknown> | null;
      const formConfig = metadata?.formConfig as FormConfig | undefined;

      if (formConfig) {
        const settings = clinic.settings as Record<string, unknown> | null;
        const portalSettings = settings?.patientPortal as Record<string, unknown> | null;

        const branding: FormBranding = {
          logo: (portalSettings?.logoUrl as string) ?? undefined,
          primaryColor: (portalSettings?.primaryColor as string) ?? '#413d3d',
          accentColor: (portalSettings?.accentColor as string) ?? '#f0feab',
          secondaryColor: (portalSettings?.secondaryColor as string) ?? '#4fa87f',
          ...(formConfig.branding ?? {}),
        };

        return NextResponse.json({
          config: formConfig,
          branding,
          clinicName: clinic.name,
        });
      }

      const fallbackConfig: FormConfig = {
        id: `template-${template.id}`,
        name: template.name,
        version: String(template.version),
        description: template.description ?? undefined,
        treatmentType: template.treatmentType ?? undefined,
        steps: [],
        startStep: '',
        languages: ['en'],
        defaultLanguage: 'en',
        integrations: [{ type: 'platform', triggers: ['complete'] }],
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      };

      return NextResponse.json({
        config: fallbackConfig,
        branding: {},
        clinicName: clinic.name,
      });
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/intake-forms/config' });
  }
}
