'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserCheck,
  Search,
  ArrowRightLeft,
  Loader2,
  ChevronRight,
  AlertCircle,
  X,
} from 'lucide-react';

interface SalesRep {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  clinicId: number;
  clinicName: string | null;
  createdAt: string;
  lastLogin: string | null;
  patientCount: number;
}

export default function SalesRepsPage() {
  const router = useRouter();
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showBulkReassignModal, setShowBulkReassignModal] = useState(false);

  const fetchSalesReps = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      const params = new URLSearchParams();
      if (searchTerm) {
        params.set('search', searchTerm);
      }

      const response = await fetch(`/api/admin/sales-reps?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSalesReps(data.salesReps || []);
      }
    } catch (error) {
      console.error('Failed to fetch sales reps:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchSalesReps();
  }, [fetchSalesReps]);

  const totalPatients = salesReps.reduce((acc, rep) => acc + rep.patientCount, 0);

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Representatives</h1>
          <p className="mt-1 text-gray-600">Manage sales reps and their patient assignments</p>
        </div>
        <button
          onClick={() => setShowBulkReassignModal(true)}
          disabled={salesReps.length < 2}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary, #0EA5E9)' }}
        >
          <ArrowRightLeft className="h-5 w-5" />
          Bulk Reassign
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)' }}>
              <UserCheck className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sales Reps</p>
              <p className="text-2xl font-semibold text-gray-900">{salesReps.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
              <Users className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Assigned Patients</p>
              <p className="text-2xl font-semibold text-gray-900">{totalPatients}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}>
              <Users className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Patients per Rep</p>
              <p className="text-2xl font-semibold text-gray-900">
                {salesReps.length > 0 ? Math.round(totalPatients / salesReps.length) : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--brand-primary, #0EA5E9)' } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Sales Reps Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-sky-500" />
            <p className="text-gray-600">Loading sales representatives...</p>
          </div>
        ) : salesReps.length === 0 ? (
          <div className="p-12 text-center">
            <UserCheck className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">
              No sales representatives found
            </h3>
            <p className="text-gray-600">
              {searchTerm
                ? 'Try adjusting your search criteria'
                : 'No users with the Sales Rep role exist yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Sales Rep
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Patients
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {salesReps.map((rep) => (
                  <tr key={rep.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100">
                          <span className="font-medium text-sky-600">
                            {rep.firstName?.[0]}
                            {rep.lastName?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {rep.firstName} {rep.lastName}
                          </div>
                          <div className="text-sm text-gray-500">ID: {rep.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{rep.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-sm font-medium text-sky-700">
                        <Users className="h-3.5 w-3.5" />
                        {rep.patientCount}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          rep.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {rep.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {rep.lastLogin ? new Date(rep.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <button
                        onClick={() =>
                          (window.location.href = `/admin/patients?salesRepId=${rep.id}`)
                        }
                        className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700"
                      >
                        View Patients
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Reassign Modal */}
      {showBulkReassignModal && (
        <BulkReassignModal
          salesReps={salesReps}
          onClose={() => setShowBulkReassignModal(false)}
          onReassigned={() => {
            setShowBulkReassignModal(false);
            fetchSalesReps();
          }}
        />
      )}
    </div>
  );
}

// Bulk Reassign Modal Component
function BulkReassignModal({
  salesReps,
  onClose,
  onReassigned,
}: {
  salesReps: SalesRep[];
  onClose: () => void;
  onReassigned: () => void;
}) {
  const [fromSalesRepId, setFromSalesRepId] = useState<number | null>(null);
  const [toSalesRepId, setToSalesRepId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Fetch preview count when source sales rep changes
  useEffect(() => {
    if (!fromSalesRepId) {
      setPreviewCount(null);
      return;
    }

    const fetchPreview = async () => {
      try {
        const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
        const response = await fetch(
          `/api/admin/sales-reps/bulk-reassign?fromSalesRepId=${fromSalesRepId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setPreviewCount(data.patientCount);
        }
      } catch {
        // Ignore preview errors
      }
    };

    fetchPreview();
  }, [fromSalesRepId]);

  const handleReassign = async () => {
    if (!fromSalesRepId || !toSalesRepId) {
      setError('Please select both source and target sales reps');
      return;
    }

    if (fromSalesRepId === toSalesRepId) {
      setError('Source and target sales reps must be different');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      const response = await fetch('/api/admin/sales-reps/bulk-reassign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromSalesRepId,
          toSalesRepId,
          note: note || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reassign patients');
      }

      onReassigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign patients');
    } finally {
      setLoading(false);
    }
  };

  const fromRep = salesReps.find((r) => r.id === fromSalesRepId);
  const toRep = salesReps.find((r) => r.id === toSalesRepId);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

        <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2">
                <ArrowRightLeft className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Bulk Reassign Patients</h2>
                <p className="text-sm text-gray-500">
                  Transfer all patients from one rep to another
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Form */}
          <div className="mb-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Transfer patients FROM
              </label>
              <select
                value={fromSalesRepId || ''}
                onChange={(e) =>
                  setFromSalesRepId(e.target.value ? parseInt(e.target.value) : null)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select source sales rep</option>
                {salesReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.firstName} {rep.lastName} ({rep.patientCount} patients)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Transfer patients TO
              </label>
              <select
                value={toSalesRepId || ''}
                onChange={(e) => setToSalesRepId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select target sales rep</option>
                {salesReps
                  .filter((rep) => rep.id !== fromSalesRepId)
                  .map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.firstName} {rep.lastName} ({rep.patientCount} patients)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Note (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for reassignment..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Preview */}
          {fromSalesRepId && toSalesRepId && previewCount !== null && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                <strong>{previewCount}</strong> patient{previewCount !== 1 ? 's' : ''} will be
                transferred from{' '}
                <strong>
                  {fromRep?.firstName} {fromRep?.lastName}
                </strong>{' '}
                to{' '}
                <strong>
                  {toRep?.firstName} {toRep?.lastName}
                </strong>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReassign}
              disabled={loading || !fromSalesRepId || !toSalesRepId || previewCount === 0}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Reassign{' '}
              {previewCount !== null
                ? `${previewCount} Patient${previewCount !== 1 ? 's' : ''}`
                : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
