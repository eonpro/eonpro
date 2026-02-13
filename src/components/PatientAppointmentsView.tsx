'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  User,
  Phone,
  Mail,
  Plus,
  Download,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string | null;
}

interface Appointment {
  id: number;
  date: Date;
  time: string;
  duration: number;
  type: 'telehealth' | 'in-person' | 'VIDEO' | 'PHONE' | 'IN_PERSON';
  status:
    | 'scheduled'
    | 'completed'
    | 'cancelled'
    | 'no-show'
    | 'SCHEDULED'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'NO_SHOW'
    | 'IN_PROGRESS'
    | 'CHECKED_IN'
    | 'RESCHEDULED';
  provider: {
    id?: number;
    name: string;
    specialty?: string;
  };
  reason?: string;
  notes?: string;
  zoomLink?: string;
  videoLink?: string;
  location?: string;
  startTime?: string;
}

interface PatientAppointmentsViewProps {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dob: string | null;
  };
  clinicId?: number;
}

// Normalize appointment type for display
function normalizeType(type: string): 'telehealth' | 'in-person' {
  const t = type.toUpperCase();
  if (t === 'VIDEO' || t === 'PHONE' || t === 'TELEHEALTH') return 'telehealth';
  return 'in-person';
}

// Normalize status for display
function normalizeStatus(status: string): 'scheduled' | 'completed' | 'cancelled' | 'no-show' {
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return 'completed';
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'NO_SHOW') return 'no-show';
  return 'scheduled';
}

