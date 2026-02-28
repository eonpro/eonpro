'use client';

/**
 * Patient Portal - Support Ticket List
 * =====================================
 *
 * Shows patient's own tickets with status badges and a "New Request" button.
 */

import { useState, useEffect } from 'react';
import { Plus, MessageSquare, Loader2, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';

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
  PENDING_CUSTOMER: { label: 'Needs Your Reply', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  PENDING_INTERNAL: { label: 'Being Reviewed', color: 'bg-gray-100 text-gray-700', icon: Clock },
  ON_HOLD: { label: 'On Hold', color: 'bg-gray-100 text-gray-600', icon: Clock },
  ESCALATED: { label: 'Escalated', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  RESOLVED: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CLOSED: { label: 'Closed', color: 'bg-gray-100 text-gray-500', icon: CheckCircle },
  REOPENED: { label: 'Reopened', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PatientSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalFetch('/api/patient-portal/tickets')
      .then((res) => {
        const err = getPortalResponseError(res);
        if (err) { setError(err); return null; }
        return res.json();
      })
      .then((data) => { if (data) setTickets(data.tickets || []); })
      .catch(() => setError('Failed to load tickets'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support</h1>
          <p className="text-sm text-gray-500">Submit and track your support requests</p>
        </div>
        <a
          href="/patient-portal/support/new"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Request
        </a>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white py-16">
          <MessageSquare className="h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">No support requests yet</p>
          <a
            href="/patient-portal/support/new"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" />
            Submit your first request
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const config = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.NEW;
            const Icon = config.icon;
            return (
              <a
                key={ticket.id}
                href={`/patient-portal/support/${ticket.id}`}
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
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}>
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
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
