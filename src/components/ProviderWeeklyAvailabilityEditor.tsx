'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  CalendarOff,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { todayET, EASTERN_TZ } from '@/lib/utils/timezone';

interface DaySchedule {
  date: string;
  dayOfWeek: number;
  source: 'recurring' | 'override' | 'unavailable' | 'timeoff';
  blocks: { startTime: string; endTime: string }[];
  appointmentCount: number;
  notes?: string;
}

interface EditingDay {
  date: string;
  blocks: { startTime: string; endTime: string }[];
  isUnavailable: boolean;
  notes: string;
}

interface ProviderWeeklyAvailabilityEditorProps {
  providerId: number;
  providerName?: string;
  readOnly?: boolean;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: EASTERN_TZ });
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: EASTERN_TZ };
  return `${weekStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

export default function ProviderWeeklyAvailabilityEditor({
  providerId,
  providerName,
  readOnly = false,
}: ProviderWeeklyAvailabilityEditorProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const [editingDay, setEditingDay] = useState<EditingDay | null>(null);
  const [copySourceWeek, setCopySourceWeek] = useState<number | null>(null);

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const y = weekStart.getFullYear(), m = String(weekStart.getMonth() + 1).padStart(2, '0'), dd = String(weekStart.getDate()).padStart(2, '0');
      const startStr = `${y}-${m}-${dd}`;
      const res = await apiFetch(
        `/api/scheduling/availability/weekly?providerId=${providerId}&startDate=${startStr}&weeks=4`
      );
      if (!res.ok) throw new Error('Failed to fetch schedule');
      const data = await res.json();
      setSchedule(data.schedule || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setIsLoading(false);
    }
  }, [providerId, weekStart]);

  useEffect(() => {
    if (providerId) fetchSchedule();
  }, [providerId, fetchSchedule]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const getWeeksFromSchedule = (): DaySchedule[][] => {
    const weeks: DaySchedule[][] = [];
    for (let i = 0; i < schedule.length; i += 7) {
      weeks.push(schedule.slice(i, i + 7));
    }
    return weeks;
  };

  const openDayEditor = (day: DaySchedule) => {
    if (readOnly) return;
    setEditingDay({
      date: day.date,
      blocks:
        day.blocks.length > 0
          ? day.blocks.map((b) => ({ ...b }))
          : [{ startTime: '09:00', endTime: '17:00' }],
      isUnavailable: day.source === 'unavailable',
      notes: day.notes || '',
    });
  };

  const addBlock = () => {
    if (!editingDay) return;
    setEditingDay({
      ...editingDay,
      blocks: [...editingDay.blocks, { startTime: '09:00', endTime: '17:00' }],
    });
  };

  const removeBlock = (idx: number) => {
    if (!editingDay) return;
    setEditingDay({
      ...editingDay,
      blocks: editingDay.blocks.filter((_, i) => i !== idx),
    });
  };

  const updateBlock = (idx: number, field: 'startTime' | 'endTime', value: string) => {
    if (!editingDay) return;
    const blocks = [...editingDay.blocks];
    blocks[idx] = { ...blocks[idx], [field]: value };
    setEditingDay({ ...editingDay, blocks });
  };

  const handleSaveDay = async () => {
    if (!editingDay) return;

    if (!editingDay.isUnavailable) {
      for (const block of editingDay.blocks) {
        if (block.startTime >= block.endTime) {
          setError('Start time must be before end time for all blocks');
          return;
        }
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/scheduling/availability/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          date: editingDay.date,
          isUnavailable: editingDay.isUnavailable,
          blocks: editingDay.isUnavailable ? [] : editingDay.blocks,
          notes: editingDay.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save override');
      }
      setEditingDay(null);
      showSuccess(`Availability updated for ${formatDateShort(editingDay.date)}`);
      await fetchSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDay = async (dateStr: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/scheduling/availability/overrides?providerId=${providerId}&date=${dateStr}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to reset');
      showSuccess(`Reset to recurring template for ${formatDateShort(dateStr)}`);
      await fetchSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWeek = async (weekIdx: number) => {
    const weeks = getWeeksFromSchedule();
    const sourceWeek = weeks[weekIdx];
    const targetWeekIdx = weekIdx + 1;
    if (!sourceWeek || targetWeekIdx >= weeks.length) return;

    const targetWeek = weeks[targetWeekIdx];
    setIsSaving(true);
    setError(null);

    try {
      for (let d = 0; d < 7; d++) {
        const src = sourceWeek[d];
        const tgt = targetWeek[d];
        if (!tgt) continue;

        if (src.source === 'unavailable') {
          await apiFetch('/api/scheduling/availability/overrides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId,
              date: tgt.date,
              isUnavailable: true,
              blocks: [],
            }),
          });
        } else if (src.blocks.length > 0) {
          await apiFetch('/api/scheduling/availability/overrides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId,
              date: tgt.date,
              isUnavailable: false,
              blocks: src.blocks,
            }),
          });
        }
      }

      setCopySourceWeek(null);
      showSuccess(`Week ${weekIdx + 1} copied to week ${targetWeekIdx + 1}`);
      await fetchSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy week');
    } finally {
      setIsSaving(false);
    }
  };

  const weeks = getWeeksFromSchedule();
  const today = todayET();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {providerName ? `${providerName}'s` : ''} Weekly Availability
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Customize availability for each upcoming week. Click a day to edit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const prev = new Date(weekStart);
              prev.setDate(prev.getDate() - 28);
              setWeekStart(prev);
            }}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => {
              const next = new Date(weekStart);
              next.setDate(next.getDate() + 28);
              setWeekStart(next);
            }}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day Editor Modal */}
      {editingDay && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">
              {DAY_NAMES[new Date(editingDay.date + 'T00:00:00').getDay()]},{' '}
              {formatDateShort(editingDay.date)}
            </h4>
            <button
              onClick={() => setEditingDay(null)}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Unavailable Toggle */}
          <label className="mb-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={editingDay.isUnavailable}
              onChange={(e) =>
                setEditingDay({ ...editingDay, isUnavailable: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">Mark as unavailable this day</span>
          </label>

          {/* Time Blocks */}
          {!editingDay.isUnavailable && (
            <div className="space-y-2">
              {editingDay.blocks.map((block, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={block.startTime}
                    onChange={(e) => updateBlock(idx, 'startTime', e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="time"
                    value={block.endTime}
                    onChange={(e) => updateBlock(idx, 'endTime', e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  {editingDay.blocks.length > 1 && (
                    <button
                      onClick={() => removeBlock(idx)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addBlock}
                className="flex items-center gap-1 text-xs font-medium text-[#4fa77e] hover:text-[#3f8660]"
              >
                <Plus className="h-3 w-3" />
                Add time block
              </button>
            </div>
          )}

          {/* Notes */}
          <div className="mt-3">
            <input
              type="text"
              value={editingDay.notes}
              onChange={(e) => setEditingDay({ ...editingDay, notes: e.target.value })}
              placeholder="Notes (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSaveDay}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660] disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
            <button
              onClick={() => setEditingDay(null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Weekly Grid */}
      {weeks.map((week, weekIdx) => {
        const weekStartDate = week[0]?.date;
        if (!weekStartDate) return null;
        const wStart = new Date(weekStartDate + 'T00:00:00');

        return (
          <div
            key={weekIdx}
            className="rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">
                {formatWeekRange(wStart)}
              </span>
              {!readOnly && weekIdx < weeks.length - 1 && (
                <button
                  onClick={() => handleCopyWeek(weekIdx)}
                  disabled={isSaving}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  title="Copy this week's schedule to the next week"
                >
                  <Copy className="h-3 w-3" />
                  Copy to next week
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 divide-x">
              {week.map((day) => {
                const isPast = day.date < today;
                const isToday = day.date === today;
                const hasOverride = day.source === 'override' || day.source === 'unavailable';

                return (
                  <div
                    key={day.date}
                    onClick={() => !isPast && openDayEditor(day)}
                    className={`min-h-[100px] p-2 transition-colors ${
                      isPast
                        ? 'cursor-default bg-gray-50/50 opacity-60'
                        : readOnly
                          ? 'cursor-default'
                          : 'cursor-pointer hover:bg-gray-50'
                    } ${isToday ? 'ring-1 ring-inset ring-[#4fa77e]/30' : ''}`}
                  >
                    {/* Day Header */}
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isToday ? 'text-[#4fa77e]' : 'text-gray-400'
                        }`}
                      >
                        {DAY_SHORT[day.dayOfWeek]}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          isToday ? 'rounded-full bg-[#4fa77e] px-1.5 py-0.5 text-white' : 'text-gray-500'
                        }`}
                      >
                        {new Date(day.date + 'T00:00:00').getDate()}
                      </span>
                    </div>

                    {/* Override Badge */}
                    {hasOverride && (
                      <div className="mb-1 flex items-center justify-between">
                        <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-700">
                          Custom
                        </span>
                        {!readOnly && !isPast && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetDay(day.date);
                            }}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                            title="Reset to recurring template"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Availability */}
                    {day.source === 'timeoff' ? (
                      <div className="flex items-center gap-1">
                        <CalendarOff className="h-3 w-3 text-red-400" />
                        <span className="text-[10px] font-medium text-red-500">Time Off</span>
                      </div>
                    ) : day.source === 'unavailable' ? (
                      <div className="flex items-center gap-1">
                        <X className="h-3 w-3 text-red-400" />
                        <span className="text-[10px] font-medium text-red-500">
                          Unavailable
                        </span>
                      </div>
                    ) : day.blocks.length === 0 ? (
                      <span className="text-[10px] text-gray-300">No hours</span>
                    ) : (
                      <div className="space-y-0.5">
                        {day.blocks.map((block, bi) => (
                          <div
                            key={bi}
                            className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${
                              hasOverride
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-green-50 text-green-700'
                            }`}
                          >
                            <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                            <span>
                              {formatTime12(block.startTime)}-{formatTime12(block.endTime)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Appointment Count */}
                    {day.appointmentCount > 0 && (
                      <div className="mt-1">
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
                          {day.appointmentCount} appt{day.appointmentCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}

                    {day.notes && (
                      <p className="mt-0.5 truncate text-[9px] italic text-gray-400" title={day.notes}>
                        {day.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {schedule.length === 0 && !isLoading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <Calendar className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-600">No schedule data</p>
          <p className="mt-1 text-xs text-gray-400">
            Set up recurring availability first, then customize specific weeks here.
          </p>
        </div>
      )}
    </div>
  );
}
