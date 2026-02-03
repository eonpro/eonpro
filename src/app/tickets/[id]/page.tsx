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
import { useRouter, useParams } from 'next/navigation';
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
  tagsArray?: string[];
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

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

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

  // Fetch ticket
  const fetchTicket = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}`);
      if (!response.ok) throw new Error('Failed to fetch ticket');
      const data = await response.json();
      setTicket(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [ticketId]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`);
      if (!response.ok) throw new Error('Failed to fetch comments');
      const data = await response.json();
      setComments(data.comments);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  }, [ticketId]);

  // Fetch activity
  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/activity`);
      if (!response.ok) throw new Error('Failed to fetch activity');
      const data = await response.json();
      setActivities(data.activities);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, [ticketId]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTicket(), fetchComments(), fetchActivity()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTicket, fetchComments, fetchActivity]);

  // Add comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment,
          isInternal: isInternalComment,
        }),
      });

      if (!response.ok) throw new Error('Failed to add comment');

      setNewComment('');
      setIsInternalComment(false);
      await fetchComments();
      await fetchActivity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
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
          onClick={() => router.push('/tickets')}
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
            onClick={() => router.push('/tickets')}
            className="mt-1 rounded-lg p-1 hover:bg-gray-100"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">
                {ticket.ticketNumber}
              </span>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${
                  STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-800 border-gray-300'
                }`}
              >
                {ticket.status.replace(/_/g, ' ')}
              </span>
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
            onClick={() => router.push(`/tickets/${ticketId}/edit`)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
          {['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'ON_HOLD', 'ESCALATED'].includes(ticket.status) && (
            <button
              onClick={() => {
                // TODO: Open resolve modal
                alert('Resolve modal coming soon');
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
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Description</h2>
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
              {ticket.description}
            </div>
          </div>

          {/* Resolution (if resolved) */}
          {ticket.resolutionNotes && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <h2 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5" />
                Resolution
              </h2>
              <div className="text-sm text-green-700 whitespace-pre-wrap">
                {ticket.resolutionNotes}
              </div>
              {ticket.rootCause && (
                <div className="mt-4 border-t border-green-200 pt-4">
                  <h3 className="text-xs font-medium text-green-800 mb-1">Root Cause</h3>
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
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
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
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
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
                      onChange={(e) => setNewComment(e.target.value)}
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
                        <span className="text-sm text-gray-600">Internal note (not visible to patient)</span>
                      </label>
                      <button
                        type="submit"
                        disabled={submittingComment || !newComment.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingComment ? 'Adding...' : 'Add Comment'}
                      </button>
                    </div>
                  </form>

                  {/* Comments List */}
                  <div className="space-y-4 border-t border-gray-200 pt-4">
                    {comments.length === 0 ? (
                      <p className="text-center text-sm text-gray-500 py-4">
                        No comments yet
                      </p>
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
                              <span className="text-xs font-medium text-yellow-700">
                                Internal
                              </span>
                            )}
                          </div>
                          <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
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
                    <p className="text-center text-sm text-gray-500 py-4">
                      No activity yet
                    </p>
                  ) : (
                    activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 text-sm"
                      >
                        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                          <ClockIcon className="h-3 w-3 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-gray-700">
                            <span className="font-medium">
                              {activity.user
                                ? `${activity.user.firstName} ${activity.user.lastName}`
                                : 'System'}
                            </span>
                            {' '}
                            {activity.activityType.toLowerCase().replace(/_/g, ' ')}
                            {activity.fieldChanged && (
                              <span className="text-gray-500">
                                {' '}{activity.fieldChanged}
                                {activity.oldValue && activity.newValue && (
                                  <span>
                                    {' from '}<code className="rounded bg-gray-100 px-1">{activity.oldValue}</code>
                                    {' to '}<code className="rounded bg-gray-100 px-1">{activity.newValue}</code>
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
            <h2 className="text-sm font-medium text-gray-900 mb-4">Details</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium text-gray-500">Category</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {ticket.category.replace(/_/g, ' ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Source</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {ticket.source.replace(/_/g, ' ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(ticket.createdAt)}
                </dd>
              </div>
              {ticket.dueDate && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Due Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(ticket.dueDate)}
                  </dd>
                </div>
              )}
              {ticket.reopenCount > 0 && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Reopen Count</dt>
                  <dd className="mt-1 text-sm text-orange-600 font-medium">
                    {ticket.reopenCount}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* People */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-medium text-gray-900 mb-4">People</h2>
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
                  {ticket.assignedTo ? (
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                        {ticket.assignedTo.firstName[0]}
                        {ticket.assignedTo.lastName[0]}
                      </div>
                      <span className="text-sm text-gray-900">
                        {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Unassigned</span>
                  )}
                </dd>
              </div>
              {ticket.team && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Team</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {ticket.team.name}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Related */}
          {(ticket.patient || ticket.order) && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-900 mb-4">Related</h2>
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
                        href={`/orders/${ticket.order.id}`}
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
              <h2 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
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
          {ticket.tagsArray && ticket.tagsArray.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                <TagIcon className="h-4 w-4" />
                Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {ticket.tagsArray.map((tag, index) => (
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
    </div>
  );
}