export default function PatientAppointmentsView({
  patient,
  clinicId: propClinicId,
}: PatientAppointmentsViewProps) {
  const searchParams = useSearchParams();
  const clinicId =
    propClinicId ||
    (searchParams.get('clinicId') ? parseInt(searchParams.get('clinicId')!) : undefined);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    date: '',
    time: '',
    duration: '30',
    type: 'VIDEO' as 'VIDEO' | 'IN_PERSON' | 'PHONE',
    providerId: '',
    reason: '',
    notes: '',
    location: '',
  });

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showNewAppointmentModal) {
        setShowNewAppointmentModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showNewAppointmentModal]);

  // Fetch providers from API
  const fetchProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    try {
      const url = new URL('/api/patient-portal/appointments', window.location.origin);
      url.searchParams.set('action', 'providers');
      if (clinicId) {
        url.searchParams.set('clinicId', clinicId.toString());
      }

      const response = await fetch(url.toString(), {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch providers');
      }

      const data = await response.json();
      setProviders(data.providers || []);
    } catch (err) {
      console.error('Error fetching providers:', err);
      // Don't show error to user - just use empty list
      setProviders([]);
    } finally {
      setIsLoadingProviders(false);
    }
  }, [clinicId]);

  // Fetch appointments from API
  const fetchAppointments = useCallback(async () => {
    setIsLoadingAppointments(true);
    setError(null);
    try {
      const url = new URL('/api/patient-portal/appointments', window.location.origin);
      url.searchParams.set('patientId', patient.id.toString());
      if (clinicId) {
        url.searchParams.set('clinicId', clinicId.toString());
      }

      const response = await fetch(url.toString(), {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch appointments');
      }

      const data = await response.json();

      // Transform API appointments to component format
      const transformedAppointments: Appointment[] = (data.appointments || []).map(
        (apt: {
          id: number;
          startTime: string;
          duration: number;
          type: string;
          status: string;
          provider?: { id?: number; firstName?: string; lastName?: string; titleLine?: string };
          reason?: string;
          notes?: string;
          videoLink?: string;
          location?: string;
        }) => {
          const startDate = new Date(apt.startTime);
          return {
            id: apt.id,
            date: startDate,
            time: startDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
            duration: apt.duration || 30,
            type: apt.type,
            status: apt.status,
            provider: {
              id: apt.provider?.id,
              name: apt.provider
                ? `${apt.provider.firstName || ''} ${apt.provider.lastName || ''}`.trim()
                : 'Unknown Provider',
              specialty: apt.provider?.titleLine || undefined,
            },
            reason: apt.reason,
            notes: apt.notes,
            zoomLink: apt.videoLink,
            videoLink: apt.videoLink,
            location: apt.location,
            startTime: apt.startTime,
          };
        }
      );

      setAppointments(transformedAppointments);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
      setAppointments([]);
    } finally {
      setIsLoadingAppointments(false);
    }
  }, [patient.id, clinicId]);

  // Fetch data on mount
  useEffect(() => {
    fetchProviders();
    fetchAppointments();
  }, [fetchProviders, fetchAppointments]);

  const filteredAppointments = appointments
    .filter((apt) => {
      const now = new Date();
      const aptDate = apt.date instanceof Date ? apt.date : new Date(apt.date);
      if (filter === 'upcoming') {
        return aptDate >= now;
      } else if (filter === 'past') {
        return aptDate < now;
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toUpperCase();
    switch (normalizedStatus) {
      case 'SCHEDULED':
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'CANCELLED':
      case 'RESCHEDULED':
        return 'bg-red-100 text-red-700';
      case 'NO_SHOW':
        return 'bg-gray-100 text-gray-700';
      case 'IN_PROGRESS':
      case 'CHECKED_IN':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getTypeIcon = (type: string) => {
    const normalizedType = type.toUpperCase();
    if (
      normalizedType === 'VIDEO' ||
      normalizedType === 'PHONE' ||
      normalizedType === 'TELEHEALTH'
    ) {
      return <Video className="h-4 w-4" />;
    }
    return <MapPin className="h-4 w-4" />;
  };

  // Create appointment handler
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Construct the start time from date and time
      const startTime = new Date(`${appointmentForm.date}T${appointmentForm.time}`);

      const response = await fetch('/api/patient-portal/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          patientId: patient.id,
          providerId: parseInt(appointmentForm.providerId),
          startTime: startTime.toISOString(),
          duration: parseInt(appointmentForm.duration),
          type: appointmentForm.type,
          reason: appointmentForm.reason || undefined,
          notes: appointmentForm.notes || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create appointment');
      }

      // Success - refresh appointments and close modal
      await fetchAppointments();
      setShowNewAppointmentModal(false);
      setAppointmentForm({
        date: '',
        time: '',
        duration: '30',
        type: 'VIDEO',
        providerId: '',
        reason: '',
        notes: '',
        location: '',
      });
    } catch (err) {
      console.error('Error creating appointment:', err);
      setError(err instanceof Error ? err.message : 'Failed to create appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Appointment History</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage and view all appointments for {patient.firstName} {patient.lastName}
            </p>
          </div>
          <button
            onClick={() => setShowNewAppointmentModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660]"
          >
            <Plus className="h-4 w-4" />
            Schedule Appointment
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex w-fit gap-2 rounded-lg bg-gray-100 p-1">
          {(['upcoming', 'past', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-4 py-2 capitalize transition-colors ${
                filter === f
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : 'Past'}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Appointments List */}
      <div className="space-y-4">
        {isLoadingAppointments ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-gray-400" />
            <p className="text-gray-500">Loading appointments...</p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <p className="text-gray-500">No {filter === 'all' ? '' : filter} appointments found</p>
            {filter === 'upcoming' && (
              <button
                onClick={() => setShowNewAppointmentModal(true)}
                className="mt-4 font-medium text-[#4fa77e] hover:text-[#3f8660]"
              >
                Schedule an appointment →
              </button>
            )}
          </div>
        ) : (
          filteredAppointments.map((appointment) => {
            const aptDate =
              appointment.date instanceof Date ? appointment.date : new Date(appointment.date);
            const normalizedStatus = normalizeStatus(appointment.status);
            const normalizedType = normalizeType(appointment.type);
            const videoLink = appointment.zoomLink || appointment.videoLink;

            return (
              <div
                key={appointment.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    {/* Date Box */}
                    <div className="min-w-[80px] text-center">
                      <div className="rounded-lg bg-gray-100 p-3">
                        <div className="text-xs uppercase text-gray-600">
                          {aptDate.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div className="text-2xl font-bold">{aptDate.getDate()}</div>
                        <div className="text-xs text-gray-600">
                          {aptDate.toLocaleDateString('en-US', { weekday: 'short' })}
                        </div>
                      </div>
                    </div>

                    {/* Appointment Details */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-4">
                        <h3 className="text-lg font-semibold">
                          {appointment.reason || 'Medical Appointment'}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(appointment.status)}`}
                        >
                          {normalizedStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="h-4 w-4" />
                          <span>
                            {appointment.time} • {appointment.duration} minutes
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="h-4 w-4" />
                          <span>{appointment.provider.name}</span>
                          {appointment.provider.specialty && (
                            <span className="text-xs text-gray-500">
                              ({appointment.provider.specialty})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          {getTypeIcon(appointment.type)}
                          <span className="capitalize">{normalizedType.replace('-', ' ')}</span>
                        </div>
                        {normalizedType === 'telehealth' && videoLink && (
                          <div className="flex items-center gap-2">
                            <a
                              href={videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                              <Video className="h-4 w-4" />
                              Join Video Call
                            </a>
                          </div>
                        )}
                        {normalizedType === 'in-person' && appointment.location && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="h-4 w-4" />
                            <span>{appointment.location}</span>
                          </div>
                        )}
                      </div>

                      {appointment.notes && (
                        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                          <span className="font-medium">Notes: </span>
                          {appointment.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {normalizedStatus === 'scheduled' && aptDate >= new Date() && (
                      <>
                        <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700">
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700">
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                    {normalizedStatus === 'completed' && (
                      <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700">
                        <Download className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter((a) => a.status === 'completed').length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter((a) => a.status === 'scheduled' && a.date >= new Date()).length}
          </div>
          <div className="text-sm text-gray-600">Upcoming</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter((a) => a.type === 'telehealth').length}
          </div>
          <div className="text-sm text-gray-600">Telehealth</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter((a) => a.type === 'in-person').length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h3 className="mb-3 font-semibold text-blue-900">Patient Contact Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-blue-800">
            <Mail className="h-4 w-4" />
            <span>{patient.email || 'No email on file'}</span>
          </div>
          <div className="flex items-center gap-2 text-blue-800">
            <Phone className="h-4 w-4" />
            <span>{patient.phone || 'No phone on file'}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-blue-700">
          Appointment reminders will be sent to the contact information above.
        </p>
      </div>

      {/* New Appointment Modal */}
      {showNewAppointmentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={(e) => {
            // Close modal if clicking outside
            if (e.target === e.currentTarget) {
              setShowNewAppointmentModal(false);
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white">
            <div className="sticky top-0 border-b border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Schedule New Appointment</h2>
                <button
                  onClick={() => setShowNewAppointmentModal(false)}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Scheduling appointment for {patient.firstName} {patient.lastName}
              </p>
            </div>

            <form className="space-y-6 p-6" onSubmit={handleCreateAppointment}>
              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    required
                    value={appointmentForm.date}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Time</label>
                  <input
                    type="time"
                    required
                    value={appointmentForm.time}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, time: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              {/* Duration and Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Duration</label>
                  <select
                    value={appointmentForm.duration}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, duration: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Type</label>
                  <select
                    value={appointmentForm.type}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({
                        ...prev,
                        type: e.target.value as 'VIDEO' | 'IN_PERSON' | 'PHONE',
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                  >
                    <option value="VIDEO">Telehealth (Video)</option>
                    <option value="PHONE">Telehealth (Phone)</option>
                    <option value="IN_PERSON">In-Person</option>
                  </select>
                </div>
              </div>

              {/* Provider */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Provider</label>
                {isLoadingProviders ? (
                  <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading providers...
                  </div>
                ) : providers.length === 0 ? (
                  <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500">
                    No providers available for scheduling
                  </div>
                ) : (
                  <select
                    required
                    value={appointmentForm.providerId}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, providerId: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                  >
                    <option value="">Select a provider</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id.toString()}>
                        {provider.firstName} {provider.lastName}
                        {provider.titleLine ? ` - ${provider.titleLine}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Location (for in-person) */}
              {appointmentForm.type === 'IN_PERSON' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={appointmentForm.location}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, location: e.target.value }))
                    }
                    placeholder="e.g., Main Clinic - Room 201"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                  />
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Reason for Visit
                </label>
                <input
                  type="text"
                  required
                  value={appointmentForm.reason}
                  onChange={(e) =>
                    setAppointmentForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="e.g., Follow-up consultation, Annual checkup"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Notes (Optional)
                </label>
                <textarea
                  value={appointmentForm.notes}
                  onChange={(e) =>
                    setAppointmentForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Any additional notes or special instructions"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                />
              </div>

              {/* Error Message in Modal */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewAppointmentModal(false);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || providers.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    'Schedule Appointment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
