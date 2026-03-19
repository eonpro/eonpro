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
import { weightLossIntakeConfig } from '@/domains/intake/templates/weight-loss-intake';
import { otMensIntakeConfig } from '@/domains/intake/templates/ot-mens-intake';
import { wellmedrIntakeConfig } from '@/domains/intake/templates/wellmedr-intake';

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
      const candidates = await prisma.intakeFormTemplate.findMany({
        where: {
          clinicId: clinic.id,
          isActive: true,
          OR: [
            { treatmentType: templateSlug },
            { name: templateSlug },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      // No DB template — fall back to hardcoded TS configs for known clinic/template combos
      if (candidates.length === 0) {
        const isOtNoDb = clinicSlug === 'ot' || clinicSlug === 'otmens';
        if (templateSlug === 'weight-loss') {
          const fallback = isOtNoDb ? otMensIntakeConfig : weightLossIntakeConfig;
          const settings = clinic.settings as Record<string, unknown> | null;
          const portalSettings = settings?.patientPortal as Record<string, unknown> | null;
          const branding: FormBranding = isOtNoDb
            ? {
                logo: otMensIntakeConfig.branding?.logo ?? undefined,
                primaryColor: '#413d3d',
                accentColor: '#cab172',
                secondaryColor: '#f5ecd8',
              }
            : {
                logo: (portalSettings?.logoUrl as string) ?? undefined,
                primaryColor: (portalSettings?.primaryColor as string) ?? '#413d3d',
                accentColor: (portalSettings?.accentColor as string) ?? '#f0feab',
                secondaryColor: (portalSettings?.secondaryColor as string) ?? '#4fa87f',
              };
          return NextResponse.json({
            config: { ...fallback, id: `clinic-${clinic.id}-weight-loss` },
            branding,
            clinicName: clinic.name,
          });
        }
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const template = candidates.find((t) => {
        const meta = t.metadata as Record<string, unknown> | null;
        const cfg = meta?.formConfig as FormConfig | undefined;
        return !!cfg?.startStep && Array.isArray(cfg?.steps) && cfg.steps.length > 0;
      }) ?? candidates[0];

      const metadata = template.metadata as Record<string, unknown> | null;
      const dbFormConfig = metadata?.formConfig as FormConfig | undefined;

      // For weight-loss templates, always use the canonical TypeScript config
      // which includes state options, height options, and all conditional branching.
      // The DB may have a stale snapshot — the TS file is the source of truth.
      const isWeightLoss =
        templateSlug === 'weight-loss' ||
        template.treatmentType === 'weight-loss';

      const isOtMens = isWeightLoss && (clinicSlug === 'ot' || clinicSlug === 'otmens');
      const isWellmedr = isWeightLoss && clinicSlug === 'wellmedr';

      const formConfig = isWellmedr
        ? { ...wellmedrIntakeConfig, id: `template-${template.id}` }
        : isOtMens
        ? { ...otMensIntakeConfig, id: `template-${template.id}` }
        : isWeightLoss
        ? { ...weightLossIntakeConfig, id: `template-${template.id}` }
        : dbFormConfig;

      if (formConfig) {
        const settings = clinic.settings as Record<string, unknown> | null;
        const portalSettings = settings?.patientPortal as Record<string, unknown> | null;

        const branding: FormBranding = isWellmedr
          ? {
              logo: wellmedrIntakeConfig.branding?.logo ?? '/wellmedr-logo.svg',
              primaryColor: '#0C2631',
              accentColor: '#7B95A9',
              secondaryColor: '#F7F7F9',
            }
          : {
              logo: (portalSettings?.logoUrl as string) ?? undefined,
              primaryColor: (portalSettings?.primaryColor as string) ?? '#413d3d',
              accentColor: (portalSettings?.accentColor as string) ?? '#f0feab',
              secondaryColor: (portalSettings?.secondaryColor as string) ?? '#4fa87f',
              ...(dbFormConfig?.branding ?? {}),
            };

        return NextResponse.json({
          config: formConfig,
          branding,
          clinicName: clinic.name,
        });
      }

      if (templateSlug === 'weight-loss') {
        const settings = clinic.settings as Record<string, unknown> | null;
        const portalSettings = settings?.patientPortal as Record<string, unknown> | null;
        const isOtFallback = clinicSlug === 'ot' || clinicSlug === 'otmens';
        const isWellmedrFallback = clinicSlug === 'wellmedr';
        const fallbackConfig = isWellmedrFallback
          ? wellmedrIntakeConfig
          : isOtFallback ? otMensIntakeConfig : weightLossIntakeConfig;
        const branding: FormBranding = isWellmedrFallback
          ? {
              logo: wellmedrIntakeConfig.branding?.logo ?? '/wellmedr-logo.svg',
              primaryColor: '#0C2631',
              accentColor: '#7B95A9',
              secondaryColor: '#F7F7F9',
            }
          : isOtFallback
          ? {
              logo: otMensIntakeConfig.branding?.logo ?? undefined,
              primaryColor: '#413d3d',
              accentColor: '#cab172',
              secondaryColor: '#f5ecd8',
            }
          : {
              logo: (portalSettings?.logoUrl as string) ?? undefined,
              primaryColor: (portalSettings?.primaryColor as string) ?? '#413d3d',
              accentColor: (portalSettings?.accentColor as string) ?? '#f0feab',
              secondaryColor: (portalSettings?.secondaryColor as string) ?? '#4fa87f',
            };
        return NextResponse.json({
          config: { ...fallbackConfig, id: `template-${template.id}` },
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
