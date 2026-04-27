'use client';

import { useState, useEffect } from 'react';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import {
  parseDoseFromDirections,
  parseMultiMonthDirections,
  isSupplyMedication,
} from '@/lib/utils/rx-sig-parser';

export interface DoseScheduleItem {
  week: string;
  dose: number;
  label: string;
  desc: string;
}

interface RxMedication {
  name: string;
  directions: string;
  daysSupply: number;
  quantity: string;
  form: string;
}

interface Prescription {
  prescribedDate: string;
  medications: RxMedication[];
}

const TIRZEPATIDE_TITRATION_DOSES = [2.5, 5, 7.5, 10, 12.5, 15];
const SEMAGLUTIDE_TITRATION_DOSES = [0.25, 0.5, 1.0, 1.7, 2.4];

const STEP_DESCRIPTIONS = [
  'Starting dose',
  'First increase',
  'Building up',
  'Approaching target',
  'Second target',
  'Maintenance dose',
];

/**
 * Builds a titration schedule that starts at the patient's prescribed dose
 * and continues up the standard ladder from there.
 *
 * Example: patient prescribed 10 mg tirzepatide →
 *   Weeks 1-4: 10 mg (Starting dose)
 *   Weeks 5-8: 12.5 mg (First increase)
 *   Weeks 9-12+: 15 mg (Maintenance dose)
 */
function buildTitrationFromDose(startDoseMg: number, ladder: number[]): DoseScheduleItem[] | null {
  let startIdx = ladder.findIndex((d) => d === startDoseMg);

  if (startIdx === -1) {
    startIdx = ladder.findIndex((d) => d >= startDoseMg);
    if (startIdx === -1) startIdx = ladder.length - 1;
  }

  const remaining = ladder.slice(startIdx);
  if (remaining.length === 0) return null;

  return remaining.map((dose, i) => {
    const isLast = i === remaining.length - 1;
    const weekStart = i * 4 + 1;
    const weekEnd = weekStart + 3;

    let desc: string;
    if (remaining.length === 1) {
      desc = 'Maintenance dose';
    } else if (i === 0) {
      desc = STEP_DESCRIPTIONS[0];
    } else if (isLast) {
      desc = 'Maintenance dose';
    } else {
      desc = STEP_DESCRIPTIONS[Math.min(i, STEP_DESCRIPTIONS.length - 2)];
    }

    return {
      week: isLast ? `${weekStart}+` : `${weekStart}-${weekEnd}`,
      dose,
      label: isLast ? `Week ${weekStart}+` : `Weeks ${weekStart}-${weekEnd}`,
      desc,
    };
  });
}

/**
 * Fetches the patient's prescriptions and builds a personalized dosing
 * schedule for the given medication type. The schedule starts at the
 * patient's prescribed dose and continues up the standard titration
 * ladder from there. Returns null when no matching prescription is found
 * (callers should fall back to the full standard titration).
 */
export function usePatientDoseSchedule(medicationType: 'tirzepatide' | 'semaglutide'): {
  schedule: DoseScheduleItem[] | null;
  loading: boolean;
} {
  const [schedule, setSchedule] = useState<DoseScheduleItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const ladder =
      medicationType === 'tirzepatide' ? TIRZEPATIDE_TITRATION_DOSES : SEMAGLUTIDE_TITRATION_DOSES;

    portalFetch('/api/patient-portal/prescriptions')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = await safeParseJson(res);
        if (!data || typeof data !== 'object' || cancelled) return;

        const prescriptions: Prescription[] =
          (data as { prescriptions?: Prescription[] }).prescriptions || [];

        const sorted = [...prescriptions].sort(
          (a, b) => new Date(b.prescribedDate).getTime() - new Date(a.prescribedDate).getTime()
        );

        for (const rx of sorted) {
          for (const med of rx.medications || []) {
            const name = (med.name || '').toLowerCase();
            if (!name.includes(medicationType)) continue;
            if (isSupplyMedication(med.name)) continue;

            // Multi-month SIG with explicit per-month doses — use as-is
            const multiMonth = parseMultiMonthDirections(med.directions);
            if (multiMonth && multiMonth.length >= 2) {
              let weekCursor = 1;
              const items = multiMonth.map((segment, i) => {
                const weekStart = weekCursor;
                const weekEnd = weekCursor + segment.weeks - 1;
                weekCursor += segment.weeks;
                const doseMg = segment.dose ? parseFloat(segment.dose.mg) : 0;
                return {
                  week: `${weekStart}-${weekEnd}`,
                  dose: doseMg,
                  label: `Weeks ${weekStart}-${weekEnd}`,
                  desc:
                    i === 0
                      ? 'Starting dose'
                      : i === multiMonth.length - 1
                        ? 'Target dose'
                        : 'Dose increase',
                };
              });
              if (!cancelled) setSchedule(items);
              return;
            }

            // Single-dose SIG — start titration from this dose
            const dose = parseDoseFromDirections(med.directions);
            if (dose?.mg) {
              const doseMg = parseFloat(dose.mg);
              if (!isNaN(doseMg) && doseMg > 0) {
                const built = buildTitrationFromDose(doseMg, ladder);
                if (built && !cancelled) {
                  setSchedule(built);
                  return;
                }
              }
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [medicationType]);

  return { schedule, loading };
}
