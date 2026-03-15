'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useClinicBranding, getContrastTextColor } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { logger } from '@/lib/logger';
import {
  Play,
  Syringe,
  Thermometer,
  Snowflake,
  Sun,
  Eye,
  ChevronRight,
  Check,
  Calendar,
  ArrowLeft,
  PackageCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirrored from medications page)
// ---------------------------------------------------------------------------

interface RxMedication {
  id: number;
  medicationKey?: string;
  name: string;
  strength: string;
  form: string;
  quantity: string;
  directions: string;
  daysSupply: number;
}

interface Prescription {
  id: number;
  status: string;
  prescribedDate: string;
  provider: { name: string } | null;
  medications: RxMedication[];
  shipping: { status: string; trackingNumber: string | null };
}

// ---------------------------------------------------------------------------
// Helpers (shared logic with medications page)
// ---------------------------------------------------------------------------

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function isSupplyMedication(name: string): boolean {
  const n = (name || '').toLowerCase();
  return n.includes('syringe') || n.includes('alcohol pad') || n.includes('needle') || n.includes('kit');
}

function isInjectableMedication(name: string): boolean {
  const n = (name || '').toLowerCase();
  return (
    n.includes('semaglutide') || n.includes('tirzepatide') || n.includes('testosterone') ||
    n.includes('sermorelin') || n.includes('bpc') || n.includes('tb-500')
  );
}

function parseDoseFromDirections(directions: string): { mg: string; units: string } | null {
  if (!directions) return null;
  const m = directions.match(/inject\s+([\d.]+)\s*mg\s*\([^)]*?(\d+)\s*units?\)/i);
  if (m?.[1] && m?.[2]) return { mg: m[1], units: m[2] };
  const unitsWithMg = directions.match(/inject\s+(\d+)\s*units?\s*\(([\d.]+)\s*mg\)/i);
  if (unitsWithMg?.[1] && unitsWithMg?.[2]) return { mg: unitsWithMg[2], units: unitsWithMg[1] };
  const mgOnly = directions.match(/inject\s+([\d.]+)\s*mg/i);
  if (mgOnly?.[1]) return { mg: mgOnly[1], units: '' };
  const uOnly = directions.match(/inject\s+(\d+)\s*units?/i);
  if (uOnly?.[1]) return { mg: '', units: uOnly[1] };
  return null;
}

function reformatDirectionsUnitsFirst(directions: string): string {
  if (!directions) return directions;
  return directions.replace(
    /inject\s+([\d.]+)\s*mg\s*\([^)]*?(\d+)\s*units?\)/gi,
    (_, mg, units) => `Inject ${units} units (${mg} mg)`
  );
}

