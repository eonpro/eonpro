'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Pill,
  RefreshCw,
  Loader2,
  User,
  Building2,
  FileText,
  Clock,
  DollarSign,
  ClipboardCheck,
  Eye,
  Filter,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface RxQueueItem {
  id: string;
  type: 'invoice' | 'soap_note' | 'refill';
  status: string;
  patientId: number;
  patientName: string;
  patientEmail: string | null;
  clinicId: number | null;
  clinicName: string | null;
  treatment?: string;
  amount?: string | null;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

interface QueueCounts {
  total: number;
  invoices: number;
  soap_notes: number;
  refills: number;
}

export default function AdminRxQueuePage() {
  const router = useRouter();
  const [queueItems, setQueueItems] = useState<RxQueueItem[]>([]);
  const [counts, setCounts] = useState<QueueCounts>({
    total: 0,
    invoices: 0,
    soap_notes: 0,
    refills: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'invoices' | 'soap_notes' | 'refills'>('all');

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

      const params = new URLSearchParams({
        filter,
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await apiFetch(`/api/admin/rx-queue?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setQueueItems(data.items || []);
        setCounts(data.counts || { total: 0, invoices: 0, soap_notes: 0, refills: 0 });
      }
    } catch (error) {
      console.error('Failed to fetch RX queue:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, searchTerm]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchQueue();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchQueue]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'invoice':
        return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'soap_note':
        return <ClipboardCheck className="h-4 w-4 text-amber-600" />;
      case 'refill':
        return <RefreshCw className="h-4 w-4 text-[var(--brand-primary)]" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'invoice':
        return 'bg-green-100 text-green-800';
      case 'soap_note':
        return 'bg-amber-100 text-amber-800';
      case 'refill':
        return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'invoice':
        return 'New Rx';
      case 'soap_note':
        return 'SOAP Note';
      case 'refill':
        return 'Refill';
      default:
        return type;
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RX Queue</h1>
          <p className="mt-1 text-gray-600">
            View-only overview of all pending prescription activity
          </p>
        </div>
        <button
          onClick={() => fetchQueue()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Info Banner */}
      <div
        className="mb-6 rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))',
          borderColor: 'var(--brand-primary, #4fa77e)',
        }}
      >
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 h-5 w-5" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
          <div>
            <p className="text-sm font-medium text-gray-800">
              This is a read-only view for monitoring prescription activity
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
              Providers handle prescription writing from their dedicated queue
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div
          className="cursor-pointer rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-gray-300 sm:p-4"
          style={
            filter === 'all'
              ? {
                  borderColor: 'var(--brand-primary, #4fa77e)',
                  boxShadow: '0 0 0 3px var(--brand-primary-light, rgba(79, 167, 126, 0.15))',
                }
              : {}
          }
          onClick={() => setFilter('all')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 sm:text-sm">Total Queue</p>
              <p className="text-xl font-bold text-gray-900 sm:text-2xl">{counts.total}</p>
            </div>
            <div
              className="rounded-xl p-2 sm:p-3"
              style={{ backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))' }}
            >
              <Pill
                className="h-5 w-5 sm:h-6 sm:w-6"
                style={{ color: 'var(--brand-primary, #4fa77e)' }}
              />
            </div>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-gray-300 sm:p-4"
          style={
            filter === 'invoices'
              ? {
                  borderColor: '#22c55e',
                  boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.15)',
                }
              : {}
          }
          onClick={() => setFilter('invoices')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 sm:text-sm">Awaiting Rx</p>
              <p className="text-xl font-bold text-green-600 sm:text-2xl">{counts.invoices}</p>
            </div>
            <div className="rounded-xl bg-green-100 p-2 sm:p-3">
              <DollarSign className="h-5 w-5 text-green-600 sm:h-6 sm:w-6" />
            </div>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-gray-300 sm:p-4"
          style={
            filter === 'soap_notes'
              ? {
                  borderColor: '#f59e0b',
                  boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.15)',
                }
              : {}
          }
          onClick={() => setFilter('soap_notes')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 sm:text-sm">SOAP Pending</p>
              <p className="text-xl font-bold text-amber-600 sm:text-2xl">{counts.soap_notes}</p>
            </div>
            <div className="rounded-xl bg-amber-100 p-2 sm:p-3">
              <ClipboardCheck className="h-5 w-5 text-amber-600 sm:h-6 sm:w-6" />
            </div>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-gray-300 sm:p-4"
          style={
            filter === 'refills'
              ? {
                  borderColor: 'var(--brand-primary)',
                  boxShadow: '0 0 0 3px var(--brand-primary-light, rgba(79, 167, 126, 0.15))',
                }
              : {}
          }
          onClick={() => setFilter('refills')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 sm:text-sm">Refills</p>
              <p className="text-xl font-bold text-[var(--brand-primary)] sm:text-2xl">{counts.refills}</p>
            </div>
            <div className="rounded-xl bg-[var(--brand-primary-light)] p-2 sm:p-3">
              <RefreshCw className="h-5 w-5 text-[var(--brand-primary)] sm:h-6 sm:w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
            >
              <option value="all">All Types</option>
              <option value="invoices">Awaiting Rx</option>
              <option value="soap_notes">SOAP Notes</option>
              <option value="refills">Refills</option>
            </select>
          </div>
        </div>
      </div>

      {/* Queue List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2
              className="mx-auto mb-4 h-12 w-12 animate-spin"
              style={{ color: 'var(--brand-primary, #4fa77e)' }}
            />
            <p className="text-gray-600">Loading RX queue...</p>
          </div>
        ) : queueItems.length === 0 ? (
          <div className="p-12 text-center">
            <Pill className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">Queue is empty</h3>
            <p className="text-gray-600">
              {searchTerm
                ? 'No items match your search'
                : filter === 'all'
                  ? 'No pending prescription activity at this time'
                  : `No ${filter.replace('_', ' ')} pending`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Patient
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 lg:table-cell">
                    Treatment
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:table-cell">
                    Clinic
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    In Queue
                  </th>
                  <th className="w-16 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {queueItems.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getTypeBadgeColor(item.type)}`}
                      >
                        {getTypeIcon(item.type)}
                        {getTypeLabel(item.type)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {item.patientName}
                          </div>
                          <div className="text-xs text-gray-500">ID: {item.patientId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-4 lg:table-cell">
                      <div className="text-sm text-gray-900">{item.treatment || '-'}</div>
                      {item.amount && (
                        <div
                          className="text-xs font-medium"
                          style={{ color: 'var(--brand-primary, #4fa77e)' }}
                        >
                          {item.amount}
                        </div>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        <span className="max-w-[120px] truncate">
                          {item.clinicName || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="text-sm text-gray-700">{item.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs">{formatDate(item.createdAt)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <button
                        onClick={() => (window.location.href = `/patients/${item.patientId}`)}
                        className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-opacity-10"
                        style={
                          {
                            '--tw-bg-opacity': '0.1',
                          } as React.CSSProperties
                        }
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                          e.currentTarget.style.backgroundColor =
                            'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#4b5563';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="View Patient"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-700">Queue Item Types</h3>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-green-800">
              <DollarSign className="h-3 w-3" />
              New Rx
            </span>
            <span className="text-gray-600">Paid invoices awaiting prescription</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-800">
              <ClipboardCheck className="h-3 w-3" />
              SOAP Note
            </span>
            <span className="text-gray-600">Clinical notes pending approval</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary-light)] px-2 py-1 text-[var(--brand-primary)]">
              <RefreshCw className="h-3 w-3" />
              Refill
            </span>
            <span className="text-gray-600">Prescription refill requests</span>
          </div>
        </div>
      </div>
    </div>
  );
}
