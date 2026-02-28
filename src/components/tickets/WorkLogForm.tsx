'use client';

import { useState } from 'react';
import { Clock, Loader2, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface WorkLogFormProps {
  ticketId: string | number;
  onSubmit: () => void;
}

const WORK_ACTIONS = [
  { value: 'RESEARCHED', label: 'Researched' },
  { value: 'CONTACTED_PATIENT', label: 'Contacted Patient' },
  { value: 'CONTACTED_PROVIDER', label: 'Contacted Provider' },
  { value: 'CONTACTED_PHARMACY', label: 'Contacted Pharmacy' },
  { value: 'CONTACTED_INSURANCE', label: 'Contacted Insurance' },
  { value: 'APPLIED_SOLUTION', label: 'Applied Solution' },
  { value: 'TESTED_SOLUTION', label: 'Tested Solution' },
  { value: 'STARTED_WORK', label: 'Started Work' },
  { value: 'STOPPED_WORK', label: 'Stopped Work' },
  { value: 'PROVIDED_INFO', label: 'Provided Info' },
  { value: 'REQUESTED_INFO', label: 'Requested Info' },
  { value: 'ADDED_COMMENT', label: 'General Work' },
];

const DURATION_PRESETS = [
  { value: 5, label: '5m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
];

export default function WorkLogForm({ ticketId, onSubmit }: WorkLogFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState('RESEARCHED');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/tickets/${ticketId}/worklog`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          duration: duration ? parseInt(duration, 10) : undefined,
          description: description.trim(),
          isInternal: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to log work');
      }

      setAction('RESEARCHED');
      setDuration('');
      setDescription('');
      setIsOpen(false);
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log work');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800"
      >
        <Clock className="h-4 w-4" />
        Log Work
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-teal-200 bg-teal-50 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-teal-800">
        <Clock className="h-4 w-4" />
        Log Work
      </h4>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {WORK_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Time Spent</label>
            <div className="flex gap-1">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="min"
                min="0"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-1 flex gap-1">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDuration(String(p.value))}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    duration === String(p.value)
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setError(null); }}
            placeholder="What did you do?"
            rows={2}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setIsOpen(false); setError(null); }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
            Log Work
          </button>
        </div>
      </div>
    </form>
  );
}
