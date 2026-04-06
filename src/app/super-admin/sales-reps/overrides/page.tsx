'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, Plus, Pencil, Trash2, X, Users, Percent,
  Save, Loader2, AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface OverrideAssignment {
  id: number;
  clinicId: number;
  overrideRepId: number;
  subordinateRepId: number;
  overridePercentBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
  overrideRep: { id: number; firstName: string; lastName: string; email: string };
  subordinateRep: { id: number; firstName: string; lastName: string; email: string };
  overrideRepName: string;
  subordinateRepName: string;
  overridePercentDisplay: string;
}

interface Clinic { id: number; name: string; }
interface Rep { id: number; firstName: string; lastName: string; email: string; role?: string; }

function repName(r: Rep) {
  const name = `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.email;
  return r.role === 'ADMIN' ? `${name} (Admin)` : name;
}

export default function OverrideManagersPage() {
  const [assignments, setAssignments] = useState<OverrideAssignment[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicId, setClinicId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editAssignment, setEditAssignment] = useState<OverrideAssignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [managers, setManagers] = useState<Rep[]>([]);

  const [form, setForm] = useState({
    overrideRepId: '',
    subordinateRepId: '',
    overridePercent: '',
    notes: '',
  });

  const fetchClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinics');
      if (res.ok) {
        const json = await res.json();
        const list = json.clinics || [];
        setClinics(list);
        if (list.length > 0 && !clinicId) setClinicId(String(list[0].id));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAssignments = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/sales-rep/overrides?clinicId=${clinicId}&activeOnly=true`);
      if (res.ok) {
        const json = await res.json();
        setAssignments(json.assignments || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clinicId]);

  const fetchReps = useCallback(async () => {
    if (!clinicId) return;
    try {
      // Fetch sales reps (subordinates only)
      const repRes = await apiFetch(`/api/admin/sales-reps?clinicId=${clinicId}&roles=SALES_REP`);
      let repList: Rep[] = [];
      if (repRes.ok) {
        const json = await repRes.json();
        repList = (json.salesReps || []).map((r: any) => ({
          id: r.id, firstName: r.firstName || '', lastName: r.lastName || '',
          email: r.email, role: r.role || 'SALES_REP',
        }));
      }
      setReps(repList);

      // Fetch admins + sales reps (eligible as override managers)
      const mgrRes = await apiFetch(`/api/admin/sales-reps?clinicId=${clinicId}&roles=SALES_REP,ADMIN`);
      let mgrList: Rep[] = [];
      if (mgrRes.ok) {
        const json = await mgrRes.json();
        mgrList = (json.salesReps || []).map((r: any) => ({
          id: r.id, firstName: r.firstName || '', lastName: r.lastName || '',
          email: r.email, role: r.role || 'SALES_REP',
        }));
      }
      setManagers(mgrList);
    } catch { /* ignore */ }
  }, [clinicId]);

  useEffect(() => { fetchClinics(); }, [fetchClinics]);
  useEffect(() => { fetchAssignments(); fetchReps(); }, [fetchAssignments, fetchReps]);

  const openCreate = async () => {
    setEditAssignment(null);
    setForm({ overrideRepId: '', subordinateRepId: '', overridePercent: '', notes: '' });
    setError('');
    await fetchReps();
    setShowModal(true);
  };

  const openEdit = (a: OverrideAssignment) => {
    setEditAssignment(a);
    setForm({
      overrideRepId: String(a.overrideRepId),
      subordinateRepId: String(a.subordinateRepId),
      overridePercent: String(a.overridePercentBps / 100),
      notes: a.notes || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const percentVal = parseFloat(form.overridePercent || '0');
      if (percentVal <= 0 || percentVal > 100) {
        setError('Override percentage must be between 0.01% and 100%');
        setSaving(false);
        return;
      }

      if (editAssignment) {
        const res = await apiFetch(`/api/admin/sales-rep/overrides/${editAssignment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            overridePercentBps: Math.round(percentVal * 100),
            notes: form.notes || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update');
        }
      } else {
        if (!form.overrideRepId || !form.subordinateRepId) {
          setError('Please select both the manager rep and subordinate rep');
          setSaving(false);
          return;
        }
        const res = await apiFetch('/api/admin/sales-rep/overrides', {
          method: 'POST',
          body: JSON.stringify({
            overrideRepId: parseInt(form.overrideRepId, 10),
            subordinateRepId: parseInt(form.subordinateRepId, 10),
            overridePercentBps: Math.round(percentVal * 100),
            notes: form.notes || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to create');
        }
      }

      setShowModal(false);
      fetchAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (a: OverrideAssignment) => {
    if (!confirm(`Remove ${a.overrideRepName} as override manager of ${a.subordinateRepName}?`)) return;
    try {
      const res = await apiFetch(`/api/admin/sales-rep/overrides/${a.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to remove');
        return;
      }
      fetchAssignments();
    } catch { alert('Failed to remove override assignment'); }
  };

  const managerGroups = assignments.reduce<Record<number, OverrideAssignment[]>>((acc, a) => {
    (acc[a.overrideRepId] = acc[a.overrideRepId] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="p-6">
      <a href="/super-admin/sales-reps" className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900">
        <ChevronLeft className="h-5 w-5" />Back to Sales Reps
      </a>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Override Managers</h1>
          <p className="text-gray-500">Senior reps earn a % of gross revenue from their subordinate reps</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
          <button onClick={openCreate} disabled={!clinicId} className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50">
            <Plus className="h-4 w-4" />Add Override
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" /></div>
      ) : assignments.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No override managers configured for this clinic</p>
          <p className="mt-1 text-sm text-gray-400">Override managers earn a commission on gross revenue generated by reps assigned under them</p>
          <button onClick={openCreate} className="mt-4 text-sm font-medium text-[var(--brand-primary)] hover:underline">Add your first override</button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(managerGroups).map(([managerId, subs]) => {
            const manager = subs[0];
            return (
              <div key={managerId} className="rounded-xl border bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-primary)] text-sm font-bold text-white">
                      {(manager.overrideRep.firstName?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{manager.overrideRepName}</p>
                      <p className="text-xs text-gray-500">{manager.overrideRep.email} &middot; Override Manager</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {subs.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                          {(a.subordinateRep.firstName?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{a.subordinateRepName}</p>
                          <p className="text-xs text-gray-500">{a.subordinateRep.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                          <Percent className="h-3.5 w-3.5" />{(a.overridePercentBps / 100).toFixed(2)}%
                        </span>
                        {a.notes && <span className="max-w-[200px] truncate text-xs text-gray-400" title={a.notes}>{a.notes}</span>}
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(a)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeactivate(a)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{editAssignment ? 'Edit Override' : 'Add Override Manager'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              {!editAssignment && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Override Manager (senior rep or admin) *</label>
                    <select value={form.overrideRepId} onChange={(e) => setForm((f) => ({ ...f, overrideRepId: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Select manager...</option>
                      {managers.map((r) => <option key={r.id} value={String(r.id)}>{repName(r)} ({r.email})</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Subordinate Rep (earns revenue) *</label>
                    <select value={form.subordinateRepId} onChange={(e) => setForm((f) => ({ ...f, subordinateRepId: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Select subordinate rep...</option>
                      {reps.filter((r) => String(r.id) !== form.overrideRepId).map((r) => <option key={r.id} value={String(r.id)}>{repName(r)} ({r.email})</option>)}
                    </select>
                  </div>
                </>
              )}

              {editAssignment && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p><span className="font-medium">Manager:</span> {editAssignment.overrideRepName}</p>
                  <p><span className="font-medium">Subordinate:</span> {editAssignment.subordinateRepName}</p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Override Percentage (%) *</label>
                <div className="relative">
                  <input type="number" step="0.01" min="0.01" max="100" value={form.overridePercent} onChange={(e) => setForm((f) => ({ ...f, overridePercent: e.target.value }))} placeholder="e.g. 1.5" className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">The manager earns this % of gross revenue from the subordinate rep's patients</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
                <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. Team lead bonus" maxLength={500} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>

              {form.overrideRepId && form.subordinateRepId && form.overridePercent && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <p className="font-medium">Preview</p>
                  <p className="mt-1">
                    When {reps.find((r) => String(r.id) === form.subordinateRepId)?.firstName || 'the subordinate'}'s patients generate revenue, {managers.find((r) => String(r.id) === form.overrideRepId)?.firstName || 'the manager'} will earn <strong>{form.overridePercent}%</strong> of the gross payment amount.
                  </p>
                  <p className="mt-1 text-xs text-blue-600">Example: $1,000 payment = ${(parseFloat(form.overridePercent || '0') * 10).toFixed(2)} override commission</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving || !form.overridePercent} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />{editAssignment ? 'Update' : 'Create'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
