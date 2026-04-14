'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  DollarSign,
  Percent,
  BadgeDollarSign,
  Save,
  Loader2,
  RefreshCw,
  Package,
  Settings2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Plan {
  id: number;
  name: string;
  description: string | null;
  planType: string;
  flatAmountCents: number | null;
  percentBps: number | null;
  initialPercentBps: number | null;
  initialFlatAmountCents: number | null;
  recurringPercentBps: number | null;
  recurringFlatAmountCents: number | null;
  appliesTo: string;
  holdDays: number;
  clawbackEnabled: boolean;
  recurringEnabled: boolean;
  recurringMonths: number | null;
  isActive: boolean;
  createdAt: string;
  assignmentCount: number;
  multiItemBonusEnabled?: boolean;
  multiItemBonusType?: string | null;
  multiItemBonusPercentBps?: number | null;
  multiItemBonusFlatCents?: number | null;
  multiItemMinQuantity?: number | null;
  volumeTierEnabled: boolean;
  volumeTierBasis?: 'SALE_COUNT' | 'WEEKLY_REVENUE_CENTS';
  volumeTierWindow: string | null;
  volumeTierRetroactive?: boolean;
  volumeTiers: Array<{
    id?: number;
    minSales: number;
    maxSales: number | null;
    amountCents: number;
    minRevenueCents?: number | null;
    additionalPercentBps?: number | null;
  }>;
}

interface Clinic {
  id: number;
  name: string;
}

interface FormData {
  name: string;
  description: string;
  planType: 'FLAT' | 'PERCENT';
  flatAmountCents: number;
  percentBps: number;
  useSeparateRates: boolean;
  initialPercentBps: number;
  initialFlatAmountCents: number;
  recurringPercentBps: number;
  recurringFlatAmountCents: number;
  appliesTo: string;
  holdDays: number;
  clawbackEnabled: boolean;
  recurringEnabled: boolean;
  recurringMonths: number | null;
  multiItemBonusEnabled: boolean;
  multiItemBonusType: 'PERCENT' | 'FLAT';
  multiItemBonusPercentBps: number;
  multiItemBonusFlatCents: number;
  multiItemMinQuantity: number;
  volumeTierEnabled: boolean;
  volumeTierWindow: 'CALENDAR_WEEK_MON_SUN' | 'REPORT_PERIOD';
  volumeTierRetroactive: boolean;
  volumeTiers: Array<{ minSales: number; maxSales: number | null; amountCents: number }>;
}

interface ProductRuleLine {
  productId: number | '';
  productBundleId: number | '';
  bonusType: 'PERCENT' | 'FLAT';
  percentBps: number;
  flatAmountCents: number;
}

