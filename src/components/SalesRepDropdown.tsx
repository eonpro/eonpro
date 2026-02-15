'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, UserCheck, Loader2, X, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SalesRep {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface SalesRepDropdownProps {
  patientId: number;
  currentSalesRep?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  userRole: string;
  disabled?: boolean;
  onAssigned?: (rep: SalesRep | null) => void;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
}

export default function SalesRepDropdown({
  patientId,
  currentSalesRep,
  userRole,
  disabled = false,
  onAssigned,
}: SalesRepDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(
    currentSalesRep ? { ...currentSalesRep, email: '' } : null
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with parent if currentSalesRep changes
  useEffect(() => {
    if (currentSalesRep) {
      setSelectedRep({ ...currentSalesRep, email: '' });
    } else {
      setSelectedRep(null);
    }
  }, [currentSalesRep?.id]);

  // Only admins and super_admins can change the assignment
  const normalizedRole = userRole?.toLowerCase();
  const canEdit = ['admin', 'super_admin'].includes(normalizedRole);

  // Fetch sales reps when dropdown opens
  useEffect(() => {
    if (isOpen && salesReps.length === 0) {
      fetchSalesReps();
    }
  }, [isOpen]);

  const fetchSalesReps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const response = await apiFetch('/api/admin/sales-reps', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch sales reps (${response.status})`);
      }

      const data = await response.json();
      setSalesReps(data.salesReps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales reps');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = async (rep: SalesRep | null) => {
    if (rep?.id === selectedRep?.id) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      if (rep) {
        // Assign new sales rep
        const response = await apiFetch(`/api/admin/patients/${patientId}/sales-rep`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ salesRepId: rep.id }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to assign sales rep');
        }
      } else {
        // Remove assignment
        const response = await apiFetch(`/api/admin/patients/${patientId}/sales-rep`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to remove sales rep');
        }
      }

      setSelectedRep(rep);
      setIsOpen(false);
      onAssigned?.(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  // If user can't edit, just show the current rep (or "Unassigned")
  if (!canEdit) {
    return (
      <div className="mt-4 border-t border-gray-200 pt-4">
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Sales Rep</p>
        <p className="text-sm text-gray-900">
          {selectedRep ? `${selectedRep.firstName} ${selectedRep.lastName}` : 'Unassigned'}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4" ref={dropdownRef}>
      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Sales Rep</p>

      <div className="relative">
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled || saving}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
            disabled || saving
              ? 'cursor-not-allowed bg-gray-100 text-gray-500'
              : 'cursor-pointer bg-white hover:bg-gray-50'
          } ${isOpen ? 'border-[var(--brand-primary,#4fa77e)] ring-1 ring-[var(--brand-primary,#4fa77e)]' : 'border-gray-300'}`}
        >
          <span className="flex items-center gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <UserCheck className="h-4 w-4 text-gray-400" />
            )}
            <span className={selectedRep ? 'text-gray-900' : 'text-gray-500'}>
              {selectedRep
                ? `${selectedRep.firstName} ${selectedRep.lastName}`
                : 'Assign sales rep...'}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

            {/* Dropdown menu */}
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {loading ? (
                <div className="px-3 py-4 text-center text-sm text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Loading...
                </div>
              ) : error ? (
                <div className="px-3 py-4 text-center">
                  <p className="mb-2 text-sm text-red-600">{error}</p>
                  <button
                    onClick={() => fetchSalesReps()}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {/* Unassign option */}
                  {selectedRep && (
                    <button
                      onClick={() => handleSelect(null)}
                      className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                      Remove assignment
                    </button>
                  )}

                  {/* Sales rep options */}
                  {salesReps.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">
                      No sales reps available
                    </div>
                  ) : (
                    salesReps.map((rep) => (
                      <button
                        key={rep.id}
                        onClick={() => handleSelect(rep)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          selectedRep?.id === rep.id
                            ? 'bg-[var(--brand-primary-light,#e8f5ef)] text-[var(--brand-primary,#4fa77e)]'
                            : 'text-gray-900'
                        }`}
                      >
                        <span>
                          {rep.firstName} {rep.lastName}
                        </span>
                        {selectedRep?.id === rep.id && (
                          <span className="text-[var(--brand-primary,#4fa77e)]">&#10003;</span>
                        )}
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {error && !isOpen && (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setSalesReps([]);
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
