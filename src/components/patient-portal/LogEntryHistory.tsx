'use client';

import { useState, useCallback } from 'react';
import { Pencil, Trash2, X, ChevronDown, ChevronUp, Clock } from 'lucide-react';

export type LogType = 'weight' | 'water' | 'exercise' | 'sleep' | 'nutrition';

export interface BaseLogEntry {
  id: number;
  recordedAt: string;
  source?: string;
  [key: string]: unknown;
}

interface LogEntryHistoryProps {
  entries: BaseLogEntry[];
  type: LogType;
  onEdit: (id: number, data: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  primaryColor: string;
  disabled?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function formatEntrySummary(entry: BaseLogEntry, type: LogType): string {
  switch (type) {
    case 'weight':
      return `${entry.weight} ${entry.unit || 'lbs'}`;
    case 'water':
      return `${entry.amount} ${entry.unit || 'oz'}`;
    case 'exercise': {
      const act = String(entry.activityType || 'Exercise');
      return `${act.charAt(0).toUpperCase() + act.slice(1)} - ${entry.duration} min (${entry.intensity || 'moderate'})`;
    }
    case 'sleep': {
      const dur = Number(entry.duration || 0);
      const hrs = Math.floor(dur / 60);
      const mins = dur % 60;
      const q = entry.quality ? ` (${entry.quality}/10)` : '';
      return `${hrs}h ${mins}m${q}`;
    }
    case 'nutrition': {
      const meal = String(entry.mealType || 'meal');
      const desc = entry.description ? ` - ${entry.description}` : '';
      const cal = entry.calories ? ` (${entry.calories} kcal)` : '';
      return `${meal.charAt(0).toUpperCase() + meal.slice(1)}${desc}${cal}`;
    }
    default:
      return '';
  }
}

function EditForm({
  entry,
  type,
  primaryColor,
  onSave,
  onCancel,
  saving,
}: {
  entry: BaseLogEntry;
  type: LogType;
  primaryColor: string;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, string | number>>(() => {
    switch (type) {
      case 'weight':
        return { weight: String(entry.weight ?? ''), notes: String(entry.notes ?? '') };
      case 'water':
        return { amount: String(entry.amount ?? ''), notes: String(entry.notes ?? '') };
      case 'exercise':
        return {
          activityType: String(entry.activityType ?? 'walking'),
          duration: String(entry.duration ?? ''),
          intensity: String(entry.intensity ?? 'moderate'),
          notes: String(entry.notes ?? ''),
        };
      case 'sleep':
        return {
          quality: String(entry.quality ?? '7'),
          notes: String(entry.notes ?? ''),
        };
      case 'nutrition':
        return {
          mealType: String(entry.mealType ?? 'breakfast'),
          description: String(entry.description ?? ''),
          calories: String(entry.calories ?? ''),
          notes: String(entry.notes ?? ''),
        };
      default:
        return {};
    }
  });

  const update = (key: string, val: string) =>
    setFormData((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = () => {
    const data: Record<string, unknown> = {};
    switch (type) {
      case 'weight': {
        const w = parseFloat(formData.weight as string);
        if (!isNaN(w) && w > 0) data.weight = w;
        if (formData.notes !== String(entry.notes ?? '')) data.notes = formData.notes || null;
        break;
      }
      case 'water': {
        const a = parseFloat(formData.amount as string);
        if (!isNaN(a) && a > 0) data.amount = a;
        if (formData.notes !== String(entry.notes ?? '')) data.notes = formData.notes || null;
        break;
      }
      case 'exercise': {
        if (formData.activityType !== String(entry.activityType ?? ''))
          data.activityType = formData.activityType;
        const d = parseInt(formData.duration as string, 10);
        if (!isNaN(d) && d > 0) data.duration = d;
        if (formData.intensity !== String(entry.intensity ?? ''))
          data.intensity = formData.intensity;
        if (formData.notes !== String(entry.notes ?? '')) data.notes = formData.notes || null;
        break;
      }
      case 'sleep': {
        const q = parseInt(formData.quality as string, 10);
        if (!isNaN(q) && q >= 1 && q <= 10) data.quality = q;
        if (formData.notes !== String(entry.notes ?? '')) data.notes = formData.notes || null;
        break;
      }
      case 'nutrition': {
        if (formData.mealType !== String(entry.mealType ?? ''))
          data.mealType = formData.mealType;
        if (formData.description !== String(entry.description ?? ''))
          data.description = formData.description || null;
        const c = parseInt(formData.calories as string, 10);
        if (!isNaN(c)) data.calories = c;
        else if (formData.calories === '' && entry.calories) data.calories = null;
        if (formData.notes !== String(entry.notes ?? '')) data.notes = formData.notes || null;
        break;
      }
    }
    if (Object.keys(data).length === 0) {
      onCancel();
      return;
    }
    onSave(data);
  };

  const inputCls =
    'min-h-[44px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2.5 text-base font-medium outline-none focus:bg-white';

  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-3">
      {type === 'weight' && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Weight (lbs)</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={formData.weight}
              onChange={(e) => update('weight', e.target.value.replace(/[^0-9.]/g, ''))}
              className={inputCls}
              style={{ fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => update('notes', e.target.value)}
              className={inputCls}
              placeholder="Optional note"
            />
          </div>
        </>
      )}
      {type === 'water' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Amount (oz)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={formData.amount}
            onChange={(e) => update('amount', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputCls}
            style={{ fontSize: '16px' }}
          />
        </div>
      )}
      {type === 'exercise' && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Activity</label>
            <select
              value={formData.activityType as string}
              onChange={(e) => update('activityType', e.target.value)}
              className={inputCls}
            >
              {['walking', 'running', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'other'].map(
                (t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Duration (min)</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={formData.duration}
              onChange={(e) => update('duration', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputCls}
              style={{ fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Intensity</label>
            <select
              value={formData.intensity as string}
              onChange={(e) => update('intensity', e.target.value)}
              className={inputCls}
            >
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="vigorous">Vigorous</option>
            </select>
          </div>
        </>
      )}
      {type === 'sleep' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Quality: {formData.quality}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={formData.quality}
            onChange={(e) => update('quality', e.target.value)}
            className="w-full"
            style={{ accentColor: primaryColor }}
          />
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>
      )}
      {type === 'nutrition' && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Meal Type</label>
            <select
              value={formData.mealType as string}
              onChange={(e) => update('mealType', e.target.value)}
              className={inputCls}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => update('description', e.target.value)}
              className={inputCls}
              placeholder="What did you eat?"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Calories</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={formData.calories}
              onChange={(e) => update('calories', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputCls}
              placeholder="Optional"
              style={{ fontSize: '16px' }}
            />
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="min-h-[40px] flex-1 rounded-xl bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="min-h-[40px] flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function LogEntryHistory({
  entries,
  type,
  onEdit,
  onDelete,
  primaryColor,
  disabled = false,
}: LogEntryHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const editableEntries = entries.filter(
    (e) => e.id > 0 && e.source === 'patient'
  );

  const COLLAPSED_COUNT = 3;
  const visibleEntries = expanded
    ? editableEntries
    : editableEntries.slice(0, COLLAPSED_COUNT);
  const hasMore = editableEntries.length > COLLAPSED_COUNT;

  const handleEdit = useCallback(
    async (id: number, data: Record<string, unknown>) => {
      setSaving(true);
      try {
        const ok = await onEdit(id, data);
        if (ok) setEditingId(null);
      } finally {
        setSaving(false);
      }
    },
    [onEdit]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setSaving(true);
      try {
        const ok = await onDelete(id);
        if (ok) setDeletingId(null);
      } finally {
        setSaving(false);
      }
    },
    [onDelete]
  );

  if (editableEntries.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="px-3 pb-1 pt-3 sm:px-5 sm:pt-4">
        <h3 className="text-sm font-semibold text-gray-900">Recent Entries</h3>
        <p className="mt-0.5 text-xs text-gray-400">Tap to edit or remove</p>
      </div>

      <div className="divide-y divide-gray-50 px-3 pb-3 sm:px-5 sm:pb-4">
        {visibleEntries.map((entry) => (
          <div key={entry.id} className="py-2.5 first:pt-2">
            {editingId === entry.id ? (
              <EditForm
                entry={entry}
                type={type}
                primaryColor={primaryColor}
                saving={saving}
                onSave={(data) => handleEdit(entry.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : deletingId === entry.id ? (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3">
                <p className="flex-1 text-sm text-red-700">Delete this entry?</p>
                <button
                  onClick={() => setDeletingId(null)}
                  disabled={saving}
                  className="min-h-[36px] rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={saving}
                  className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {formatEntrySummary(entry, type)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate">{formatDate(entry.recordedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingId(entry.id);
                      setDeletingId(null);
                    }}
                    disabled={disabled || saving}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:scale-[0.95] disabled:opacity-40"
                    aria-label="Edit entry"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeletingId(entry.id);
                      setEditingId(null);
                    }}
                    disabled={disabled || saving}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-[0.95] disabled:opacity-40"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-gray-50 py-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 active:bg-gray-100"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Show all {editableEntries.length} entries <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
