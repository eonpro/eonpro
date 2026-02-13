'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { logger } from '../../../lib/logger';

import { useSearchParams } from 'next/navigation';
import ProviderCalendar from '@/components/ProviderCalendar';
import CalendarSync from '@/components/CalendarSync';
import AppointmentModal from '@/components/AppointmentModal';
import { Calendar, Clock, Video, Users, Bell, Settings, Plus, Loader2 } from 'lucide-react';

interface Appointment {
  id: number;
  patientId: number;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  date: Date;
  duration: number;
  type: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  status: string;
  reason?: string;
  notes?: string;
}

function ProviderCalendarContent() {
  const searchParams = useSearchParams();
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [preSelectedPatient, setPreSelectedPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch appointments from database
  const fetchAppointments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current month's date range for initial load
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const response = await fetch(
        `/api/scheduling/appointments?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.detail || errorData.error || 'Failed to fetch appointments';
        throw new Error(message);
      }

      const data = await response.json();

      // Transform API response to component format
      const transformedAppointments: Appointment[] = (data.appointments || []).map((apt: any) => ({
        id: apt.id,
        patientId: apt.patientId,
        patientName: apt.patient
          ? `${apt.patient.firstName} ${apt.patient.lastName}`
          : 'Unknown Patient',
        patientEmail: apt.patient?.email || '',
        patientPhone: apt.patient?.phone || '',
        date: new Date(apt.startTime),
        duration: apt.duration || 30,
        type:
          apt.type === 'VIDEO' ? 'telehealth' : apt.type === 'IN_PERSON' ? 'in-person' : 'phone',
        zoomLink: apt.zoomJoinUrl || apt.videoLink,
        zoomMeetingId: apt.zoomMeetingId,
        status: apt.status?.toLowerCase() || 'scheduled',
        reason: apt.reason,
        notes: apt.notes,
      }));

      setAppointments(transformedAppointments);
    } catch (err) {
      logger.error('Error fetching appointments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Check for query parameters and pre-selected patient on mount
  useEffect(() => {
    // Check if we should open appointment modal
    if (searchParams.get('newAppointment') === 'true') {
      // Check for pre-selected patient from sessionStorage
      const storedPatient = sessionStorage.getItem('appointmentPatient');
      if (storedPatient) {
        try {
          const patient = JSON.parse(storedPatient);
          setPreSelectedPatient(patient);
          sessionStorage.removeItem('appointmentPatient'); // Clean up
        } catch (e) {
          logger.error('Failed to parse stored patient', e);
        }
      }
      setShowAppointmentModal(true);
    }
  }, [searchParams]);

  const handleCreateAppointment = (date?: Date) => {
    setSelectedDate(date || null);
    setSelectedAppointment(null);
    setShowAppointmentModal(true);
  };

  const handleEditAppointment = (appointment: any) => {
    setSelectedAppointment(appointment);
    setShowAppointmentModal(true);
  };

  const handleSaveAppointment = async (appointmentData: any) => {
    // The AppointmentModal now handles the API call directly
    // This callback receives the created/updated appointment from the API

    if (appointmentData.id) {
      // Check if this is an update or a new appointment
      const existingIndex = appointments.findIndex((apt) => apt.id === appointmentData.id);

      if (existingIndex >= 0) {
        // Update existing appointment in state
        setAppointments((prev) =>
          prev.map((apt) =>
            apt.id === appointmentData.id
              ? {
                  ...apt,
                  ...appointmentData,
                }
              : apt
          )
        );
      } else {
        // Add new appointment to state
        setAppointments((prev) => [...prev, appointmentData]);
      }
    }

    // Refresh appointments from server to ensure we have the latest data
    await fetchAppointments();

    setShowAppointmentModal(false);
    setSelectedAppointment(null);
    setPreSelectedPatient(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-[#4fa77e]" />
            <h1 className="text-2xl font-bold text-gray-900">Provider Calendar</h1>
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Stats */}
            <div className="mr-6 flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {
                    appointments.filter(
                      (apt) => apt.date.toDateString() === new Date().toDateString()
                    ).length
                  }
                </p>
                <p className="text-xs text-gray-600">Today</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {
                    appointments.filter(
                      (apt) =>
                        apt.date >= new Date() &&
                        apt.date <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    ).length
                  }
                </p>
                <p className="text-xs text-gray-600">This Week</p>
              </div>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => setShowSyncSettings(!showSyncSettings)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Calendar Sync</span>
            </button>

            <button
              onClick={() => handleCreateAppointment()}
              className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660]"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">New Appointment</span>
            </button>
          </div>
        </div>

        {/* Calendar Sync Settings */}
        {showSyncSettings && (
          <div className="mt-4 border-t pt-4">
            <CalendarSync onClose={() => setShowSyncSettings(false)} />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex gap-6 p-6">
        {/* Sidebar - Today's Schedule */}
        <div className="w-80 flex-shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Today's Schedule</h3>

            <div className="space-y-3">
              {appointments
                .filter((apt) => apt.date.toDateString() === new Date().toDateString())
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map((apt) => (
                  <div
                    key={apt.id}
                    className="cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 transition-colors hover:border-[#4fa77e]"
                    onClick={() => handleEditAppointment(apt)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <Clock className="h-3 w-3 text-gray-500" />
                          <span className="text-sm font-medium">
                            {apt.date.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="text-xs text-gray-500">({apt.duration} min)</span>
                        </div>
                        <p className="font-medium text-gray-900">{apt.patientName}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Video className="h-3 w-3 text-blue-500" />
                          <span className="text-xs text-blue-600">Telehealth</span>
                        </div>
                      </div>
                      {apt.status === 'confirmed' && (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                          Confirmed
                        </span>
                      )}
                    </div>
                  </div>
                ))}

              {appointments.filter((apt) => apt.date.toDateString() === new Date().toDateString())
                .length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">
                  No appointments scheduled for today
                </p>
              )}
            </div>

            {/* Upcoming Appointments */}
            <div className="mt-6 border-t pt-4">
              <h4 className="mb-3 font-medium text-gray-700">Upcoming</h4>
              <div className="space-y-2">
                {appointments
                  .filter((apt) => apt.date > new Date())
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 3)
                  .map((apt) => (
                    <div
                      key={apt.id}
                      className="cursor-pointer rounded p-2 text-sm hover:bg-gray-50"
                      onClick={() => handleEditAppointment(apt)}
                    >
                      <p className="font-medium">{apt.patientName}</p>
                      <p className="text-xs text-gray-500">
                        {apt.date.toLocaleDateString()} at{' '}
                        {apt.date.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 space-y-2 border-t pt-4">
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                <Users className="h-4 w-4 text-gray-500" />
                <span>Manage Patients</span>
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                <Bell className="h-4 w-4 text-gray-500" />
                <span>Notification Settings</span>
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                <Video className="h-4 w-4 text-gray-500" />
                <span>Zoom Settings</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Calendar */}
        <div className="flex-1">
          <ProviderCalendar
            appointments={appointments}
            onDateClick={handleCreateAppointment}
            onAppointmentClick={handleEditAppointment}
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            {error}
            <button onClick={fetchAppointments} className="ml-2 underline hover:no-underline">
              Try again
            </button>
          </p>
        </div>
      )}

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <AppointmentModal
          isOpen={showAppointmentModal}
          onClose={() => {
            setShowAppointmentModal(false);
            setPreSelectedPatient(null);
            setSelectedAppointment(null);
          }}
          onSave={handleSaveAppointment}
          selectedDate={selectedDate}
          appointment={selectedAppointment}
          preSelectedPatient={preSelectedPatient}
        />
      )}
    </div>
  );
}

export default function ProviderCalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <div className="animate-pulse">
            <div className="mb-6 h-8 w-1/4 rounded bg-gray-200"></div>
            <div className="flex space-x-6">
              <div className="h-96 w-80 rounded bg-gray-200"></div>
              <div className="h-96 flex-1 rounded bg-gray-200"></div>
            </div>
          </div>
        </div>
      }
    >
      <ProviderCalendarContent />
    </Suspense>
  );
}
