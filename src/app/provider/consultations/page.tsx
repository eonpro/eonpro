'use client';

import { useState, useEffect } from 'react';
import {
  Video,
  Clock,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Consultation {
  id: number;
  patientName: string;
  patientId: number;
  type: 'VIDEO' | 'IN_PERSON' | 'PHONE';
  startTime: string;
  endTime: string;
  duration: number;
  status:
    | 'SCHEDULED'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'NO_SHOW';
  reason: string;
  notes?: string;
}

export default function ProviderConsultationsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation handlers - using window.location for reliable navigation
  const handleScheduleConsultation = () => {
    window.location.href = '/provider/calendar?newAppointment=true';
  };

  const handleStartVideoCall = () => {
    window.location.href = '/telehealth';
  };

  const handleViewTemplates = () => {
    window.location.href = '/provider/soap-notes';
  };

  const handleJoinConsultation = (consultation: Consultation) => {
    // Navigate to telehealth with consultation context
    if (consultation.type === 'VIDEO') {
      window.location.href = `/telehealth?consultationId=${consultation.id}`;
    } else {
      // For non-video consultations, go to patient record
      window.location.href = `/provider/patients?patientId=${consultation.patientId}`;
    }
  };

  const handleCreateSOAPNote = (consultation: Consultation) => {
    // Store consultation context for SOAP note creation
    sessionStorage.setItem(
      'soapNoteContext',
      JSON.stringify({
        patientId: consultation.patientId,
        patientName: consultation.patientName,
        consultationId: consultation.id,
        visitDate: consultation.startTime,
        reason: consultation.reason,
      })
    );
    window.location.href = '/provider/soap-notes?new=true';
  };

  // Fetch real consultations from API
  useEffect(() => {
    async function fetchConsultations() {
      try {
        setLoading(true);
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
        const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString();

        const response = await apiFetch(
          `/api/scheduling/appointments?startDate=${startDate}&endDate=${endDate}`
        );

        if (response.ok) {
          const data = await response.json();
          const mapped = (data.appointments || []).map((apt: any) => ({
            id: apt.id,
            patientName:
              `${apt.patient?.firstName || ''} ${apt.patient?.lastName || ''}`.trim() ||
              'Unknown Patient',
            patientId: apt.patientId,
            type: apt.type || 'IN_PERSON',
            startTime: apt.startTime,
            endTime: apt.endTime,
            duration: apt.duration || 30,
            status: apt.status,
            reason: apt.reason || apt.title || 'Consultation',
            notes: apt.notes,
          }));
          setConsultations(mapped);
        } else {
          setConsultations([]);
        }
      } catch (err) {
        console.error('Failed to fetch consultations:', err);
        setConsultations([]);
        setError('Failed to load consultations. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchConsultations();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'CANCELLED':
      case 'NO_SHOW':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'IN_PROGRESS':
      case 'CHECKED_IN':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-blue-600" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'VIDEO':
        return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]';
      case 'PHONE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const filteredConsultations = consultations.filter((c) =>
    activeTab === 'upcoming'
      ? ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(c.status)
      : ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(c.status)
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = consultations.filter((c) => c.startTime?.startsWith(todayStr)).length;
  const videoCount = consultations.filter((c) => c.type === 'VIDEO').length;
  const completedCount = consultations.filter((c) => c.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Video className="h-6 w-6" />
          Consultations
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-[var(--brand-primary)]">{todayCount}</div>
          <div className="text-sm text-gray-600">Today&apos;s Consultations</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-[var(--brand-primary)]">{videoCount}</div>
          <div className="text-sm text-gray-600">Video Calls</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-orange-600">{consultations.length}</div>
          <div className="text-sm text-gray-600">Total Appointments</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Consultations List */}
        <div className="col-span-2 rounded-lg bg-white shadow">
          <div className="border-b p-6">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('upcoming')}
                className={`rounded-lg px-4 py-2 ${
                  activeTab === 'upcoming'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`rounded-lg px-4 py-2 ${
                  activeTab === 'history'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                History
              </button>
            </div>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="py-8 text-center text-gray-500">
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-primary)] border-t-transparent"></div>
                Loading consultations...
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                <p className="mb-1 font-medium">Error Loading Consultations</p>
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 rounded bg-red-100 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-red-200"
                >
                  Try Again
                </button>
              </div>
            ) : filteredConsultations.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <h3 className="mb-2 text-lg font-medium text-gray-900">
                  No {activeTab === 'upcoming' ? 'upcoming' : 'past'} consultations
                </h3>
                <p className="mb-4 text-gray-500">
                  {activeTab === 'upcoming'
                    ? 'Schedule a consultation to get started.'
                    : 'Completed consultations will appear here.'}
                </p>
                {activeTab === 'upcoming' && (
                  <button
                    onClick={handleScheduleConsultation}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-white hover:brightness-90"
                  >
                    <Plus className="h-4 w-4" />
                    Schedule Consultation
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredConsultations.map((consultation) => (
                  <div
                    key={consultation.id}
                    onClick={() => setSelectedConsultation(consultation)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedConsultation(consultation); }}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{consultation.patientName}</span>
                          {getStatusIcon(consultation.status)}
                        </div>
                        <div className="mb-2 text-sm text-gray-600">{consultation.reason}</div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(consultation.startTime).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {new Date(consultation.startTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            ({consultation.duration} min)
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${getTypeColor(consultation.type)}`}
                          >
                            {consultation.type.toLowerCase().replace('_', '-')}
                          </span>
                        </div>
                      </div>
                      {['SCHEDULED', 'CONFIRMED'].includes(consultation.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinConsultation(consultation);
                          }}
                          className="rounded bg-[var(--brand-primary-light)] px-3 py-1 text-sm text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]"
                        >
                          Join
                        </button>
                      )}
                      {consultation.status === 'IN_PROGRESS' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinConsultation(consultation);
                          }}
                          className="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200"
                        >
                          Continue
                        </button>
                      )}
                    </div>
                    {consultation.notes && (
                      <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">
                        <strong>Notes:</strong> {consultation.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 font-semibold">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={handleScheduleConsultation}
                className="w-full rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-white hover:brightness-90"
              >
                Schedule Consultation
              </button>
              <button
                onClick={handleStartVideoCall}
                className="w-full rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-white hover:brightness-90"
              >
                Start Video Call
              </button>
              <button
                onClick={handleViewTemplates}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
              >
                View Templates
              </button>
            </div>
          </div>

          {/* Selected Consultation Details */}
          {selectedConsultation && (
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 font-semibold">Consultation Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-500">Patient</label>
                  <p className="font-medium">{selectedConsultation.patientName}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Date & Time</label>
                  <p className="font-medium">
                    {new Date(selectedConsultation.startTime).toLocaleDateString()} at{' '}
                    {new Date(selectedConsultation.startTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Type</label>
                  <p className="font-medium capitalize">
                    {selectedConsultation.type.toLowerCase().replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Reason</label>
                  <p className="font-medium">{selectedConsultation.reason}</p>
                </div>
                {selectedConsultation.notes && (
                  <div>
                    <label className="text-sm text-gray-500">Notes</label>
                    <p className="text-sm">{selectedConsultation.notes}</p>
                  </div>
                )}
                <div className="space-y-2 pt-3">
                  <button
                    onClick={() => {
                      window.location.href = `/provider/patients?patientId=${selectedConsultation.patientId}`;
                    }}
                    className="block w-full rounded bg-[var(--brand-primary-light)] px-3 py-2 text-center text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]"
                  >
                    View Patient Profile
                  </button>
                  <button
                    onClick={() => handleCreateSOAPNote(selectedConsultation)}
                    className="w-full rounded bg-green-100 px-3 py-2 text-green-700 hover:bg-green-200"
                  >
                    Create SOAP Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
