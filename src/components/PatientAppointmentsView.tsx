"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Clock, Video, MapPin, User, Phone, Mail, Plus, Download, X, Loader2, AlertCircle } from "lucide-react";

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
  type: "telehealth" | "in-person" | "VIDEO" | "PHONE" | "IN_PERSON";
  status: "scheduled" | "completed" | "cancelled" | "no-show" | "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "IN_PROGRESS" | "CHECKED_IN" | "RESCHEDULED";
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
function normalizeType(type: string): "telehealth" | "in-person" {
  const t = type.toUpperCase();
  if (t === "VIDEO" || t === "PHONE" || t === "TELEHEALTH") return "telehealth";
  return "in-person";
}

// Normalize status for display
function normalizeStatus(status: string): "scheduled" | "completed" | "cancelled" | "no-show" {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "completed";
  if (s === "CANCELLED") return "cancelled";
  if (s === "NO_SHOW") return "no-show";
  return "scheduled";
}

export default function PatientAppointmentsView({ patient, clinicId: propClinicId }: PatientAppointmentsViewProps) {
  const searchParams = useSearchParams();
  const clinicId = propClinicId || (searchParams.get("clinicId") ? parseInt(searchParams.get("clinicId")!) : undefined);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    date: "",
    time: "",
    duration: "30",
    type: "VIDEO" as "VIDEO" | "IN_PERSON" | "PHONE",
    providerId: "",
    reason: "",
    notes: "",
    location: ""
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
      const transformedAppointments: Appointment[] = (data.appointments || []).map((apt: {
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
          time: startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          duration: apt.duration || 30,
          type: apt.type,
          status: apt.status,
          provider: {
            id: apt.provider?.id,
            name: apt.provider ? `${apt.provider.firstName || ''} ${apt.provider.lastName || ''}`.trim() : 'Unknown Provider',
            specialty: apt.provider?.titleLine || undefined,
          },
          reason: apt.reason,
          notes: apt.notes,
          zoomLink: apt.videoLink,
          videoLink: apt.videoLink,
          location: apt.location,
          startTime: apt.startTime,
        };
      });

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

  const filteredAppointments = appointments.filter(apt => {
    const now = new Date();
    const aptDate = apt.date instanceof Date ? apt.date : new Date(apt.date);
    if (filter === "upcoming") {
      return aptDate >= now;
    } else if (filter === "past") {
      return aptDate < now;
    }
    return true;
  }).sort((a, b) => {
    const dateA = a.date instanceof Date ? a.date : new Date(a.date);
    const dateB = b.date instanceof Date ? b.date : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toUpperCase();
    switch (normalizedStatus) {
      case "SCHEDULED":
      case "CONFIRMED":
        return "bg-blue-100 text-blue-700";
      case "COMPLETED":
        return "bg-green-100 text-green-700";
      case "CANCELLED":
      case "RESCHEDULED":
        return "bg-red-100 text-red-700";
      case "NO_SHOW":
        return "bg-gray-100 text-gray-700";
      case "IN_PROGRESS":
      case "CHECKED_IN":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getTypeIcon = (type: string) => {
    const normalizedType = type.toUpperCase();
    if (normalizedType === "VIDEO" || normalizedType === "PHONE" || normalizedType === "TELEHEALTH") {
      return <Video className="w-4 h-4" />;
    }
    return <MapPin className="w-4 h-4" />;
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
        date: "",
        time: "",
        duration: "30",
        type: "VIDEO",
        providerId: "",
        reason: "",
        notes: "",
        location: ""
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Appointment History</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage and view all appointments for {patient.firstName} {patient.lastName}
            </p>
          </div>
          <button
            onClick={() => setShowNewAppointmentModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Schedule Appointment
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
          {(["upcoming", "past", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded transition-colors capitalize ${
                filter === f
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {f === "all" ? "All" : f === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Appointments List */}
      <div className="space-y-4">
        {isLoadingAppointments ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500">Loading appointments...</p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No {filter === "all" ? "" : filter} appointments found</p>
            {filter === "upcoming" && (
              <button
                onClick={() => setShowNewAppointmentModal(true)}
                className="mt-4 text-[#4fa77e] hover:text-[#3f8660] font-medium"
              >
                Schedule an appointment →
              </button>
            )}
          </div>
        ) : (
          filteredAppointments.map(appointment => {
            const aptDate = appointment.date instanceof Date ? appointment.date : new Date(appointment.date);
            const normalizedStatus = normalizeStatus(appointment.status);
            const normalizedType = normalizeType(appointment.type);
            const videoLink = appointment.zoomLink || appointment.videoLink;

            return (
              <div
                key={appointment.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    {/* Date Box */}
                    <div className="text-center min-w-[80px]">
                      <div className="bg-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-600 uppercase">
                          {aptDate.toLocaleDateString("en-US", { month: "short" })}
                        </div>
                        <div className="text-2xl font-bold">
                          {aptDate.getDate()}
                        </div>
                        <div className="text-xs text-gray-600">
                          {aptDate.toLocaleDateString("en-US", { weekday: "short" })}
                        </div>
                      </div>
                    </div>

                    {/* Appointment Details */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-4">
                        <h3 className="font-semibold text-lg">{appointment.reason || "Medical Appointment"}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(appointment.status)}`}>
                          {normalizedStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="w-4 h-4" />
                          <span>{appointment.time} • {appointment.duration} minutes</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="w-4 h-4" />
                          <span>{appointment.provider.name}</span>
                          {appointment.provider.specialty && (
                            <span className="text-xs text-gray-500">({appointment.provider.specialty})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          {getTypeIcon(appointment.type)}
                          <span className="capitalize">{normalizedType.replace("-", " ")}</span>
                        </div>
                        {normalizedType === "telehealth" && videoLink && (
                          <div className="flex items-center gap-2">
                            <a
                              href={videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
                            >
                              <Video className="w-4 h-4" />
                              Join Video Call
                            </a>
                          </div>
                        )}
                        {normalizedType === "in-person" && appointment.location && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-4 h-4" />
                            <span>{appointment.location}</span>
                          </div>
                        )}
                      </div>

                      {appointment.notes && (
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                          <span className="font-medium">Notes: </span>
                          {appointment.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {normalizedStatus === "scheduled" && aptDate >= new Date() && (
                      <>
                        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )}
                    {normalizedStatus === "completed" && (
                      <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <Download className="w-5 h-5" />
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
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.status === "completed").length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.status === "scheduled" && a.date >= new Date()).length}
          </div>
          <div className="text-sm text-gray-600">Upcoming</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.type === "telehealth").length}
          </div>
          <div className="text-sm text-gray-600">Telehealth</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.type === "in-person").length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="font-semibold mb-3 text-blue-900">Patient Contact Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-blue-800">
            <Mail className="w-4 h-4" />
            <span>{patient.email || "No email on file"}</span>
          </div>
          <div className="flex items-center gap-2 text-blue-800">
            <Phone className="w-4 h-4" />
            <span>{patient.phone || "No phone on file"}</span>
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-3">
          Appointment reminders will be sent to the contact information above.
        </p>
      </div>

      {/* New Appointment Modal */}
      {showNewAppointmentModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close modal if clicking outside
            if (e.target === e.currentTarget) {
              setShowNewAppointmentModal(false);
            }
          }}
        >
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Schedule New Appointment</h2>
                <button
                  onClick={() => setShowNewAppointmentModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Scheduling appointment for {patient.firstName} {patient.lastName}
              </p>
            </div>

            <form className="p-6 space-y-6" onSubmit={handleCreateAppointment}>
              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={appointmentForm.date}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time
                  </label>
                  <input
                    type="time"
                    required
                    value={appointmentForm.time}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Duration and Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration
                  </label>
                  <select
                    value={appointmentForm.duration}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, duration: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={appointmentForm.type}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, type: e.target.value as "VIDEO" | "IN_PERSON" | "PHONE" }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  >
                    <option value="VIDEO">Telehealth (Video)</option>
                    <option value="PHONE">Telehealth (Phone)</option>
                    <option value="IN_PERSON">In-Person</option>
                  </select>
                </div>
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider
                </label>
                {isLoadingProviders ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading providers...
                  </div>
                ) : providers.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                    No providers available for scheduling
                  </div>
                ) : (
                  <select
                    required
                    value={appointmentForm.providerId}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, providerId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
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
              {appointmentForm.type === "IN_PERSON" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={appointmentForm.location}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g., Main Clinic - Room 201"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  />
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Visit
                </label>
                <input
                  type="text"
                  required
                  value={appointmentForm.reason}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., Follow-up consultation, Annual checkup"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes or special instructions"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                />
              </div>

              {/* Error Message in Modal */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewAppointmentModal(false);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || providers.length === 0}
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
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