function fmtUSD(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}
function fmtBps(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

const defaultForm: FormData = {
  name: '',
  description: '',
  planType: 'PERCENT',
  flatAmountCents: 0,
  percentBps: 1000,
  useSeparateRates: false,
  initialPercentBps: 1000,
  initialFlatAmountCents: 0,
  recurringPercentBps: 500,
  recurringFlatAmountCents: 0,
  appliesTo: 'ALL_PAYMENTS',
  holdDays: 7,
  clawbackEnabled: true,
  recurringEnabled: true,
  recurringMonths: null,
  multiItemBonusEnabled: false,
  multiItemBonusType: 'PERCENT',
  multiItemBonusPercentBps: 500,
  multiItemBonusFlatCents: 0,
  multiItemMinQuantity: 2,
  volumeTierEnabled: false,
  volumeTierWindow: 'CALENDAR_WEEK_MON_SUN',
  volumeTierRetroactive: true,
  volumeTiers: [
    { minSales: 1, maxSales: 8, amountCents: 500 },
    { minSales: 9, maxSales: 20, amountCents: 1000 },
    { minSales: 21, maxSales: null, amountCents: 1500 },
  ],
};

export default function CommissionPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicId, setClinicId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormData>(defaultForm);
  const [productRuleLines, setProductRuleLines] = useState<ProductRuleLine[]>([]);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [bundles, setBundles] = useState<Array<{ id: number; name: string }>>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinics');
      if (res.ok) {
        const json = await res.json();
        const list = json.clinics || [];
        setClinics(list);
        if (list.length > 0 && !clinicId) setClinicId(String(list[0].id));
      }
    } catch {
      /* ignore */
    }
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
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  const fetchProductsAndBundles = async () => {
    try {
      const [pRes, bRes] = await Promise.all([
        apiFetch('/api/products?activeOnly=true'),
        apiFetch('/api/bundles?activeOnly=true'),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(
          d.products?.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })) ?? []
        );
      }
      if (bRes.ok) {
        const d = await bRes.json();
        setBundles(
          d.bundles?.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })) ?? []
        );
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchClinics();
  }, [fetchClinics]);
  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openCreate = async () => {
    setEditPlan(null);
    setForm(defaultForm);
    setProductRuleLines([
      {
        productId: '',
        productBundleId: '',
        bonusType: 'PERCENT',
        percentBps: 500,
        flatAmountCents: 0,
      },
    ]);
    setError('');
    await fetchProductsAndBundles();
    setShowModal(true);
  };

  const openEdit = async (plan: Plan) => {
    setEditPlan(plan);
    const useSeparateRates = !!(
      plan.initialPercentBps !== null ||
      plan.initialFlatAmountCents !== null ||
      plan.recurringPercentBps !== null ||
      plan.recurringFlatAmountCents !== null
    );
    setForm({
      name: plan.name,
      description: plan.description || '',
      planType: plan.planType as 'FLAT' | 'PERCENT',
      flatAmountCents: plan.flatAmountCents || 0,
      percentBps: plan.percentBps || 1000,
      useSeparateRates,
      initialPercentBps: plan.initialPercentBps || plan.percentBps || 1000,
      initialFlatAmountCents: plan.initialFlatAmountCents || plan.flatAmountCents || 0,
      recurringPercentBps: plan.recurringPercentBps || plan.percentBps || 500,
      recurringFlatAmountCents: plan.recurringFlatAmountCents || plan.flatAmountCents || 0,
      appliesTo: plan.appliesTo,
      holdDays: plan.holdDays,
      clawbackEnabled: plan.clawbackEnabled,
      recurringEnabled: plan.recurringEnabled,
      recurringMonths: plan.recurringMonths,
      multiItemBonusEnabled: plan.multiItemBonusEnabled === true,
      multiItemBonusType: (plan.multiItemBonusType === 'FLAT' ? 'FLAT' : 'PERCENT') as
        | 'PERCENT'
        | 'FLAT',
      multiItemBonusPercentBps: plan.multiItemBonusPercentBps ?? 500,
      multiItemBonusFlatCents: plan.multiItemBonusFlatCents ?? 0,
      multiItemMinQuantity: plan.multiItemMinQuantity ?? 2,
      volumeTierEnabled: plan.volumeTierEnabled === true,
      volumeTierWindow:
        plan.volumeTierWindow === 'REPORT_PERIOD' ? 'REPORT_PERIOD' : 'CALENDAR_WEEK_MON_SUN',
      volumeTierRetroactive: plan.volumeTierRetroactive !== false,
      volumeTiers:
        plan.volumeTiers?.length > 0
          ? [...plan.volumeTiers]
              .sort((a, b) => a.minSales - b.minSales)
              .map((t) => ({
                minSales: t.minSales,
                maxSales: t.maxSales,
                amountCents: t.amountCents,
              }))
          : defaultForm.volumeTiers,
    });
    setError('');
    await fetchProductsAndBundles();
    try {
      const res = await apiFetch(`/api/admin/sales-rep/commission-plans/${plan.id}/product-rules`);
      if (res.ok) {
        const data = await res.json();
        const rules = (data.rules ?? []) as Array<{
          productId: number | null;
          productBundleId: number | null;
          bonusType: string;
          percentBps: number | null;
          flatAmountCents: number | null;
        }>;
        setProductRuleLines(
          rules.map((r) => ({
            productId: r.productId ?? '',
            productBundleId: r.productBundleId ?? '',
            bonusType: (r.bonusType === 'FLAT' ? 'FLAT' : 'PERCENT') as 'PERCENT' | 'FLAT',
            percentBps: r.percentBps ?? 0,
            flatAmountCents: r.flatAmountCents ?? 0,
          }))
        );
      } else {
        setProductRuleLines([
          {
            productId: '',
            productBundleId: '',
            bonusType: 'PERCENT',
            percentBps: 500,
            flatAmountCents: 0,
          },
        ]);
      }
    } catch {
      setProductRuleLines([
        {
          productId: '',
          productBundleId: '',
          bonusType: 'PERCENT',
          percentBps: 500,
          flatAmountCents: 0,
        },
      ]);
    }
    setShowModal(true);
  };

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      clinicId: parseInt(clinicId, 10),
      name: form.name,
      description: form.description || null,
      planType: form.planType,
      appliesTo: form.appliesTo,
      holdDays: form.holdDays,
      clawbackEnabled: form.clawbackEnabled,
      recurringEnabled: form.recurringEnabled,
      recurringMonths: form.recurringEnabled ? form.recurringMonths : null,
      multiItemBonusEnabled: form.multiItemBonusEnabled,
      multiItemMinQuantity: form.multiItemBonusEnabled ? form.multiItemMinQuantity : null,
    };
    if (form.planType === 'PERCENT') {
      body.percentBps = form.percentBps;
      body.flatAmountCents = null;
      if (form.useSeparateRates) {
        body.initialPercentBps = form.initialPercentBps;
        body.recurringPercentBps = form.recurringPercentBps;
        body.initialFlatAmountCents = null;
        body.recurringFlatAmountCents = null;
      } else {
        body.initialPercentBps = null;
        body.recurringPercentBps = null;
        body.initialFlatAmountCents = null;
        body.recurringFlatAmountCents = null;
      }
    } else {
      body.flatAmountCents = form.flatAmountCents;
      body.percentBps = null;
      if (form.useSeparateRates) {
        body.initialFlatAmountCents = form.initialFlatAmountCents;
        body.recurringFlatAmountCents = form.recurringFlatAmountCents;
        body.initialPercentBps = null;
        body.recurringPercentBps = null;
      } else {
        body.initialPercentBps = null;
        body.recurringPercentBps = null;
        body.initialFlatAmountCents = null;
        body.recurringFlatAmountCents = null;
      }
    }
    if (form.multiItemBonusEnabled) {
      body.multiItemBonusType = form.multiItemBonusType;
      body.multiItemBonusPercentBps =
        form.multiItemBonusType === 'PERCENT' ? form.multiItemBonusPercentBps : null;
      body.multiItemBonusFlatCents =
        form.multiItemBonusType === 'FLAT' ? form.multiItemBonusFlatCents : null;
    } else {
      body.multiItemBonusType = null;
      body.multiItemBonusPercentBps = null;
      body.multiItemBonusFlatCents = null;
    }
    body.volumeTierEnabled = form.volumeTierEnabled;
    body.volumeTierWindow = form.volumeTierEnabled ? form.volumeTierWindow : null;
    body.volumeTierRetroactive = form.volumeTierEnabled ? form.volumeTierRetroactive : true;
    if (form.volumeTierEnabled && editPlan?.volumeTierBasis === 'WEEKLY_REVENUE_CENTS') {
      body.volumeTierBasis = 'WEEKLY_REVENUE_CENTS';
      body.volumeTiers = (editPlan.volumeTiers || []).map((t) => ({
        minRevenueCents: t.minRevenueCents ?? 0,
        additionalPercentBps: t.additionalPercentBps ?? 0,
      }));
    } else {
      body.volumeTierBasis = 'SALE_COUNT';
      body.volumeTiers = form.volumeTierEnabled
        ? form.volumeTiers.map((t) => ({
            minSales: t.minSales,
            maxSales: t.maxSales,
            amountCents: t.amountCents,
          }))
        : [];
    }
    const validRules = productRuleLines.filter(
      (l) =>
        (l.productId !== '' || l.productBundleId !== '') &&
        (l.productId === '' || l.productBundleId === '')
    );
    body.productRules = validRules.map((l) => ({
      productId: l.productId === '' ? null : l.productId,
      productBundleId: l.productBundleId === '' ? null : l.productBundleId,
      bonusType: l.bonusType,
      percentBps: l.bonusType === 'PERCENT' ? l.percentBps : null,
      flatAmountCents: l.bonusType === 'FLAT' ? l.flatAmountCents : null,
    }));
    return body;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = editPlan
        ? `/api/admin/sales-rep/commission-plans/${editPlan.id}`
        : '/api/admin/sales-rep/commission-plans';
      const method = editPlan ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(buildBody()) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save plan');
      }
      setShowModal(false);
      fetchPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (planId: number) => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/sales-rep/commission-plans/${planId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete');
      }
      setShowDeleteConfirm(null);
      fetchPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <a
        href="/super-admin/sales-reps"
        className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-5 w-5" />
        Back to Sales Reps
      </a>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission Plans</h1>
          <p className="text-gray-500">Create and manage sales rep commission structures</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {clinics.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={openCreate}
            disabled={!clinicId}
            className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New Plan
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <BadgeDollarSign className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No commission plans for this clinic</p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            Create your first plan
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${!plan.isActive ? 'opacity-60' : ''}`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                  {plan.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{plan.description}</p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${plan.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  {plan.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mb-4 space-y-2">
                {plan.initialPercentBps !== null ||
                plan.initialFlatAmountCents !== null ||
                plan.recurringPercentBps !== null ||
                plan.recurringFlatAmountCents !== null ? (
                  <>
                    <div className="flex items-center justify-between rounded-lg bg-[var(--brand-primary-light)] p-2">
                      <span className="text-sm text-[var(--brand-primary)]">Initial Payment</span>
                      <span className="font-semibold text-[var(--brand-primary)]">
                        {plan.planType === 'PERCENT' && plan.initialPercentBps !== null
                          ? fmtBps(plan.initialPercentBps)
                          : plan.initialFlatAmountCents !== null
                            ? fmtUSD(plan.initialFlatAmountCents)
                            : plan.percentBps
                              ? fmtBps(plan.percentBps)
                              : plan.flatAmountCents
                                ? fmtUSD(plan.flatAmountCents)
                                : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-blue-50 p-2">
                      <span className="flex items-center gap-1 text-sm text-blue-600">
                        <RefreshCw className="h-3 w-3" />
                        Recurring
                      </span>
                      <span className="font-semibold text-blue-700">
                        {plan.planType === 'PERCENT' && plan.recurringPercentBps !== null
                          ? fmtBps(plan.recurringPercentBps)
                          : plan.recurringFlatAmountCents !== null
                            ? fmtUSD(plan.recurringFlatAmountCents)
                            : plan.percentBps
                              ? fmtBps(plan.percentBps)
                              : plan.flatAmountCents
                                ? fmtUSD(plan.flatAmountCents)
                                : 'N/A'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2">
                    <span className="text-sm text-gray-600">Commission Rate</span>
                    <span className="font-semibold text-gray-800">
                      {plan.planType === 'PERCENT' && plan.percentBps
                        ? fmtBps(plan.percentBps)
                        : plan.flatAmountCents
                          ? fmtUSD(plan.flatAmountCents)
                          : 'N/A'}
                    </span>
                  </div>
                )}
              </div>

              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {plan.recurringEnabled && (
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                    Recurring {plan.recurringMonths ? `(${plan.recurringMonths} mo)` : '(Lifetime)'}
                  </span>
                )}
                {plan.multiItemBonusEnabled && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                    Multi-item:{' '}
                    {plan.multiItemBonusType === 'FLAT' && plan.multiItemBonusFlatCents != null
                      ? fmtUSD(plan.multiItemBonusFlatCents)
                      : plan.multiItemBonusPercentBps != null
                        ? fmtBps(plan.multiItemBonusPercentBps)
                        : '—'}
                  </span>
                )}
                {plan.clawbackEnabled && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                    Clawback
                  </span>
                )}
                {plan.volumeTierEnabled && (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                    Volume tiers (
                    {plan.volumeTierWindow === 'REPORT_PERIOD' ? 'Report window' : 'Mon-Sun'})
                  </span>
                )}
                {plan.holdDays > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                    {plan.holdDays}d hold
                  </span>
                )}
              </div>

              {plan.volumeTierEnabled && plan.volumeTiers?.length > 0 && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  {[...plan.volumeTiers]
                    .sort((a, b) => a.minSales - b.minSales)
                    .slice(0, 3)
                    .map((tier, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span>
                          {tier.maxSales == null
                            ? `${tier.minSales}+ sales`
                            : `${tier.minSales}-${tier.maxSales} sales`}
                        </span>
                        <span className="font-semibold">{fmtUSD(tier.amountCents)}/sale</span>
                      </div>
                    ))}
                  {plan.volumeTierRetroactive && (
                    <p className="mt-1 text-[11px] text-emerald-700">
                      Retroactive to first sale in period
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400">
                  {plan.assignmentCount} rep{plan.assignmentCount === 1 ? '' : 's'} assigned
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(plan)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(plan.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-featured Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editPlan ? 'Edit Plan' : 'New Commission Plan'}
              </h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard 10%"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Type *</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, planType: 'FLAT' }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${form.planType === 'FLAT' ? 'bg-[var(--brand-primary)]/5 border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-gray-200 text-gray-600'}`}
                  >
                    <DollarSign className="mb-1 inline h-4 w-4" /> Flat Amount
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, planType: 'PERCENT' }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${form.planType === 'PERCENT' ? 'bg-[var(--brand-primary)]/5 border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-gray-200 text-gray-600'}`}
                  >
                    <Percent className="mb-1 inline h-4 w-4" /> Percentage
                  </button>
                </div>
              </div>

              {!form.useSeparateRates && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {form.planType === 'PERCENT' ? 'Percentage (%)' : 'Amount per sale ($)'} *
                  </label>
                  {form.planType === 'PERCENT' ? (
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.percentBps / 100}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            percentBps: Math.round(parseFloat(e.target.value || '0') * 100),
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        %
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        $
                      </span>
                      <input
                        type="number"
                        required
                        min={0}
                        step={0.01}
                        value={form.flatAmountCents / 100}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            flatAmountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Separate initial/recurring rates */}
              <div className="rounded-lg border border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.useSeparateRates}
                    onChange={(e) => setForm((f) => ({ ...f, useSeparateRates: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-gray-700">
                    Use separate rates for initial &amp; recurring
                  </span>
                </label>
                {form.useSeparateRates && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-[var(--brand-primary)]">
                        Initial {form.planType === 'PERCENT' ? '%' : 'Amount'}
                      </label>
                      <div className="relative mt-1">
                        {form.planType === 'PERCENT' ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={form.initialPercentBps / 100}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                initialPercentBps: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8"
                          />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={form.initialFlatAmountCents / 100}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                initialFlatAmountCents: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-700">
                        Recurring {form.planType === 'PERCENT' ? '%' : 'Amount'}
                      </label>
                      <div className="relative mt-1">
                        {form.planType === 'PERCENT' ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={form.recurringPercentBps / 100}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                recurringPercentBps: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8"
                          />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={form.recurringFlatAmountCents / 100}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                recurringFlatAmountCents: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Applies To</label>
                <select
                  value={form.appliesTo}
                  onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="FIRST_PAYMENT_ONLY">First Payment Only</option>
                  <option value="ALL_PAYMENTS">All Payments</option>
                </select>
              </div>

              {/* Recurring commissions */}
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.recurringEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, recurringEnabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-gray-700">Enable recurring commissions</span>
                </label>
                {form.recurringEnabled && (
                  <div className="ml-7">
                    <label className="block text-sm font-medium text-gray-700">
                      Recurring duration
                    </label>
                    <select
                      value={
                        form.recurringMonths === null ? 'lifetime' : String(form.recurringMonths)
                      }
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          recurringMonths:
                            e.target.value === 'lifetime' ? null : parseInt(e.target.value, 10),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="lifetime">Lifetime</option>
                      <option value="3">3 months</option>
                      <option value="6">6 months</option>
                      <option value="12">12 months</option>
                      <option value="24">24 months</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Product/package commission rules */}
              <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Package className="h-4 w-4" />
                  Custom commission per product or package
                </h3>
                <p className="mt-1 text-xs text-emerald-700">
                  Add lines below to pay an extra % or $ when specific products or packages are
                  sold.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-emerald-200 text-left text-emerald-800">
                        <th className="pb-2 font-medium">Product / Package</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Value</th>
                        <th className="w-10 pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {productRuleLines.map((line, idx) => (
                        <tr key={idx} className="border-b border-emerald-100">
                          <td className="py-2">
                            <select
                              value={
                                line.productId !== ''
                                  ? `p-${line.productId}`
                                  : line.productBundleId !== ''
                                    ? `b-${line.productBundleId}`
                                    : ''
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                setProductRuleLines((prev) =>
                                  prev.map((l, i) =>
                                    i !== idx
                                      ? l
                                      : v === ''
                                        ? { ...l, productId: '', productBundleId: '' }
                                        : v.startsWith('p-')
                                          ? {
                                              ...l,
                                              productId: Number(v.slice(2)),
                                              productBundleId: '' as const,
                                            }
                                          : {
                                              ...l,
                                              productId: '' as const,
                                              productBundleId: Number(v.slice(2)),
                                            }
                                  )
                                );
                              }}
                              className="w-full max-w-[200px] rounded border border-emerald-300 bg-white px-2 py-1.5 text-gray-900"
                            >
                              <option value="">Select product or package</option>
                              <optgroup label="Products">
                                {products.map((p) => (
                                  <option key={p.id} value={`p-${p.id}`}>
                                    {p.name}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Packages">
                                {bundles.map((b) => (
                                  <option key={b.id} value={`b-${b.id}`}>
                                    {b.name}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </td>
                          <td className="py-2">
                            <select
                              value={line.bonusType}
                              onChange={(e) =>
                                setProductRuleLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, bonusType: e.target.value as 'PERCENT' | 'FLAT' }
                                      : l
                                  )
                                )
                              }
                              className="rounded border border-emerald-300 bg-white px-2 py-1.5"
                            >
                              <option value="PERCENT">%</option>
                              <option value="FLAT">$</option>
                            </select>
                          </td>
                          <td className="py-2">
                            {line.bonusType === 'PERCENT' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.1}
                                  value={line.percentBps / 100}
                                  onChange={(e) =>
                                    setProductRuleLines((prev) =>
                                      prev.map((l, i) =>
                                        i === idx
                                          ? {
                                              ...l,
                                              percentBps: Math.round(
                                                parseFloat(e.target.value || '0') * 100
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-16 rounded border border-emerald-300 px-2 py-1"
                                />
                                <span className="text-gray-500">%</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-500">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={line.flatAmountCents / 100}
                                  onChange={(e) =>
                                    setProductRuleLines((prev) =>
                                      prev.map((l, i) =>
                                        i === idx
                                          ? {
                                              ...l,
                                              flatAmountCents: Math.round(
                                                parseFloat(e.target.value || '0') * 100
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-20 rounded border border-emerald-300 px-2 py-1"
                                />
                              </div>
                            )}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setProductRuleLines((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setProductRuleLines((prev) => [
                      ...prev,
                      {
                        productId: '',
                        productBundleId: '',
                        bonusType: 'PERCENT',
                        percentBps: 500,
                        flatAmountCents: 0,
                      },
                    ])
                  }
                  className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-400 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <Plus className="h-4 w-4" />
                  Add line
                </button>
              </div>

              {/* Volume tiers */}
              <div className="rounded-lg border-2 border-teal-300 bg-teal-50 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.volumeTierEnabled}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, volumeTierEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm font-semibold text-teal-900">
                    Weekly sales volume tiers
                  </span>
                </label>
                <p className="ml-7 mt-1 text-xs text-teal-700">
                  Set per-sale flat rates by total sales count in a 7-day period, or use clinic
                  Admin commission plans for weekly revenue % tiers.
                </p>
                {editPlan?.volumeTierBasis === 'WEEKLY_REVENUE_CENTS' && (
                  <p className="ml-7 mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    This plan uses <strong>weekly initial-sale revenue</strong> tiers. Tier rows are
                    preserved when you save from here; edit brackets in{' '}
                    <strong>Admin → Sales Rep → Commission Plans</strong> for full control.
                  </p>
                )}
                {form.volumeTierEnabled && (
                  <div className="ml-7 mt-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-teal-900">
                        Period basis
                      </label>
                      <select
                        value={form.volumeTierWindow}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            volumeTierWindow: e.target.value as
                              | 'CALENDAR_WEEK_MON_SUN'
                              | 'REPORT_PERIOD',
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-teal-300 bg-white px-3 py-2 text-gray-900"
                      >
                        <option value="CALENDAR_WEEK_MON_SUN">Calendar week (Monday-Sunday)</option>
                        <option value="REPORT_PERIOD">Custom report payout period</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.volumeTierRetroactive}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, volumeTierRetroactive: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-teal-900">
                        Retroactive to first sale in period
                      </span>
                    </label>
                    {editPlan?.volumeTierBasis === 'WEEKLY_REVENUE_CENTS' ? (
                      <p className="text-xs text-teal-800">
                        Tier table hidden — revenue brackets unchanged unless edited in clinic
                        admin.
                      </p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-teal-200 text-left text-teal-900">
                                <th className="pb-2 font-medium">Min sales</th>
                                <th className="pb-2 font-medium">Max sales</th>
                                <th className="pb-2 font-medium">Rate per sale ($)</th>
                                <th className="w-10 pb-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {form.volumeTiers.map((tier, idx) => (
                                <tr key={idx} className="border-b border-teal-100">
                                  <td className="py-2">
                                    <input
                                      type="number"
                                      min={1}
                                      value={tier.minSales}
                                      onChange={(e) =>
                                        setForm((f) => ({
                                          ...f,
                                          volumeTiers: f.volumeTiers.map((r, i) =>
                                            i === idx
                                              ? {
                                                  ...r,
                                                  minSales: Math.max(
                                                    1,
                                                    parseInt(e.target.value, 10) || 1
                                                  ),
                                                }
                                              : r
                                          ),
                                        }))
                                      }
                                      className="w-20 rounded border border-teal-300 px-2 py-1"
                                    />
                                  </td>
                                  <td className="py-2">
                                    <input
                                      type="number"
                                      min={tier.minSales}
                                      placeholder="+"
                                      value={tier.maxSales ?? ''}
                                      onChange={(e) =>
                                        setForm((f) => ({
                                          ...f,
                                          volumeTiers: f.volumeTiers.map((r, i) =>
                                            i === idx
                                              ? {
                                                  ...r,
                                                  maxSales:
                                                    e.target.value === ''
                                                      ? null
                                                      : Math.max(
                                                          r.minSales,
                                                          parseInt(e.target.value, 10) || r.minSales
                                                        ),
                                                }
                                              : r
                                          ),
                                        }))
                                      }
                                      className="w-20 rounded border border-teal-300 px-2 py-1"
                                    />
                                  </td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-1">
                                      <span className="text-gray-500">$</span>
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={tier.amountCents / 100}
                                        onChange={(e) =>
                                          setForm((f) => ({
                                            ...f,
                                            volumeTiers: f.volumeTiers.map((r, i) =>
                                              i === idx
                                                ? {
                                                    ...r,
                                                    amountCents: Math.round(
                                                      parseFloat(e.target.value || '0') * 100
                                                    ),
                                                  }
                                                : r
                                            ),
                                          }))
                                        }
                                        className="w-24 rounded border border-teal-300 px-2 py-1"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setForm((f) => ({
                                          ...f,
                                          volumeTiers: f.volumeTiers.filter((_, i) => i !== idx),
                                        }))
                                      }
                                      disabled={form.volumeTiers.length <= 1}
                                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              volumeTiers: [
                                ...f.volumeTiers,
                                {
                                  minSales: Math.max(
                                    1,
                                    (f.volumeTiers[f.volumeTiers.length - 1]?.maxSales ??
                                      f.volumeTiers[f.volumeTiers.length - 1]?.minSales ??
                                      1) + 1
                                  ),
                                  maxSales: null,
                                  amountCents: 0,
                                },
                              ],
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded border border-teal-400 bg-white px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50"
                        >
                          <Plus className="h-4 w-4" />
                          Add tier
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-item bonus */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.multiItemBonusEnabled}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, multiItemBonusEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-amber-800">
                    Add bonus when sale has multiple items
                  </span>
                </label>
                <p className="ml-7 mt-1 text-xs text-amber-700">
                  Extra commission (% or $) when the sale contains 2+ items.
                </p>
                {form.multiItemBonusEnabled && (
                  <div className="ml-7 mt-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-amber-800">Bonus type</label>
                      <select
                        value={form.multiItemBonusType}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            multiItemBonusType: e.target.value as 'PERCENT' | 'FLAT',
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-gray-900"
                      >
                        <option value="PERCENT">Percentage</option>
                        <option value="FLAT">Flat amount ($)</option>
                      </select>
                    </div>
                    {form.multiItemBonusType === 'PERCENT' ? (
                      <div>
                        <label className="block text-sm font-medium text-amber-800">
                          Extra percentage
                        </label>
                        <div className="relative mt-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={form.multiItemBonusPercentBps / 100}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                multiItemBonusPercentBps: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white py-2 pl-3 pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            %
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-amber-800">
                          Extra amount ($)
                        </label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                            $
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={form.multiItemBonusFlatCents / 100}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                multiItemBonusFlatCents: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white py-2 pl-7 pr-3"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-amber-800">
                        Minimum items to trigger bonus
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={99}
                        value={form.multiItemMinQuantity}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            multiItemMinQuantity: Math.max(2, parseInt(e.target.value, 10) || 2),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2"
                      />
                      <p className="mt-0.5 text-xs text-amber-600">
                        Apply when sale has this many items or more (default 2).
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Hold Days</label>
                  <input
                    type="number"
                    min="0"
                    max={90}
                    value={form.holdDays}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, holdDays: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.clawbackEnabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, clawbackEnabled: e.target.checked }))
                      }
                      className="rounded"
                    />
                    Clawback on refund
                  </label>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {editPlan ? 'Update' : 'Create'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-gray-900">Delete plan?</h2>
            <p className="mb-4 text-sm text-gray-600">
              This will remove this commission plan. Reps assigned to it will need to be reassigned.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
