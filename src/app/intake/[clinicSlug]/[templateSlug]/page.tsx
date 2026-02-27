import { redirect } from 'next/navigation';
import { basePrisma, runWithClinicContext } from '@/lib/db';
import { prisma } from '@/lib/db';
import { weightLossIntakeConfig } from '@/domains/intake/templates/weight-loss-intake';
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Form Unavailable</h2>
          <p className="text-gray-500 text-sm">Form not found. Please check the URL.</p>
        </div>
      </div>
    );
  }

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

    if (candidates.length === 0) return null;

    const template = candidates.find((t) => {
      const meta = t.metadata as Record<string, unknown> | null;
      const cfg = meta?.formConfig as FormConfig | undefined;
      return !!cfg?.startStep && Array.isArray(cfg?.steps) && cfg.steps.length > 0;
    }) ?? candidates[0];

    const metadata = template.metadata as Record<string, unknown> | null;
    const formConfig = metadata?.formConfig as FormConfig | undefined;

    if (formConfig?.startStep) return formConfig.startStep;

    if (templateSlug === 'weight-loss' && weightLossIntakeConfig.startStep) {
      return weightLossIntakeConfig.startStep;
    }

    return null;
  });

  if (startStep) {
    redirect(`/intake/${clinicSlug}/${templateSlug}/${startStep}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Form Unavailable</h2>
        <p className="text-gray-500 text-sm">This form has no steps configured yet.</p>
      </div>
    </div>
  );
}
