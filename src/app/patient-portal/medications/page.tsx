'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useClinicBranding, getContrastTextColor } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { usePatientId } from '@/hooks/usePatientId';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { MedicationsPageSkeleton } from '@/components/patient-portal/PortalSkeletons';
import {
  isSupplyMedication,
  isInjectableMedication,
  getMedicationDisplayName,
} from '@/lib/utils/rx-sig-parser';
import {
  buildDosingSchedule,
  getCurrentDoseIndex,
  type DosingSchedulePrescription,
  type DosingScheduleItem,
} from '@/lib/utils/buildDosingSchedule';
import type { MedicationFamily, Cadence } from '@/lib/utils/rx-sig-parser';
import {
  Pill,
  Clock,
  Calendar,
  Bell,
  ChevronRight,
  Plus,
  Trash2,
  Download,
  Check,
  AlertCircle,
  X,
  Syringe,
  CreditCard,
  Package,
  ChevronDown,
  ChevronUp,
  FileText,
  Truck,
  ExternalLink,
} from 'lucide-react';

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
  shipping: {
    status: string;
    trackingNumber: string | null;
  };
}

interface BillingPlan {
  id: number;
  name: string;
  status: string;
  interval: string;
  amount: number;
  currency: string;
  nextBillingDate: string | null;
  currentPeriodEnd: string | null;
  startDate: string | null;
  vialCount: number;
}

interface InvoiceRecord {
  id: number;
  invoiceNumber: string;
  date: string;
  amount: number | null;
  amountPaid: number;
  status: string;
  description: string;
}

interface Reminder {
  id: number;
  patientId: number;
  medicationName: string;
  dayOfWeek: number;
  timeOfDay: string;
  isActive: boolean;
}

const daysOfWeek = [
  { value: 0, label: 'S', full: 'Sunday' },
  { value: 1, label: 'M', full: 'Monday' },
  { value: 2, label: 'T', full: 'Tuesday' },
  { value: 3, label: 'W', full: 'Wednesday' },
  { value: 4, label: 'T', full: 'Thursday' },
  { value: 5, label: 'F', full: 'Friday' },
  { value: 6, label: 'S', full: 'Saturday' },
];

// Friendly display name per medication family. For GLP-1 we prefer the
// actual prescribed med name (Semaglutide vs Tirzepatide) when items
// are available; for the add-ons we use a fixed brand-style label.
function familyDisplayName(
  family: MedicationFamily,
  items: DosingScheduleItem[]
): string {
  if (family === 'glp1') return items[0]?.medName ?? 'GLP-1';
  if (family === 'sermorelin') return 'Sermorelin';
  if (family === 'nad_plus') return 'NAD+';
  if (family === 'b12') return 'Cyanocobalamin (B12)';
  if (family === 'testosterone') return 'Testosterone';
  if (family === 'bpc') return 'BPC-157';
  if (family === 'tb500') return 'TB-500';
  return items[0]?.medName ?? 'Medication';
}

// Short cadence chip rendered in each family's header.
function cadenceDisplayLabel(cadence: Cadence, wasInferred: boolean): string {
  if (wasInferred) return 'Schedule per provider';
  switch (cadence) {
    case 'weekly':
      return 'Weekly';
    case 'twice-weekly':
      return 'Twice weekly';
    case 'thrice-weekly':
      return '3× per week';
    case 'daily':
      return 'Daily';
    case 'daily-mf':
      return 'Daily Mon–Fri';
    case 'every-other-day':
      return 'Every other day';
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return 'Monthly';
    default:
      return 'Schedule per provider';
  }
}

// Phrase used before the dose line ("Inject weekly: 20 units"). Falls
// back to "Inject" when the cadence is unknown so we never imply a
// frequency we did not extract from the SIG.
function cadenceInjectVerb(cadence: Cadence | undefined): string {
  switch (cadence) {
    case 'weekly':
      return 'Inject weekly';
    case 'twice-weekly':
      return 'Inject 2× per week';
    case 'thrice-weekly':
      return 'Inject 3× per week';
    case 'daily':
      return 'Inject daily';
    case 'daily-mf':
      return 'Inject Mon–Fri';
    case 'every-other-day':
      return 'Inject every other day';
    case 'biweekly':
      return 'Inject every 2 weeks';
    case 'monthly':
      return 'Inject monthly';
    default:
      return 'Inject';
  }
}

// Footer label under the "Current" month card.
function cadenceFooterLabel(
  cadence: { cadence: Cadence; injectionsPerWeek: number; cadenceWasInferred: boolean } | undefined
): string {
  if (!cadence || cadence.cadenceWasInferred) {
    return 'Schedule per provider';
  }
  const n = cadence.injectionsPerWeek;
  if (n === 1) return '1 injection per week';
  if (Number.isInteger(n)) return `${n} injections per week`;
  return `~${n.toFixed(1)} injections per week`;
}

