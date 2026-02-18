'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  ChevronLeft,
  CreditCard,
  AlertCircle,
  Pill,
  User,
  Calendar,
  DollarSign,
  Package,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface RefillPatient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface RefillSubscription {
  id: number;
  planName: string;
  status: string;
}

interface RefillOrder {
  id: number;
  status: string | null;
  createdAt: string;
}

interface RefillInvoice {
  id: number;
  status: string;
  amount: number | null;
  paidAt: string | null;
}

interface Refill {
  id: number;
  createdAt: string;
  updatedAt: string;
  clinicId: number;
  patientId: number;
  subscriptionId: number | null;
  status: string;
  vialCount: number;
  refillIntervalDays: number;
  nextRefillDate: string;
  lastRefillDate: string | null;
  paymentVerified: boolean;
  paymentVerifiedAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  adminApproved: boolean | null;
  adminApprovedAt: string | null;
  adminNotes: string | null;
  providerQueuedAt: string | null;
  prescribedAt: string | null;
  orderId: number | null;
  requestedEarly: boolean;
  patientNotes: string | null;
  medicationName: string | null;
  medicationStrength: string | null;
  medicationForm: string | null;
  planName: string | null;
  patient: RefillPatient | null;
  subscription: RefillSubscription | null;
  lastOrder: RefillOrder | null;
  invoice: RefillInvoice | null;
}

interface RefillStats {
  scheduled: number;
  pendingPayment: number;
  pendingAdmin: number;
  approved: number;
  pendingProvider: number;
  prescribed: number;
  total: number;
}

type StatusFilter =
  | 'ALL'
  | 'PENDING_PAYMENT'
  | 'PENDING_ADMIN'
  | 'APPROVED'
  | 'PENDING_PROVIDER'
  | 'SCHEDULED';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SCHEDULED: {
    label: 'Scheduled',
    color: 'bg-gray-100 text-gray-800',
    icon: <Calendar className="h-4 w-4" />,
  },
  PENDING_PAYMENT: {
    label: 'Payment Pending',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <DollarSign className="h-4 w-4" />,
  },
  PENDING_ADMIN: {
    label: 'Admin Review',
    color: 'bg-blue-100 text-blue-800',
    icon: <Clock className="h-4 w-4" />,
  },
  APPROVED: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  PENDING_PROVIDER: {
    label: 'Provider Queue',
    color: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
    icon: <Pill className="h-4 w-4" />,
  },
  PRESCRIBED: {
    label: 'Prescribed',
    color: 'bg-emerald-100 text-emerald-800',
    icon: <Package className="h-4 w-4" />,
  },
  REJECTED: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-800',
    icon: <XCircle className="h-4 w-4" />,
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-600',
    icon: <XCircle className="h-4 w-4" />,
  },
  ON_HOLD: {
    label: 'On Hold',
    color: 'bg-orange-100 text-orange-800',
    icon: <AlertCircle className="h-4 w-4" />,
  },
};

