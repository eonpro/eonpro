'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  User,
  Phone,
  Plus,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  Building,
} from 'lucide-react';

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string;
}

interface AppointmentType {
  id: number;
  name: string;
  description?: string;
  duration: number;
  price?: number;
  requiresVideoLink?: boolean;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface Appointment {
  id: number;
  startTime: string;
  endTime: string;
  duration: number;
  status: string;
  type: string;
  reason?: string;
  notes?: string;
  videoLink?: string;
  location?: string;
  provider?: {
    id: number;
    firstName: string;
    lastName: string;
    titleLine?: string;
  };
  appointmentType?: {
    name: string;
  };
}

export default function AppointmentsPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  // State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');

  // Booking modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [appointmentMode, setAppointmentMode] = useState<'VIDEO' | 'IN_PERSON' | 'PHONE'>('VIDEO');
  const [reason, setReason] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);

  // Cancel/reschedule state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load initial data
  useEffect(() => {
    loadAppointments();
    loadProviders();
    loadAppointmentTypes();
  }, [filter]);

  const loadAppointments = async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filter === 'upcoming') params.set('upcoming', 'true');
      if (filter === 'past') params.set('past', 'true');

      const response = await portalFetch(`/api/patient-portal/appointments?${params}`);
      const err = getPortalResponseError(response);
      if (err) {
        setLoadError(err);
        setLoading(false);
        return;
      }
      if (response.ok) {
        const data = await safeParseJson(response);
        const list =
          data !== null && typeof data === 'object' && 'appointments' in data
            ? (data as { appointments?: Appointment[] }).appointments
            : undefined;
        setAppointments(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      logger.error('Failed to load appointments', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      const response = await portalFetch('/api/patient-portal/appointments?action=providers');
      if (response.ok) {
        const data = await safeParseJson(response);
        const list =
          data !== null && typeof data === 'object' && 'providers' in data
            ? (data as { providers?: Provider[] }).providers
            : undefined;
        setProviders(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      logger.error('Failed to load providers', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  };

  const loadAppointmentTypes = async () => {
    try {
      const response = await portalFetch('/api/patient-portal/appointments?action=appointment-types');
      if (response.ok) {
        const data = await safeParseJson(response);
        const list =
          data !== null && typeof data === 'object' && 'appointmentTypes' in data
            ? (data as { appointmentTypes?: AppointmentType[] }).appointmentTypes
            : undefined;
        setAppointmentTypes(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      logger.error('Failed to load appointment types', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  };

  const loadAvailableSlots = useCallback(async () => {
    if (!selectedProvider || !selectedDate) return;

    setLoadingSlots(true);
    try {
      const duration = selectedType?.duration || 30;
      const params = new URLSearchParams({
        action: 'available-slots',
        providerId: selectedProvider.id.toString(),
        date: selectedDate,
        duration: duration.toString(),
      });

      const response = await portalFetch(`/api/patient-portal/appointments?${params}`);
      if (response.ok) {
        const data = await safeParseJson(response);
        const list =
          data !== null && typeof data === 'object' && 'slots' in data
            ? (data as { slots?: TimeSlot[] }).slots
            : undefined;
        setAvailableSlots(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      logger.error('Failed to load slots', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedProvider, selectedDate, selectedType]);

  useEffect(() => {
    if (selectedProvider && selectedDate) {
      loadAvailableSlots();
    }
  }, [selectedProvider, selectedDate, loadAvailableSlots]);

  const handleBookAppointment = async () => {
    if (!selectedProvider || !selectedSlot) return;

    setBooking(true);
    try {
      const response = await portalFetch('/api/patient-portal/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider.id,
          appointmentTypeId: selectedType?.id,
          startTime: selectedSlot.startTime,
          duration: selectedType?.duration || 30,
          type: appointmentMode,
          reason,
        }),
      });

      if (response.ok) {
        showToast('Appointment booked successfully!');
        setShowBookingModal(false);
        resetBookingForm();
        loadAppointments();
      } else {
        const errBody = await safeParseJson(response);
        const errMsg =
          errBody !== null && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: unknown }).error)
            : 'Failed to book appointment';
        showToast(errMsg, 'error');
      }
    } catch (error) {
      showToast('Failed to book appointment', 'error');
    } finally {
      setBooking(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!appointmentToCancel) return;

    setCancelling(true);
    try {
      const params = new URLSearchParams({
        appointmentId: appointmentToCancel.id.toString(),
        reason: cancelReason || 'Cancelled by patient',
      });

      const response = await portalFetch(`/api/patient-portal/appointments?${params}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast('Appointment cancelled successfully');
        setShowCancelModal(false);
        setAppointmentToCancel(null);
        setCancelReason('');
        loadAppointments();
      } else {
        const errBody = await safeParseJson(response);
        const errMsg =
          errBody !== null && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: unknown }).error)
            : 'Failed to cancel appointment';
        showToast(errMsg, 'error');
      }
    } catch (error) {
      showToast('Failed to cancel appointment', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const resetBookingForm = () => {
    setBookingStep(1);
    setSelectedProvider(null);
    setSelectedType(null);
    setSelectedDate('');
    setSelectedSlot(null);
    setAvailableSlots([]);
    setAppointmentMode('VIDEO');
    setReason('');
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'SCHEDULED':
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'CANCELLED':
        return 'bg-red-100 text-red-700';
      case 'NO_SHOW':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getModeIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'VIDEO':
        return <Video className="h-4 w-4" />;
      case 'PHONE':
        return <Phone className="h-4 w-4" />;
      default:
        return <Building className="h-4 w-4" />;
    }
  };

  const canCancel = (appointment: Appointment) => {
    const hoursUntil = (new Date(appointment.startTime).getTime() - Date.now()) / (1000 * 60 * 60);
    return (
      hoursUntil >= 24 && ['SCHEDULED', 'CONFIRMED'].includes(appointment.status.toUpperCase())
    );
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
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
      {/* Toast */}
      {toast && (
        <div
          className={`animate-in slide-in-from-top-2 fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 text-white shadow-2xl ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'
          }`}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
            }`}
          >
            {toast.type === 'error' ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </div>
          <span className="font-medium">{toast.message}</span>
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
            href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/appointments`)}&reason=session_expired`}
            className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            Log in
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Appointments</h1>
          <p className="mt-2 text-gray-500">Schedule and manage your visits</p>
        </div>
        <button
          onClick={() => setShowBookingModal(true)}
          className="flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-white shadow-lg transition-all hover:scale-105"
          style={{ backgroundColor: primaryColor }}
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Book Appointment</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2 rounded-2xl bg-gray-100 p-1.5">
        {(['upcoming', 'past'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold capitalize transition-all ${
              filter === f
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Appointments List */}
      <div className="space-y-4">
        {appointments.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-xl shadow-gray-200/50">
            <Calendar className="mx-auto mb-4 h-16 w-16 text-gray-300" />
            <h3 className="text-xl font-semibold text-gray-900">No {filter} appointments</h3>
            <p className="mt-2 text-gray-500">
              {filter === 'upcoming'
                ? "You don't have any upcoming appointments scheduled."
                : "You don't have any past appointments."}
            </p>
            {filter === 'upcoming' && (
              <button
                onClick={() => setShowBookingModal(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition-all hover:scale-105"
                style={{ backgroundColor: primaryColor }}
              >
                <Plus className="h-5 w-5" />
                Book Your First Appointment
              </button>
            )}
          </div>
        ) : (
          appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50"
            >
              {/* Appointment Header */}
              <div
                className="relative p-5"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                }}
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm">
                      <span className="text-xs font-medium uppercase">
                        {new Date(appointment.startTime).toLocaleDateString('en-US', {
                          month: 'short',
                        })}
                      </span>
                      <span className="text-2xl font-bold">
                        {new Date(appointment.startTime).getDate()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {appointment.appointmentType?.name || appointment.reason || 'Appointment'}
                      </h3>
                      <p className="text-white/80">
                        {formatTime(appointment.startTime)} · {appointment.duration} min
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusColor(
                      appointment.status
                    )}`}
                  >
                    {appointment.status}
                  </span>
                </div>
              </div>

              {/* Appointment Details */}
              <div className="p-5">
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                    <User className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Provider</p>
                      <p className="font-medium text-gray-900">
                        {appointment.provider
                          ? `${appointment.provider.firstName} ${appointment.provider.lastName}`
                          : 'TBD'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                    {getModeIcon(appointment.type)}
                    <div>
                      <p className="text-xs text-gray-500">Type</p>
                      <p className="font-medium capitalize text-gray-900">
                        {appointment.type?.toLowerCase().replace('_', ' ') || 'In Person'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Video Link for Telehealth */}
                {appointment.type?.toUpperCase() === 'VIDEO' && appointment.videoLink && (
                  <a
                    href={appointment.videoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-blue-50 p-4 font-semibold text-blue-600 transition-all hover:bg-blue-100"
                  >
                    <Video className="h-5 w-5" />
                    Join Video Call
                  </a>
                )}

                {/* Location for In-Person */}
                {appointment.type?.toUpperCase() === 'IN_PERSON' && appointment.location && (
                  <div className="mb-4 flex items-center gap-3 rounded-xl bg-gray-50 p-4">
                    <MapPin className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-700">{appointment.location}</span>
                  </div>
                )}

                {/* Notes */}
                {appointment.notes && (
                  <div className="mb-4 rounded-xl border-2 border-gray-100 bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">{appointment.notes}</p>
                  </div>
                )}

                {/* Actions */}
                {['SCHEDULED', 'CONFIRMED'].includes(appointment.status.toUpperCase()) && (
                  <div className="flex gap-3">
                    {canCancel(appointment) ? (
                      <button
                        onClick={() => {
                          setAppointmentToCancel(appointment);
                          setShowCancelModal(true);
                        }}
                        className="flex-1 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-600 transition-all hover:bg-red-100"
                      >
                        Cancel
                      </button>
                    ) : (
                      <div className="flex flex-1 items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        <AlertCircle className="h-4 w-4" />
                        <span>Cannot cancel within 24 hours</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Booking Modal */}
      {showBookingModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowBookingModal(false);
              resetBookingForm();
            }}
          />
          <div className="fixed inset-x-4 top-1/2 z-50 max-h-[90vh] -translate-y-1/2 overflow-y-auto md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2">
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
                    <h2 className="text-2xl font-semibold text-gray-900">Book Appointment</h2>
                    <p className="mt-1 text-gray-700">Step {bookingStep} of 3</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowBookingModal(false);
                      resetBookingForm();
                    }}
                    className="rounded-xl p-2 text-gray-700 transition-colors hover:bg-black/10"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="mt-4 flex gap-2">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        step <= bookingStep ? 'bg-gray-900' : 'bg-black/20'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="p-6">
                {/* Step 1: Select Provider & Type */}
                {bookingStep === 1 && (
                  <div className="space-y-6">
                    {/* Provider Selection */}
                    <div>
                      <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Select Provider
                      </label>
                      <div className="space-y-2">
                        {providers.length === 0 ? (
                          <p className="text-gray-500">No providers available</p>
                        ) : (
                          providers.map((provider) => (
                            <button
                              key={provider.id}
                              onClick={() => setSelectedProvider(provider)}
                              className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
                                selectedProvider?.id === provider.id
                                  ? 'border-gray-900 bg-gray-50'
                                  : 'border-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <div
                                className="flex h-12 w-12 items-center justify-center rounded-xl"
                                style={{ backgroundColor: `${primaryColor}15` }}
                              >
                                <User className="h-6 w-6" style={{ color: primaryColor }} />
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {provider.firstName} {provider.lastName}
                                </p>
                                {provider.titleLine && (
                                  <p className="text-sm text-gray-500">{provider.titleLine}</p>
                                )}
                              </div>
                              {selectedProvider?.id === provider.id && (
                                <Check className="ml-auto h-5 w-5 text-gray-900" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Appointment Type Selection */}
                    {appointmentTypes.length > 0 && (
                      <div>
                        <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                          Appointment Type (Optional)
                        </label>
                        <div className="space-y-2">
                          {appointmentTypes.map((type) => (
                            <button
                              key={type.id}
                              onClick={() =>
                                setSelectedType(selectedType?.id === type.id ? null : type)
                              }
                              className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left transition-all ${
                                selectedType?.id === type.id
                                  ? 'border-gray-900 bg-gray-50'
                                  : 'border-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <div>
                                <p className="font-semibold text-gray-900">{type.name}</p>
                                <p className="text-sm text-gray-500">
                                  {type.duration} min
                                  {type.price ? ` · $${type.price}` : ''}
                                </p>
                              </div>
                              {selectedType?.id === type.id && (
                                <Check className="h-5 w-5 text-gray-900" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setBookingStep(2)}
                      disabled={!selectedProvider}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold text-white transition-all disabled:opacity-50"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Continue
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                )}

                {/* Step 2: Select Date & Time */}
                {bookingStep === 2 && (
                  <div className="space-y-6">
                    {/* Date Selection */}
                    <div>
                      <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Select Date
                      </label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setSelectedSlot(null);
                        }}
                        min={getMinDate()}
                        className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-6 py-4 text-lg font-semibold text-gray-900 outline-none transition-all focus:border-gray-900 focus:bg-white"
                      />
                    </div>

                    {/* Time Slots */}
                    {selectedDate && (
                      <div>
                        <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                          Available Times
                        </label>
                        {loadingSlots ? (
                          <div className="flex items-center justify-center py-8">
                            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                          </div>
                        ) : availableSlots.length === 0 ? (
                          <div className="rounded-2xl bg-gray-50 p-6 text-center">
                            <Clock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                            <p className="text-gray-500">No available times for this date</p>
                            <p className="mt-1 text-sm text-gray-400">
                              Try selecting a different date
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {availableSlots.map((slot, idx) => (
                              <button
                                key={idx}
                                onClick={() => setSelectedSlot(slot)}
                                className={`rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                                  selectedSlot?.startTime === slot.startTime
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {new Date(slot.startTime).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-4">
                      <button
                        onClick={() => setBookingStep(1)}
                        className="flex-1 rounded-2xl border-2 border-gray-200 px-6 py-4 font-semibold text-gray-700 transition-all hover:bg-gray-50"
                      >
                        <ChevronLeft className="mr-2 inline h-5 w-5" />
                        Back
                      </button>
                      <button
                        onClick={() => setBookingStep(3)}
                        disabled={!selectedSlot}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold text-white transition-all disabled:opacity-50"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Continue
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Confirm & Details */}
                {bookingStep === 3 && (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <h3 className="mb-3 font-semibold text-gray-900">Appointment Summary</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Provider</span>
                          <span className="font-medium text-gray-900">
                            {selectedProvider?.firstName} {selectedProvider?.lastName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Date</span>
                          <span className="font-medium text-gray-900">
                            {selectedDate &&
                              new Date(selectedDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                              })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Time</span>
                          <span className="font-medium text-gray-900">
                            {selectedSlot &&
                              new Date(selectedSlot.startTime).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Duration</span>
                          <span className="font-medium text-gray-900">
                            {selectedType?.duration || 30} minutes
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Appointment Mode */}
                    <div>
                      <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Appointment Mode
                      </label>
                      <div className="flex gap-2">
                        {[
                          { value: 'VIDEO', label: 'Video', icon: Video },
                          { value: 'PHONE', label: 'Phone', icon: Phone },
                          { value: 'IN_PERSON', label: 'In Person', icon: Building },
                        ].map((mode) => {
                          const Icon = mode.icon;
                          return (
                            <button
                              key={mode.value}
                              onClick={() =>
                                setAppointmentMode(mode.value as 'VIDEO' | 'PHONE' | 'IN_PERSON')
                              }
                              className={`flex flex-1 flex-col items-center gap-2 rounded-xl p-4 transition-all ${
                                appointmentMode === mode.value
                                  ? 'bg-gray-900 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                              <span className="text-sm font-medium">{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Reason for Visit (Optional)
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Briefly describe why you're scheduling this appointment"
                        rows={3}
                        className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition-all focus:border-gray-900 focus:bg-white"
                      />
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => setBookingStep(2)}
                        className="flex-1 rounded-2xl border-2 border-gray-200 px-6 py-4 font-semibold text-gray-700 transition-all hover:bg-gray-50"
                      >
                        <ChevronLeft className="mr-2 inline h-5 w-5" />
                        Back
                      </button>
                      <button
                        onClick={handleBookAppointment}
                        disabled={booking}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {booking ? (
                          <>
                            <RefreshCw className="h-5 w-5 animate-spin" />
                            Booking...
                          </>
                        ) : (
                          <>
                            <Check className="h-5 w-5" />
                            Confirm Booking
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && appointmentToCancel && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowCancelModal(false);
              setAppointmentToCancel(null);
              setCancelReason('');
            }}
          />
          <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="bg-red-50 p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Cancel Appointment</h2>
                    <p className="text-sm text-gray-600">This action cannot be undone</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-6 rounded-xl bg-gray-50 p-4">
                  <p className="font-medium text-gray-900">
                    {formatDate(appointmentToCancel.startTime)} at{' '}
                    {formatTime(appointmentToCancel.startTime)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {appointmentToCancel.provider
                      ? `with ${appointmentToCancel.provider.firstName} ${appointmentToCancel.provider.lastName}`
                      : ''}
                  </p>
                </div>

                <div className="mb-6">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Reason for cancellation (optional)
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Let us know why you're cancelling..."
                    rows={3}
                    className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition-all focus:border-gray-900 focus:bg-white"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setShowCancelModal(false);
                      setAppointmentToCancel(null);
                      setCancelReason('');
                    }}
                    className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 font-semibold text-gray-700 transition-all hover:bg-gray-50"
                  >
                    Keep Appointment
                  </button>
                  <button
                    onClick={handleCancelAppointment}
                    disabled={cancelling}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition-all hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      'Yes, Cancel'
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
