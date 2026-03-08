'use client';

import { useState, useEffect, useCallback } from 'react';

import {
  X,
  Calendar,
  Clock,
  Users,
  AlertCircle,
  Loader2,
  CheckCircle,
  Video,
} from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';
import { CONSULTATION_DURATIONS } from '@/lib/integrations/zoom/config';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
}

interface ScheduleSessionModalProps {
  providerId?: number;
  onClose: () => void;
  onCreated: () => void;
}

export default function ScheduleSessionModal({ providerId, onClose, onCreated }: ScheduleSessionModalProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
          ((data.patients as Array<{ id: number; firstName?: string; lastName?: string }>) ?? []).map((p) => ({
            id: p.id,
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
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
    const timer = setTimeout(() => void searchPatients(patientSearch), 300);
    return () => clearTimeout(timer);
  }, [patientSearch, searchPatients]);

  const handleSubmit = async () => {
    if (!selectedPatient || !topic || !date || !time) {
      setError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const scheduledAt = new Date(`${date}T${time}`);
      const res = await apiFetch('/api/scheduling/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          ...(providerId ? { providerId } : {}),
          title: topic,
          type: 'VIDEO',
          startTime: scheduledAt.toISOString(),
          duration,
          reason: topic,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          onCreated();
          onClose();
        }, 1500);
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failed to schedule session');
      }
    } catch {
      setError('Failed to schedule telehealth session');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <Video className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Schedule Telehealth Session</h2>
              <p className="text-xs text-gray-500">Create a video consultation appointment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center px-6 py-12">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Session Scheduled</h3>
            <p className="mt-1 text-sm text-gray-500">
              A Zoom meeting link has been generated and the patient will be notified.
            </p>
          </div>
        ) : (
          <div className="space-y-5 px-6 py-5">
            {/* Patient Search */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                <Users className="mb-0.5 mr-1 inline h-4 w-4" />
                Patient <span className="text-red-500">*</span>
              </label>
              {selectedPatient ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <span className="text-sm font-medium text-emerald-800">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientSearch('');
                    }}
                    className="text-xs text-emerald-600 hover:text-emerald-800"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search by patient name..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {patientsLoading && (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                  )}
                  {patients.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {patients.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatients([]);
                            setPatientSearch('');
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                        >
                          <Users className="h-4 w-4 text-gray-400" />
                          {p.firstName} {p.lastName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Topic */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Topic <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Follow-up Consultation"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                  <Calendar className="h-3.5 w-3.5" />
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                  <Clock className="h-3.5 w-3.5" />
                  Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Duration</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(CONSULTATION_DURATIONS).map(([key, dur]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDuration(dur)}
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      duration === dur
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {dur} min
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
            <button
              onClick={onClose}
              disabled={isCreating}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={isCreating || !selectedPatient || !topic || !date || !time}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                'Schedule Session'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
