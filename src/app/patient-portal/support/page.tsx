'use client';

/**
 * Patient Portal - Support Ticket List
 * =====================================
 *
 * Shows patient's own tickets with status badges (read-only view).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { MessageSquare, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { usePortalSWR } from '@/hooks/usePortalSWR';

interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  category: string;
  createdAt: string;
  resolvedAt?: string | null;
  _count?: { comments: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  NEW: { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  OPEN: { label: 'Under Review', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-indigo-100 text-indigo-700', icon: Clock },
  PENDING_CUSTOMER: {
    label: 'Needs Your Reply',
    color: 'bg-orange-100 text-orange-700',
    icon: AlertTriangle,
  },
  PENDING_INTERNAL: { label: 'Being Reviewed', color: 'bg-gray-100 text-gray-700', icon: Clock },
  ON_HOLD: { label: 'On Hold', color: 'bg-gray-100 text-gray-600', icon: Clock },
  ESCALATED: { label: 'Escalated', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  RESOLVED: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CLOSED: { label: 'Closed', color: 'bg-gray-100 text-gray-500', icon: CheckCircle },
  REOPENED: { label: 'Reopened', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PatientSupportPage() {
  const { data, error, isLoading } = usePortalSWR<{ tickets?: Ticket[] }>(
    '/api/patient-portal/tickets'
  );
  const tickets = useMemo(() => data?.tickets ?? [], [data]);
  const resolvedError = error?.message || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <p className="text-sm text-gray-500">Track your support requests</p>
      </div>

      {resolvedError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="flex-1">{resolvedError}</span>
          {resolvedError === SESSION_EXPIRED_MESSAGE && (
            <Link
              href={`/patient-login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/support`)}&reason=session_expired`}
              className="shrink-0 rounded-lg bg-red-200 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-300"
            >
              Log in
            </Link>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-3/5 rounded bg-gray-200" />
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-16 rounded bg-gray-100" />
                    <div className="h-3 w-20 rounded bg-gray-100" />
                    <div className="h-3 w-24 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-6 w-24 rounded-full bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white py-16">
          <MessageSquare className="h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">No support requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const config = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.NEW;
            const Icon = config.icon;
            return (
              <Link
                key={ticket.id}
                href={`${PATIENT_PORTAL_PATH}/support/${ticket.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900">{ticket.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <span>{ticket.ticketNumber}</span>
                      <span>&middot;</span>
                      <span>{ticket.category.replace(/_/g, ' ')}</span>
                      <span>&middot;</span>
                      <span>{formatDate(ticket.createdAt)}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}
                  >
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </span>
                </div>
                {(ticket._count?.comments || 0) > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <MessageSquare className="h-3 w-3" />
                    {ticket._count?.comments} {ticket._count?.comments === 1 ? 'reply' : 'replies'}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
