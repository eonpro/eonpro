'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, Plus, Pencil, Trash2, X, DollarSign, Percent, Users,
  BadgeDollarSign, Building2, Save, Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Plan {
  id: number; name: string; description: string | null; planType: string;
  flatAmountCents: number | null; percentBps: number | null;
  initialPercentBps: number | null; initialFlatAmountCents: number | null;
  recurringPercentBps: number | null; recurringFlatAmountCents: number | null;
  appliesTo: string; holdDays: number; clawbackEnabled: boolean;
  recurringEnabled: boolean; recurringMonths: number | null;
  isActive: boolean; createdAt: string; assignmentCount: number;
  volumeTierEnabled: boolean; volumeTierWindow: string | null;
  volumeTiers: Array<{ id: number; minSales: number; maxSales: number | null; amountCents: number }>;
}

interface Clinic { id: number; name: string; }

function fmtUSD(c: number) { return `$${(c / 100).toFixed(2)}`; }
function fmtBps(bps: number) { return `${(bps / 100).toFixed(1)}%`; }

export default function CommissionPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicId, setClinicId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', description: '', planType: 'FLAT' as 'FLAT' | 'PERCENT',
    flatAmountCents: '', percentBps: '',
    appliesTo: 'FIRST_PAYMENT_ONLY', holdDays: '0', clawbackEnabled: false,
    recurringEnabled: false, recurringMonths: '',
    initialPercentBps: '', initialFlatAmountCents: '',
    recurringPercentBps: '', recurringFlatAmountCents: '',
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

  const fetchPlans = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/sales-rep/commission-plans?clinicId=${clinicId}`);
      if (res.ok) {
        const json = await res.json();
        setPlans(json.plans || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clinicId]);

  useEffect(() => { fetchClinics(); }, [fetchClinics]);
  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openCreate = () => {
    setEditPlan(null);
    setForm({
      name: '', description: '', planType: 'FLAT',
      flatAmountCents: '', percentBps: '',
      appliesTo: 'FIRST_PAYMENT_ONLY', holdDays: '0', clawbackEnabled: false,
      recurringEnabled: false, recurringMonths: '',
      initialPercentBps: '', initialFlatAmountCents: '',
      recurringPercentBps: '', recurringFlatAmountCents: '',
    });
    setError('');
    setShowModal(true);
  };

  const openEdit = (plan: Plan) => {
    setEditPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description || '',
      planType: plan.planType as 'FLAT' | 'PERCENT',
      flatAmountCents: plan.flatAmountCents != null ? String(plan.flatAmountCents / 100) : '',
      percentBps: plan.percentBps != null ? String(plan.percentBps / 100) : '',
      appliesTo: plan.appliesTo,
      holdDays: String(plan.holdDays),
      clawbackEnabled: plan.clawbackEnabled,
      recurringEnabled: plan.recurringEnabled,
      recurringMonths: plan.recurringMonths != null ? String(plan.recurringMonths) : '',
      initialPercentBps: plan.initialPercentBps != null ? String(plan.initialPercentBps / 100) : '',
      initialFlatAmountCents: plan.initialFlatAmountCents != null ? String(plan.initialFlatAmountCents / 100) : '',
      recurringPercentBps: plan.recurringPercentBps != null ? String(plan.recurringPercentBps / 100) : '',
      recurringFlatAmountCents: plan.recurringFlatAmountCents != null ? String(plan.recurringFlatAmountCents / 100) : '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, any> = {
        clinicId: parseInt(clinicId, 10),
        name: form.name,
        description: form.description || null,
        planType: form.planType,
        flatAmountCents: form.planType === 'FLAT' ? Math.round(parseFloat(form.flatAmountCents || '0') * 100) : null,
        percentBps: form.planType === 'PERCENT' ? Math.round(parseFloat(form.percentBps || '0') * 100) : null,
        appliesTo: form.appliesTo,
        holdDays: parseInt(form.holdDays || '0', 10),
        clawbackEnabled: form.clawbackEnabled,
        recurringEnabled: form.recurringEnabled,
        recurringMonths: form.recurringEnabled && form.recurringMonths ? parseInt(form.recurringMonths, 10) : null,
        initialPercentBps: form.initialPercentBps ? Math.round(parseFloat(form.initialPercentBps) * 100) : null,
        initialFlatAmountCents: form.initialFlatAmountCents ? Math.round(parseFloat(form.initialFlatAmountCents) * 100) : null,
        recurringPercentBps: form.recurringPercentBps ? Math.round(parseFloat(form.recurringPercentBps) * 100) : null,
        recurringFlatAmountCents: form.recurringFlatAmountCents ? Math.round(parseFloat(form.recurringFlatAmountCents) * 100) : null,
      };

      const url = editPlan
        ? `/api/admin/sales-rep/commission-plans/${editPlan.id}`
        : '/api/admin/sales-rep/commission-plans';
      const method = editPlan ? 'PATCH' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save plan');
      }

      setShowModal(false);
      fetchPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"?`)) return;
    try {
      const res = await apiFetch(`/api/admin/sales-rep/commission-plans/${plan.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to delete');
        return;
      }
      fetchPlans();
    } catch { alert('Failed to delete plan'); }
  };

  return (
    <div className="p-6">
      <button onClick={() => router.push('/super-admin/sales-reps')} className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900">
        <ChevronLeft className="h-5 w-5" />Back to Sales Reps
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission Plans</h1>
          <p className="text-gray-500">Create and manage sales rep commission structures</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
          <button onClick={openCreate} disabled={!clinicId} className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50">
            <Plus className="h-4 w-4" />New Plan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" /></div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <BadgeDollarSign className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No commission plans for this clinic</p>
          <button onClick={openCreate} className="mt-3 text-sm font-medium text-[var(--brand-primary)] hover:underline">Create your first plan</button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className={`rounded-xl bg-white p-5 shadow-sm ${!plan.isActive ? 'opacity-60' : ''}`}>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                  {plan.description && <p className="mt-0.5 text-xs text-gray-500">{plan.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(plan)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(plan)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2">
                {plan.planType === 'FLAT' ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-700"><DollarSign className="h-3.5 w-3.5" />{fmtUSD(plan.flatAmountCents || 0)} per sale</span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-sm font-semibold text-blue-700"><Percent className="h-3.5 w-3.5" />{fmtBps(plan.percentBps || 0)} of sale</span>
                )}
                {!plan.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactive</span>}
              </div>

              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex justify-between"><span>Applies to</span><span className="font-medium text-gray-700">{plan.appliesTo.replace(/_/g, ' ')}</span></div>
                <div className="flex justify-between"><span>Hold period</span><span className="font-medium text-gray-700">{plan.holdDays} days</span></div>
                <div className="flex justify-between"><span>Clawback</span><span className="font-medium text-gray-700">{plan.clawbackEnabled ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span>Recurring</span><span className="font-medium text-gray-700">{plan.recurringEnabled ? `Yes (${plan.recurringMonths || '∞'} mo)` : 'No'}</span></div>
                {plan.volumeTierEnabled && <div className="flex justify-between"><span>Volume tiers</span><span className="font-medium text-gray-700">{plan.volumeTiers.length} tiers</span></div>}
                <div className="flex justify-between"><span>Assigned reps</span><span className="font-medium text-gray-700">{plan.assignmentCount}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{editPlan ? 'Edit Plan' : 'New Commission Plan'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard 10%" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Type *</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setForm((f) => ({ ...f, planType: 'FLAT' }))} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${form.planType === 'FLAT' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]' : 'border-gray-200 text-gray-600'}`}>
                    <DollarSign className="mb-1 inline h-4 w-4" /> Flat Amount
                  </button>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, planType: 'PERCENT' }))} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${form.planType === 'PERCENT' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]' : 'border-gray-200 text-gray-600'}`}>
                    <Percent className="mb-1 inline h-4 w-4" /> Percentage
                  </button>
                </div>
              </div>

              {form.planType === 'FLAT' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Amount per sale ($) *</label>
                  <input type="number" step="0.01" min="0" value={form.flatAmountCents} onChange={(e) => setForm((f) => ({ ...f, flatAmountCents: e.target.value }))} placeholder="25.00" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Percentage (%) *</label>
                  <input type="number" step="0.1" min="0" max="100" value={form.percentBps} onChange={(e) => setForm((f) => ({ ...f, percentBps: e.target.value }))} placeholder="10" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Applies To</label>
                <select value={form.appliesTo} onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="FIRST_PAYMENT_ONLY">First Payment Only</option>
                  <option value="ALL_PAYMENTS">All Payments</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Hold Days</label>
                  <input type="number" min="0" value={form.holdDays} onChange={(e) => setForm((f) => ({ ...f, holdDays: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.clawbackEnabled} onChange={(e) => setForm((f) => ({ ...f, clawbackEnabled: e.target.checked }))} className="rounded" />
                    Clawback on refund
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.recurringEnabled} onChange={(e) => setForm((f) => ({ ...f, recurringEnabled: e.target.checked }))} className="rounded" />
                <label className="text-sm font-medium text-gray-700">Enable recurring commissions</label>
              </div>

              {form.recurringEnabled && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Recurring months (blank = unlimited)</label>
                  <input type="number" min="1" value={form.recurringMonths} onChange={(e) => setForm((f) => ({ ...f, recurringMonths: e.target.value }))} placeholder="12" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}

              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving || !form.name} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />{editPlan ? 'Update' : 'Create'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
