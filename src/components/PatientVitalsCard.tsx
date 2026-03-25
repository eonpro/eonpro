'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch';

interface Vitals {
  height: string | null;
  weight: string | null;
  bmi: string | null;
  bloodPressure: string | null;
  idealWeight: string | null;
}

type ColorResult = { bar: string; text: string; width: string };

const GRAY_DEFAULT: ColorResult = { bar: 'bg-gray-400', text: 'text-gray-600', width: '0%' };
const YELLOW: Omit<ColorResult, 'width'> = { bar: 'bg-yellow-500', text: 'text-yellow-600' };
const GREEN: Omit<ColorResult, 'width'> = { bar: 'bg-emerald-500', text: 'text-emerald-600' };
const RED: Omit<ColorResult, 'width'> = { bar: 'bg-red-500', text: 'text-red-600' };

function getBmiColor(bmi: string | null | undefined): ColorResult {
  if (!bmi) return GRAY_DEFAULT;
  const bmiNum = parseFloat(bmi);
  if (isNaN(bmiNum)) return GRAY_DEFAULT;
  const width = `${Math.min(100, Math.max(0, ((bmiNum - 15) / 35) * 100))}%`;
  if (bmiNum < 18.5) return { ...YELLOW, width };
  if (bmiNum < 25) return { ...GREEN, width };
  if (bmiNum < 30) return { ...YELLOW, width };
  return { ...RED, width };
}

function getBloodPressureColor(bp: string | null | undefined): ColorResult {
  if (!bp || bp.toLowerCase() === 'unknown') return GRAY_DEFAULT;
  const parts = bp.replace(/\s/g, '').split('/');
  if (parts.length !== 2) return { ...GRAY_DEFAULT, width: '50%' };
  const systolic = parseInt(parts[0]);
  const diastolic = parseInt(parts[1]);
  if (isNaN(systolic) || isNaN(diastolic)) return { ...GRAY_DEFAULT, width: '50%' };
  const width = `${Math.min(100, Math.max(0, ((systolic - 90) / 90) * 100))}%`;
  if (systolic < 120 && diastolic < 80) return { ...GREEN, width };
  if (systolic < 130 && diastolic < 80) return { ...YELLOW, width };
  if (systolic < 140 || diastolic < 90) return { ...YELLOW, width };
  return { ...RED, width };
}

function getWeightColor(weight: string | null | undefined, bmi: string | null | undefined): ColorResult {
  if (!weight) return GRAY_DEFAULT;
  const weightNum = parseFloat(weight.replace(/[^\d.]/g, ''));
  if (isNaN(weightNum)) return GRAY_DEFAULT;
  const width = `${Math.min(100, Math.max(0, ((weightNum - 100) / 300) * 100))}%`;
  if (bmi) {
    const bmiColor = getBmiColor(bmi);
    return { ...bmiColor, width };
  }
  return { bar: 'bg-gray-500', text: 'text-gray-600', width };
}

function VitalsSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-gray-200" />
        <div className="h-5 w-14 rounded bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl bg-[#efece7] p-3 md:p-4">
            <div className="mb-1 h-3 w-14 rounded bg-gray-200" />
            <div className="mb-3 h-7 w-16 rounded bg-gray-200" />
            <div className="h-2 w-full rounded-full bg-gray-300" />
          </div>
        ))}
      </div>
    </div>
  );
}

function VitalCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: { bar: string; text: string; width: string };
}) {
  const hasValue = value !== '—';
  return (
    <div className="rounded-xl bg-[#efece7] p-3 md:p-4">
      <p className="mb-0.5 text-xs text-gray-500 md:mb-1 md:text-sm">{label}</p>
      <p className={`text-lg font-bold md:text-2xl ${hasValue ? color.text : 'text-gray-900'}`}>
        {value}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-300 md:mt-3 md:h-2">
        <div
          className={`h-full ${color.bar} rounded-full transition-all duration-500`}
          style={{ width: color.width }}
        />
      </div>
    </div>
  );
}

export default function PatientVitalsCard({ patientId }: { patientId: number }) {
  const { data: vitals, isLoading, isError, refetch } = useQuery<Vitals>({
    queryKey: ['patient-vitals', patientId],
    queryFn: async (): Promise<Vitals> => {
      const res = await apiFetch(`/api/patients/${patientId}/vitals`);
      if (!res.ok) throw new Error('Failed to load vitals');
      return res.json() as Promise<Vitals>;
    },
  });

  if (isLoading) return <VitalsSkeleton />;

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-700">Unable to load vitals data.</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!vitals) return <VitalsSkeleton />;

  const bmiColor = getBmiColor(vitals.bmi);
  const bpColor = getBloodPressureColor(vitals.bloodPressure);
  const weightColor = getWeightColor(vitals.weight, vitals.bmi);
  let weightDisplay = '—';
  if (vitals.weight) {
    weightDisplay = vitals.weight.toLowerCase().includes('lb')
      ? vitals.weight
      : `${vitals.weight} lbs`;
  }
  const bpDisplay =
    vitals.bloodPressure && vitals.bloodPressure.toLowerCase() !== 'unknown'
      ? vitals.bloodPressure
      : '—';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-900">Vitals</h2>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        <VitalCard
          label="Height"
          value={vitals.height ?? '—'}
          color={{ bar: 'bg-gray-500', text: 'text-gray-900', width: vitals.height ? '100%' : '0%' }}
        />
        <VitalCard label="Weight" value={weightDisplay} color={weightColor} />
        <VitalCard label="BMI" value={vitals.bmi ?? '—'} color={bmiColor} />
        <VitalCard label="BP" value={bpDisplay} color={bpColor} />
      </div>
    </div>
  );
}
