'use client';

import { useState, useEffect, useCallback } from 'react';
import { Feature } from '@/components/Feature';
import MeetingRoom from '@/components/zoom/MeetingRoom';
import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { CONSULTATION_DURATIONS } from '@/lib/integrations/zoom/config';
import { apiFetch } from '@/lib/api/fetch';

interface TelehealthSession {
  id: number;
  topic: string;
  scheduledAt: string;
  duration: number;
  status: string;
  joinUrl: string;
  hostUrl?: string;
  meetingId?: string;
  password?: string;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
  };
  appointment?: {
    id: number;
    title: string;
    reason: string;
  };
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
}

type ViewState = 'list' | 'lobby';

export default function TelehealthPage() {
  const [sessions, setSessions] = useState<TelehealthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [zoomEnabled, setZoomEnabled] = useState(false);

  const [viewState, setViewState] = useState<ViewState>('list');
  const [activeSession, setActiveSession] = useState<TelehealthSession | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingDuration, setMeetingDuration] = useState(30);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/provider/telehealth/upcoming');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        setTotalCount(data.totalCount || 0);
        setZoomEnabled(data.zoomEnabled || false);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPatients([]);
      return;
    }
    setPatientsLoading(true);
    try {
      const res = await apiFetch(`/api/admin/patients?search=${encodeURIComponent(query)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setPatients(
          (data.patients || []).map((p: any) => ({
            id: p.id,
            firstName: p.firstName || '',
            lastName: p.lastName || '',
          }))
        );
      }
    } catch {
      setPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchPatients(patientSearch), 300);
    return () => clearTimeout(timer);
  }, [patientSearch, searchPatients]);

  const createAppointment = async () => {
    if (!selectedPatientId || !meetingTopic || !meetingDate || !meetingTime) {
      setCreateError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const scheduledAt = new Date(`${meetingDate}T${meetingTime}`);

      const res = await apiFetch('/api/scheduling/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          title: meetingTopic,
          type: 'VIDEO',
          startTime: scheduledAt.toISOString(),
          duration: meetingDuration,
          reason: meetingTopic,
        }),
      });

      if (res.ok) {
        setShowNewForm(false);
        resetForm();
        await fetchSessions();
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Failed to schedule appointment');
      }
    } catch {
      setCreateError('Failed to create telehealth appointment');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setMeetingTopic('');
    setSelectedPatientId(null);
    setPatientSearch('');
    setPatients([]);
    setMeetingDate('');
    setMeetingTime('');
    setMeetingDuration(30);
    setCreateError(null);
  };

  const startMeeting = (session: TelehealthSession) => {
    setActiveSession(session);
    setViewState('lobby');
  };

  const openZoomDirect = (session: TelehealthSession) => {
    const url = session.hostUrl || session.joinUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyLink = (session: TelehealthSession) => {
    if (!session.joinUrl) return;
    navigator.clipboard.writeText(session.joinUrl);
    setCopiedId(session.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDateTime = (dateStr: string): string => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { icon: typeof Clock; color: string; label: string }> = {
      SCHEDULED: { icon: Clock, color: 'text-blue-600 bg-blue-100', label: 'Scheduled' },
      WAITING: { icon: Users, color: 'text-yellow-600 bg-yellow-100', label: 'Waiting' },
      IN_PROGRESS: { icon: Video, color: 'text-green-600 bg-green-100', label: 'In Progress' },
      COMPLETED: { icon: CheckCircle, color: 'text-gray-600 bg-gray-100', label: 'Completed' },
      CANCELLED: { icon: XCircle, color: 'text-red-600 bg-red-100', label: 'Cancelled' },
      NO_SHOW: { icon: AlertCircle, color: 'text-orange-600 bg-orange-100', label: 'No Show' },
    };
    const badge = map[status] || map.SCHEDULED;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${badge.color}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  if (viewState === 'lobby' && activeSession) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <MeetingRoom
            meetingId={activeSession.meetingId || activeSession.id.toString()}
            meetingPassword={activeSession.password}
            userName="Provider"
            role="host"
            joinUrl={activeSession.joinUrl}
            hostUrl={activeSession.hostUrl}
            topic={activeSession.topic}
            patientName={`${activeSession.patient.firstName} ${activeSession.patient.lastName}`}
            scheduledAt={activeSession.scheduledAt}
            duration={activeSession.duration}
            onBack={() => {
              setViewState('list');
              setActiveSession(null);
              fetchSessions();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                  <Video className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Telehealth Center</h1>
                  <p className="text-sm text-gray-500">
                    Manage and join virtual consultations
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Schedule Consultation
              </button>
            </div>
          </div>

          <Feature
            feature="ZOOM_TELEHEALTH"
            fallback={
              <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                <Video className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                <h2 className="mb-2 text-2xl font-semibold text-gray-900">Telehealth Coming Soon</h2>
                <p className="mx-auto max-w-md text-gray-500">
                  Virtual consultations with Zoom integration will be available soon.
                </p>
              </div>
            }
          >
            {/* New Appointment Modal */}
            {showNewForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">
                    Schedule Video Consultation
                  </h2>

                  <div className="space-y-4">
                    {/* Patient Search */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Patient <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setSelectedPatientId(null);
                        }}
                        placeholder="Search by patient name..."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {patientsLoading && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching...
                        </div>
                      )}
                      {patients.length > 0 && !selectedPatientId && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                          {patients.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setSelectedPatientId(p.id);
                                setPatientSearch(`${p.firstName} ${p.lastName}`);
                                setPatients([]);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                            >
                              {p.firstName} {p.lastName}
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedPatientId && (
                        <p className="mt-1 text-xs text-green-600">Patient selected</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Topic <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={meetingTopic}
                        onChange={(e) => setMeetingTopic(e.target.value)}
                        placeholder="e.g., Follow-up Consultation"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={meetingDate}
                          onChange={(e) => setMeetingDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Time <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="time"
                          value={meetingTime}
                          onChange={(e) => setMeetingTime(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Duration</label>
                      <div className="grid grid-cols-4 gap-2">
                        {Object.entries(CONSULTATION_DURATIONS).map(([key, dur]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMeetingDuration(dur)}
                            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                              meetingDuration === dur
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {dur} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {createError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="flex items-center gap-2 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4" />
                          {createError}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => { setShowNewForm(false); resetForm(); }}
                      disabled={isCreating}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createAppointment}
                      disabled={isCreating || !selectedPatientId}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Scheduling...
                        </>
                      ) : (
                        'Schedule Meeting'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sessions List */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Upcoming Consultations
                  {totalCount > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">({totalCount})</span>
                  )}
                </h2>
                {!zoomEnabled && (
                  <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                    Zoom not configured
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-16 text-center">
                  <Video className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-gray-500">No upcoming consultations</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Schedule a video appointment to get started
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sessions.map((session) => (
                    <div key={session.id} className="px-6 py-5 transition-colors hover:bg-gray-50/50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-1.5 flex items-center gap-3">
                            <h3 className="font-semibold text-gray-900">{session.topic}</h3>
                            {getStatusBadge(session.status)}
                          </div>

                          <div className="mb-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {session.patient.firstName} {session.patient.lastName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDateTime(session.scheduledAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {session.duration} min
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {(session.status === 'SCHEDULED' || session.status === 'WAITING') && (
                            <>
                              <button
                                onClick={() => copyLink(session)}
                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                title="Copy patient link"
                              >
                                {copiedId === session.id ? (
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : (
                                  <Copy className="h-5 w-5" />
                                )}
                              </button>

                              <button
                                onClick={() => startMeeting(session)}
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                              >
                                <Video className="h-4 w-4" />
                                Start
                              </button>
                            </>
                          )}

                          {session.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => openZoomDirect(session)}
                              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Rejoin
                            </button>
                          )}

                          {session.status === 'COMPLETED' && session.appointment && (
                            <a
                              href={`/provider/soap-notes?appointmentId=${session.appointment.id}`}
                              className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200"
                            >
                              <ChevronRight className="h-4 w-4" />
                              SOAP Notes
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            {!loading && sessions.length > 0 && (
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">
                    {sessions.filter((s) => s.status === 'SCHEDULED' || s.status === 'WAITING').length}
                  </div>
                  <div className="text-sm text-gray-500">Upcoming</div>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="text-2xl font-bold text-green-600">
                    {sessions.filter((s) => s.status === 'IN_PROGRESS').length}
                  </div>
                  <div className="text-sm text-gray-500">In Progress</div>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="text-2xl font-bold text-gray-600">
                    {sessions.reduce((sum, s) => sum + s.duration, 0)}
                  </div>
                  <div className="text-sm text-gray-500">Total Minutes</div>
                </div>
              </div>
            )}
          </Feature>
        </div>
      </div>
    </div>
  );
}
