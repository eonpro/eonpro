'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Video,
  User,
  Search,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { todayET, EASTERN_TZ } from '@/lib/utils/timezone';

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string;
  email: string;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface BookTelehealthWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onBooked: () => void;
  providers?: Provider[];
  preSelectedProviderId?: number;
}

type Step = 'provider' | 'patient' | 'datetime' | 'confirm';

function formatTime12(isoOrTime: string): string {
  const d = new Date(isoOrTime);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EASTERN_TZ });
  }
  const [h, m] = isoOrTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function BookTelehealthWizard({
  isOpen,
  onClose,
  onBooked,
  providers: externalProviders,
  preSelectedProviderId,
}: BookTelehealthWizardProps) {
  const [step, setStep] = useState<Step>('provider');
  const [providers, setProviders] = useState<Provider[]>(externalProviders || []);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    if (!externalProviders?.length) {
      apiFetch('/api/providers').then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setProviders(data.providers || []);
        }
      });
    }
  }, [externalProviders]);

  useEffect(() => {
    if (preSelectedProviderId && providers.length > 0) {
      const p = providers.find((pr) => pr.id === preSelectedProviderId);
      if (p) {
        setSelectedProvider(p);
        setStep('patient');
      }
    }
  }, [preSelectedProviderId, providers]);

  // Patient search with debounce
  useEffect(() => {
    if (patientSearch.length < 2) {
      setPatients([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setPatientsLoading(true);
      try {
        const res = await apiFetch(`/api/admin/patients?search=${encodeURIComponent(patientSearch)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setPatients(data.patients || []);
        }
      } catch {
        // best-effort
      } finally {
        setPatientsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [patientSearch]);

  // Fetch slots when date changes
  useEffect(() => {
    if (!selectedProvider || !selectedDate) {
      setSlots([]);
      return;
    }
    const fetchSlots = async () => {
      setSlotsLoading(true);
      try {
        const res = await apiFetch(
          `/api/scheduling/availability?providerId=${selectedProvider.id}&date=${selectedDate}&duration=${selectedDuration}`
        );
        if (res.ok) {
          const data = await res.json();
          setSlots(
            (data.slots || [])
              .filter((s: any) => s.available)
              .map((s: any) => ({
                startTime: s.startTime,
                endTime: s.endTime,
                available: s.available,
              }))
          );
        }
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    };
    fetchSlots();
  }, [selectedProvider, selectedDate, selectedDuration]);

  const handleBook = async () => {
    if (!selectedProvider || !selectedPatient || !selectedSlot) return;

    setIsBooking(true);
    setError(null);

    try {
      const res = await apiFetch('/api/scheduling/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider.id,
          patientId: selectedPatient.id,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          duration: selectedDuration,
          type: 'VIDEO',
          reason: reason || 'Telehealth consultation',
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to book appointment');
      }

      setBookingSuccess(true);
      setTimeout(() => {
        onBooked();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setIsBooking(false);
    }
  };

  const getWeekDays = (): Date[] => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  if (!isOpen) return null;

  const steps: { key: Step; label: string }[] = [
    { key: 'provider', label: 'Provider' },
    { key: 'patient', label: 'Patient' },
    { key: 'datetime', label: 'Date & Time' },
    { key: 'confirm', label: 'Confirm' },
  ];

  const stepIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <Video className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Book Telehealth Consultation</h2>
              <p className="text-xs text-gray-500">Step {stepIdx + 1} of {steps.length}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex border-b px-6 py-3">
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  i < stepIdx
                    ? 'bg-[#4fa77e] text-white'
                    : i === stepIdx
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={`ml-2 text-xs font-medium ${
                  i <= stepIdx ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`mx-2 h-px flex-1 ${i < stepIdx ? 'bg-[#4fa77e]' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="h-4 w-4 text-red-400" />
            </button>
          </div>
        )}

        {/* Success */}
        {bookingSuccess && (
          <div className="flex flex-col items-center justify-center gap-4 p-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Consultation Booked!</h3>
            <p className="text-sm text-gray-500">
              The telehealth appointment has been created and a Zoom link is being generated.
            </p>
          </div>
        )}

        {/* Step Content */}
        {!bookingSuccess && (
          <div className="p-6">
            {/* Step 1: Select Provider */}
            {step === 'provider' && (
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Select a Provider</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProvider(p);
                        setStep('patient');
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        selectedProvider?.id === p.id
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {p.firstName} {p.lastName}
                        </div>
                        {p.titleLine && (
                          <div className="text-xs text-gray-500">{p.titleLine}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {providers.length === 0 && (
                  <p className="py-8 text-center text-sm text-gray-400">No providers found</p>
                )}
              </div>
            )}

            {/* Step 2: Select Patient */}
            {step === 'patient' && (
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Select a Patient</h3>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search patients by name, email, or phone..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  {patientsLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                  )}
                </div>

                <div className="max-h-[300px] space-y-1 overflow-y-auto">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPatient(p);
                        setStep('datetime');
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                        selectedPatient?.id === p.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {p.firstName} {p.lastName}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {p.email} {p.phone ? `| ${p.phone}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                  {patientSearch.length >= 2 && patients.length === 0 && !patientsLoading && (
                    <p className="py-6 text-center text-sm text-gray-400">
                      No patients found for "{patientSearch}"
                    </p>
                  )}
                  {patientSearch.length < 2 && (
                    <p className="py-6 text-center text-sm text-gray-400">
                      Type at least 2 characters to search
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Select Date & Time */}
            {step === 'datetime' && (
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">
                  Select Date & Time
                  {selectedProvider && (
                    <span className="ml-2 font-normal text-gray-500">
                      with {selectedProvider.firstName} {selectedProvider.lastName}
                    </span>
                  )}
                </h3>

                {/* Week Navigation */}
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={() => {
                      const prev = new Date(weekStart);
                      prev.setDate(prev.getDate() - 7);
                      setWeekStart(prev);
                    }}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: EASTERN_TZ })} –{' '}
                    {(() => {
                      const end = new Date(weekStart);
                      end.setDate(end.getDate() + 6);
                      return end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: EASTERN_TZ });
                    })()}
                  </span>
                  <button
                    onClick={() => {
                      const next = new Date(weekStart);
                      next.setDate(next.getDate() + 7);
                      setWeekStart(next);
                    }}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Day Picker */}
                <div className="mb-4 grid grid-cols-7 gap-1">
                  {getWeekDays().map((d) => {
                    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${y}-${m}-${dd}`;
                    const isSelected = selectedDate === dateStr;
                    const todayStr = todayET();
                    const isPast = dateStr < todayStr;
                    const isToday = dateStr === todayStr;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => !isPast && setSelectedDate(dateStr)}
                        disabled={isPast}
                        className={`rounded-lg border p-2 text-center transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : isPast
                              ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className="text-[10px] font-medium text-gray-500">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}
                        </div>
                        <div
                          className={`text-sm font-semibold ${
                            isSelected ? 'text-blue-700' : isToday ? 'text-[#4fa77e]' : 'text-gray-900'
                          }`}
                        >
                          {d.getDate()}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Time Slots */}
                {selectedDate && (
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-gray-600">Available Slots</h4>
                    {slotsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : slots.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {slots.map((slot, i) => {
                          const isSelected =
                            selectedSlot?.startTime === slot.startTime;
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedSlot(slot);
                                setStep('confirm');
                              }}
                              className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-all ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                  : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
                              }`}
                            >
                              <Clock className="mx-auto mb-0.5 h-3.5 w-3.5" />
                              {formatTime12(slot.startTime)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center">
                        <Calendar className="mx-auto mb-2 h-6 w-6 text-gray-400" />
                        <p className="text-sm text-gray-500">No available slots on this date</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Try another date or check provider availability
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Confirm */}
            {step === 'confirm' && selectedProvider && selectedPatient && selectedSlot && (
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">
                  Confirm Telehealth Consultation
                </h3>

                <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        Provider
                      </span>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedProvider.firstName} {selectedProvider.lastName}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        Patient
                      </span>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedPatient.firstName} {selectedPatient.lastName}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        Date
                      </span>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                          timeZone: EASTERN_TZ,
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        Time
                      </span>
                      <p className="text-sm font-medium text-gray-900">
                        {formatTime12(selectedSlot.startTime)} – {formatTime12(selectedSlot.endTime)}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        Type
                      </span>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
                        <Video className="h-4 w-4" />
                        Telehealth (Video)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Duration
                    </label>
                    <div className="flex gap-2">
                      {[10, 15, 30].map((dur) => (
                        <button
                          key={dur}
                          type="button"
                          onClick={() => setSelectedDuration(dur)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-all ${
                            selectedDuration === dur
                              ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                              : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
                          }`}
                        >
                          {dur} min
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Reason for visit
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g., Follow-up consultation, New patient intake"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Internal notes about this consultation..."
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleBook}
                  disabled={isBooking}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isBooking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  {isBooking ? 'Booking...' : 'Book Telehealth Consultation'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer Navigation */}
        {!bookingSuccess && (
          <div className="sticky bottom-0 flex items-center justify-between border-t bg-gray-50 px-6 py-3">
            <button
              onClick={() => {
                if (step === 'patient') setStep('provider');
                else if (step === 'datetime') setStep('patient');
                else if (step === 'confirm') setStep('datetime');
              }}
              disabled={step === 'provider'}
              className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:invisible"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
