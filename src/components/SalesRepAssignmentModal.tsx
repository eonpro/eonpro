'use client';

import { useState } from 'react';
import { X, UserCheck, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SalesRep {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  patientCount: number;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
}

interface SalesRepAssignmentModalProps {
  patient: Patient;
  salesReps: SalesRep[];
  currentSalesRepId?: number;
  onClose: () => void;
  onAssigned: () => void;
}

export default function SalesRepAssignmentModal({
  patient,
  salesReps,
  currentSalesRepId,
  onClose,
  onAssigned,
}: SalesRepAssignmentModalProps) {
  const [selectedSalesRepId, setSelectedSalesRepId] = useState<number | null>(
    currentSalesRepId || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!selectedSalesRepId) {
      setError('Please select a sales representative');
      return;
    }

    if (selectedSalesRepId === currentSalesRepId) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/admin/patients/${patient.id}/sales-rep`, {
        method: 'POST',
        body: JSON.stringify({ salesRepId: selectedSalesRepId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to assign sales rep');
      }

      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign sales rep');
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (!currentSalesRepId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/admin/patients/${patient.id}/sales-rep`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to remove sales rep');
      }

      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove sales rep');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

        {/* Modal */}
        <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="rounded-lg p-2"
                style={{ backgroundColor: 'var(--brand-primary-light, rgba(14, 165, 233, 0.1))' }}
              >
                <UserCheck className="h-5 w-5" style={{ color: 'var(--brand-primary, #0EA5E9)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Assign Sales Rep</h2>
                <p className="text-sm text-gray-500">
                  {patient.firstName} {patient.lastName}
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

          {/* Sales Rep Selection */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select Sales Representative
            </label>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {salesReps.map((rep) => (
                <label
                  key={rep.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedSalesRepId === rep.id
                      ? 'border-[var(--brand-primary,#4fa77e)] bg-[var(--brand-primary-light,rgba(79,167,126,0.1))]'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="salesRep"
                    value={rep.id}
                    checked={selectedSalesRepId === rep.id}
                    onChange={() => setSelectedSalesRepId(rep.id)}
                    className="sr-only"
                  />
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                      selectedSalesRepId === rep.id ? 'border-[var(--brand-primary,#4fa77e)]' : 'border-gray-300'
                    }`}
                  >
                    {selectedSalesRepId === rep.id && (
                      <div className="h-2 w-2 rounded-full bg-[var(--brand-primary,#4fa77e)]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {rep.firstName} {rep.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{rep.email}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-400">
                    {rep.patientCount} patients
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div>
              {currentSalesRepId && (
                <button
                  onClick={handleUnassign}
                  disabled={loading}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  Remove assignment
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={loading || !selectedSalesRepId}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary, #0EA5E9)' }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {currentSalesRepId ? 'Update' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