function extractMgValue(...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    if (!input) continue;
    const m = input.match(/(\d+(?:\.\d+)?)\s*mg/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractMlValue(...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    if (!input) continue;
    const m = input.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function getMedicationDisplayName(med: RxMedication): string {
  const medName = med.name || 'Medication';
  if (medName.toLowerCase().includes('semaglutide')) {
    const mg = extractMgValue(med.strength, med.name);
    const vialMl = extractMlValue(med.quantity, med.name, med.form);
    if (mg && vialMl) return `Semaglutide ${mg}mg/1ml (${vialMl}ml)`;
    if (mg) return `Semaglutide ${mg}mg/1ml`;
    if (vialMl) return `Semaglutide (${vialMl}ml)`;
    return 'Semaglutide';
  }
  const normalized = toTitleCase(medName.replace(/\s+/g, ' ').trim());
  const str = med.strength ? med.strength.toLowerCase().trim() : '';
  if (!str || str.startsWith('solution')) {
    return normalized;
  }
  return str ? `${normalized} ${str}` : normalized;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WelcomeKitPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';
  const accentText = getContrastTextColor(accentColor) === 'light' ? '#ffffff' : '#1f2937';

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalFetch('/api/patient-portal/prescriptions')
      .then(async (res) => {
        if (res.ok) {
          const data = await safeParseJson(res);
          if (data && typeof data === 'object') {
            setPrescriptions((data as { prescriptions?: Prescription[] }).prescriptions || []);
          }
        }
      })
      .catch((err) => {
        logger.error('[WelcomeKit] Failed to load prescriptions', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Build dosing schedule from actual prescriptions
  const dosingItems = (() => {
    const sorted = [...prescriptions].sort(
      (a, b) => new Date(a.prescribedDate).getTime() - new Date(b.prescribedDate).getTime(),
    );

    const items: Array<{
      monthNumber: number;
      monthEnd: number;
      weekStart: number;
      weekEnd: number;
      date: string;
      medName: string;
      directions: string;
      dose: { mg: string; units: string } | null;
      isActive: boolean;
      isTitration: boolean;
    }> = [];

    let monthNum = 0;
    let weekCursor = 1;
    let prevDoseKey = '';

    for (const order of sorted) {
      const injectables = (order.medications ?? []).filter(
        (m) => isInjectableMedication(m.name) && !isSupplyMedication(m.name),
      );
      if (injectables.length === 0) continue;

      for (const med of injectables) {
        monthNum++;
        const weeks = med.daysSupply > 0 ? Math.round(med.daysSupply / 7) : 4;
        const monthsCovered = Math.max(1, Math.ceil(weeks / 4));
        const monthStart = monthNum;
        const monthEnd = monthNum + monthsCovered - 1;
        monthNum = monthEnd;
        const weekStart = weekCursor;
        const weekEnd = weekCursor + weeks - 1;
        weekCursor = weekEnd + 1;

        const dose = parseDoseFromDirections(med.directions);
        const doseKey = dose ? `${dose.mg}-${dose.units}` : med.directions;
        const isTitration = prevDoseKey !== '' && doseKey !== prevDoseKey;
        prevDoseKey = doseKey;

        const isActive = ['pending', 'processing', 'shipped', 'active', 'approved', 'submitted', 'in_progress'].includes(
          (order.status || '').toLowerCase(),
        );

        items.push({ monthNumber: monthStart, monthEnd, weekStart, weekEnd, date: order.prescribedDate, medName: getMedicationDisplayName(med), directions: reformatDirectionsUnitsFirst(med.directions), dose, isActive, isTitration });
      }
    }
    return items;
  })();

  const currentIdx = dosingItems.findIndex((d) => d.isActive);

  return (
    <div className="min-h-[100dvh] px-3 py-4 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`${PATIENT_PORTAL_PATH}/shipments`}
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Shipments
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: accentColor }}
          >
            <PackageCheck className="h-6 w-6" style={{ color: accentText }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Welcome to Your Treatment</h1>
            <p className="mt-0.5 text-sm text-gray-500 sm:text-base">
              Everything you need to get started with your medication
            </p>
          </div>
        </div>
      </div>

      {/* ── Section A: Injection Video ── */}
      <section className="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Play className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">How to Inject</h2>
              <p className="text-sm text-gray-500">Watch this short video before your first injection</p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          <div className="relative overflow-hidden rounded-2xl bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 h-full w-full"
              src="https://www.youtube.com/embed/RUxd5uk_lAc?rel=0"
              title="How to Safely Apply a Semaglutide Injection at Home"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ── Section B: Dosing Schedule ── */}
      <section className="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Syringe className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Your Dosing Schedule</h2>
              <p className="text-sm text-gray-500">
                Each prescription covers 4 weekly injections at the listed dose
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : dosingItems.length === 0 ? (
          <div className="p-8 text-center">
            <Syringe className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-500">No injectable prescriptions found yet.</p>
            <p className="mt-1 text-sm text-gray-400">Your dosing schedule will appear once your provider prescribes your treatment.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {dosingItems.map((item, idx) => {
              const isCurrent = idx === currentIdx;
              const hasCurrentDose = currentIdx >= 0;
              const isPast = hasCurrentDose ? idx < currentIdx : !item.isActive;
              const isGrayed = hasCurrentDose && idx < currentIdx;
              return (
                <div
                  key={`${item.monthNumber}`}
                  className={`relative flex gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5 ${isCurrent ? 'bg-emerald-50/60' : ''}`}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:h-10 sm:w-10 ${
                        isCurrent ? 'text-white shadow-md' : isGrayed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}
                      style={isCurrent ? { backgroundColor: primaryColor } : undefined}
                    >
                      {item.monthNumber}
                    </div>
                    {idx < dosingItems.length - 1 && (
                      <div
                        className={`mt-1 w-0.5 flex-1 ${isGrayed ? 'bg-gray-200' : 'bg-gray-100'}`}
                        style={isCurrent ? { backgroundColor: `${primaryColor}40` } : undefined}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold sm:text-base ${isCurrent ? 'text-gray-900' : isGrayed ? 'text-gray-400' : 'text-gray-700'}`}>
                        Month {item.monthNumber}{item.monthEnd > item.monthNumber ? ` and ${item.monthEnd}` : ''}
                      </span>
                      <span className={`text-[10px] font-semibold sm:text-xs ${isGrayed ? 'text-gray-300' : 'text-gray-400'}`}>
                        Weeks {item.weekStart}&ndash;{item.weekEnd}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs" style={{ backgroundColor: primaryColor }}>
                          Current
                        </span>
                      )}
                      {isPast && (
                        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400 sm:text-xs">
                          <Check className="h-3 w-3" /> Done
                        </span>
                      )}
                      {item.isTitration && !isPast && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 sm:text-xs">
                          Dose increase
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs sm:text-sm ${isGrayed ? 'text-gray-400' : 'text-gray-500'}`}>
                      {item.medName}
                      <span className="mx-1.5 text-gray-300">&middot;</span>
                      Prescribed {formatDate(item.date)}
                    </p>
                    <div className={`mt-2 rounded-xl p-3 ${isCurrent ? 'border border-emerald-200 bg-white' : 'bg-gray-50'}`}>
                      {item.dose && (item.dose.mg || item.dose.units) ? (
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className={`text-xs font-semibold uppercase tracking-wider ${isGrayed ? 'text-gray-300' : 'text-gray-400'}`}>
                            Inject weekly:
                          </span>
                          {item.dose.units && (
                            <span
                              className={`text-lg font-bold uppercase sm:text-xl ${isCurrent ? '' : isGrayed ? 'text-gray-300' : 'text-gray-700'}`}
                              style={isCurrent ? { color: primaryColor } : undefined}
                            >
                              {item.dose.units} units
                            </span>
                          )}
                          {item.dose.mg && (
                            <span className={`text-sm font-medium ${isGrayed ? 'text-gray-300' : 'text-gray-500'}`}>
                              ({item.dose.mg} mg)
                            </span>
                          )}
                        </div>
                      ) : null}
                      <p className={`${item.dose && (item.dose.mg || item.dose.units) ? 'mt-1.5' : ''} text-xs leading-relaxed sm:text-sm ${isGrayed ? 'text-gray-300' : 'text-gray-600'}`}>
                        {item.directions}
                      </p>
                      {isCurrent && (
                        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-gray-400 sm:text-xs">
                          <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          1 injection per week &middot; {item.weekEnd - item.weekStart + 1} weeks at this dose
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section C: Storage Instructions ── */}
      <section className="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Thermometer className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Storage Instructions</h2>
              <p className="text-sm text-gray-500">Keep your medication safe and effective</p>
            </div>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4">
              <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Refrigerate at 36–46 °F (2–8 °C)</p>
                <p className="mt-0.5 text-xs text-blue-700">Store in the refrigerator as soon as you receive your package.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4">
              <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-900">Do Not Freeze</p>
                <p className="mt-0.5 text-xs text-red-700">Freezing destroys the medication. Discard if frozen.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4">
              <Eye className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Protect from Light</p>
                <p className="mt-0.5 text-xs text-amber-700">Keep the vial in its original packaging or a dark area.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-4">
              <Sun className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Room Temperature — Up to 21 Days</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  May be kept at room temperature up to 77 °F (25 °C) for up to 21 days.
                  Discard if exposed to temperatures above 86 °F (30 °C).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="pb-6">
        <Link
          href={`${PATIENT_PORTAL_PATH}/medications`}
          className="group flex items-center justify-between rounded-2xl bg-white p-5 shadow-lg shadow-gray-200/50 transition-all hover:shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Syringe className="h-6 w-6" style={{ color: primaryColor }} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Go to Medications</p>
              <p className="text-sm text-gray-500">View your full treatment details</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
