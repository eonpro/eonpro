'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Lock,
  ArrowRightLeft,
  UserPlus,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Clock,
  Plus,
  Activity,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import useWebSocket from '@/hooks/useWebSocket';

interface TimelineEntry {
  id: string;
  type: string;
  timestamp: string;
  actor: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  content: string;
  metadata?: Record<string, unknown>;
}

interface UnifiedTimelineProps {
  ticketId: string | number;
  refreshKey?: number;
}

const TYPE_CONFIG: Record<string, { icon: typeof MessageSquare; color: string; bgColor: string; label: string }> = {
  comment: { icon: MessageSquare, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Comment' },
  internal_note: { icon: Lock, color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'Internal Note' },
  status_change: { icon: ArrowRightLeft, color: 'text-purple-600', bgColor: 'bg-purple-100', label: 'Status Changed' },
  assignment: { icon: UserPlus, color: 'text-indigo-600', bgColor: 'bg-indigo-100', label: 'Assignment' },
  escalation: { icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Escalation' },
  resolution: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Resolved' },
  reopen: { icon: RotateCcw, color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'Reopened' },
  work_log: { icon: Clock, color: 'text-teal-600', bgColor: 'bg-teal-100', label: 'Work Logged' },
  created: { icon: Plus, color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Created' },
  system: { icon: Activity, color: 'text-gray-500', bgColor: 'bg-gray-100', label: 'System' },
};

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function UnifiedTimeline({ ticketId, refreshKey = 0 }: UnifiedTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}/timeline?limit=200`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      const data = await response.json();
      setEntries(data.timeline || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline, refreshKey]);

  const { isConnected, subscribe } = useWebSocket({
    autoConnect: true,
    events: ['ticket:updated'],
  });

  useEffect(() => {
    if (!isConnected) return;
    const unsub = subscribe('ticket:updated', (data: unknown) => {
      const payload = data as { ticketId: number };
      if (payload.ticketId === Number(ticketId)) {
        fetchTimeline();
      }
    });
    return () => { if (unsub) unsub(); };
  }, [isConnected, subscribe, ticketId, fetchTimeline]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
        <button onClick={fetchTimeline} className="ml-2 font-medium underline">
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">No activity yet</p>;
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gray-200" />

      {entries.map((entry, index) => {
        const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.system;
        const Icon = config.icon;
        const isComment = entry.type === 'comment' || entry.type === 'internal_note';
        const isWorkLog = entry.type === 'work_log';
        const duration = isWorkLog && entry.metadata?.duration
          ? formatDuration(entry.metadata.duration as number)
          : null;

        return (
          <div key={entry.id} className={`relative flex gap-3 ${index > 0 ? 'pt-4' : ''}`}>
            {/* Icon */}
            <div className={`z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${config.bgColor}`}>
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">
                  {entry.actor
                    ? `${entry.actor.firstName} ${entry.actor.lastName}`
                    : 'System'}
                </span>
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-500" title={new Date(entry.timestamp).toLocaleString()}>
                  {formatRelativeTime(entry.timestamp)}
                </span>
                {duration && (
                  <>
                    <span className="text-gray-400">&middot;</span>
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">
                      {duration}
                    </span>
                  </>
                )}
                {entry.type === 'internal_note' && (
                  <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700">
                    Internal
                  </span>
                )}
              </div>

              {isComment ? (
                <div
                  className={`mt-2 rounded-lg border p-3 text-sm whitespace-pre-wrap ${
                    entry.type === 'internal_note'
                      ? 'border-yellow-200 bg-yellow-50 text-gray-800'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {entry.content}
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-gray-600">{entry.content}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
