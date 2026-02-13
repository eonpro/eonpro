'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';
import { logger } from '@/lib/logger';
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
} from 'lucide-react';

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
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [patientId, setPatientId] = useState<number | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  /** When adding a reminder without a medication card (no prescriptions on file), user enters name here */
  const [customMedicationName, setCustomMedicationName] = useState('');
  const [newReminder, setNewReminder] = useState({ dayOfWeek: 3, time: '08:00' });
  const [showSuccess, setShowSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (!userJson) return;
      try {
        const userData = safeParseJsonString<{ patientId?: number; role?: string }>(userJson);
        if (!userData) return;
        let pid: number | null = userData.patientId ?? null;
        if (pid == null && userData.role?.toLowerCase() === 'patient') {
          const meRes = await portalFetch('/api/auth/me');
          if (meRes.ok && !cancelled) {
            const meData = await safeParseJson(meRes);
            const fromMe = (meData as { user?: { patientId?: number } } | null)?.user?.patientId;
            if (typeof fromMe === 'number' && fromMe > 0) {
              pid = fromMe;
              setPortalUserStorage(getMinimalPortalUserPayload({ ...userData, patientId: fromMe }));
            }
          }
        }
        if (!cancelled && pid != null) setPatientId(pid);
      } catch {
        if (!cancelled) setPatientId(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (patientId) {
      loadData();
    }
  }, [patientId]);

  const loadData = async () => {
    setLoadError(null);
    // Production: medications list from API when available; until then empty (reminders still work)
    setMedications([]);

    if (patientId) {
      try {
        const response = await portalFetch(
          `/api/patient-progress/medication-reminders?patientId=${patientId}`
        );
        const err = getPortalResponseError(response);
        if (err) {
          setLoadError(err);
          setLoading(false);
          return;
        }
        if (response.ok) {
          const result = await safeParseJson(response);
          const data =
            result !== null
              ? Array.isArray(result)
                ? result
                : (result as { data?: unknown[] })?.data ?? []
              : [];
          setReminders(data);
        }
      } catch (error) {
        logger.error('Failed to fetch reminders', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        setLoadError('Failed to load reminders. Please try again.');
      }
    }
    setLoading(false);
  };

  const addReminder = async () => {
    const medicationName = selectedMed
      ? `${selectedMed.name} ${selectedMed.dosage}`
      : customMedicationName?.trim() || '';
    if (!medicationName || !patientId) return;

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
        setShowSuccess('Reminder saved successfully!');
        setTimeout(() => setShowSuccess(''), 3000);
      }
    } catch (error) {
      logger.error('Error saving reminder', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeReminder = async (id: number) => {
    try {
      const response = await portalFetch(`/api/patient-progress/medication-reminders?id=${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setReminders((prev) => prev.filter((r) => r.id !== id));
        setShowSuccess('Reminder removed');
        setTimeout(() => setShowSuccess(''), 2000);
      }
    } catch (error) {
      logger.error('Error removing reminder', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
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

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//EONPRO//Medication Reminder//EN
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

    setShowSuccess('Calendar file downloaded!');
    setTimeout(() => setShowSuccess(''), 3000);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
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
        <h1 className="text-3xl font-semibold text-gray-900">Medications</h1>
        <p className="mt-2 text-gray-500">Your prescriptions and dose reminders</p>
      </div>

      {/* When no medications on file: show reminders only and allow adding by name */}
      {medications.length === 0 && (
        <div className="mb-10 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
          <div className="border-b border-gray-100 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-gray-400" />
                <span className="text-lg font-semibold text-gray-900">Medication reminders</span>
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
                Add reminder
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              No prescriptions on file. You can still add reminders for any medication.
            </p>
          </div>
          <div className="p-6">
            {reminders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
                <Bell className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-600">No reminders yet</p>
                <p className="mt-1 text-sm text-gray-500">Add a reminder to never miss a dose</p>
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
                        style={{ backgroundColor: `${accentColor}` }}
                      >
                        <Bell className="h-5 w-5 text-gray-700" />
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
                      >
                        <Download className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => removeReminder(reminder.id)}
                        className="rounded-xl p-3 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
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
      )}

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
                          Frequency
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">{med.frequency}</p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Started
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
                        Instructions
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
                        <p className="font-medium text-gray-400">No reminders set</p>
                        <p className="mt-1 text-sm text-gray-400">
                          Add a reminder to never miss a dose
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
                                style={{ backgroundColor: `${accentColor}` }}
                              >
                                <Bell className="h-5 w-5 text-gray-700" />
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
                              >
                                <Download className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => removeReminder(reminder.id)}
                                className="rounded-xl p-3 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
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
                          <p className="font-semibold text-amber-900">Refill needed soon</p>
                          <p className="text-sm text-amber-700">
                            Due by{' '}
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
                style={{ backgroundColor: `${accentColor}` }}
              >
                <Syringe className="h-6 w-6 text-gray-700" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Dose Calculator</h3>
                <p className="text-sm text-gray-500">Calculate your injection</p>
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
                <h3 className="text-lg font-semibold text-gray-900">Injection Guide</h3>
                <p className="text-sm text-gray-500">Watch how-to videos</p>
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
                    <h2 className="text-2xl font-semibold text-gray-900">Add Reminder</h2>
                    {selectedMed ? (
                      <p className="mt-1 text-gray-700">
                        {selectedMed.name} ({selectedMed.dosage})
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-gray-600">Enter medication name below</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowReminderModal(false);
                      setSelectedMed(null);
                      setCustomMedicationName('');
                    }}
                    className="rounded-xl p-2 text-gray-700 transition-colors hover:bg-black/10"
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
                      Medication name
                    </label>
                    <input
                      type="text"
                      value={customMedicationName}
                      onChange={(e) => setCustomMedicationName(e.target.value)}
                      placeholder="e.g. Semaglutide 0.5mg"
                      className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition-all focus:border-gray-900 focus:bg-white"
                    />
                  </div>
                )}

                {/* Day Selection */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Day of Week
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
                    Selected:{' '}
                    <span className="font-semibold text-gray-900">
                      {daysOfWeek.find((d) => d.value === newReminder.dayOfWeek)?.full}
                    </span>
                  </p>
                </div>

                {/* Time Selection */}
                <div className="mb-8">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Time
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
                    Cancel
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
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-5 w-5" />
                        Save Reminder
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
