'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Pill, Plus, RefreshCw, User, X } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface ClinicOption {
  id: number;
  name: string;
  subdomain: string | null;
}

interface PharmacyStaffRow {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  createdAt: string;
  lastLogin: string | null;
  primaryClinic: {
    id: number;
    name: string;
    subdomain: string | null;
  } | null;
  clinics: Array<{
    clinicId: number;
    isPrimary: boolean;
    clinic: {
      id: number;
      name: string;
      subdomain: string | null;
    };
  }>;
}

interface ApiPayload {
  staff: PharmacyStaffRow[];
  clinics: ClinicOption[];
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  clinicIds: [] as number[],
};

export default function SuperAdminPharmacyStaffPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PharmacyStaffRow[]>([]);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiFetch('/api/super-admin/pharmacy-staff');
      const payload = (await response.json()) as Partial<ApiPayload> & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load pharmacy staff');
      }

      setRows(Array.isArray(payload.staff) ? payload.staff : []);
      setClinics(Array.isArray(payload.clinics) ? payload.clinics : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pharmacy staff');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim().toLowerCase();
      return (
        fullName.includes(query) ||
        row.email.toLowerCase().includes(query) ||
        row.clinics.some((assignment) => assignment.clinic.name.toLowerCase().includes(query))
      );
    });
  }, [rows, search]);

  const toggleClinic = (clinicId: number) => {
    setForm((prev) => ({
      ...prev,
      clinicIds: prev.clinicIds.includes(clinicId)
        ? prev.clinicIds.filter((id) => id !== clinicId)
        : [...prev.clinicIds, clinicId],
    }));
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateError(null);
    setForm(EMPTY_FORM);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const response = await apiFetch('/api/super-admin/pharmacy-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create pharmacy staff');
      }

      closeCreateModal();
      await loadData(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create pharmacy staff');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pharmacy Staff</h1>
          <p className="text-gray-500">
            Manage global pharmacy representatives and their clinic access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 font-medium text-white hover:bg-[#3d8a66]"
          >
            <Plus className="h-4 w-4" />
            Add Pharmacy Staff
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or clinic..."
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
        />
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Staff
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Primary Clinic
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Clinic Access
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Last Login
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredRows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
                      <Pill className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {`${row.firstName || ''} ${row.lastName || ''}`.trim() || 'No Name'}
                      </p>
                      <p className="text-sm text-gray-500">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {row.primaryClinic ? (
                    <span>{row.primaryClinic.name}</span>
                  ) : (
                    <span className="italic text-gray-400">Not set</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {row.clinics.map((assignment) => (
                      <span
                        key={`${row.id}-${assignment.clinicId}`}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                          assignment.isPrimary
                            ? 'bg-[#4fa77e]/10 font-medium text-[#4fa77e]'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {assignment.clinic.name}
                        {assignment.isPrimary && '(Primary)'}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-500">
            <User className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            No pharmacy staff found.
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Create Pharmacy Staff</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">First Name *</label>
                  <input
                    required
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Last Name *</label>
                  <input
                    required
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Password *</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Assign Clinics * (first selected becomes primary)
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {clinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      type="button"
                      onClick={() => toggleClinic(clinic.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                        form.clinicIds.includes(clinic.id) ? 'bg-[#4fa77e]/5' : ''
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                          form.clinicIds.includes(clinic.id)
                            ? 'border-[#4fa77e] bg-[#4fa77e]'
                            : 'border-gray-300'
                        }`}
                      >
                        {form.clinicIds.includes(clinic.id) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{clinic.name}</p>
                        <p className="text-xs text-gray-500">
                          <Building2 className="mr-1 inline h-3 w-3" />
                          {clinic.subdomain ? `${clinic.subdomain}.eonpro.io` : 'No subdomain'}
                        </p>
                      </div>
                      {form.clinicIds[0] === clinic.id && (
                        <span className="text-xs font-medium text-[#4fa77e]">Primary</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {createError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Pharmacy Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
