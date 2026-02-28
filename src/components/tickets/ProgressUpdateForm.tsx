'use client';

import { useState } from 'react';
import { Send, Lock, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface ProgressUpdateFormProps {
  ticketId: string | number;
  currentStatus: string;
  onSubmit: () => void;
}

const STATUS_TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  NEW: [
    { value: '', label: 'No status change' },
    { value: 'OPEN', label: 'Open (Triaged)' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
  ],
  OPEN: [
    { value: '', label: 'No status change' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'PENDING_CUSTOMER', label: 'Pending Customer' },
    { value: 'PENDING_INTERNAL', label: 'Pending Internal' },
    { value: 'ON_HOLD', label: 'On Hold' },
  ],
  IN_PROGRESS: [
    { value: '', label: 'No status change' },
    { value: 'PENDING_CUSTOMER', label: 'Pending Customer' },
    { value: 'PENDING_INTERNAL', label: 'Pending Internal' },
    { value: 'ON_HOLD', label: 'On Hold' },
  ],
  PENDING_CUSTOMER: [
    { value: '', label: 'No status change' },
    { value: 'IN_PROGRESS', label: 'Resume Work' },
    { value: 'OPEN', label: 'Back to Open' },
  ],
  PENDING_INTERNAL: [
    { value: '', label: 'No status change' },
    { value: 'IN_PROGRESS', label: 'Resume Work' },
    { value: 'OPEN', label: 'Back to Open' },
  ],
  ON_HOLD: [
    { value: '', label: 'No status change' },
    { value: 'IN_PROGRESS', label: 'Resume Work' },
    { value: 'OPEN', label: 'Back to Open' },
  ],
  ESCALATED: [
    { value: '', label: 'No status change' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
  ],
  REOPENED: [
    { value: '', label: 'No status change' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'PENDING_CUSTOMER', label: 'Pending Customer' },
  ],
};

export default function ProgressUpdateForm({
  ticketId,
  currentStatus,
  onSubmit,
}: ProgressUpdateFormProps) {
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transitions = STATUS_TRANSITIONS[currentStatus] || [{ value: '', label: 'No status change' }];
  const isResolved = ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(currentStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() && !newStatus) return;

    setSubmitting(true);
    setError(null);

    try {
      if (newStatus) {
        const statusRes = await apiFetch(`/api/tickets/${ticketId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
        if (!statusRes.ok) {
          const data = await statusRes.json();
          throw new Error(data.error || 'Failed to update status');
        }
      }

      if (comment.trim()) {
        const commentRes = await apiFetch(`/api/tickets/${ticketId}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            content: comment.trim(),
            isInternal,
          }),
        });
        if (!commentRes.ok) {
          const data = await commentRes.json();
          throw new Error(data.error || 'Failed to add comment');
        }
      }

      setComment('');
      setNewStatus('');
      setIsInternal(false);
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit update');
    } finally {
      setSubmitting(false);
    }
  };

  if (isResolved) return null;

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-900">Add Update</h3>

      <textarea
        value={comment}
        onChange={(e) => { setComment(e.target.value); setError(null); }}
        placeholder="Add a progress update, note, or comment..."
        rows={3}
        className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <Lock className="h-3.5 w-3.5" />
            Internal note
          </label>

          {transitions.length > 1 && (
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              {transitions.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || (!comment.trim() && !newStatus)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {newStatus ? 'Update & Change Status' : 'Add Update'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
      )}
    </form>
  );
}
