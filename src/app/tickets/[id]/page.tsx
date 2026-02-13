'use client';

/**
 * Ticket Detail Page
 * ==================
 *
 * View and manage individual ticket with comments,
 * activity log, and quick actions.
 *
 * @module app/(dashboard)/tickets/[id]
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft as ArrowLeftIcon,
  Pencil as PencilIcon,
  UserPlus as UserPlusIcon,
  CheckCircle as CheckCircleIcon,
  X as XMarkIcon,
  Clock as ClockIcon,
  MessageSquare as ChatBubbleLeftRightIcon,
  Paperclip as PaperClipIcon,
  Eye as EyeIcon,
  AlertTriangle as ExclamationTriangleIcon,
  RefreshCw as ArrowPathIcon,
  Tag as TagIcon,
} from 'lucide-react';

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

interface Comment {
  id: number;
  comment: string;
  isInternal: boolean;
  createdAt: string;
  author: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

interface Activity {
  id: number;
  activityType: string;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  user?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
}

// Constants
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 border-blue-300',
  OPEN: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  IN_PROGRESS: 'bg-purple-100 text-purple-800 border-purple-300',
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

interface AssignUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

const TICKET_STATUSES = [
  'NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'PENDING_CUSTOMER', 'PENDING_INTERNAL',
  'ON_HOLD', 'ESCALATED', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REOPENED',
];

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const ticketId = params.id as string;
  const isEditMode = searchParams.get('mode') === 'edit';

  // State
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [newComment, setNewComment] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveDisposition, setResolveDisposition] = useState('RESOLVED_SUCCESSFULLY');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveRootCause, setResolveRootCause] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [assignUsers, setAssignUsers] = useState<AssignUser[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingAssign, setUpdatingAssign] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Auth token for API calls (login stores in localStorage, not cookies)
  const getAuthHeaders = useCallback((): HeadersInit => {
    if (typeof window === 'undefined') return {};
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('super_admin-token') ||
      localStorage.getItem('provider-token') ||
      localStorage.getItem('staff-token') ||
      localStorage.getItem('support-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Fetch ticket
  const fetchTicket = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
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
  }, [ticketId, getAuthHeaders]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch comments');
      const data = await response.json();
      setComments(data.comments);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  }, [ticketId, getAuthHeaders]);

  // Fetch activity
  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/activity`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch activity');
      const data = await response.json();
      setActivities(data.activities);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, [ticketId, getAuthHeaders]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTicket(), fetchComments(), fetchActivity()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTicket, fetchComments, fetchActivity]);

  // Fetch users for assign dropdown (clinic-scoped)
  useEffect(() => {
    if (!ticket) return;
    const clinicId = typeof window !== 'undefined' ? localStorage.getItem('activeClinicId') : null;
    const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    let cid = clinicId;
    if (!cid && userJson) {
      try {
        const u = JSON.parse(userJson);
        if (u.clinicId != null) cid = String(u.clinicId);
      } catch {
        // ignore
      }
    }
    const params = new URLSearchParams({ limit: '100' });
    if (cid) params.set('clinicId', cid);
    ['staff', 'admin', 'provider', 'support'].forEach((r) => params.append('role', r));
    fetch(`/api/users?${params.toString()}`, { credentials: 'include', headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : { users: [] })
      .then((data) => setAssignUsers(data.users || []))
      .catch(() => setAssignUsers([]));
  }, [ticket?.id, getAuthHeaders]);

  // Add comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          content: newComment,
          isInternal: isInternalComment,
        }),
      });

      if (!response.ok) throw new Error('Failed to add comment');

      setNewComment('');
      setIsInternalComment(false);
      setCommentError(null);
      await fetchComments();
      await fetchActivity();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Change status
  const handleStatusChange = async (newStatus: string) => {
    if (!ticket || newStatus === ticket.status) return;
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      await fetchTicket();
      await fetchActivity();
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Assign ticket
  const handleAssignChange = async (assignedToId: number | '') => {
    if (!ticket) return;
    const value = assignedToId === '' ? null : assignedToId;
    if (value === (ticket.assignedTo?.id ?? null)) return;
    setUpdatingAssign(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ assignedToId: value }),
      });
      if (!response.ok) throw new Error('Failed to assign');
      await fetchTicket();
      await fetchActivity();
    } catch (err) {
      console.error('Assign failed:', err);
    } finally {
      setUpdatingAssign(false);
    }
  };

  // Sync edit form when ticket or edit mode changes
  useEffect(() => {
    if (ticket && isEditMode) {
      setEditTitle(ticket.title);
      setEditDescription(ticket.description);
      setEditCategory(ticket.category);
      setEditPriority(ticket.priority);
    }
  }, [ticket, isEditMode]);

  // Save edit (PATCH ticket)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory,
          priority: editPriority,
        }),
      });
      if (!response.ok) throw new Error('Failed to update ticket');
      await fetchTicket();
      await fetchActivity();
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
      const response = await fetch(`/api/tickets/${ticketId}/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
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
      await fetchActivity();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Failed to resolve ticket');
    } finally {
      setSubmittingResolve(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Format relative time
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
                {ticket.priority.replace(/_/g, ' ')}
              </span>
              {ticket.sla?.breached && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  SLA Breached
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{ticket.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { window.location.href = isEditMode ? `/tickets/${ticketId}` : `/tickets/${ticketId}?mode=edit`; }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PencilIcon className="h-4 w-4" />
            {isEditMode ? 'Cancel edit' : 'Edit'}
          </button>
          {[
            'NEW',
            'OPEN',
            'IN_PROGRESS',
            'PENDING_CUSTOMER',
            'PENDING_INTERNAL',
            'ON_HOLD',
            'ESCALATED',
          ].includes(ticket.status) && (
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
          {/* Description or Edit form */}
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
                    {['GENERAL', 'PATIENT_ISSUE', 'ORDER_ISSUE', 'BILLING', 'TECHNICAL_ISSUE', 'OTHER'].map((c) => (
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
            </div>
          )}

          {/* Comments & Activity Tabs */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200">
              <nav className="flex">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`border-b-2 px-6 py-3 text-sm font-medium ${
                    activeTab === 'comments'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="h-4 w-4" />
                    Comments ({comments.length})
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`border-b-2 px-6 py-3 text-sm font-medium ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ClockIcon className="h-4 w-4" />
                    Activity ({activities.length})
                  </div>
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'comments' ? (
                <div className="space-y-4">
                  {/* Add Comment Form */}
                  <form onSubmit={handleAddComment} className="space-y-3">
                    <textarea
                      value={newComment}
                      onChange={(e) => { setNewComment(e.target.value); setCommentError(null); }}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isInternalComment}
                          onChange={(e) => setIsInternalComment(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-600">
                          Internal note (not visible to patient)
                        </span>
                      </label>
                      <button
                        type="submit"
                        disabled={submittingComment || !newComment.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingComment ? 'Adding...' : 'Add Comment'}
                      </button>
                    </div>
                    {commentError && (
                      <p className="text-sm text-red-600" role="alert">
                        {commentError}
                      </p>
                    )}
                  </form>

                  {/* Comments List */}
                  <div className="space-y-4 border-t border-gray-200 pt-4">
                    {comments.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-500">No comments yet</p>
                    ) : (
                      comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`rounded-lg border p-4 ${
                            comment.isInternal
                              ? 'border-yellow-200 bg-yellow-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                                {comment.author.firstName[0]}
                                {comment.author.lastName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {comment.author.firstName} {comment.author.lastName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatRelativeTime(comment.createdAt)}
                                </p>
                              </div>
                            </div>
                            {comment.isInternal && (
                              <span className="text-xs font-medium text-yellow-700">Internal</span>
                            )}
                          </div>
                          <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                            {comment.comment}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">No activity yet</p>
                  ) : (
                    activities.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                          <ClockIcon className="h-3 w-3 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-gray-700">
                            <span className="font-medium">
                              {activity.user
                                ? `${activity.user.firstName} ${activity.user.lastName}`
                                : 'System'}
                            </span>{' '}
                            {activity.activityType.toLowerCase().replace(/_/g, ' ')}
                            {activity.fieldChanged && (
                              <span className="text-gray-500">
                                {' '}
                                {activity.fieldChanged}
                                {activity.oldValue && activity.newValue && (
                                  <span>
                                    {' from '}
                                    <code className="rounded bg-gray-100 px-1">
                                      {activity.oldValue}
                                    </code>
                                    {' to '}
                                    <code className="rounded bg-gray-100 px-1">
                                      {activity.newValue}
                                    </code>
                                  </span>
                                )}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatRelativeTime(activity.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
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
              {ticket.dueDate && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Due Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(ticket.dueDate)}</dd>
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
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                    {ticket.createdBy.firstName[0]}
                    {ticket.createdBy.lastName[0]}
                  </div>
                  <span className="text-sm text-gray-900">
                    {ticket.createdBy.firstName} {ticket.createdBy.lastName}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Assigned To</dt>
                <dd className="mt-1">
                  <select
                    value={ticket.assignedTo?.id ?? ''}
                    onChange={(e) => handleAssignChange(e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={updatingAssign}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {assignUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({u.role})
                      </option>
                    ))}
                  </select>
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
                        {ticket.patient.patientId && (
                          <span className="text-gray-400"> ({ticket.patient.patientId})</span>
                        )}
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
                    {watcher.user.firstName[0]}
                    {watcher.user.lastName[0]}
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

      {/* Resolve modal */}
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
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
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
