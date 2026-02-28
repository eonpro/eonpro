'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Users, Hash, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface TimeTrackingCardProps {
  ticketId: string | number;
  refreshKey?: number;
}

function formatDuration(minutes: number) {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function TimeTrackingCard({ ticketId, refreshKey = 0 }: TimeTrackingCardProps) {
  const [summary, setSummary] = useState<{ totalMinutes: number; totalEntries: number; uniqueWorkers: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}/worklog`);
      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-900">
          <Clock className="h-4 w-4" />
          Time Tracking
        </h2>
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!summary || (summary.totalEntries === 0 && summary.totalMinutes === 0)) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
          <Clock className="h-4 w-4" />
          Time Tracking
        </h2>
        <p className="text-sm text-gray-500">No work logged yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-900">
        <Clock className="h-4 w-4" />
        Time Tracking
      </h2>
      <dl className="space-y-3">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            Total Time
          </dt>
          <dd className="text-sm font-semibold text-gray-900">
            {formatDuration(summary.totalMinutes)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-xs text-gray-500">
            <Hash className="h-3.5 w-3.5" />
            Work Sessions
          </dt>
          <dd className="text-sm font-medium text-gray-700">{summary.totalEntries}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-xs text-gray-500">
            <Users className="h-3.5 w-3.5" />
            Contributors
          </dt>
          <dd className="text-sm font-medium text-gray-700">{summary.uniqueWorkers}</dd>
        </div>
      </dl>
    </div>
  );
}
