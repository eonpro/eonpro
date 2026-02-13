'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, UserCheck, Loader2, X } from 'lucide-react';

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
}

export default function SalesRepDropdown({
  patientId,
  currentSalesRep,
  userRole,
  disabled = false,
}: SalesRepDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(
    currentSalesRep ? { ...currentSalesRep, email: '' } : null
  );

  // Only admins and super_admins can change the assignment
  const canEdit = ['admin', 'super_admin', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

  // Fetch sales reps when dropdown opens
  useEffect(() => {
    if (isOpen && salesReps.length === 0) {
      fetchSalesReps();
    }
  }, [isOpen]);

  const fetchSalesReps = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      const response = await fetch('/api/admin/sales-reps', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sales reps');
      }

      const data = await response.json();
      setSalesReps(data.salesReps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales reps');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (rep: SalesRep | null) => {
    if (rep?.id === selectedRep?.id) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

      if (rep) {
        // Assign new sales rep
        const response = await fetch(`/api/admin/patients/${patientId}/sales-rep`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ salesRepId: rep.id }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to assign sales rep');
        }
      } else {
        // Remove assignment
        const response = await fetch(`/api/admin/patients/${patientId}/sales-rep`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to remove sales rep');
        }
      }

      setSelectedRep(rep);
      setIsOpen(false);
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
    <div className="mt-4 border-t border-gray-200 pt-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Sales Rep</p>

      <div className="relative">
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled || saving}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
            disabled || saving
              ? 'cursor-not-allowed bg-gray-100 text-gray-500'
              : 'cursor-pointer bg-white hover:bg-gray-50'
          } ${isOpen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-gray-300'}`}
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
                <div className="px-3 py-4 text-center text-sm text-red-600">{error}</div>
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
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'text-gray-900'
                        }`}
                      >
                        <span>
                          {rep.firstName} {rep.lastName}
                        </span>
                        {selectedRep?.id === rep.id && <span className="text-emerald-600">✓</span>}
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {error && !isOpen && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
