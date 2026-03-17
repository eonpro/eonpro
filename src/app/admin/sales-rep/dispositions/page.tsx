'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  MessageSquare,
  Mail,
  Globe,
  Users,
  Video,
  Tag,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Disposition {
  id: number;
  createdAt: string;
  salesRep: { id: number; firstName: string; lastName: string };
  patient: { id: number; firstName: string; lastName: string };
  leadSource: string;
  contactMethod: string;
  outcome: string;
  productInterest: string | null;
  notes: string | null;
  followUpDate: string | null;
  followUpNotes: string | null;
  tags: string[] | null;
  status: string;
  reviewedAt: string | null;
  reviewer: { id: number; firstName: string; lastName: string } | null;
  reviewNote: string | null;
  autoAssigned: boolean;
  assignmentId: number | null;
}

interface Stats {
  total: number;
  byOutcome: Record<string, number>;
  byStatus: Record<string, number>;
  byLeadSource: Record<string, number>;
  pendingReview: number;
  autoAssigned: number;
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  SALE_COMPLETED: { label: 'Sale Completed', color: 'bg-green-100 text-green-700' },
  INTERESTED: { label: 'Interested', color: 'bg-blue-100 text-blue-700' },
  CALLBACK_REQUESTED: { label: 'Callback', color: 'bg-yellow-100 text-yellow-700' },
  NOT_INTERESTED: { label: 'Not Interested', color: 'bg-gray-100 text-gray-600' },
  NO_ANSWER: { label: 'No Answer', color: 'bg-orange-100 text-orange-700' },
  WRONG_NUMBER: { label: 'Wrong Number', color: 'bg-red-100 text-red-600' },
  ALREADY_PATIENT: { label: 'Already Patient', color: 'bg-purple-100 text-purple-700' },
  DO_NOT_CONTACT: { label: 'Do Not Contact', color: 'bg-red-100 text-red-700' },
  OTHER: { label: 'Other', color: 'bg-gray-100 text-gray-600' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDING_REVIEW: { label: 'Pending Review', color: 'bg-amber-100 text-amber-700', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  REF_LINK: 'Referral Link',
  COLD_CALL: 'Cold Call',
  WALK_IN: 'Walk-In',
  SOCIAL_MEDIA: 'Social Media',
  TEXT_MESSAGE: 'Text Message',
  EMAIL_CAMPAIGN: 'Email Campaign',
  WORD_OF_MOUTH: 'Word of Mouth',
  EXISTING_PATIENT: 'Existing Patient',
  EVENT: 'Event',
  OTHER: 'Other',
};

const CONTACT_METHOD_CONFIG: Record<string, { label: string; icon: typeof Phone }> = {
  PHONE: { label: 'Phone', icon: Phone },
  TEXT: { label: 'Text', icon: MessageSquare },
  EMAIL: { label: 'Email', icon: Mail },
  IN_PERSON: { label: 'In Person', icon: Users },
  VIDEO_CALL: { label: 'Video Call', icon: Video },
  SOCIAL_DM: { label: 'Social DM', icon: Globe },
  OTHER: { label: 'Other', icon: Tag },
};

export default function AdminDispositionsPage() {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState('PENDING_REVIEW');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const fetchDispositions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filterStatus) params.set('status', filterStatus);
      if (filterOutcome) params.set('outcome', filterOutcome);

      const res = await apiFetch(`/api/admin/sales-rep/dispositions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDispositions(data.dispositions);
        setTotalPages(data.totalPages);
      }
    } catch {
      // handled by loading state
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterOutcome]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/sales-rep/dispositions?action=stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchDispositions();
  }, [fetchDispositions]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReview = async (dispositionId: number, status: 'APPROVED' | 'REJECTED') => {
    setReviewingId(dispositionId);
    try {
      const res = await apiFetch('/api/admin/sales-rep/dispositions', {
        method: 'PATCH',
        body: JSON.stringify({ dispositionId, status, reviewNote: reviewNote || undefined }),
      });

      if (res.ok) {
        setReviewNote('');
        setExpandedId(null);
        fetchDispositions();
        fetchStats();
      }
    } catch {
      // error handling
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2.5">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dispositions</h1>
            <p className="text-sm text-gray-500">
              Review and approve sales rep patient dispositions
            </p>
          </div>
        </div>
        <button
          onClick={() => { fetchDispositions(); fetchStats(); }}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-700">Pending</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{stats.pendingReview}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-green-700">
              Sales Completed
            </p>
            <p className="mt-1 text-2xl font-bold text-green-700">
              {stats.byOutcome.SALE_COMPLETED || 0}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-700">
              Auto-Assigned
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{stats.autoAssigned}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Status:</span>
        </div>
        {['', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilterStatus(s); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === '' ? 'All' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}

        <div className="ml-4 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Outcome:</span>
        </div>
        <select
          value={filterOutcome}
          onChange={(e) => { setFilterOutcome(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        >
          <option value="">All outcomes</option>
          {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : dispositions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <ClipboardCheck className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No dispositions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dispositions.map((d) => {
            const outcomeConfig = OUTCOME_CONFIG[d.outcome] || OUTCOME_CONFIG.OTHER;
            const statusConfig = STATUS_CONFIG[d.status] || STATUS_CONFIG.PENDING_REVIEW;
            const StatusIcon = statusConfig.icon;
            const contactConfig = CONTACT_METHOD_CONFIG[d.contactMethod] || CONTACT_METHOD_CONFIG.OTHER;
            const ContactIcon = contactConfig.icon;
            const isExpanded = expandedId === d.id;

            return (
              <div
                key={d.id}
                className="rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-sm"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {d.patient.firstName} {d.patient.lastName}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${outcomeConfig.color}`}>
                        {outcomeConfig.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </span>
                      {d.autoAssigned && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          Auto-Assigned
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {d.salesRep.firstName} {d.salesRep.lastName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ContactIcon className="h-3 w-3" />
                        {contactConfig.label}
                      </span>
                      <span>{LEAD_SOURCE_LABELS[d.leadSource] || d.leadSource}</span>
                      <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {d.productInterest && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Product Interest</p>
                          <p className="text-gray-900">{d.productInterest}</p>
                        </div>
                      )}
                      {d.notes && (
                        <div className="col-span-2">
                          <p className="text-xs font-medium text-gray-500">Notes</p>
                          <p className="text-gray-900">{d.notes}</p>
                        </div>
                      )}
                      {d.followUpDate && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Follow-Up Date</p>
                          <p className="text-gray-900">
                            {new Date(d.followUpDate).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {d.followUpNotes && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Follow-Up Notes</p>
                          <p className="text-gray-900">{d.followUpNotes}</p>
                        </div>
                      )}
                      {d.tags && Array.isArray(d.tags) && d.tags.length > 0 && (
                        <div className="col-span-2">
                          <p className="mb-1 text-xs font-medium text-gray-500">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {(d.tags as string[]).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {d.reviewer && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Reviewed By</p>
                          <p className="text-gray-900">
                            {d.reviewer.firstName} {d.reviewer.lastName}
                          </p>
                        </div>
                      )}
                      {d.reviewNote && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Review Note</p>
                          <p className="text-gray-900">{d.reviewNote}</p>
                        </div>
                      )}
                    </div>

                    {d.status === 'PENDING_REVIEW' && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <div className="mb-3">
                          <label className="mb-1 block text-xs font-medium text-gray-500">
                            Review Note (optional)
                          </label>
                          <input
                            type="text"
                            value={expandedId === d.id ? reviewNote : ''}
                            onChange={(e) => setReviewNote(e.target.value)}
                            placeholder="Add a note about this review..."
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleReview(d.id, 'APPROVED')}
                            disabled={reviewingId === d.id}
                            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {reviewingId === d.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            Approve{d.outcome === 'SALE_COMPLETED' ? ' & Assign' : ''}
                          </button>
                          <button
                            onClick={() => handleReview(d.id, 'REJECTED')}
                            disabled={reviewingId === d.id}
                            className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
