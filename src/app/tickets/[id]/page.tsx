'use client';

/**
 * Ticket Detail Page
 * ==================
 *
 * Full ticket view with resolution workflow:
 * - Quick actions bar for status transitions
 * - Unified timeline (comments + activity + work logs)
 * - Employee assignment with workload visibility
 * - Progress update form with status change
 * - Time tracking sidebar
 * - Resolve modal with disposition & root cause
 *
 * @module app/(dashboard)/tickets/[id]
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft as ArrowLeftIcon,
  Pencil as PencilIcon,
  CheckCircle as CheckCircleIcon,
  AlertTriangle as ExclamationTriangleIcon,
  RefreshCw as ArrowPathIcon,
  Eye as EyeIcon,
  Tag as TagIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import EmployeeAssignPicker from '@/components/tickets/EmployeeAssignPicker';
import UnifiedTimeline from '@/components/tickets/UnifiedTimeline';
import QuickActions from '@/components/tickets/QuickActions';
import WorkLogForm from '@/components/tickets/WorkLogForm';
import ProgressUpdateForm from '@/components/tickets/ProgressUpdateForm';
import TimeTrackingCard from '@/components/tickets/TimeTrackingCard';
import MacroDropdown from '@/components/tickets/MacroDropdown';
import TicketPresence from '@/components/tickets/TicketPresence';

// Types
interface TicketDetail {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  dueDate?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  rootCause?: string | null;
  disposition?: string | null;
  reopenCount: number;
  tags?: string[];
  assignedTo?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  team?: {
    id: number;
    name: string;
    color?: string | null;
  } | null;
  createdBy: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    patientId?: string | null;
    email?: string;
    phone?: string;
  } | null;
  order?: {
    id: number;
    referenceId: string;
    status?: string;
  } | null;
  resolvedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  sla?: {
    firstResponseDue?: string | null;
    firstResponseAt?: string | null;
    resolutionDue?: string | null;
    breached: boolean;
  } | null;
  watchers?: Array<{
    id: number;
    user: {
      id: number;
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
  _count?: {
    comments: number;
    attachmentFiles: number;
    childTickets: number;
  };
}

// Constants
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 border-blue-300',
  OPEN: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  PENDING: 'bg-gray-100 text-gray-800 border-gray-300',
  PENDING_CUSTOMER: 'bg-orange-100 text-orange-800 border-orange-300',
  PENDING_INTERNAL: 'bg-orange-100 text-orange-800 border-orange-300',
  ON_HOLD: 'bg-gray-100 text-gray-800 border-gray-300',
  ESCALATED: 'bg-red-100 text-red-800 border-red-300',
  RESOLVED: 'bg-green-100 text-green-800 border-green-300',
  CLOSED: 'bg-gray-100 text-gray-600 border-gray-300',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-300',
  REOPENED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0_CRITICAL: 'bg-red-600 text-white',
  P1_URGENT: 'bg-red-500 text-white',
  P2_HIGH: 'bg-orange-500 text-white',
  P3_MEDIUM: 'bg-yellow-500 text-white',
  P4_LOW: 'bg-blue-500 text-white',
  P5_PLANNING: 'bg-gray-500 text-white',
  URGENT: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-white',
  LOW: 'bg-blue-500 text-white',
};

const PRIORITY_LABELS: Record<string, string> = {
  P0_CRITICAL: 'Critical',
  P1_URGENT: 'Urgent',
  P2_HIGH: 'High',
  P3_MEDIUM: 'Medium',
  P4_LOW: 'Low',
  P5_PLANNING: 'Planning',
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

const RESOLVE_DISPOSITIONS = [
  { value: 'RESOLVED_SUCCESSFULLY', label: 'Resolved successfully' },
  { value: 'RESOLVED_WITH_WORKAROUND', label: 'Resolved with workaround' },
  { value: 'NOT_RESOLVED', label: 'Not resolved' },
  { value: 'DUPLICATE', label: 'Duplicate' },
  { value: 'NOT_REPRODUCIBLE', label: 'Not reproducible' },
  { value: 'BY_DESIGN', label: 'By design' },
  { value: 'CUSTOMER_ERROR', label: 'Customer error' },
  { value: 'TRAINING_ISSUE', label: 'Training issue' },
  { value: 'REFERRED_TO_SPECIALIST', label: 'Referred to specialist' },
  { value: 'PENDING_CUSTOMER', label: 'Pending customer' },
  { value: 'CANCELLED_BY_CUSTOMER', label: 'Cancelled by customer' },
];

const TICKET_STATUSES = [
  'NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'PENDING_CUSTOMER', 'PENDING_INTERNAL',
  'ON_HOLD', 'ESCALATED', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REOPENED',
];

export default function TicketDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const ticketId = params.id as string;
  const isEditMode = searchParams.get('mode') === 'edit';

  // State
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveDisposition, setResolveDisposition] = useState('RESOLVED_SUCCESSFULLY');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveRootCause, setResolveRootCause] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUser({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() });
      }
    } catch { /* */ }
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Fetch ticket
  const fetchTicket = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}`);
      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expired. Please log in again.');
          return;
        }
        throw new Error('Failed to fetch ticket');
      }
      const data = await response.json();
      setTicket(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [ticketId]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchTicket();
      setLoading(false);
    };
    loadData();
  }, [fetchTicket]);

  // Refresh ticket when refreshKey changes (from child actions)
  useEffect(() => {
    if (refreshKey > 0) {
      fetchTicket();
    }
  }, [refreshKey, fetchTicket]);

  // Sync edit form when ticket or edit mode changes
  useEffect(() => {
    if (ticket && isEditMode) {
      setEditTitle(ticket.title);
      setEditDescription(ticket.description);
      setEditCategory(ticket.category);
      setEditPriority(ticket.priority);
    }
  }, [ticket, isEditMode]);

  // Change status
  const handleStatusChange = async (newStatus: string) => {
    if (!ticket || newStatus === ticket.status) return;
    setUpdatingStatus(true);
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      await fetchTicket();
      triggerRefresh();
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Assign ticket
  const handleAssign = async (userId: number | null) => {
    const response = await apiFetch(`/api/tickets/${ticketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assignedToId: userId }),
    });
    if (!response.ok) throw new Error('Failed to assign');
    await fetchTicket();
    triggerRefresh();
  };

  // Save edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;
    setSavingEdit(true);
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory,
          priority: editPriority,
        }),
      });
      if (!response.ok) throw new Error('Failed to update ticket');
      await fetchTicket();
      triggerRefresh();
      window.location.href = `/tickets/${ticketId}`;
    } catch (err) {
      console.error('Save edit failed:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  // Resolve ticket
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveNotes.trim()) {
      setResolveError('Resolution notes are required');
      return;
    }
    setSubmittingResolve(true);
    setResolveError(null);
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          disposition: resolveDisposition,
          resolutionNotes: resolveNotes.trim(),
          rootCause: resolveRootCause.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || 'Failed to resolve ticket');
      }
      setShowResolveModal(false);
      await fetchTicket();
      triggerRefresh();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Failed to resolve ticket');
    } finally {
      setSubmittingResolve(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex h-96 flex-col items-center justify-center">
        <ExclamationTriangleIcon className="h-12 w-12 text-red-400" />
        <p className="mt-2 text-gray-500">{error || 'Ticket not found'}</p>
        <button
          onClick={() => { window.location.href = '/tickets'; }}
          className="mt-4 text-blue-600 hover:text-blue-700"
        >
          Back to Tickets
        </button>
      </div>
    );
  }

  const isResolvable = [
    'NEW', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'ON_HOLD', 'ESCALATED',
  ].includes(ticket.status);

  const assigneeName = ticket.assignedTo
    ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => { window.location.href = '/tickets'; }}
            className="mt-1 rounded-lg p-1 hover:bg-gray-100"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-gray-500">{ticket.ticketNumber}</span>
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updatingStatus}
                className={`rounded-full border px-3 py-1 text-sm font-medium cursor-pointer disabled:opacity-50 ${
                  STATUS_COLORS[ticket.status] || 'border-gray-300 bg-gray-100 text-gray-800'
                }`}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  PRIORITY_COLORS[ticket.priority] || 'bg-gray-500 text-white'
                }`}
              >
                {PRIORITY_LABELS[ticket.priority] || ticket.priority.replace(/_/g, ' ')}
              </span>
              {ticket.sla?.breached && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  SLA Breached
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{ticket.title}</h1>
            <div className="mt-1 flex items-center gap-4">
              <p className="text-sm text-gray-500">
                Created {formatRelativeTime(ticket.createdAt)} by {ticket.createdBy.firstName} {ticket.createdBy.lastName}
              </p>
              <TicketPresence
                ticketId={ticketId}
                currentUserId={currentUser?.id}
                currentUserName={currentUser?.name}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MacroDropdown
            ticketId={ticketId}
            onApplied={() => { fetchTicket(); triggerRefresh(); }}
          />
          <button
            onClick={() => {
              window.location.href = isEditMode
                ? `/tickets/${ticketId}`
                : `/tickets/${ticketId}?mode=edit`;
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PencilIcon className="h-4 w-4" />
            {isEditMode ? 'Cancel edit' : 'Edit'}
          </button>
          {isResolvable && (
            <button
              onClick={() => {
                setResolveError(null);
                setResolveNotes('');
                setResolveRootCause('');
                setResolveDisposition('RESOLVED_SUCCESSFULLY');
                setShowResolveModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Resolve
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Quick Actions */}
          <QuickActions
            ticketId={ticketId}
            currentStatus={ticket.status}
            onActionComplete={() => { fetchTicket(); triggerRefresh(); }}
          />

          {/* Edit Form or Description */}
          {isEditMode ? (
            <form onSubmit={handleSaveEdit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
              <h2 className="text-sm font-medium text-gray-900">Edit ticket</h2>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  required
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {['GENERAL', 'PATIENT_ISSUE', 'PATIENT_COMPLAINT', 'ORDER_ISSUE', 'SHIPPING_ISSUE',
                      'BILLING', 'BILLING_ISSUE', 'REFUND_REQUEST', 'PRESCRIPTION', 'PRESCRIPTION_ISSUE',
                      'TECHNICAL_ISSUE', 'SYSTEM_BUG', 'FEATURE_REQUEST', 'ACCESS_ISSUE', 'OTHER'].map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {['P0_CRITICAL', 'P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW', 'P5_PLANNING'].map((p) => (
                      <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = `/tickets/${ticketId}`; }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-3 text-sm font-medium text-gray-500">Description</h2>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                {ticket.description}
              </div>
            </div>
          )}

          {/* Resolution (if resolved) */}
          {ticket.resolutionNotes && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-green-800">
                <CheckCircleIcon className="h-5 w-5" />
                Resolution
                {ticket.disposition && (
                  <span className="rounded-full bg-green-200 px-2 py-0.5 text-xs">
                    {ticket.disposition.replace(/_/g, ' ')}
                  </span>
                )}
              </h2>
              <div className="whitespace-pre-wrap text-sm text-green-700">
                {ticket.resolutionNotes}
              </div>
              {ticket.rootCause && (
                <div className="mt-4 border-t border-green-200 pt-4">
                  <h3 className="mb-1 text-xs font-medium text-green-800">Root Cause</h3>
                  <p className="text-sm text-green-700">{ticket.rootCause}</p>
                </div>
              )}
              {ticket.resolvedBy && ticket.resolvedAt && (
                <p className="mt-3 text-xs text-green-600">
                  Resolved by {ticket.resolvedBy.firstName} {ticket.resolvedBy.lastName} on{' '}
                  {formatDate(ticket.resolvedAt)}
                </p>
              )}
            </div>
          )}

          {/* Work Log + Progress Update */}
          <div className="flex items-center gap-4">
            <WorkLogForm ticketId={ticketId} onSubmit={() => { fetchTicket(); triggerRefresh(); }} />
          </div>

          {/* Progress Update Form */}
          <ProgressUpdateForm
            ticketId={ticketId}
            currentStatus={ticket.status}
            onSubmit={() => { fetchTicket(); triggerRefresh(); }}
          />

          {/* Unified Timeline */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-medium text-gray-900">Resolution Timeline</h2>
            <UnifiedTimeline ticketId={ticketId} refreshKey={refreshKey} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-medium text-gray-900">Details</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium text-gray-500">Category</dt>
                <dd className="mt-1 text-sm text-gray-900">{ticket.category.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Source</dt>
                <dd className="mt-1 text-sm text-gray-900">{ticket.source.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Last Activity</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatRelativeTime(ticket.lastActivityAt)}</dd>
              </div>
              {ticket.dueDate && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Due Date</dt>
                  <dd className={`mt-1 text-sm font-medium ${
                    new Date(ticket.dueDate) < new Date() ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    {formatDate(ticket.dueDate)}
                  </dd>
                </div>
              )}
              {ticket.reopenCount > 0 && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Reopen Count</dt>
                  <dd className="mt-1 text-sm font-medium text-orange-600">{ticket.reopenCount}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* People */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-medium text-gray-900">People</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium text-gray-500">Created By</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                    {ticket.createdBy.firstName[0]}
                    {ticket.createdBy.lastName[0]}
                  </span>
                  <span className="text-sm text-gray-900">
                    {ticket.createdBy.firstName} {ticket.createdBy.lastName}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="mb-1.5 text-xs font-medium text-gray-500">Assigned To</dt>
                <dd>
                  <EmployeeAssignPicker
                    currentAssigneeId={ticket.assignedTo?.id ?? null}
                    currentAssigneeName={assigneeName}
                    onAssign={handleAssign}
                  />
                </dd>
              </div>
              {ticket.team && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Team</dt>
                  <dd className="mt-1 text-sm text-gray-900">{ticket.team.name}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Time Tracking */}
          <TimeTrackingCard ticketId={ticketId} refreshKey={refreshKey} />

          {/* Related */}
          {(ticket.patient || ticket.order) && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-medium text-gray-900">Related</h2>
              <dl className="space-y-4">
                {ticket.patient && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Patient</dt>
                    <dd className="mt-1">
                      <a
                        href={`/patients/${ticket.patient.id}`}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {ticket.patient.firstName} {ticket.patient.lastName}
                        <span className="text-gray-400">
                          {' '}({formatPatientDisplayId(ticket.patient.patientId, ticket.patient.id)})
                        </span>
                      </a>
                    </dd>
                  </div>
                )}
                {ticket.order && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Order</dt>
                    <dd className="mt-1">
                      <a
                        href="/admin/orders"
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {ticket.order.referenceId}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Watchers */}
          {ticket.watchers && ticket.watchers.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-900">
                <EyeIcon className="h-4 w-4" />
                Watchers ({ticket.watchers.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {ticket.watchers.map((watcher) => (
                  <div
                    key={watcher.id}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600"
                    title={`${watcher.user.firstName} ${watcher.user.lastName}`}
                  >
                    {watcher.user.firstName[0]}{watcher.user.lastName[0]}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-900">
                <TagIcon className="h-4 w-4" />
                Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {ticket.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
            <div className="border-b border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900">Resolve Ticket</h2>
              <p className="mt-1 text-sm text-gray-500">
                Set disposition and resolution notes. This will mark the ticket as resolved.
              </p>
            </div>
            <form onSubmit={handleResolveSubmit} className="p-4 space-y-4">
              {resolveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {resolveError}
                </div>
              )}
              <div>
                <label htmlFor="resolve-disposition" className="mb-1 block text-sm font-medium text-gray-700">
                  Disposition <span className="text-red-500">*</span>
                </label>
                <select
                  id="resolve-disposition"
                  value={resolveDisposition}
                  onChange={(e) => setResolveDisposition(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {RESOLVE_DISPOSITIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="resolve-notes" className="mb-1 block text-sm font-medium text-gray-700">
                  Resolution notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="resolve-notes"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  required
                  rows={4}
                  placeholder="Describe what was done to resolve the issue..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="resolve-rootcause" className="mb-1 block text-sm font-medium text-gray-700">
                  Root cause (optional)
                </label>
                <input
                  id="resolve-rootcause"
                  type="text"
                  value={resolveRootCause}
                  onChange={(e) => setResolveRootCause(e.target.value)}
                  placeholder="Brief root cause if applicable"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolve || !resolveNotes.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {submittingResolve ? 'Resolving...' : 'Resolve ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
