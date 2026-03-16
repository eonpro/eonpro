'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, Plus, Pencil, Trash2, DollarSign, Users,
  Building2, Search, RefreshCw, X, Check, Loader2, Wallet,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SalaryRecord {
  id: number;
  clinicId: number;
  clinicName: string;
  userId: number;
  userName: string;
  userEmail: string;
  userRole: string;
  weeklyBasePayCents: number;
  hourlyRateCents: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

interface Clinic { id: number; name: string; }
interface EligibleUser { id: number; firstName: string; lastName: string; email: string; role: string; }

function $(c: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
}

const roleBadge: Record<string, string> = {
  STAFF: 'bg-teal-100 text-teal-700',
  SALES_REP: 'bg-indigo-100 text-indigo-700',
};

export default function EmployeeSalariesPage() {
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicFilter, setClinicFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Add/Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState<SalaryRecord | null>(null);
  const [modalClinicId, setModalClinicId] = useState('');
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [weeklyPay, setWeeklyPay] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinics');
      if (res.ok) setClinics((await res.json()).clinics || []);
    } catch { /* non-critical */ }
  }, []);

  const fetchSalaries = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (clinicFilter) p.set('clinicId', clinicFilter);
      const res = await apiFetch(`/api/admin/employee-salaries?${p}`);
      if (res.ok) {
        const json = await res.json();
        setSalaries(json.salaries || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clinicFilter]);

  useEffect(() => { fetchClinics(); }, [fetchClinics]);
  useEffect(() => { fetchSalaries(); }, [fetchSalaries]);

  const fetchEligibleUsers = useCallback(async (cId: string) => {
    if (!cId) { setEligibleUsers([]); return; }
    setLoadingUsers(true);
    try {
      const res = await apiFetch(`/api/super-admin/clinics/${cId}/users?roles=STAFF,SALES_REP`);
      if (res.ok) {
        const json = await res.json();
        setEligibleUsers(json.users || []);
      }
    } catch { setEligibleUsers([]); }
    finally { setLoadingUsers(false); }
  }, []);

  const openAddModal = () => {
    setEditingSalary(null);
    setModalClinicId('');
    setSelectedUserId('');
    setWeeklyPay('');
    setHourlyRate('');
    setNotes('');
    setModalError('');
    setEligibleUsers([]);
    setShowModal(true);
  };

  const openEditModal = (s: SalaryRecord) => {
    setEditingSalary(s);
    setModalClinicId(String(s.clinicId));
    setSelectedUserId(String(s.userId));
    setWeeklyPay(String((s.weeklyBasePayCents / 100).toFixed(2)));
    setHourlyRate(s.hourlyRateCents != null ? String((s.hourlyRateCents / 100).toFixed(2)) : '');
    setNotes(s.notes || '');
    setModalError('');
    setShowModal(true);
  };

  const handleClinicChange = (cId: string) => {
    setModalClinicId(cId);
    setSelectedUserId('');
    fetchEligibleUsers(cId);
  };

  const handleSave = async () => {
    setModalError('');
    const weeklyCents = Math.round(parseFloat(weeklyPay || '0') * 100);
    if (weeklyCents <= 0) { setModalError('Weekly salary must be greater than $0'); return; }

    const hourlyCents = hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null;

    setSaving(true);
    try {
      if (editingSalary) {
        const res = await apiFetch(`/api/admin/employee-salaries/${editingSalary.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            weeklyBasePayCents: weeklyCents,
            hourlyRateCents: hourlyCents,
            notes: notes || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setModalError(err.error || 'Failed to update');
          return;
        }
      } else {
        if (!modalClinicId || !selectedUserId) { setModalError('Select a clinic and employee'); return; }
        const res = await apiFetch('/api/admin/employee-salaries', {
          method: 'POST',
          body: JSON.stringify({
            clinicId: parseInt(modalClinicId, 10),
            userId: parseInt(selectedUserId, 10),
            weeklyBasePayCents: weeklyCents,
            hourlyRateCents: hourlyCents,
            notes: notes || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setModalError(err.error || 'Failed to create');
          return;
        }
      }
      setShowModal(false);
      fetchSalaries();
    } catch {
      setModalError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this employee\'s weekly salary?')) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/admin/employee-salaries/${id}`, { method: 'DELETE' });
      if (res.ok) fetchSalaries();
      else alert('Failed to remove salary');
    } catch { alert('Failed to remove salary'); }
    finally { setDeletingId(null); }
  };

  const filtered = salaries.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!s.userName.toLowerCase().includes(q) && !s.userEmail.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalWeekly = filtered.reduce((a, s) => a + s.weeklyBasePayCents, 0);

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <a href="/super-admin/sales-reps" className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> Back to Sales Reps
        </a>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Employee Weekly Salaries</h1>
            <p className="text-gray-500">Manage weekly base pay for sales reps and staff</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchSalaries} disabled={loading} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={openAddModal} className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66]">
              <Plus className="h-4 w-4" /> Add Salary
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All Clinics</option>
          {clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /><span className="text-xs font-medium text-gray-500">Salaried Employees</span></div>
          <p className="mt-1 text-lg font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-orange-500" /><span className="text-xs font-medium text-gray-500">Total Weekly Salary</span></div>
          <p className="mt-1 text-lg font-bold text-orange-700">{$(totalWeekly)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-500" /><span className="text-xs font-medium text-gray-500">Monthly Estimate</span></div>
          <p className="mt-1 text-lg font-bold text-green-700">{$(totalWeekly * 4)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Clinic</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Weekly Salary</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Hourly Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Since</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Notes</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-500">
                  {salaries.length === 0 ? 'No employee salaries configured yet. Click "Add Salary" to get started.' : 'No results match your search.'}
                </td></tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.userName}</p>
                      <p className="text-xs text-gray-500">{s.userEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[s.userRole] || 'bg-gray-100 text-gray-700'}`}>
                        {s.userRole === 'SALES_REP' ? 'Sales Rep' : s.userRole === 'STAFF' ? 'Staff' : s.userRole}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.clinicName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-700">{$(s.weeklyBasePayCents)}/wk</td>
                    <td className="px-4 py-3 text-right text-gray-600">{s.hourlyRateCents != null ? `${$(s.hourlyRateCents)}/hr` : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Date(s.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{s.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditModal(s)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(s.id)} disabled={deletingId === s.id} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50" title="Remove">
                          {deletingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingSalary ? 'Edit Weekly Salary' : 'Add Weekly Salary'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              {!editingSalary && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Clinic</label>
                    <select value={modalClinicId} onChange={(e) => handleClinicChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="">Select clinic...</option>
                      {clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Employee (Staff or Sales Rep)</label>
                    {loadingUsers ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
                    ) : (
                      <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" disabled={!modalClinicId}>
                        <option value="">{modalClinicId ? 'Select employee...' : 'Select a clinic first'}</option>
                        {eligibleUsers.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.firstName} {u.lastName} ({u.email}) — {u.role === 'SALES_REP' ? 'Sales Rep' : 'Staff'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}

              {editingSalary && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{editingSalary.userName}</p>
                  <p className="text-xs text-gray-500">{editingSalary.userEmail} — {editingSalary.clinicName}</p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Weekly Salary ($)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={weeklyPay}
                    onChange={(e) => setWeeklyPay(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                  />
                </div>
                {weeklyPay && parseFloat(weeklyPay) > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Monthly: ~{$(Math.round(parseFloat(weeklyPay) * 100 * 4.33))} &middot; Annual: ~{$(Math.round(parseFloat(weeklyPay) * 100 * 52))}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Hourly Rate ($) <span className="text-gray-400">(optional)</span></label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes <span className="text-gray-400">(optional)</span></label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., Part-time, 20 hrs/week" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" maxLength={500} />
              </div>

              {modalError && <p className="text-sm text-red-600">{modalError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {editingSalary ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
