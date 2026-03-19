'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Video,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import BookTelehealthWizard from '@/components/BookTelehealthWizard';
import { apiFetch } from '@/lib/api/fetch';

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string;
  email: string;
}

interface Appointment {
  id: number;
  patientName: string;
  providerName: string;
  date: Date;
  duration: number;
  type: string;
  status: string;
  reason?: string;
  zoomJoinUrl?: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  checked_in: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-orange-100 text-orange-800',
};

function getTypeIcon(type: string) {
  switch (type) {
    case 'telehealth':
      return <Video className="h-4 w-4" />;
    case 'phone':
      return <Phone className="h-4 w-4" />;
    default:
      return <MapPin className="h-4 w-4" />;
  }
}

export default function StaffAppointmentsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterProviderId, setFilterProviderId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBookWizard, setShowBookWizard] = useState(false);

  useEffect(() => {
    apiFetch('/api/providers').then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    });
  }, []);

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      if (filterProviderId !== 'all') params.set('providerId', filterProviderId);

      const res = await apiFetch(`/api/scheduling/appointments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch appointments');

      const data = await res.json();
      const mapped: Appointment[] = (data.appointments || []).map((apt: any) => ({
        id: apt.id,
        patientName: apt.patient
          ? `${apt.patient.firstName} ${apt.patient.lastName}`
          : 'Unknown',
        providerName: apt.provider
          ? `${apt.provider.firstName} ${apt.provider.lastName}`
          : 'Unknown',
        date: new Date(apt.startTime),
        duration: apt.duration || 30,
        type:
          apt.type === 'VIDEO'
            ? 'telehealth'
            : apt.type === 'IN_PERSON'
              ? 'in-person'
              : 'phone',
        status: apt.status?.toLowerCase() || 'scheduled',
        reason: apt.reason,
        zoomJoinUrl: apt.zoomJoinUrl || apt.videoLink,
      }));

      setAppointments(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, filterProviderId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const filteredAppointments = appointments.filter((apt) => {
    if (filterStatus !== 'all' && apt.status !== filterStatus) return false;
    return true;
  });

  const handleStatusUpdate = async (aptId: number, newStatus: string) => {
    try {
      const res = await apiFetch('/api/scheduling/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: aptId, status: newStatus.toUpperCase() }),
      });
      if (res.ok) {
        await fetchAppointments();
      }
    } catch {
      // best-effort
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Calendar className="h-6 w-6 text-[#4fa77e]" />
            Appointment Management
          </h1>
          <button
            onClick={() => setShowBookWizard(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Video className="h-4 w-4" />
            Book Telehealth
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
          <select
            value={filterProviderId}
            onChange={(e) => setFilterProviderId(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-900">{filteredAppointments.length}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {filteredAppointments.filter((a) => a.status === 'confirmed').length}
          </div>
          <div className="text-sm text-gray-600">Confirmed</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-purple-600">
            {filteredAppointments.filter((a) => a.status === 'in_progress').length}
          </div>
          <div className="text-sm text-gray-600">In Progress</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {filteredAppointments.filter((a) => a.type === 'telehealth').length}
          </div>
          <div className="text-sm text-gray-600">Telehealth</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-600">
            {filteredAppointments.filter((a) => a.type === 'in-person').length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Appointments List */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredAppointments.length > 0 ? (
            <div className="space-y-3">
              {filteredAppointments
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-start gap-4 rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="min-w-[90px] text-center">
                      <div className="text-base font-semibold text-gray-900">
                        {apt.date.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-xs text-gray-500">{apt.duration} min</div>
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{apt.patientName}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[apt.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {apt.status.replace('_', ' ')}
                        </span>
                      </div>
                      {apt.reason && (
                        <div className="mb-1 text-sm text-gray-600">{apt.reason}</div>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          {getTypeIcon(apt.type)}
                          {apt.type === 'telehealth' ? 'Video' : apt.type}
                        </span>
                        <span>Provider: {apt.providerName}</span>
                        {apt.zoomJoinUrl && (
                          <a
                            href={apt.zoomJoinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Join Zoom
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      {apt.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => handleStatusUpdate(apt.id, 'CONFIRMED')}
                            className="rounded bg-green-100 px-3 py-1 text-sm font-medium text-green-700 transition-colors hover:bg-green-200"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(apt.id, 'CANCELLED')}
                            className="rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-200"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {apt.status === 'confirmed' && (
                        <button
                          onClick={() => handleStatusUpdate(apt.id, 'CHECKED_IN')}
                          className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200"
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Calendar className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No appointments found for the selected criteria</p>
              <button
                onClick={() => setShowBookWizard(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Video className="h-4 w-4" />
                Book a telehealth consultation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Book Telehealth Wizard */}
      {showBookWizard && (
        <BookTelehealthWizard
          isOpen={showBookWizard}
          onClose={() => setShowBookWizard(false)}
          onBooked={() => {
            setShowBookWizard(false);
            fetchAppointments();
          }}
          providers={providers}
        />
      )}
    </div>
  );
}
