'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { UserCheck, Loader2, X, RefreshCw, Pencil } from 'lucide-react';
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
  currentUserId?: number;
  disabled?: boolean;
  onAssigned?: (rep: SalesRep | null) => void;
}

export default function SalesRepDropdown({
  patientId,
  currentSalesRep,
  userRole,
  currentUserId,
  disabled = false,
  onAssigned,
}: SalesRepDropdownProps) {
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(
    currentSalesRep ? { ...currentSalesRep, email: '' } : null
  );
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentSalesRep) {
      setSelectedRep({ ...currentSalesRep, email: '' });
    } else {
      setSelectedRep(null);
    }
  }, [currentSalesRep?.id]);

  const normalizedRole = userRole?.toLowerCase();
  const canEdit = ['admin', 'super_admin', 'provider'].includes(normalizedRole);
  const isSalesRep = normalizedRole === 'sales_rep';
  const isAlreadyAssignedToMe =
    isSalesRep && currentUserId != null && selectedRep?.id === currentUserId;
  const [selfAssigning, setSelfAssigning] = useState(false);
  const [selfAssignError, setSelfAssignError] = useState<string | null>(null);

  const handleSelfAssign = async () => {
    if (!currentUserId) return;
    setSelfAssigning(true);
    setSelfAssignError(null);
    try {
      const response = await apiFetch(`/api/admin/patients/${patientId}/sales-rep`, {
        method: 'POST',
        body: JSON.stringify({ salesRepId: currentUserId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to assign');
      }
      const data = await response.json();
      const rep = data.assignment?.salesRep;
      if (rep) {
        setSelectedRep(rep);
        onAssigned?.(rep);
      }
    } catch (err) {
      setSelfAssignError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setSelfAssigning(false);
    }
  };

  const fetchSalesReps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/admin/sales-reps');
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

  const handleOpenForm = () => {
    setShowForm(true);
    setSearchQuery('');
    setError(null);
    if (salesReps.length === 0) fetchSalesReps();
  };

  const handleClose = () => {
    setShowForm(false);
    setSearchQuery('');
    setError(null);
  };

  const handleSelect = async (rep: SalesRep) => {
    if (rep.id === selectedRep?.id) {
      handleClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/admin/patients/${patientId}/sales-rep`, {
        method: 'POST',
        body: JSON.stringify({ salesRepId: rep.id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to assign sales rep');
      }
      setSelectedRep(rep);
      handleClose();
      onAssigned?.(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/admin/patients/${patientId}/sales-rep`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to remove sales rep');
      }
      setSelectedRep(null);
      handleClose();
      onAssigned?.(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!showForm) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showForm]);

  const filteredReps = searchQuery
    ? salesReps.filter((r) =>
        `${r.firstName} ${r.lastName} ${r.email}`.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : salesReps;

  // --- Assigned: show badge (all roles) ---
  if (selectedRep && !showForm) {
    return (
      <div>
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
              Sales Rep
            </p>
            <p className="truncate text-sm font-bold text-emerald-900">
              {selectedRep.firstName} {selectedRep.lastName}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleOpenForm}
              disabled={disabled}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-emerald-400 transition-colors hover:bg-emerald-100 hover:text-emerald-600 disabled:opacity-50"
              title="Change or remove sales rep"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isSalesRep && isAlreadyAssignedToMe && (
          <p className="mt-1.5 text-xs text-emerald-600">You are the assigned rep</p>
        )}
        {isSalesRep && !isAlreadyAssignedToMe && (
          <button
            onClick={handleSelfAssign}
            disabled={selfAssigning || disabled}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            {selfAssigning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            Assign myself
          </button>
        )}
        {selfAssignError && <p className="mt-1 text-xs text-red-600">{selfAssignError}</p>}
      </div>
    );
  }

  // --- Admin: edit form (assign/change/remove) ---
  if (showForm && canEdit) {
    return (
      <div ref={dropdownRef} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
            {selectedRep ? 'Change Sales Rep' : 'Assign Sales Rep'}
          </p>
          <button onClick={handleClose} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name..."
          className="mb-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm text-emerald-900 placeholder-emerald-300 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          autoFocus
          disabled={saving}
        />

        <div className="max-h-48 overflow-y-auto rounded-lg border border-emerald-100 bg-white">
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Loading...
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-center">
              <p className="mb-2 text-sm text-red-600">{error}</p>
              <button
                onClick={fetchSalesReps}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : (
            <>
              {selectedRep && (
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Remove assignment
                </button>
              )}
              {filteredReps.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-gray-500">
                  {searchQuery ? 'No matching sales reps' : 'No sales reps available'}
                </div>
              ) : (
                filteredReps.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => handleSelect(rep)}
                    disabled={saving}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50 disabled:opacity-50 ${
                      selectedRep?.id === rep.id
                        ? 'bg-emerald-50 font-medium text-emerald-700'
                        : 'text-gray-900'
                    }`}
                  >
                    <span>
                      {rep.firstName} {rep.lastName}
                    </span>
                    {selectedRep?.id === rep.id && (
                      <span className="text-emerald-600">&#10003;</span>
                    )}
                  </button>
                ))
              )}
            </>
          )}
        </div>

        {error && !loading && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // --- Not assigned + admin: show "Assign Sales Rep" button ---
  if (!selectedRep && canEdit) {
    return (
      <button
        onClick={handleOpenForm}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 px-3.5 py-2.5 text-sm font-medium text-emerald-600 transition-all hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
      >
        <UserCheck className="h-4 w-4" />
        Assign Sales Rep
      </button>
    );
  }

  // --- Not assigned + non-admin (including sales reps) ---
  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3.5 py-2.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-300 text-white">
          <UserCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sales Rep</p>
          <p className="text-sm font-medium text-gray-400">Unassigned</p>
        </div>
      </div>
      {isSalesRep && !isAlreadyAssignedToMe && (
        <button
          onClick={handleSelfAssign}
          disabled={selfAssigning || disabled}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50"
        >
          {selfAssigning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          Assign myself
        </button>
      )}
      {selfAssignError && <p className="mt-1 text-xs text-red-600">{selfAssignError}</p>}
    </div>
  );
}
