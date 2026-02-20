'use client';

import { useState, useEffect } from 'react';
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
  Sparkles,
  Syringe,
  CreditCard,
  Package,
  ChevronDown,
  ChevronUp,
  FileText,
  Truck,
} from 'lucide-react';

interface RxMedication {
  id: number;
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

interface Medication {
  id: number;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  status: 'active' | 'completed' | 'paused';
  startDate: string;
  refillDate?: string;
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

export default function MedicationsPage() {
  const { t } = usePatientPortalLanguage();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';
  const accentIconColor = getContrastTextColor(accentColor) === 'light' ? '#ffffff' : '#1f2937';
  const primaryIconColor = getContrastTextColor(primaryColor) === 'light' ? '#ffffff' : '#1f2937';

  const { patientId } = usePatientId();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [billingPlan, setBillingPlan] = useState<BillingPlan | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  const [customMedicationName, setCustomMedicationName] = useState('');
  const [newReminder, setNewReminder] = useState({ dayOfWeek: 3, time: '08:00' });
  const [showSuccess, setShowSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (patientId) {
      loadData();
    }
  }, [patientId]);

  const loadData = async () => {
    setLoadError(null);
    setMedications([]);

    if (!patientId) {
      setLoading(false);
      return;
    }

    const fetchPromises: Promise<void>[] = [];

    fetchPromises.push(
      portalFetch('/api/patient-portal/prescriptions')
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
        .catch(() => {})
    );

    fetchPromises.push(
      portalFetch(`/api/patient-progress/medication-reminders?patientId=${patientId}`)
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
                  : (result as { data?: unknown[] })?.data ?? []
                : [];
            setReminders(data);
          }
        })
        .catch((error) => {
          logger.error('Failed to fetch reminders', {
            error: error instanceof Error ? error.message : 'Unknown',
          });
          setLoadError('Failed to load reminders. Please try again.');
        })
    );

    await Promise.all(fetchPromises);
    setLoading(false);
  };

  const [reminderError, setReminderError] = useState<string | null>(null);

  const addReminder = async () => {
    setReminderError(null);
    const medicationName = selectedMed
      ? `${selectedMed.name} ${selectedMed.dosage}`
      : customMedicationName?.trim() || '';

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
        setSelectedMed(null);
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

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
      !['pending', 'processing', 'shipped', 'active', 'approved', 'submitted', 'in_progress'].includes(
        (p.status || '').toLowerCase()
      )
  );

  const allActiveMeds = activePrescriptions.flatMap((p) =>
    p.medications.map((m) => ({ ...m, prescription: p }))
  );

  if (loading) {
    return <MedicationsPageSkeleton />;
  }

  return (
    <div className="min-h-[100dvh] px-3 py-4 sm:px-4 sm:py-6">
      {/* Success Toast */}
      {showSuccess && (
        <div className="animate-in slide-in-from-top-2 fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white shadow-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-4 w-4" />
          </div>
          <span className="font-medium">{showSuccess}</span>
        </div>
      )}

      {loadError && (
        <div
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm font-medium text-amber-900">{loadError}</p>
          <Link
            href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/medications`)}&reason=session_expired`}
            className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            Log in
          </Link>
        </div>
      )}

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
                  {formatCurrency(billingPlan.amount)}/{billingPlan.interval === 'annual' ? 'yr' : billingPlan.interval === '6-month' ? '6mo' : billingPlan.interval === 'quarterly' ? 'qtr' : 'mo'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-3">
            <div className="bg-white p-3 text-center sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">Status</p>
              <p className="mt-0.5 text-xs font-bold sm:mt-1 sm:text-sm" style={{ color: primaryColor }}>
                {billingPlan.status}
              </p>
            </div>
            {billingPlan.nextBillingDate && (
              <div className="bg-white p-3 text-center sm:p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">Next Billing</p>
                <p className="mt-0.5 text-xs font-bold text-gray-900 sm:mt-1 sm:text-sm">{formatDate(billingPlan.nextBillingDate)}</p>
              </div>
            )}
            {billingPlan.startDate && (
              <div className="col-span-2 bg-white p-3 text-center sm:col-span-1 sm:p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">Started</p>
                <p className="mt-0.5 text-xs font-bold text-gray-900 sm:mt-1 sm:text-sm">{formatDate(billingPlan.startDate)}</p>
              </div>
            )}
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
                          {med.name}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase sm:px-3 sm:py-1 sm:text-xs ${statusColor(med.prescription.status)}`}
                        >
                          {med.prescription.status}
                        </span>
                      </div>
                      {med.strength && (
                        <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                          {med.strength} &middot; {med.form}
                        </p>
                      )}
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
                    {med.prescription.provider && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Dr. {med.prescription.provider.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {formatDate(med.prescription.prescribedDate)}
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
              {pastPrescriptions.map((rx) => (
                <div
                  key={rx.id}
                  className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {formatDate(rx.prescribedDate)}
                      {rx.provider && <> &middot; Dr. {rx.provider.name}</>}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase sm:text-xs ${statusColor(rx.status)}`}
                    >
                      {rx.status}
                    </span>
                  </div>
                  {rx.medications.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rx.medications.map((m) => (
                        <span
                          key={m.id}
                          className="break-words rounded-lg bg-gray-50 px-2 py-1 text-xs leading-tight text-gray-700"
                        >
                          {m.name} {m.strength}
                        </span>
                      ))}
                    </div>
                  )}
                  {rx.medications.length === 0 && (
                    <p className="text-sm font-medium text-gray-900">Prescription</p>
                  )}
                </div>
              ))}
            </div>
          )}
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
                  setSelectedMed(null);
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
              <p className="mt-2 text-sm text-gray-500">
                {t('medsNoPrescriptions')}
              </p>
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
      <div className="mb-10 space-y-6">
        {medications
          .filter((m) => m.status === 'active')
          .map((med) => {
            const medReminders = reminders.filter((r) => r.medicationName.includes(med.name));
            const nextReminder = medReminders[0];
            const nextDay = nextReminder
              ? daysOfWeek.find((d) => d.value === nextReminder.dayOfWeek)?.full
              : null;

            return (
              <div
                key={med.id}
                className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50"
              >
                {/* Header */}
                <div
                  className="relative overflow-hidden p-6"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                  }}
                >
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
                  <div className="relative flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                        <Syringe className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-white">{med.name}</h3>
                        <p className="text-lg font-medium text-white/80">{med.dosage}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                      Active
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Info Grid */}
                  <div className="mb-6 grid grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {t('medsFrequency')}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">{med.frequency}</p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {t('medsStarted')}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {new Date(med.startDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-gray-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        {t('medsInstructions')}
                      </p>
                    </div>
                    <p className="font-medium text-gray-700">{med.instructions}</p>
                  </div>

                  {/* Reminders Section */}
                  <div className="mb-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-gray-400" />
                        <span className="font-semibold text-gray-900">Reminders</span>
                        {medReminders.length > 0 && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                            {medReminders.length}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedMed(med);
                          setShowReminderModal(true);
                        }}
                        className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-white transition-all hover:scale-105"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>

                    {medReminders.length === 0 ? (
                      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                        <Bell className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        <p className="font-medium text-gray-400">{t('medsNoRemindersSet')}</p>
                        <p className="mt-1 text-sm text-gray-400">
                          {t('medsNoRemindersDesc')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {medReminders.map((reminder) => (
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
                                <p className="font-semibold text-gray-900">
                                  {daysOfWeek.find((d) => d.value === reminder.dayOfWeek)?.full}
                                </p>
                                <p className="text-sm text-gray-500">at {reminder.timeOfDay}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => generateICS(med, reminder)}
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

                  {/* Refill Notice */}
                  {med.refillDate &&
                    new Date(med.refillDate) <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) && (
                      <div className="flex items-center gap-4 rounded-2xl bg-amber-50 p-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                          <AlertCircle className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-amber-900">{t('medsRefillNeeded')}</p>
                          <p className="text-sm text-amber-700">
                            {t('medsDueBy')}{' '}
                            {new Date(med.refillDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/patient-portal/calculators/semaglutide"
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
          href="/patient-portal/resources"
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
              setSelectedMed(null);
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
                    <h2 className="text-2xl font-semibold" style={{ color: accentIconColor }}>{t('medsAddReminderTitle')}</h2>
                    {selectedMed ? (
                      <p className="mt-1" style={{ color: accentIconColor, opacity: 0.8 }}>
                        {selectedMed.name} ({selectedMed.dosage})
                      </p>
                    ) : (
                      <p className="mt-1 text-sm" style={{ color: accentIconColor, opacity: 0.7 }}>{t('medsEnterNameBelow')}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowReminderModal(false);
                      setSelectedMed(null);
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
                {/* Medication name (when no prescription selected) */}
                {!selectedMed && (
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
                )}

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
