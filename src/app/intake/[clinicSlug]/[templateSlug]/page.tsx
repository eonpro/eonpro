import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { basePrisma, runWithClinicContext } from '@/lib/db';
import { prisma } from '@/lib/db';

const INTAKE_CUSTOM_DOMAINS: Record<string, string> = {
  'intake.otmens.com': 'ot',
};
import { weightLossIntakeConfig } from '@/domains/intake/templates/weight-loss-intake';
import { otMensIntakeConfig } from '@/domains/intake/templates/ot-mens-intake';
import { wellmedrIntakeConfig } from '@/domains/intake/templates/wellmedr-intake';
import { otMensPeptideIntakeConfig } from '@/domains/intake/templates/ot-mens-peptide-intake';
import { otMensTRTIntakeConfig } from '@/domains/intake/templates/ot-mens-trt-intake';
import type { FormConfig } from '@/domains/intake/types/form-engine';

interface Props {
  params: Promise<{ clinicSlug: string; templateSlug: string }>;
}

export default async function IntakeLandingPage({ params }: Props) {
  const { clinicSlug, templateSlug } = await params;

  const clinic = await basePrisma.clinic.findFirst({
    where: {
      OR: [{ subdomain: clinicSlug }, { customDomain: clinicSlug }],
    },
    select: { id: true },
  });

  if (!clinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Form Unavailable</h2>
          <p className="text-sm text-gray-500">Form not found. Please check the URL.</p>
        </div>
      </div>
    );
  }

  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const isWellmedr = clinicSlug === 'wellmedr';

  const startStep = await runWithClinicContext(clinic.id, async () => {
    const candidates = await prisma.intakeFormTemplate.findMany({
      where: {
        clinicId: clinic.id,
        isActive: true,
        OR: [{ treatmentType: templateSlug }, { name: templateSlug }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    // No DB template — fall back to hardcoded TS configs for known clinic/template combos
    if (candidates.length === 0) {
      if (templateSlug === 'weight-loss') {
        return isWellmedr
          ? wellmedrIntakeConfig.startStep
          : isOt
            ? otMensIntakeConfig.startStep
            : weightLossIntakeConfig.startStep;
      }
      if (templateSlug === 'peptides' && isOt) {
        return otMensPeptideIntakeConfig.startStep;
      }
      if (templateSlug === 'trt' && isOt) {
        return otMensTRTIntakeConfig.startStep;
      }
      return null;
    }

    const template =
      candidates.find((t) => {
        const meta = t.metadata as Record<string, unknown> | null;
        const cfg = meta?.formConfig as FormConfig | undefined;
        return !!cfg?.startStep && Array.isArray(cfg?.steps) && cfg.steps.length > 0;
      }) ?? candidates[0];

    if (templateSlug === 'weight-loss' || template.treatmentType === 'weight-loss') {
      return isWellmedr
        ? wellmedrIntakeConfig.startStep
        : isOt
          ? otMensIntakeConfig.startStep
          : weightLossIntakeConfig.startStep;
    }

    if ((templateSlug === 'peptides' || template.treatmentType === 'peptides') && isOt) {
      return otMensPeptideIntakeConfig.startStep;
    }

    if ((templateSlug === 'trt' || template.treatmentType === 'trt') && isOt) {
      return otMensTRTIntakeConfig.startStep;
    }

    const metadata = template.metadata as Record<string, unknown> | null;
    const formConfig = metadata?.formConfig as FormConfig | undefined;

    if (formConfig?.startStep) return formConfig.startStep;

    return null;
  });

  if (startStep) {
    const headersList = await headers();
    const host = (headersList.get('x-forwarded-host') || headersList.get('host') || '')
      .split(':')[0]
      .toLowerCase();
    const isIntakeDomain = host in INTAKE_CUSTOM_DOMAINS;
    const redirectPath = isIntakeDomain
      ? `/${templateSlug}/${startStep}`
      : `/intake/${clinicSlug}/${templateSlug}/${startStep}`;
    redirect(redirectPath);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-8 w-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Form Unavailable</h2>
        <p className="text-sm text-gray-500">This form has no steps configured yet.</p>
      </div>
    </div>
  );
}
