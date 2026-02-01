'use client';

import { useState } from 'react';
import { X, UserCheck, Loader2, AlertCircle } from 'lucide-react';

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
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      const response = await fetch(`/api/admin/patients/${patient.id}/sales-rep`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ salesRepId: selectedSalesRepId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign sales rep');
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
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      const response = await fetch(`/api/admin/patients/${patient.id}/sales-rep`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove sales rep');
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
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
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
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Sales Rep Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Sales Representative
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {salesReps.map((rep) => (
                <label
                  key={rep.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSalesRepId === rep.id
                      ? 'border-sky-500 bg-sky-50'
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
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selectedSalesRepId === rep.id
                        ? 'border-sky-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedSalesRepId === rep.id && (
                      <div className="w-2 h-2 rounded-full bg-sky-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {rep.firstName} {rep.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{rep.email}</p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
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
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={loading || !selectedSalesRepId}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
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
