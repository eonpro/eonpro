'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChevronLeft, Pencil, Trash2, DollarSign, Users,
  Search, RefreshCw, X, Check, Loader2, Wallet,
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

interface ClinicUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  clinicId: number;
  clinicName: string;
}

interface Clinic { id: number; name: string; }

function $(c: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
}

const roleBadge: Record<string, string> = {
  STAFF: 'bg-teal-100 text-teal-700',
  SALES_REP: 'bg-indigo-100 text-indigo-700',
};

export default function EmployeeSalariesPage() {
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [allEmployees, setAllEmployees] = useState<ClinicUser[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicFilter, setClinicFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<{ userId: number; userName: string; userEmail: string; userRole: string; clinicId: number; clinicName: string } | null>(null);
  const [editingSalaryId, setEditingSalaryId] = useState<number | null>(null);
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
    try {
      const res = await apiFetch('/api/admin/employee-salaries');
      if (res.ok) {
        const json = await res.json();
        setSalaries(json.salaries || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAllEmployees = useCallback(async (fetchedClinics: Clinic[]) => {
    setLoading(true);
    try {
      const results = await Promise.all(
        fetchedClinics.map(async (clinic) => {
          try {
            const res = await apiFetch(`/api/super-admin/clinics/${clinic.id}/users?roles=STAFF,SALES_REP`);
            if (res.ok) {
              const json = await res.json();
              return (json.users || []).map((u: any) => ({
                ...u,
                clinicId: clinic.id,
                clinicName: clinic.name,
              }));
            }
          } catch { /* ignore */ }
          return [];
        })
      );
      const allUsers: ClinicUser[] = results.flat();
      // Deduplicate by userId (a user may appear in multiple clinics via UserClinic)
      const seen = new Set<string>();
      const deduped = allUsers.filter((u) => {
        const key = `${u.id}-${u.clinicId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAllEmployees(deduped);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/super-admin/clinics');
        if (res.ok) {
          const json = await res.json();
          const fetchedClinics = json.clinics || [];
          setClinics(fetchedClinics);
          await Promise.all([fetchSalaries(), fetchAllEmployees(fetchedClinics)]);
        }
      } catch { setLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const salaryByUserId = useMemo(() => {
    const map = new Map<number, SalaryRecord>();
    for (const s of salaries) map.set(s.userId, s);
    return map;
  }, [salaries]);

  const merged = useMemo(() => {
    return allEmployees.map((emp) => {
      const salary = salaryByUserId.get(emp.id);
      return {
        userId: emp.id,
        userName: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email,
        userEmail: emp.email,
        userRole: emp.role,
        userStatus: emp.status,
        clinicId: emp.clinicId,
        clinicName: emp.clinicName,
        salary: salary || null,
      };
    });
  }, [allEmployees, salaryByUserId]);

  const filtered = useMemo(() => {
    let result = merged;
    if (clinicFilter) result = result.filter((r) => r.clinicId === parseInt(clinicFilter, 10));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        r.userName.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      if (a.salary && !b.salary) return -1;
      if (!a.salary && b.salary) return 1;
      return a.userName.localeCompare(b.userName);
    });
  }, [merged, clinicFilter, searchQuery]);

  const totalWeekly = useMemo(() =>
    filtered.reduce((a, r) => a + (r.salary?.weeklyBasePayCents || 0), 0)
  , [filtered]);

  const salariedCount = filtered.filter((r) => r.salary).length;

  const openSetSalary = (emp: typeof filtered[number]) => {
    setEditingUser({
      userId: emp.userId,
      userName: emp.userName,
      userEmail: emp.userEmail,
      userRole: emp.userRole,
      clinicId: emp.clinicId,
      clinicName: emp.clinicName,
    });
    if (emp.salary) {
      setEditingSalaryId(emp.salary.id);
      setWeeklyPay(String((emp.salary.weeklyBasePayCents / 100).toFixed(2)));
      setHourlyRate(emp.salary.hourlyRateCents != null ? String((emp.salary.hourlyRateCents / 100).toFixed(2)) : '');
      setNotes(emp.salary.notes || '');
    } else {
      setEditingSalaryId(null);
      setWeeklyPay('');
      setHourlyRate('');
      setNotes('');
    }
    setModalError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setModalError('');
    const weeklyCents = Math.round(parseFloat(weeklyPay || '0') * 100);
    if (weeklyCents <= 0) { setModalError('Weekly salary must be greater than $0'); return; }
    if (!editingUser) return;

    const hourlyCents = hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null;

    setSaving(true);
    try {
      if (editingSalaryId) {
        const res = await apiFetch(`/api/admin/employee-salaries/${editingSalaryId}`, {
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
        const res = await apiFetch('/api/admin/employee-salaries', {
          method: 'POST',
          body: JSON.stringify({
            clinicId: editingUser.clinicId,
            userId: editingUser.userId,
            weeklyBasePayCents: weeklyCents,
            hourlyRateCents: hourlyCents,
            notes: notes || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setModalError(err.error || 'Failed to set salary');
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

  const handleDelete = async (userId: number) => {
    const salary = salaryByUserId.get(userId);
    if (!salary) return;
    if (!confirm('Remove this employee\'s weekly salary?')) return;
    setDeletingId(salary.id);
    try {
      const res = await apiFetch(`/api/admin/employee-salaries/${salary.id}`, { method: 'DELETE' });
      if (res.ok) fetchSalaries();
      else alert('Failed to remove salary');
    } catch { alert('Failed to remove salary'); }
    finally { setDeletingId(null); }
  };

  const handleRefresh = () => {
    if (clinics.length > 0) {
      fetchSalaries();
      fetchAllEmployees(clinics);
    }
  };

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
          <button onClick={handleRefresh} disabled={loading} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
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
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /><span className="text-xs font-medium text-gray-500">Total Staff & Sales Reps</span></div>
          <p className="mt-1 text-lg font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-green-500" /><span className="text-xs font-medium text-gray-500">With Salary</span></div>
          <p className="mt-1 text-lg font-bold text-green-700">{salariedCount}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-orange-500" /><span className="text-xs font-medium text-gray-500">Total Weekly Salary</span></div>
          <p className="mt-1 text-lg font-bold text-orange-700">{$(totalWeekly)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-500" /><span className="text-xs font-medium text-gray-500">Monthly Estimate</span></div>
          <p className="mt-1 text-lg font-bold text-emerald-700">{$(Math.round(totalWeekly * 4.33))}</p>
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Notes</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-500">
                  {allEmployees.length === 0 ? 'No staff or sales reps found across your clinics.' : 'No results match your search.'}
                </td></tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={`${emp.userId}-${emp.clinicId}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{emp.userName}</p>
                      <p className="text-xs text-gray-500">{emp.userEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[emp.userRole] || 'bg-gray-100 text-gray-700'}`}>
                        {emp.userRole === 'SALES_REP' ? 'Sales Rep' : emp.userRole === 'STAFF' ? 'Staff' : emp.userRole}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.clinicName}</td>
                    <td className="px-4 py-3 text-right">
                      {emp.salary ? (
                        <span className="font-semibold text-orange-700">{$(emp.salary.weeklyBasePayCents)}/wk</span>
                      ) : (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {emp.salary?.hourlyRateCents != null ? `${$(emp.salary.hourlyRateCents)}/hr` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{emp.salary?.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openSetSalary(emp)}
                          className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                          title={emp.salary ? 'Edit salary' : 'Set salary'}
                        >
                          {emp.salary ? <Pencil className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
                          {emp.salary ? 'Edit' : 'Set Salary'}
                        </button>
                        {emp.salary && (
                          <button
                            onClick={() => handleDelete(emp.userId)}
                            disabled={deletingId === emp.salary?.id}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                            title="Remove salary"
                          >
                            {deletingId === emp.salary?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Set/Edit Salary Modal */}
      {showModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingSalaryId ? 'Edit Weekly Salary' : 'Set Weekly Salary'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{editingUser.userName}</p>
                    <p className="text-xs text-gray-500">{editingUser.userEmail}</p>
                  </div>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[editingUser.userRole] || 'bg-gray-100 text-gray-700'}`}>
                    {editingUser.userRole === 'SALES_REP' ? 'Sales Rep' : editingUser.userRole === 'STAFF' ? 'Staff' : editingUser.userRole}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{editingUser.clinicName}</p>
              </div>

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
                    autoFocus
                  />
                </div>
                {weeklyPay && parseFloat(weeklyPay) > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Monthly: ~{$(Math.round(parseFloat(weeklyPay) * 100 * 4.33))} &middot; Annual: ~{$(Math.round(parseFloat(weeklyPay) * 100 * 52))}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Hourly Rate ($) <span className="text-gray-400">(optional, for reference)</span></label>
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
                  {editingSalaryId ? 'Update' : 'Set Salary'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
