'use client';

/**
 * Tickets List Page
 * =================
 *
 * Enterprise ticket management dashboard with filtering,
 * sorting, and quick actions.
 *
 * @module app/(dashboard)/tickets
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus as PlusIcon,
  Filter as FunnelIcon,
  Search as MagnifyingGlassIcon,
  ChevronDown as ChevronDownIcon,
  RefreshCw as ArrowPathIcon,
  AlertTriangle as ExclamationTriangleIcon,
  CheckCircle as CheckCircleIcon,
  Clock as ClockIcon,
  User as UserIcon,
  Tag as TagIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// Types
interface TicketListItem {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  dueDate?: string | null;
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
  };
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    patientId?: string | null;
  } | null;
  sla?: {
    firstResponseDue?: string | null;
    resolutionDue?: string | null;
    breached: boolean;
  } | null;
  _count?: {
    comments: number;
    attachmentFiles: number;
    watchers: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

// Constants
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  OPEN: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
  PENDING: 'bg-gray-100 text-gray-800',
  PENDING_CUSTOMER: 'bg-orange-100 text-orange-800',
  PENDING_INTERNAL: 'bg-orange-100 text-orange-800',
  ON_HOLD: 'bg-gray-100 text-gray-800',
  ESCALATED: 'bg-red-100 text-red-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REOPENED: 'bg-yellow-100 text-yellow-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0_CRITICAL: 'bg-red-600 text-white',
  P1_URGENT: 'bg-red-500 text-white',
  P2_HIGH: 'bg-orange-500 text-white',
  P3_MEDIUM: 'bg-yellow-500 text-white',
  P4_LOW: 'bg-blue-500 text-white',
  P5_PLANNING: 'bg-gray-500 text-white',
  // Legacy
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

export default function TicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [filters, setFilters] = useState({
    status: searchParams.getAll('status'),
    priority: searchParams.getAll('priority'),
    myTickets: searchParams.get('myTickets') === 'true',
    isUnassigned: searchParams.get('isUnassigned') === 'true',
    hasSlaBreach: searchParams.get('hasSlaBreach') === 'true',
  });

  // Auth token for API calls (login stores in localStorage, not cookies)
  const getAuthHeaders = useCallback((): HeadersInit => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('auth-token') ||
          localStorage.getItem('admin-token') ||
          localStorage.getItem('super_admin-token') ||
          localStorage.getItem('provider-token') ||
          localStorage.getItem('staff-token') ||
          localStorage.getItem('support-token')
        : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const params = new URLSearchParams();
      params.set('page', searchParams.get('page') || '1');
      params.set('limit', '20');
      params.set('sortBy', searchParams.get('sortBy') || 'createdAt');
      params.set('sortOrder', searchParams.get('sortOrder') || 'desc');

      if (searchQuery) {
        params.set('search', searchQuery);
      }

      filters.status.forEach((s) => params.append('status', s));
      filters.priority.forEach((p) => params.append('priority', p));

      if (filters.myTickets) params.set('myTickets', 'true');
      if (filters.isUnassigned) params.set('isUnassigned', 'true');
      if (filters.hasSlaBreach) params.set('hasSlaBreach', 'true');

      const response = await apiFetch(`/api/tickets?${params.toString()}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expired. Please log in again.');
          return;
        }
        if (response.status === 403) {
          setError('You do not have access to list tickets. Clinic context may be required.');
          return;
        }
        throw new Error('Failed to fetch tickets');
      }

      const data = await response.json();
      setTickets(data.tickets || []);
      setPagination(data.pagination);

      // Check for system warning (migration pending)
      if (data.warning) {
        setWarning(data.warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [searchParams, searchQuery, filters, getAuthHeaders]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Handle search (full-page nav so it works when client router is flaky)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set('search', searchQuery);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    window.location.href = `/tickets?${params.toString()}`;
  };

  // Handle filter change
  const handleFilterChange = (key: keyof typeof filters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Apply filters (full-page nav)
  const applyFilters = () => {
    const params = new URLSearchParams();
    filters.status.forEach((s) => params.append('status', s));
    filters.priority.forEach((p) => params.append('priority', p));
    if (filters.myTickets) params.set('myTickets', 'true');
    if (filters.isUnassigned) params.set('isUnassigned', 'true');
    if (filters.hasSlaBreach) params.set('hasSlaBreach', 'true');
    if (searchQuery) params.set('search', searchQuery);
    params.set('page', '1');
    window.location.href = `/tickets?${params.toString()}`;
    setShowFilters(false);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      status: [],
      priority: [],
      myTickets: false,
      isUnassigned: false,
      hasSlaBreach: false,
    });
    setSearchQuery('');
    window.location.href = '/tickets';
    setShowFilters(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-500">Manage support tickets and issue resolution</p>
        </div>
        <a
          href="/tickets/new"
          onClick={(e) => { e.preventDefault(); window.location.href = '/tickets/new'; }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <PlusIcon className="h-5 w-5" />
          New Ticket
        </a>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="max-w-md flex-1">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tickets..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              showFilters ||
              Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : v))
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FunnelIcon className="h-5 w-5" />
            Filters
            {Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : v)) && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                {Object.values(filters).filter((v) => (Array.isArray(v) ? v.length > 0 : v)).length}
              </span>
            )}
          </button>

          <button
            onClick={fetchTickets}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Status Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
              <div className="space-y-2">
                {[
                  'NEW',
                  'OPEN',
                  'IN_PROGRESS',
                  'PENDING_CUSTOMER',
                  'ON_HOLD',
                  'ESCALATED',
                  'RESOLVED',
                ].map((status) => (
                  <label key={status} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(status)}
                      onChange={(e) => {
                        const newStatus = e.target.checked
                          ? [...filters.status, status]
                          : filters.status.filter((s) => s !== status);
                        handleFilterChange('status', newStatus);
                      }}
                      className="rounded border-gray-300"
                    />
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
                    >
                      {status.replace(/_/g, ' ')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Priority</label>
              <div className="space-y-2">
                {['P0_CRITICAL', 'P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'].map((priority) => (
                  <label key={priority} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filters.priority.includes(priority)}
                      onChange={(e) => {
                        const newPriority = e.target.checked
                          ? [...filters.priority, priority]
                          : filters.priority.filter((p) => p !== priority);
                        handleFilterChange('priority', newPriority);
                      }}
                      className="rounded border-gray-300"
                    />
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}
                    >
                      {PRIORITY_LABELS[priority]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quick Filters */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Quick Filters</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.myTickets}
                    onChange={(e) => handleFilterChange('myTickets', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Assigned to me</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.isUnassigned}
                    onChange={(e) => handleFilterChange('isUnassigned', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Unassigned</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.hasSlaBreach}
                    onChange={(e) => handleFilterChange('hasSlaBreach', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">SLA Breached</span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              onClick={applyFilters}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-red-800">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => { setError(null); fetchTickets(); }}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Tickets Table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Ticket
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Assignee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
                      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-gray-100" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                    </td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      {warning ? (
                        <>
                          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
                            <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600" />
                          </div>
                          <h3 className="mb-2 text-lg font-medium text-gray-900">
                            System Upgrade in Progress
                          </h3>
                          <p className="max-w-md text-sm text-gray-500">{warning}</p>
                          <p className="mt-2 text-xs text-gray-400">
                            This usually takes a few minutes. Please check back shortly.
                          </p>
                        </>
                      ) : (
                        <>
                          <TagIcon className="h-12 w-12 text-gray-300" />
                          <p className="mt-2 text-sm text-gray-500">No tickets found</p>
                          <a
                            href="/tickets/new"
                            onClick={(e) => { e.preventDefault(); window.location.href = '/tickets/new'; }}
                            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                          >
                            <PlusIcon className="h-4 w-4" />
                            Create your first ticket
                          </a>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => { window.location.href = `/tickets/${ticket.id}`; }}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2">
                        {ticket.sla?.breached && (
                          <span title="SLA Breached">
                            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-red-500" />
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{ticket.title}</p>
                          <p className="text-sm text-gray-500">{ticket.ticketNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          PRIORITY_COLORS[ticket.priority] || 'bg-gray-500 text-white'
                        }`}
                      >
                        {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
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
                    </td>
                    <td className="px-6 py-4">
                      {ticket.patient ? (
                        <span className="text-sm text-gray-900">
                          {ticket.patient.firstName} {ticket.patient.lastName}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500">{formatDate(ticket.createdAt)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
            <p className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}{' '}
              tickets
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('page', String(pagination.page - 1));
                  window.location.href = `/tickets?${params.toString()}`;
                }}
                disabled={pagination.page === 1}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('page', String(pagination.page + 1));
                  window.location.href = `/tickets?${params.toString()}`;
                }}
                disabled={!pagination.hasMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
