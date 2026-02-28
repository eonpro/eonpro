'use client';

import { useState } from 'react';
import {
  Play,
  Pause,
  MessageCircleQuestion,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  XCircle,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface QuickActionsProps {
  ticketId: string | number;
  currentStatus: string;
  onActionComplete: () => void;
}

interface QuickAction {
  id: string;
  label: string;
  icon: typeof Play;
  color: string;
  hoverColor: string;
  targetStatus: string;
  requiresNote?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
}

function getAvailableActions(status: string): QuickAction[] {
  const actions: QuickAction[] = [];

  if (['NEW', 'OPEN', 'REOPENED'].includes(status)) {
    actions.push({
      id: 'start',
      label: 'Start Work',
      icon: Play,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      hoverColor: 'hover:bg-blue-100',
      targetStatus: 'IN_PROGRESS',
    });
  }

  if (['IN_PROGRESS', 'OPEN', 'REOPENED'].includes(status)) {
    actions.push({
      id: 'request-info',
      label: 'Request Info',
      icon: MessageCircleQuestion,
      color: 'bg-orange-50 text-orange-700 border-orange-200',
      hoverColor: 'hover:bg-orange-100',
      targetStatus: 'PENDING_CUSTOMER',
      requiresNote: true,
      noteLabel: 'What information do you need?',
      notePlaceholder: 'Describe the information needed from the customer...',
    });
  }

  if (['IN_PROGRESS'].includes(status)) {
    actions.push({
      id: 'on-hold',
      label: 'Put On Hold',
      icon: Pause,
      color: 'bg-gray-50 text-gray-700 border-gray-200',
      hoverColor: 'hover:bg-gray-100',
      targetStatus: 'ON_HOLD',
      requiresNote: true,
      noteLabel: 'Reason for hold',
      notePlaceholder: 'Why is this being put on hold?',
    });
  }

  if (!['RESOLVED', 'CLOSED', 'CANCELLED', 'ESCALATED'].includes(status)) {
    actions.push({
      id: 'escalate',
      label: 'Escalate',
      icon: AlertTriangle,
      color: 'bg-red-50 text-red-700 border-red-200',
      hoverColor: 'hover:bg-red-100',
      targetStatus: 'ESCALATED',
      requiresNote: true,
      noteLabel: 'Escalation reason',
      notePlaceholder: 'Why does this need escalation?',
    });
  }

  if (['RESOLVED', 'CLOSED'].includes(status)) {
    actions.push({
      id: 'reopen',
      label: 'Reopen',
      icon: RotateCcw,
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      hoverColor: 'hover:bg-yellow-100',
      targetStatus: 'REOPENED',
      requiresNote: true,
      noteLabel: 'Reason for reopening',
      notePlaceholder: 'Why does this ticket need to be reopened?',
    });
  }

  return actions;
}

export default function QuickActions({
  ticketId,
  currentStatus,
  onActionComplete,
}: QuickActionsProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = getAvailableActions(currentStatus);

  const handleAction = async (action: QuickAction) => {
    if (action.requiresNote && !activeAction) {
      setActiveAction(action.id);
      setNote('');
      setError(null);
      return;
    }

    if (action.requiresNote && !note.trim()) {
      setError('A note is required for this action');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const statusResponse = await apiFetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: action.targetStatus,
          reason: note.trim() || undefined,
        }),
      });

      if (!statusResponse.ok) {
        const data = await statusResponse.json();
        throw new Error(data.error || 'Failed to update status');
      }

      if (note.trim()) {
        await apiFetch(`/api/tickets/${ticketId}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            content: `[${action.label}] ${note.trim()}`,
            isInternal: true,
          }),
        });
      }

      setActiveAction(null);
      setNote('');
      onActionComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Quick Actions
      </h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleAction(action)}
              disabled={submitting}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${action.color} ${action.hoverColor}`}
            >
              {submitting && activeAction === action.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {action.label}
            </button>
          );
        })}
      </div>

      {/* Inline note input for actions that require one */}
      {activeAction && (() => {
        const action = actions.find((a) => a.id === activeAction);
        if (!action) return null;
        return (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <label className="block text-sm font-medium text-gray-700">
              {action.noteLabel}
            </label>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setError(null); }}
              placeholder={action.notePlaceholder}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setActiveAction(null); setNote(''); setError(null); }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAction(action)}
                disabled={submitting || !note.trim()}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${action.color} ${action.hoverColor}`}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
