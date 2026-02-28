'use client';

/**
 * Patient Portal - Ticket Detail
 * ===============================
 *
 * Shows ticket description, status, non-internal comments, and reply form.
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Loader2, CheckCircle, Clock, MessageSquare } from 'lucide-react';
import { useParams } from 'next/navigation';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';

interface TicketDetail {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  category: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  assignedTo?: { firstName: string; lastName: string } | null;
}

interface Comment {
  id: number;
  comment: string;
  createdAt: string;
  author: { id: number; firstName: string; lastName: string; role: string };
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Submitted',
  OPEN: 'Under Review',
  IN_PROGRESS: 'In Progress',
  PENDING_CUSTOMER: 'Needs Your Reply',
  PENDING_INTERNAL: 'Being Reviewed',
  ON_HOLD: 'On Hold',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  OPEN: 'bg-yellow-100 text-yellow-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  PENDING_CUSTOMER: 'bg-orange-100 text-orange-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function formatRelative(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PatientTicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        portalFetch(`/api/patient-portal/tickets/${ticketId}`),
        portalFetch(`/api/patient-portal/tickets/${ticketId}/comments`),
      ]);
      const tErr = getPortalResponseError(tRes);
      if (tErr) { setError(tErr); return; }
      if (tRes.ok) { const d = await tRes.json(); setTicket(d.ticket); }
      if (cRes.ok) { const d = await cRes.json(); setComments(d.comments || []); }
    } catch { setError('Failed to load ticket'); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await portalFetch(`/api/patient-portal/tickets/${ticketId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send reply');
      setReply('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setSending(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-gray-500">{error || 'Ticket not found'}</p>
        <a href="/patient-portal/support" className="mt-4 text-blue-600 hover:underline">Back to Support</a>
      </div>
    );
  }

  const isResolved = ['RESOLVED', 'CLOSED'].includes(ticket.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <a href="/patient-portal/support" className="rounded-lg p-1 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </a>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{ticket.ticketNumber}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[ticket.status] || ticket.status}
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900">{ticket.title}</h1>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-xs text-gray-500">Submitted on {formatDate(ticket.createdAt)}</p>
        <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{ticket.description}</div>
      </div>

      {/* Resolution */}
      {ticket.resolutionNotes && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800">
            <CheckCircle className="h-4 w-4" />
            Resolution
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-green-700">{ticket.resolutionNotes}</div>
        </div>
      )}

      {/* Conversation */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <MessageSquare className="h-4 w-4" />
            Conversation ({comments.length})
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {comments.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">
              No replies yet. Our team will respond shortly.
            </div>
          ) : (
            comments.map((c) => {
              const isStaff = c.author.role !== 'PATIENT';
              return (
                <div key={c.id} className={`px-5 py-4 ${isStaff ? 'bg-blue-50/50' : ''}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${isStaff ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                      {c.author.firstName[0]}{c.author.lastName[0]}
                    </span>
                    <span className="font-medium text-gray-900">
                      {isStaff ? 'Support Team' : `${c.author.firstName} ${c.author.lastName}`}
                    </span>
                    <span className="text-gray-400">&middot;</span>
                    <span className="text-gray-500">{formatRelative(c.createdAt)}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap pl-9 text-sm text-gray-700">{c.comment}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Reply form */}
        {!isResolved && (
          <form onSubmit={handleReply} className="border-t border-gray-100 p-5">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply..."
              rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Reply
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