export default function AdminRefillQueuePage() {
  const router = useRouter();
  const [refills, setRefills] = useState<Refill[]>([]);
  const [stats, setStats] = useState<RefillStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING_ADMIN');

  // Detail modal state
  const [selectedRefill, setSelectedRefill] = useState<Refill | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Action states
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Payment verification modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    method: 'MANUAL_VERIFIED',
    paymentReference: '',
  });

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchRefills();
  }, [statusFilter]);

  const getToken = () => {
    return localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
  };

  const fetchRefills = async () => {
    const token = getToken();

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }

      const response = await apiFetch(`/api/admin/refill-queue?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setRefills(data.refills);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch refills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!selectedRefill) return;

    setProcessing(true);
    setActionError(null);
    const token = getToken();

    try {
      const response = await apiFetch(`/api/admin/refill-queue/${selectedRefill.id}/verify-payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: paymentForm.method,
          paymentReference: paymentForm.paymentReference || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify payment');
      }

      setShowPaymentModal(false);
      setShowDetailModal(false);
      setSelectedRefill(null);
      setPaymentForm({ method: 'MANUAL_VERIFIED', paymentReference: '' });
      fetchRefills();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoMatchPayment = async () => {
    if (!selectedRefill) return;

    setProcessing(true);
    setActionError(null);
    const token = getToken();

    try {
      const response = await apiFetch(`/api/admin/refill-queue/${selectedRefill.id}/verify-payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autoMatch: true }),
      });

      const data = await response.json();

      if (data.autoMatched) {
        setShowDetailModal(false);
        setSelectedRefill(null);
        fetchRefills();
      } else {
        setActionError('No matching payment found. Please verify manually.');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRefill) return;

    setProcessing(true);
    setActionError(null);
    const token = getToken();

    try {
      const response = await apiFetch(`/api/admin/refill-queue/${selectedRefill.id}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve refill');
      }

      setShowDetailModal(false);
      setSelectedRefill(null);
      fetchRefills();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRefill || !rejectReason.trim()) return;

    setProcessing(true);
    setActionError(null);
    const token = getToken();

    try {
      const response = await apiFetch(`/api/admin/refill-queue/${selectedRefill.id}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: rejectReason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject refill');
      }

      setShowRejectModal(false);
      setShowDetailModal(false);
      setSelectedRefill(null);
      setRejectReason('');
      fetchRefills();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const filteredRefills = refills.filter((r) => {
    if (!searchQuery) return true;
    const patientName = r.patient
      ? `${r.patient.firstName} ${r.patient.lastName}`
      : '';
    const email = r.patient?.email || '';
    const medication = r.medicationName || '';
    return (
      normalizedIncludes(patientName, searchQuery) ||
      normalizedIncludes(email, searchQuery) ||
      normalizedIncludes(medication, searchQuery)
    );
  });

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Refill Queue</h1>
            <p className="text-gray-500">Manage prescription refill approvals</p>
          </div>
          <button
            onClick={fetchRefills}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl bg-yellow-50 p-4">
            <div className="flex items-center gap-2 text-yellow-700">
              <DollarSign className="h-5 w-5" />
              <span className="text-sm font-medium">Payment Pending</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-yellow-800">{stats.pendingPayment}</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Clock className="h-5 w-5" />
              <span className="text-sm font-medium">Admin Review</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-blue-800">{stats.pendingAdmin}</p>
          </div>
          <div className="rounded-xl bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Approved</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-green-800">{stats.approved}</p>
          </div>
          <div className="rounded-xl bg-[var(--brand-primary-light)] p-4">
            <div className="flex items-center gap-2 text-[var(--brand-primary)]">
              <Pill className="h-5 w-5" />
              <span className="text-sm font-medium">Provider Queue</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--brand-primary)]">{stats.pendingProvider}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Calendar className="h-5 w-5" />
              <span className="text-sm font-medium">Scheduled</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-800">{stats.scheduled}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Package className="h-5 w-5" />
              <span className="text-sm font-medium">Prescribed</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-800">{stats.prescribed}</p>
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { key: 'PENDING_PAYMENT', label: 'Payment Pending', count: stats?.pendingPayment || 0 },
          { key: 'PENDING_ADMIN', label: 'Admin Review', count: stats?.pendingAdmin || 0 },
          { key: 'APPROVED', label: 'Approved', count: stats?.approved || 0 },
          { key: 'PENDING_PROVIDER', label: 'Provider Queue', count: stats?.pendingProvider || 0 },
          { key: 'SCHEDULED', label: 'Scheduled', count: stats?.scheduled || 0 },
          { key: 'ALL', label: 'All', count: stats?.total || 0 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key as StatusFilter)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-[var(--brand-primary)] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by patient name, email, or medication..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-4 pr-4 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {/* Refills Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Patient
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Medication
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Refill Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Payment
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredRefills.map((refill) => {
              const config = statusConfig[refill.status] || statusConfig.SCHEDULED;
              return (
                <tr key={refill.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {refill.patient
                            ? `${refill.patient.firstName} ${refill.patient.lastName}`
                            : 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-500">{refill.patient?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {refill.medicationName || 'Not specified'}
                      </p>
                      {refill.medicationStrength && (
                        <p className="text-sm text-gray-500">{refill.medicationStrength}</p>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="text-sm text-gray-900">{refill.planName || '-'}</p>
                      <p className="text-xs text-gray-500">
                        {refill.vialCount} vial{refill.vialCount !== 1 ? 's' : ''} /{' '}
                        {refill.refillIntervalDays} days
                      </p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="text-sm text-gray-900">{formatDate(refill.nextRefillDate)}</p>
                      {refill.requestedEarly && (
                        <span className="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                          Early Request
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {refill.paymentVerified ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        {refill.paymentMethod === 'STRIPE_AUTO' ? 'Auto-matched' : 'Verified'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-yellow-600">
                        <Clock className="h-4 w-4" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${config.color}`}
                    >
                      {config.icon}
                      {config.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedRefill(refill);
                        setShowDetailModal(true);
                        setActionError(null);
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRefills.length === 0 && (
          <div className="py-12 text-center">
            <RefreshCw className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No refills found</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedRefill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Refill Details</h2>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    statusConfig[selectedRefill.status]?.color || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusConfig[selectedRefill.status]?.icon}
                  {statusConfig[selectedRefill.status]?.label || selectedRefill.status}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedRefill(null);
                  setActionError(null);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {actionError && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              {/* Patient Info */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">Patient</h3>
                {selectedRefill.patient ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Name</p>
                      <p className="font-medium text-gray-900">
                        {selectedRefill.patient.firstName} {selectedRefill.patient.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium text-gray-900">{selectedRefill.patient.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium text-gray-900">{selectedRefill.patient.phone}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Patient information not available</p>
                )}
              </div>

              {/* Medication Info */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">Medication</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Medication</p>
                    <p className="font-medium text-gray-900">
                      {selectedRefill.medicationName || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Strength</p>
                    <p className="font-medium text-gray-900">
                      {selectedRefill.medicationStrength || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Plan</p>
                    <p className="font-medium text-gray-900">{selectedRefill.planName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Vials / Interval</p>
                    <p className="font-medium text-gray-900">
                      {selectedRefill.vialCount} vial{selectedRefill.vialCount !== 1 ? 's' : ''} /{' '}
                      {selectedRefill.refillIntervalDays} days
                    </p>
                  </div>
                </div>
              </div>

              {/* Refill Schedule */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">Schedule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Refill Date</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedRefill.nextRefillDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Last Refill</p>
                    <p className="font-medium text-gray-900">
                      {selectedRefill.lastRefillDate
                        ? formatDate(selectedRefill.lastRefillDate)
                        : 'First refill'}
                    </p>
                  </div>
                  {selectedRefill.requestedEarly && (
                    <div className="col-span-2">
                      <span className="inline-flex items-center rounded bg-orange-100 px-2 py-1 text-sm text-orange-700">
                        Early refill requested
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Info */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">Payment</h3>
                {selectedRefill.paymentVerified ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <p className="inline-flex items-center gap-1 font-medium text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Verified
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Method</p>
                      <p className="font-medium text-gray-900">
                        {selectedRefill.paymentMethod === 'STRIPE_AUTO'
                          ? 'Auto-matched (Stripe)'
                          : selectedRefill.paymentMethod === 'MANUAL_VERIFIED'
                            ? 'Manually verified'
                            : selectedRefill.paymentMethod === 'EXTERNAL_REFERENCE'
                              ? 'External payment'
                              : selectedRefill.paymentMethod === 'PAYMENT_SKIPPED'
                                ? 'Skipped'
                                : selectedRefill.paymentMethod || '-'}
                      </p>
                    </div>
                    {selectedRefill.paymentReference && (
                      <div>
                        <p className="text-sm text-gray-500">Reference</p>
                        <p className="font-medium text-gray-900">
                          {selectedRefill.paymentReference}
                        </p>
                      </div>
                    )}
                    {selectedRefill.paymentVerifiedAt && (
                      <div>
                        <p className="text-sm text-gray-500">Verified At</p>
                        <p className="font-medium text-gray-900">
                          {formatDateTime(selectedRefill.paymentVerifiedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="inline-flex items-center gap-1 text-yellow-600">
                      <Clock className="h-4 w-4" />
                      Payment verification pending
                    </p>
                  </div>
                )}
              </div>

              {/* Invoice Info */}
              {selectedRefill.invoice && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">Invoice</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Invoice ID</p>
                      <p className="font-medium text-gray-900">#{selectedRefill.invoice.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Amount</p>
                      <p className="font-medium text-gray-900">
                        {selectedRefill.invoice.amount
                          ? formatCurrency(selectedRefill.invoice.amount)
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <p className="font-medium text-gray-900">{selectedRefill.invoice.status}</p>
                    </div>
                    {selectedRefill.invoice.paidAt && (
                      <div>
                        <p className="text-sm text-gray-500">Paid At</p>
                        <p className="font-medium text-gray-900">
                          {formatDateTime(selectedRefill.invoice.paidAt)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Patient Notes */}
              {selectedRefill.patientNotes && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                    Patient Notes
                  </h3>
                  <p className="whitespace-pre-wrap text-gray-900">{selectedRefill.patientNotes}</p>
                </div>
              )}

              {/* Admin Notes */}
              {selectedRefill.adminNotes && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                    Admin Notes
                  </h3>
                  <p className="whitespace-pre-wrap text-gray-900">{selectedRefill.adminNotes}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-sm text-gray-500">
                Created {formatDateTime(selectedRefill.createdAt)}
                {selectedRefill.adminApprovedAt && (
                  <span>
                    {' '}
                    • {selectedRefill.adminApproved ? 'Approved' : 'Rejected'}{' '}
                    {formatDateTime(selectedRefill.adminApprovedAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              {/* Payment verification actions */}
              {selectedRefill.status === 'PENDING_PAYMENT' && (
                <div className="flex gap-3">
                  <button
                    onClick={handleAutoMatchPayment}
                    disabled={processing}
                    className="flex-1 rounded-lg border border-[var(--brand-primary-medium)] py-2 font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)] disabled:opacity-50"
                  >
                    {processing ? 'Checking...' : 'Auto-Match Payment'}
                  </button>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    disabled={processing}
                    className="flex-1 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:brightness-90 disabled:opacity-50"
                  >
                    Manual Verify
                  </button>
                </div>
              )}

              {/* Admin approval actions */}
              {selectedRefill.status === 'PENDING_ADMIN' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={processing}
                    className="flex-1 rounded-lg border border-red-300 py-2 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={processing}
                    className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {processing ? 'Approving...' : 'Approve for Provider'}
                  </button>
                </div>
              )}

              {/* View in provider queue */}
              {(selectedRefill.status === 'APPROVED' ||
                selectedRefill.status === 'PENDING_PROVIDER') && (
                <button
                  onClick={() => router.push('/provider/prescription-queue')}
                  className="w-full rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:brightness-90"
                >
                  View in Provider Queue
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Verification Modal */}
      {showPaymentModal && selectedRefill && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Verify Payment</h2>
            <p className="mb-4 text-sm text-gray-600">
              Verify payment for{' '}
              <strong>
                {selectedRefill.patient?.firstName} {selectedRefill.patient?.lastName}
              </strong>
              's refill request.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Verification Method
                </label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  <option value="MANUAL_VERIFIED">Manually Verified</option>
                  <option value="EXTERNAL_REFERENCE">External Payment (Venmo, Check, etc.)</option>
                  <option value="PAYMENT_SKIPPED">Skip Verification</option>
                </select>
              </div>

              {paymentForm.method === 'EXTERNAL_REFERENCE' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Payment Reference
                  </label>
                  <input
                    type="text"
                    value={paymentForm.paymentReference}
                    onChange={(e) =>
                      setPaymentForm((f) => ({ ...f, paymentReference: e.target.value }))
                    }
                    placeholder="e.g., Venmo @username, Check #1234"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyPayment}
                  disabled={
                    processing ||
                    (paymentForm.method === 'EXTERNAL_REFERENCE' && !paymentForm.paymentReference)
                  }
                  className="flex-1 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:brightness-90 disabled:opacity-50"
                >
                  {processing ? 'Verifying...' : 'Verify Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRefill && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Reject Refill</h2>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to reject this refill request for{' '}
              <strong>
                {selectedRefill.patient?.firstName} {selectedRefill.patient?.lastName}
              </strong>
              ?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide a reason for rejection..."
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                  }}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing || !rejectReason.trim()}
                  className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {processing ? 'Rejecting...' : 'Reject Refill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
