'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Calendar,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  CalendarOff,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { todayET, EASTERN_TZ } from '@/lib/utils/timezone';

interface AvailabilityBlock {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  clinicId?: number | null;
}

interface TimeOffEntry {
  id: number;
  startDate: string;
  endDate: string;
  reason?: string;
  isApproved: boolean;
  isAllDay: boolean;
}

interface ProviderAvailabilityManagerProps {
  providerId: number;
  providerName?: string;
  readOnly?: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function ProviderAvailabilityManager({
  providerId,
  providerName,
  readOnly = false,
}: ProviderAvailabilityManagerProps) {
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newBlock, setNewBlock] = useState({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });

  const [showAddTimeOff, setShowAddTimeOff] = useState(false);
  const [newTimeOff, setNewTimeOff] = useState({ startDate: '', endDate: '', reason: '' });

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/availability/schedule?providerId=${providerId}`);
      if (!res.ok) throw new Error('Failed to fetch provider schedule');
      const data = await res.json();
      setAvailability(data.availability || []);
      setTimeOff(data.timeOff || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (providerId) fetchSchedule();
  }, [providerId, fetchSchedule]);

  const showSuccessMessage = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleAddBlock = async () => {
    if (newBlock.startTime >= newBlock.endTime) {
      setError('Start time must be before end time');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/scheduling/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          dayOfWeek: newBlock.dayOfWeek,
          startTime: newBlock.startTime,
          endTime: newBlock.endTime,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add availability');
      }
      setShowAddBlock(false);
      setNewBlock({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });
      showSuccessMessage('Availability block added');
      await fetchSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add availability');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveBlock = async (blockId: number) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/availability?availabilityId=${blockId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove availability');
      showSuccessMessage('Availability block removed');
      await fetchSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove availability');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTimeOff = async () => {
    if (!newTimeOff.startDate || !newTimeOff.endDate) {
      setError('Start and end dates are required');
      return;
    }
    if (newTimeOff.startDate > newTimeOff.endDate) {
      setError('Start date must be before end date');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/scheduling/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          startDate: new Date(newTimeOff.startDate).toISOString(),
          endDate: new Date(newTimeOff.endDate + 'T23:59:59').toISOString(),
          reason: newTimeOff.reason || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add time off');
      }
      setShowAddTimeOff(false);
      setNewTimeOff({ startDate: '', endDate: '', reason: '' });
      showSuccessMessage('Time off added');
      await fetchSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add time off');
    } finally {
      setIsSaving(false);
    }
  };

  const availByDay = DAY_NAMES.map((_, dayIdx) =>
    availability.filter((a) => a.dayOfWeek === dayIdx)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Weekly Availability Grid */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Weekly Availability</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {providerName ? `${providerName}'s` : 'Provider'} recurring schedule for telehealth appointments
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={() => setShowAddBlock(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#4fa77e] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660]"
            >
              <Plus className="h-4 w-4" />
              Add Block
            </button>
          )}
        </div>

        {/* Add Block Form */}
        {showAddBlock && (
          <div className="border-b bg-gray-50 px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Day</label>
                <select
                  value={newBlock.dayOfWeek}
                  onChange={(e) => setNewBlock({ ...newBlock, dayOfWeek: Number(e.target.value) })}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Start Time</label>
                <input
                  type="time"
                  value={newBlock.startTime}
                  onChange={(e) => setNewBlock({ ...newBlock, startTime: e.target.value })}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">End Time</label>
                <input
                  type="time"
                  value={newBlock.endTime}
                  onChange={(e) => setNewBlock({ ...newBlock, endTime: e.target.value })}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddBlock}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660] disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
                <button
                  onClick={() => setShowAddBlock(false)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Day Grid */}
        <div className="divide-y">
          {DAY_NAMES.map((dayName, dayIdx) => {
            const blocks = availByDay[dayIdx];
            const isActive = blocks.length > 0;
            return (
              <div key={dayIdx} className="flex items-start gap-4 px-5 py-3">
                <div className="w-24 flex-shrink-0 pt-1">
                  <span className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                    {dayName}
                  </span>
                </div>
                <div className="flex-1">
                  {blocks.length === 0 ? (
                    <span className="text-sm text-gray-400">Not available</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {blocks.map((block) => (
                        <div
                          key={block.id}
                          className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5"
                        >
                          <Clock className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-sm font-medium text-green-800">
                            {formatTime12(block.startTime)} - {formatTime12(block.endTime)}
                          </span>
                          {!readOnly && (
                            <button
                              onClick={() => handleRemoveBlock(block.id)}
                              disabled={isSaving}
                              className="ml-1 rounded p-0.5 text-green-500 transition-colors hover:bg-green-100 hover:text-red-600 disabled:opacity-50"
                              title="Remove this block"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {availability.length === 0 && (
          <div className="px-5 pb-4">
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <Calendar className="mx-auto mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-600">No availability configured</p>
              <p className="mt-1 text-xs text-gray-400">Add availability blocks to allow telehealth scheduling</p>
            </div>
          </div>
        )}
      </div>

      {/* Time Off / Blocked Dates */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Time Off / Blocked Dates</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Days or date ranges when the provider is unavailable
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={() => setShowAddTimeOff(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <CalendarOff className="h-4 w-4" />
              Block Time
            </button>
          )}
        </div>

        {/* Add Time Off Form */}
        {showAddTimeOff && (
          <div className="border-b bg-gray-50 px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Start Date</label>
                <input
                  type="date"
                  value={newTimeOff.startDate}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, startDate: e.target.value })}
                  min={todayET()}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">End Date</label>
                <input
                  type="date"
                  value={newTimeOff.endDate}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })}
                  min={newTimeOff.startDate || todayET()}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-600">Reason (optional)</label>
                <input
                  type="text"
                  value={newTimeOff.reason}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })}
                  placeholder="e.g., Vacation, Conference"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddTimeOff}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660] disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
                <button
                  onClick={() => setShowAddTimeOff(false)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Time Off List */}
        <div className="divide-y">
          {timeOff.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <CalendarOff className="mx-auto mb-2 h-6 w-6 text-gray-300" />
              <p className="text-sm text-gray-400">No upcoming time off scheduled</p>
            </div>
          ) : (
            timeOff.map((entry) => {
              const start = new Date(entry.startDate);
              const end = new Date(entry.endDate);
              const isSameDay = start.toDateString() === end.toDateString();
              return (
                <div key={entry.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                      <CalendarOff className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {isSameDay
                          ? start.toLocaleDateString('en-US', { timeZone: EASTERN_TZ, weekday: 'short', month: 'short', day: 'numeric' })
                          : `${start.toLocaleDateString('en-US', { timeZone: EASTERN_TZ, month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { timeZone: EASTERN_TZ, month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </div>
                      {entry.reason && (
                        <div className="text-xs text-gray-500">{entry.reason}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      entry.isApproved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {entry.isApproved ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