export default function MedicationsPage() {
  const { t } = usePatientPortalLanguage();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';
  const accentIconColor = getContrastTextColor(accentColor) === 'light' ? '#ffffff' : '#1f2937';

  interface TrackingShipment {
    id: string;
    carrier: string;
    trackingNumber: string;
    trackingUrl: string | null;
    items: Array<{ name: string; strength?: string; quantity: number }>;
    orderedAt: string;
    shippedAt: string | null;
  }

  const { patientId, loading: patientIdLoading, error: patientIdError } = usePatientId();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [billingPlan, setBillingPlan] = useState<BillingPlan | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [trackingShipments, setTrackingShipments] = useState<TrackingShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [customMedicationName, setCustomMedicationName] = useState('');
  const [newReminder, setNewReminder] = useState({ dayOfWeek: 3, time: '08:00' });
  const [showSuccess, setShowSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDosingSchedule, setShowDosingSchedule] = useState(true);

  useEffect(() => {
    if (patientId) {
      loadData();
    } else if (!patientIdLoading) {
      setLoading(false);
      if (patientIdError) {
        setLoadError('Unable to load your profile. Please log out and log back in.');
      }
    }
  }, [patientId, patientIdLoading, patientIdError]);

  const loadData = async () => {
    setLoadError(null);

    if (!patientId) {
      setLoading(false);
      return;
    }

    const prescriptionsPromise = portalFetch('/api/patient-portal/prescriptions')
      .then(async (res) => {
        if (res.ok) {
          const data = await safeParseJson(res);
          if (data && typeof data === 'object') {
            const d = data as {
              prescriptions?: Prescription[];
              plan?: BillingPlan | null;
              invoiceHistory?: InvoiceRecord[];
            };
            setPrescriptions(d.prescriptions || []);
            setBillingPlan(d.plan || null);
            setInvoiceHistory(d.invoiceHistory || []);
          }
        }
      })
      .catch((err) => {
        logger.error('[Medications] Prescriptions fetch failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        setLoadError('Unable to load prescriptions. Please try again.');
      });

    const trackingPromise = portalFetch('/api/patient-portal/tracking')
      .then(async (res) => {
        if (res.ok) {
          const data = await safeParseJson(res);
          if (data && typeof data === 'object') {
            const d = data as {
              activeShipments?: TrackingShipment[];
              deliveredShipments?: TrackingShipment[];
            };
            const all = [...(d.activeShipments || []), ...(d.deliveredShipments || [])];
            all.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
            setTrackingShipments(all);
          }
        }
      })
      .catch((err) => {
        logger.error('[Medications] Tracking fetch failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    const remindersPromise = portalFetch(
      `/api/patient-progress/medication-reminders?patientId=${patientId}`
    )
      .then(async (res) => {
        const err = getPortalResponseError(res);
        if (err) {
          setLoadError(err);
          return;
        }
        if (res.ok) {
          const result = await safeParseJson(res);
          const data =
            result !== null
              ? Array.isArray(result)
                ? result
                : ((result as { data?: unknown[] })?.data ?? [])
              : [];
          setReminders(data);
        }
      })
      .catch((error) => {
        logger.error('Failed to fetch reminders', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      });

    await Promise.all([prescriptionsPromise, trackingPromise, remindersPromise]);
    setLoading(false);
  };

  const [reminderError, setReminderError] = useState<string | null>(null);

  const addReminder = async () => {
    setReminderError(null);
    const medicationName = customMedicationName?.trim() || '';

    if (!medicationName) {
      setReminderError('Please select or enter a medication name');
      return;
    }
    if (medicationName.length > 200) {
      setReminderError('Medication name is too long');
      return;
    }
    if (!newReminder.time || !/^\d{2}:\d{2}$/.test(newReminder.time)) {
      setReminderError('Please select a valid time');
      return;
    }
    if (!patientId) return;

    setSaving(true);
    try {
      const response = await portalFetch('/api/patient-progress/medication-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          medicationName,
          dayOfWeek: newReminder.dayOfWeek,
          timeOfDay: newReminder.time,
          isActive: true,
        }),
      });

      if (response.ok) {
        const savedReminder = await safeParseJson(response);
        if (savedReminder !== null && typeof savedReminder === 'object') {
          setReminders((prev) => [...prev, savedReminder as Reminder]);
        }
        setShowReminderModal(false);
        setCustomMedicationName('');
        setShowSuccess(t('medsReminderSaved'));
        setTimeout(() => setShowSuccess(''), 3000);
      } else {
        const errBody = await safeParseJson(response);
        setReminderError(
          errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: string }).error)
            : 'Failed to save reminder'
        );
      }
    } catch (error) {
      logger.error('Error saving reminder', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setReminderError('Failed to save reminder. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeReminder = async (id: number) => {
    const previousReminders = [...reminders];
    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      const response = await portalFetch(`/api/patient-progress/medication-reminders?id=${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setShowSuccess(t('medsReminderRemoved'));
        setTimeout(() => setShowSuccess(''), 2000);
      } else {
        setReminders(previousReminders);
        setLoadError('Failed to remove reminder. Please try again.');
      }
    } catch (error) {
      setReminders(previousReminders);
      logger.error('Error removing reminder', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setLoadError('Failed to remove reminder. Please try again.');
    }
  };

  const generateICS = (
    med: { name: string; dosage?: string; instructions?: string },
    reminder: Reminder
  ) => {
    const [hours, minutes] = reminder.timeOfDay.split(':').map(Number);
    const today = new Date();
    const eventDate = new Date(today);
    const daysUntilTarget = (reminder.dayOfWeek - today.getDay() + 7) % 7 || 7;
    eventDate.setDate(today.getDate() + daysUntilTarget);
    eventDate.setHours(hours, minutes, 0, 0);

    const endDate = new Date(eventDate);
    endDate.setMinutes(endDate.getMinutes() + 30);

    const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const summary = med.dosage ? `${med.name} - ${med.dosage}` : med.name;
    const description = med.instructions || 'Medication reminder';

    const clinicName = branding?.clinicName || 'EONPRO';
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${clinicName}//Medication Reminder//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
DTSTART:${formatDate(eventDate)}
DTEND:${formatDate(endDate)}
SUMMARY:${summary}
DESCRIPTION:${description}
RRULE:FREQ=WEEKLY;COUNT=12
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${med.name.toLowerCase().replace(/\s+/g, '-')}-reminder.ics`;
    link.click();
    URL.revokeObjectURL(url);

    setShowSuccess(t('medsCalendarDownloaded'));
    setTimeout(() => setShowSuccess(''), 3000);
  };

  const formatCurrency = (cents: number | null) => {
    if (cents === null || cents === undefined) return '$0.00';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (['active', 'paid', 'delivered', 'completed', 'shipped'].includes(s))
      return 'bg-emerald-100 text-emerald-700';
    if (['pending', 'processing', 'draft', 'in_progress'].includes(s))
      return 'bg-amber-100 text-amber-700';
    if (['cancelled', 'failed', 'voided', 'void'].includes(s)) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  const activePrescriptions = prescriptions.filter((p) =>
    ['pending', 'processing', 'shipped', 'active', 'approved', 'submitted', 'in_progress'].includes(
      (p.status || '').toLowerCase()
    )
  );
  const pastPrescriptions = prescriptions.filter(
    (p) =>
      ![
        'pending',
        'processing',
        'shipped',
        'active',
        'approved',
        'submitted',
        'in_progress',
      ].includes((p.status || '').toLowerCase())
  );

  const allActiveMeds = activePrescriptions.flatMap((p) =>
    (p.medications ?? [])
      .filter((m) => !isSupplyMedication(m.name))
      .map((m) => ({ ...m, prescription: p }))
  );

  const isMultiMonthPlan =
    billingPlan && (billingPlan.interval === '6-month' || billingPlan.interval === 'annual');

  const shipmentSchedule = useMemo(() => {
    if (!isMultiMonthPlan || !billingPlan?.startDate) return null;
    const start = new Date(billingPlan.startDate);
    const isAnnual = billingPlan.interval === 'annual';
    const offsetMonths = isAnnual ? [3, 6, 9] : [3];
    const totalMonths = isAnnual ? 12 : 6;

    const upcoming = offsetMonths.map((m) => {
      const d = new Date(start);
      d.setMonth(d.getMonth() + m);
      return d;
    });

    const now = new Date();
    const remaining = upcoming.filter((d) => d > now);

    return { totalMonths, upcoming, remaining };
  }, [isMultiMonthPlan, billingPlan?.startDate, billingPlan?.interval]);

  const dosingScheduleItems = useMemo(
    () => buildDosingSchedule(prescriptions as DosingSchedulePrescription[]).items,
    [prescriptions]
  );

  const now = new Date();
  const currentDoseIndex = getCurrentDoseIndex(dosingScheduleItems, now);

  // Group dosing items by clinical family so Elite Bundle patients
  // (Semaglutide + NAD+ + Sermorelin + B12) see one timeline per
  // medication instead of having add-ons silenced behind the GLP-1.
  // See `feat/patient-portal-multi-injectable-schedule` and
  // `.cursor/scratchpad.md` "Patient Portal Multi-Product Injection
  // Instructions Gap (2026-05-04)" for the full rationale and the
  // production audit data motivating this change.
  const dosingScheduleByFamily = useMemo(() => {
    const groups = new Map<MedicationFamily, DosingScheduleItem[]>();
    for (const item of dosingScheduleItems) {
      const list = groups.get(item.family) ?? [];
      list.push(item);
      groups.set(item.family, list);
    }
    return groups;
  }, [dosingScheduleItems]);

  const dosingFamilyOrder = useMemo(
    () => Array.from(dosingScheduleByFamily.keys()),
    [dosingScheduleByFamily]
  );

  const familyOfCurrentDose: MedicationFamily | null = useMemo(() => {
    if (currentDoseIndex < 0) return null;
    const item = dosingScheduleItems[currentDoseIndex];
    return item?.family ?? null;
  }, [currentDoseIndex, dosingScheduleItems]);

  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<MedicationFamily>>(
    new Set()
  );
  const toggleFamilyCollapse = useCallback((family: MedicationFamily) => {
    setCollapsedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }, []);

  const nonInjectableActiveMeds = useMemo(() => {
    const allOrders = [...prescriptions];
    const meds: Array<{
      id: number;
      medName: string;
      directions: string;
      quantity: string;
      daysSupply: number;
      prescribedDate: string;
    }> = [];
    for (const order of allOrders) {
      for (const med of order.medications ?? []) {
        if (isSupplyMedication(med.name)) continue;
        if (isInjectableMedication(med.name)) continue;
        if (!med.directions) continue;
        meds.push({
          id: med.id,
          medName: getMedicationDisplayName(med),
          directions: med.directions,
          quantity: med.quantity,
          daysSupply: med.daysSupply,
          prescribedDate: order.prescribedDate,
        });
      }
    }
    const seen = new Set<string>();
    return meds.filter((m) => {
      const key = `${m.medName}|${m.directions}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [prescriptions]);

  const primaryGlp1Medication = useMemo(() => {
    const sorted = [...prescriptions].sort(
      (a, b) => new Date(b.prescribedDate).getTime() - new Date(a.prescribedDate).getTime()
    );
    for (const rx of sorted) {
      for (const med of rx.medications ?? []) {
        const n = (med.name || '').toLowerCase();
        if (n.includes('tirzepatide')) return 'tirzepatide';
        if (n.includes('semaglutide')) return 'semaglutide';
      }
    }
    return 'semaglutide';
  }, [prescriptions]);

  if (loading) {
    return <MedicationsPageSkeleton />;
  }

  return (
    <div className="min-h-[100dvh] px-3 py-4 sm:px-4 sm:py-6">
      {/* Success Toast — always rendered, visibility via opacity to avoid CLS */}
      <div
        className={`fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white shadow-2xl transition-all duration-200 ${
          showSuccess ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        aria-live="polite"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4" />
        </div>
        <span className="font-medium">{showSuccess}</span>
      </div>

      <div
        className={`flex items-center gap-3 rounded-xl border p-4 transition-all duration-150 ${
          loadError
            ? 'mb-6 border-amber-200 bg-amber-50 opacity-100'
            : 'pointer-events-none h-0 overflow-hidden border-transparent p-0 opacity-0'
        }`}
        role="alert"
      >
        {loadError && (
          <>
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="flex-1 text-sm font-medium text-amber-900">{loadError}</p>
            <Link
              href={`/patient-login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/medications`)}&reason=session_expired`}
              className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
            >
              Log in
            </Link>
          </>
        )}
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">{t('medsTitle')}</h1>
        <p className="mt-2 text-gray-500">{t('medsSubtitle')}</p>
      </div>

      {/* ── Active Plan Card ── */}
      {billingPlan && (
        <div className="mb-8 overflow-hidden rounded-3xl shadow-xl shadow-gray-200/50">
          <div
            className="relative overflow-hidden p-4 sm:p-6"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)`,
            }}
          >
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
            <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />
            <div className="relative">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm sm:h-14 sm:w-14">
                  <CreditCard className="h-6 w-6 text-white sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/70 sm:text-sm">Your Plan</p>
                  <h2 className="break-words text-xl font-bold leading-tight text-white sm:text-2xl">
                    {billingPlan.name}
                  </h2>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm sm:px-4 sm:py-1.5 sm:text-sm">
                  {billingPlan.vialCount} {billingPlan.vialCount === 1 ? 'vial' : 'vials'}
                </span>
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm sm:px-4 sm:py-1.5 sm:text-sm">
                  {formatCurrency(billingPlan.amount)}/
                  {billingPlan.interval === 'annual'
                    ? 'yr'
                    : billingPlan.interval === '6-month'
                      ? '6mo'
                      : billingPlan.interval === 'quarterly'
                        ? 'qtr'
                        : 'mo'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-gray-100">
            <div className="bg-white p-3 text-center sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">
                Status
              </p>
              <p
                className="mt-0.5 text-xs font-bold sm:mt-1 sm:text-sm"
                style={{ color: primaryColor }}
              >
                {billingPlan.status}
              </p>
            </div>
            {billingPlan.startDate && (
              <div className="bg-white p-3 text-center sm:p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">
                  Started
                </p>
                <p className="mt-0.5 text-xs font-bold text-gray-900 sm:mt-1 sm:text-sm">
                  {formatDate(billingPlan.startDate)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Multi-Month Shipping Schedule Notice ── */}
      {isMultiMonthPlan && shipmentSchedule && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/70">
          <div className="flex gap-3 p-4 sm:p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-blue-900">
                {shipmentSchedule.totalMonths}-Month Plan &mdash; Shipping Schedule
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-blue-800">
                Compounded medication vials have a{' '}
                <span className="font-semibold">90-day best use date</span>. To ensure freshness and
                potency, your treatment is shipped in 90-day intervals rather than all at once.
              </p>
              <div className="mt-3 rounded-xl bg-white/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Your Shipments
                </p>
                <div className="space-y-2">
                  {billingPlan?.startDate && (
                    <div className="flex items-center gap-2 text-sm text-blue-900">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-3 w-3 text-emerald-600" />
                      </div>
                      <span>
                        <span className="font-medium">Shipment 1</span>
                        <span className="mx-1.5 text-blue-400">&middot;</span>
                        {formatDate(billingPlan.startDate)}
                        <span className="ml-1.5 text-xs text-blue-500">(initial)</span>
                      </span>
                    </div>
                  )}
                  {shipmentSchedule.upcoming.map((date, idx) => {
                    const isPast = date <= new Date();
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm text-blue-900">
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            isPast ? 'bg-emerald-100' : 'bg-blue-100'
                          }`}
                        >
                          {isPast ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Truck className="h-3 w-3 text-blue-500" />
                          )}
                        </div>
                        <span>
                          <span className="font-medium">Shipment {idx + 2}</span>
                          <span className="mx-1.5 text-blue-400">&middot;</span>
                          {date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          <span className="ml-1.5 text-xs text-blue-500">
                            (month {(idx + 1) * 3})
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {shipmentSchedule.remaining.length > 0 && (
                <p className="mt-2.5 text-xs text-blue-600">
                  {shipmentSchedule.remaining.length}{' '}
                  {shipmentSchedule.remaining.length === 1 ? 'shipment' : 'shipments'} remaining
                  &mdash; next ships around{' '}
                  <span className="font-semibold">
                    {shipmentSchedule.remaining[0].toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Current Medications (from prescriptions API) ── */}
      {allActiveMeds.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Syringe className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
            Active Medications
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
              {allActiveMeds.length}
            </span>
          </h2>
          <div className="space-y-4">
            {allActiveMeds.map((med) => (
              <div
                key={`${med.prescription.id}-${med.id}`}
                className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/40"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      <Pill className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: primaryColor }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="break-words text-base font-semibold leading-tight text-gray-900 sm:text-lg">
                          {getMedicationDisplayName(med)}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase sm:px-3 sm:py-1 sm:text-xs ${statusColor(med.prescription.status)}`}
                        >
                          {med.prescription.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {med.directions && (
                    <div className="mt-3 rounded-xl bg-gray-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">
                        Directions
                      </p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-gray-700 sm:text-sm">
                        {med.directions}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-gray-500 sm:gap-4 sm:text-xs">
                    {med.quantity && (
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Qty: {med.quantity}
                      </span>
                    )}
                    {med.daysSupply > 0 && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {med.daysSupply}d supply
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />{' '}
                      {formatDate(med.prescription.prescribedDate)}
                    </span>
                  </div>

                  {med.prescription.shipping.trackingNumber && (
                    <div
                      className="mt-3 flex items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-xs sm:text-sm"
                      style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
                    >
                      <Truck className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">
                        Tracking: {med.prescription.shipping.trackingNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dosing Schedule (Injection Directions per Prescription) ── */}
      {dosingScheduleItems.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowDosingSchedule(!showDosingSchedule)}
            className="mb-4 flex w-full items-center justify-between text-left"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Syringe className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
              <span>Your Dosing Schedule</span>
              {dosingFamilyOrder.length > 1 && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {dosingFamilyOrder.length} medications
                </span>
              )}
            </h2>
            {showDosingSchedule ? (
              <ChevronUp className="h-5 w-5 shrink-0 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
            )}
          </button>
          {showDosingSchedule && (
            <div className="space-y-4">
              {dosingFamilyOrder.map((family) => {
                const familyItems = dosingScheduleByFamily.get(family) ?? [];
                if (familyItems.length === 0) return null;
                const familyName = familyDisplayName(family, familyItems);
                const cadence = familyItems[0]?.cadence;
                const cadenceLabel = cadence
                  ? cadenceDisplayLabel(cadence.cadence, cadence.cadenceWasInferred)
                  : 'Schedule per provider';
                const isMulti = dosingFamilyOrder.length > 1;
                const familyHasCurrent = family === familyOfCurrentDose;
                // Default collapse rule (only applies when ≥2 families):
                // expanded by default for the family containing the
                // current dose; collapsed for the rest. The user's
                // explicit toggles in `collapsedFamilies` flip the
                // default for that family.
                const userToggled = collapsedFamilies.has(family);
                const defaultCollapsed = isMulti && !familyHasCurrent;
                const collapsed = userToggled ? !defaultCollapsed : defaultCollapsed;

                // Per-family current/past computation (each family has its
                // own week-1 anchor at its newest Rx's prescribedDate).
                const familyCurrentIdx = familyItems.findIndex(
                  (it) => now >= it.periodStart && now < it.periodEnd
                );

                return (
                  <div
                    key={family}
                    className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/40"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!isMulti) return;
                        toggleFamilyCollapse(family);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5 sm:py-4 ${
                        isMulti ? 'cursor-pointer' : 'cursor-default'
                      }`}
                      style={{ backgroundColor: `${primaryColor}08` }}
                      aria-expanded={!collapsed}
                      aria-controls={`dosing-family-${family}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                          {familyName}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${
                            cadence?.cadenceWasInferred
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {cadenceLabel}
                        </span>
                        {familyHasCurrent && (
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs"
                            style={{ backgroundColor: primaryColor }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      {isMulti &&
                        (collapsed ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                        ) : (
                          <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
                        ))}
                    </button>
                    {!collapsed && (
                      <div id={`dosing-family-${family}`} className="divide-y divide-gray-50">
                        {familyItems.map((item, idxInFamily) => {
                          const isCurrent = idxInFamily === familyCurrentIdx;
                          const isPast = now >= item.periodEnd;
                          const isGrayed =
                            familyCurrentIdx >= 0 && idxInFamily < familyCurrentIdx;
                          return (
                            <div
                              key={`${item.prescriptionId}-${item.family}-${item.monthNumber}`}
                              className="relative flex gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5"
                              style={
                                isCurrent ? { backgroundColor: `${primaryColor}10` } : undefined
                              }
                            >
                              {/* Timeline connector */}
                              <div className="flex flex-col items-center">
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:h-10 sm:w-10 ${
                                    isCurrent
                                      ? 'text-white shadow-md'
                                      : isGrayed
                                        ? 'bg-gray-100 text-gray-400'
                                        : 'bg-gray-100 text-gray-500'
                                  }`}
                                  style={
                                    isCurrent ? { backgroundColor: primaryColor } : undefined
                                  }
                                >
                                  {item.monthNumber}
                                </div>
                                {idxInFamily < familyItems.length - 1 && (
                                  <div
                                    className={`mt-1 w-0.5 flex-1 ${
                                      isGrayed ? 'bg-gray-200' : 'bg-gray-100'
                                    }`}
                                    style={
                                      isCurrent
                                        ? { backgroundColor: `${primaryColor}40` }
                                        : undefined
                                    }
                                  />
                                )}
                              </div>

                              {/* Content */}
                              <div className="min-w-0 flex-1 pb-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`text-sm font-semibold sm:text-base ${
                                      isCurrent
                                        ? 'text-gray-900'
                                        : isGrayed
                                          ? 'text-gray-400'
                                          : 'text-gray-700'
                                    }`}
                                  >
                                    Month {item.monthNumber}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold sm:text-xs ${
                                      isGrayed ? 'text-gray-300' : 'text-gray-400'
                                    }`}
                                  >
                                    Weeks {item.weekStart}&ndash;{item.weekEnd}
                                  </span>
                                  {isCurrent && (
                                    <span
                                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs"
                                      style={{ backgroundColor: primaryColor }}
                                    >
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
                                  {item.isSameDose && !isPast && !isCurrent && (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-500 sm:text-xs">
                                      Dose stays the same
                                    </span>
                                  )}
                                </div>

                                <p
                                  className={`mt-0.5 text-xs sm:text-sm ${
                                    isGrayed ? 'text-gray-400' : 'text-gray-500'
                                  }`}
                                >
                                  {item.medName}
                                  <span className="mx-1.5 text-gray-300">&middot;</span>
                                  Prescribed {formatDate(item.date)}
                                </p>

                                {/* Injection directions */}
                                <div
                                  className={`mt-2 rounded-xl p-3 ${
                                    isCurrent ? 'border bg-white' : 'bg-gray-50'
                                  }`}
                                  style={
                                    isCurrent
                                      ? { borderColor: `${primaryColor}30` }
                                      : undefined
                                  }
                                >
                                  {item.dose && (item.dose.mg || item.dose.units) ? (
                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                      <span
                                        className={`text-xs font-semibold uppercase tracking-wider ${
                                          isGrayed ? 'text-gray-300' : 'text-gray-400'
                                        }`}
                                      >
                                        {cadenceInjectVerb(cadence?.cadence)}:
                                      </span>
                                      {item.dose.units && (
                                        <span
                                          className={`text-lg font-bold uppercase sm:text-xl ${
                                            isCurrent
                                              ? ''
                                              : isGrayed
                                                ? 'text-gray-300'
                                                : 'text-gray-700'
                                          }`}
                                          style={
                                            isCurrent ? { color: primaryColor } : undefined
                                          }
                                        >
                                          {item.dose.units} units
                                        </span>
                                      )}
                                      {item.dose.mg && (
                                        <span
                                          className={`text-sm font-medium ${
                                            isGrayed ? 'text-gray-300' : 'text-gray-500'
                                          }`}
                                        >
                                          ({item.dose.mg} mg)
                                        </span>
                                      )}
                                    </div>
                                  ) : null}
                                  <p
                                    className={`${
                                      item.dose && (item.dose.mg || item.dose.units)
                                        ? 'mt-1.5'
                                        : ''
                                    } text-xs leading-relaxed sm:text-sm ${
                                      isGrayed ? 'text-gray-300' : 'text-gray-600'
                                    }`}
                                  >
                                    {item.directions}
                                  </p>
                                  {isCurrent && (
                                    <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-gray-400 sm:text-xs">
                                      <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                      {cadenceFooterLabel(cadence)}
                                      &middot; {item.weekEnd - item.weekStart + 1} weeks at this
                                      dose
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Other Medication Directions (non-injectable meds with a sig) ── */}
      {nonInjectableActiveMeds.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Pill className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
            <span>Additional Medication Directions</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
              {nonInjectableActiveMeds.length}
            </span>
          </h2>
          <div className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/40">
            <div className="divide-y divide-gray-50">
              {nonInjectableActiveMeds.map((med) => (
                <div key={med.id} className="px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      <Pill className="h-5 w-5" style={{ color: primaryColor }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 sm:text-base">
                        {med.medName}
                      </p>
                      <div className="mt-2 rounded-xl bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">
                          Directions
                        </p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-gray-700 sm:text-sm">
                          {med.directions}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 sm:text-xs">
                        {med.quantity && (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" /> Qty: {med.quantity}
                          </span>
                        )}
                        {med.daysSupply > 0 && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {med.daysSupply}d supply
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Prescribed {formatDate(med.prescribedDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Prescription History ── */}
      {pastPrescriptions.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="mb-4 flex w-full items-center justify-between text-left"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="h-5 w-5 shrink-0 text-gray-400" />
              <span>Prescription History</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                {pastPrescriptions.length}
              </span>
            </h2>
            {showHistory ? (
              <ChevronUp className="h-5 w-5 shrink-0 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
            )}
          </button>
          {showHistory && (
            <div className="space-y-3">
              {pastPrescriptions.map((rx) => {
                const meds = (rx.medications ?? []).filter((m) => !isSupplyMedication(m.name));
                return (
                  <div
                    key={rx.id}
                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-500">{formatDate(rx.prescribedDate)}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase sm:text-xs ${statusColor(rx.status)}`}
                      >
                        {rx.status}
                      </span>
                    </div>
                    {meds.length > 0 ? (
                      <div className="space-y-2">
                        {meds.map((m) => (
                          <div key={m.id} className="rounded-xl bg-gray-50 px-3 py-2">
                            <p className="break-words text-sm font-medium leading-tight text-gray-900">
                              {getMedicationDisplayName(m)}
                            </p>
                            {m.directions && (
                              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                {m.directions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-gray-900">Prescription</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Shipment History ── */}
      {trackingShipments.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
          <div className="border-b border-gray-100 px-4 py-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Truck className="h-5 w-5 shrink-0 text-gray-400" />
              Shipment History
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                {trackingShipments.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {trackingShipments.map((shipment) => (
              <div key={shipment.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {(shipment.items ?? []).map((i) => i.name).join(', ') || 'Medication'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {shipment.carrier}: {shipment.trackingNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {shipment.shippedAt
                        ? `Shipped ${formatDate(shipment.shippedAt)}`
                        : `Ordered ${formatDate(shipment.orderedAt)}`}
                    </p>
                  </div>
                  {shipment.trackingUrl && (
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Track
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Invoice History ── */}
      {invoiceHistory.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
          <div className="border-b border-gray-100 px-4 py-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              Payment History
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {invoiceHistory.map((inv) => (
              <div key={inv.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-gray-900">
                    {inv.description || inv.invoiceNumber}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(inv.amountPaid || inv.amount)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${statusColor(inv.status)}`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">{formatDate(inv.date)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reminders Section (always visible) ── */}
      <div className="mb-10 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-gray-400" />
              <span className="text-lg font-semibold text-gray-900">{t('medsReminders')}</span>
              {reminders.length > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {reminders.length}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setCustomMedicationName('');
                setShowReminderModal(true);
              }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-white transition-all hover:scale-105"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="h-4 w-4" />
              {t('medsAddReminder')}
            </button>
          </div>
          {prescriptions.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">{t('medsNoPrescriptions')}</p>
          )}
        </div>
        <div className="p-6">
          {reminders.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
              <Bell className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="font-medium text-gray-600">{t('medsNoReminders')}</p>
              <p className="mt-1 text-sm text-gray-500">{t('medsNoRemindersDesc')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="group flex items-center justify-between rounded-2xl bg-gray-50 p-4 transition-all hover:bg-gray-100"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Bell className="h-5 w-5" style={{ color: accentIconColor }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{reminder.medicationName}</p>
                      <p className="text-sm text-gray-500">
                        {daysOfWeek.find((d) => d.value === reminder.dayOfWeek)?.full} at{' '}
                        {reminder.timeOfDay}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        generateICS({ name: reminder.medicationName, instructions: '' }, reminder)
                      }
                      className="rounded-xl p-3 text-gray-400 transition-all hover:bg-blue-50 hover:text-blue-600"
                      title="Download to calendar"
                      aria-label="Download to calendar"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => removeReminder(reminder.id)}
                      className="rounded-xl p-3 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove reminder"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Medications (when we have a list from API in the future) */}
      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`${PATIENT_PORTAL_PATH}/calculators/${primaryGlp1Medication}`}
          className="group overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 transition-all hover:shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
                style={{ backgroundColor: accentColor }}
              >
                <Syringe className="h-6 w-6" style={{ color: accentIconColor }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('medsDoseCalculator')}</h3>
                <p className="text-sm text-gray-500">{t('medsDoseCalculatorDesc')}</p>
              </div>
            </div>
            <ChevronRight className="h-6 w-6 text-gray-300 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
        <Link
          href={`${PATIENT_PORTAL_PATH}/resources`}
          className="group overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 transition-all hover:shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Pill className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('medsInjectionGuide')}</h3>
                <p className="text-sm text-gray-500">{t('medsInjectionGuideDesc')}</p>
              </div>
            </div>
            <ChevronRight className="h-6 w-6 text-gray-300 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      </div>

      {/* Add Reminder Modal */}
      {showReminderModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowReminderModal(false);
              setCustomMedicationName('');
            }}
          />
          <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              {/* Modal Header */}
              <div
                className="p-6"
                style={{
                  background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold" style={{ color: accentIconColor }}>
                      {t('medsAddReminderTitle')}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: accentIconColor, opacity: 0.7 }}>
                      {t('medsEnterNameBelow')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowReminderModal(false);
                      setCustomMedicationName('');
                    }}
                    className="rounded-xl p-2 transition-colors hover:bg-black/10"
                    style={{ color: accentIconColor }}
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                    {t('medsMedicationName')}
                  </label>
                  <input
                    type="text"
                    value={customMedicationName}
                    onChange={(e) => setCustomMedicationName(e.target.value)}
                    placeholder={t('medsMedicationPlaceholder')}
                    className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition-all focus:border-gray-900 focus:bg-white"
                  />
                </div>

                {/* Day Selection */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                    {t('medsDayOfWeek')}
                  </label>
                  <div className="flex gap-2">
                    {daysOfWeek.map((day) => (
                      <button
                        key={day.value}
                        onClick={() =>
                          setNewReminder((prev) => ({ ...prev, dayOfWeek: day.value }))
                        }
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold transition-all ${
                          newReminder.dayOfWeek === day.value
                            ? 'scale-110 bg-gray-900 text-white shadow-lg'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {t('medsSelected')}{' '}
                    <span className="font-semibold text-gray-900">
                      {daysOfWeek.find((d) => d.value === newReminder.dayOfWeek)?.full}
                    </span>
                  </p>
                </div>

                {/* Time Selection */}
                <div className="mb-8">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                    {t('medsTime')}
                  </label>
                  <input
                    type="time"
                    value={newReminder.time}
                    onChange={(e) => setNewReminder((prev) => ({ ...prev, time: e.target.value }))}
                    className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-6 py-4 text-2xl font-semibold text-gray-900 outline-none transition-all focus:border-gray-900 focus:bg-white focus:shadow-lg"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowReminderModal(false)}
                    className="flex-1 rounded-2xl border-2 border-gray-200 px-6 py-4 font-semibold text-gray-700 transition-all hover:bg-gray-50"
                  >
                    {t('medsCancel')}
                  </button>
                  <button
                    onClick={addReminder}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {saving ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {t('medsSaving')}
                      </>
                    ) : (
                      <>
                        <Check className="h-5 w-5" />
                        {t('medsSaveReminder')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
