'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  DollarSign,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  RefreshCw,
  Info,
  Settings2,
  Package,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface CommissionPlan {
  id: number;
  name: string;
  description: string | null;
  planType: 'FLAT' | 'PERCENT';
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
}

interface PlanFormData {
  name: string;
  description: string;
  planType: 'FLAT' | 'PERCENT';
  flatAmountCents: number;
  percentBps: number;
  useSeperateRates: boolean;
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
}

interface ProductRuleLine {
  productId: number | '';
  productBundleId: number | '';
  bonusType: 'PERCENT' | 'FLAT';
  percentBps: number;
  flatAmountCents: number;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

const defaultFormData: PlanFormData = {
  name: '',
  description: '',
  planType: 'PERCENT',
  flatAmountCents: 0,
  percentBps: 1000,
  useSeperateRates: false,
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
};

const API_BASE = '/api/admin/sales-rep/commission-plans';

export default function SalesRepCommissionPlansPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommissionPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [productRuleLines, setProductRuleLines] = useState<ProductRuleLine[]>([]);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [bundles, setBundles] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) fetchPlans();
  }, [mounted]);

  // Open edit modal when ?edit=<planId> is present
  useEffect(() => {
    if (!mounted || loading) return;
    const editId = searchParams.get('edit');
    if (!editId) return;
    const planId = parseInt(editId, 10);
    if (isNaN(planId)) return;
    const plan = plans.find((p) => p.id === planId);
    if (plan) handleOpenEditModal(plan);
  }, [mounted, loading, searchParams, plans]);

  const fetchPlans = async () => {
    try {
      const response = await apiFetch(API_BASE);
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch sales rep commission plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsAndBundles = async () => {
    try {
      const [pRes, bRes] = await Promise.all([
        apiFetch('/api/products?activeOnly=true'),
        apiFetch('/api/bundles?activeOnly=true'),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(d.products?.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })) ?? []);
      }
      if (bRes.ok) {
        const d = await bRes.json();
        setBundles(d.bundles?.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })) ?? []);
      }
    } catch {
      // ignore
    }
  };

  const handleOpenCreateModal = async () => {
    setEditingPlan(null);
    setFormData(defaultFormData);
    setProductRuleLines([
      { productId: '', productBundleId: '', bonusType: 'PERCENT', percentBps: 500, flatAmountCents: 0 },
    ]);
    setError(null);
    await fetchProductsAndBundles();
    setShowModal(true);
  };

  const handleOpenEditModal = async (plan: CommissionPlan) => {
    setEditingPlan(plan);
    const useSeperateRates = !!(
      plan.initialPercentBps !== null ||
      plan.initialFlatAmountCents !== null ||
      plan.recurringPercentBps !== null ||
      plan.recurringFlatAmountCents !== null
    );
    const multiItemEnabled = plan.multiItemBonusEnabled === true;
    setFormData({
      name: plan.name,
      description: plan.description || '',
      planType: plan.planType,
      flatAmountCents: plan.flatAmountCents || 0,
      percentBps: plan.percentBps || 1000,
      useSeperateRates,
      initialPercentBps: plan.initialPercentBps || plan.percentBps || 1000,
      initialFlatAmountCents: plan.initialFlatAmountCents || plan.flatAmountCents || 0,
      recurringPercentBps: plan.recurringPercentBps || plan.percentBps || 500,
      recurringFlatAmountCents: plan.recurringFlatAmountCents || plan.flatAmountCents || 0,
      appliesTo: plan.appliesTo,
      holdDays: plan.holdDays,
      clawbackEnabled: plan.clawbackEnabled,
      recurringEnabled: plan.recurringEnabled,
      recurringMonths: plan.recurringMonths,
      multiItemBonusEnabled: multiItemEnabled,
      multiItemBonusType: (plan.multiItemBonusType === 'FLAT' ? 'FLAT' : 'PERCENT') as 'PERCENT' | 'FLAT',
      multiItemBonusPercentBps: plan.multiItemBonusPercentBps ?? 500,
      multiItemBonusFlatCents: plan.multiItemBonusFlatCents ?? 0,
      multiItemMinQuantity: plan.multiItemMinQuantity ?? 2,
    });
    setError(null);
    await fetchProductsAndBundles();
    try {
      const res = await apiFetch(`${API_BASE}/${plan.id}/product-rules`);
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
          { productId: '', productBundleId: '', bonusType: 'PERCENT', percentBps: 500, flatAmountCents: 0 },
        ]);
      }
    } catch {
      setProductRuleLines([
        { productId: '', productBundleId: '', bonusType: 'PERCENT', percentBps: 500, flatAmountCents: 0 },
      ]);
    }
    setShowModal(true);
  };

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      name: formData.name,
      description: formData.description || null,
      planType: formData.planType,
      appliesTo: formData.appliesTo,
      holdDays: formData.holdDays,
      clawbackEnabled: formData.clawbackEnabled,
      recurringEnabled: formData.recurringEnabled,
      recurringMonths: formData.recurringEnabled ? formData.recurringMonths : null,
      multiItemBonusEnabled: formData.multiItemBonusEnabled,
      multiItemMinQuantity: formData.multiItemBonusEnabled ? formData.multiItemMinQuantity : null,
    };
    if (formData.planType === 'PERCENT') {
      body.percentBps = formData.percentBps;
      body.flatAmountCents = null;
      if (formData.useSeperateRates) {
        body.initialPercentBps = formData.initialPercentBps;
        body.recurringPercentBps = formData.recurringPercentBps;
        body.initialFlatAmountCents = null;
        body.recurringFlatAmountCents = null;
      } else {
        body.initialPercentBps = null;
        body.recurringPercentBps = null;
        body.initialFlatAmountCents = null;
        body.recurringFlatAmountCents = null;
      }
    } else {
      body.flatAmountCents = formData.flatAmountCents;
      body.percentBps = null;
      if (formData.useSeperateRates) {
        body.initialFlatAmountCents = formData.initialFlatAmountCents;
        body.recurringFlatAmountCents = formData.recurringFlatAmountCents;
        body.initialPercentBps = null;
        body.recurringPercentBps = null;
      } else {
        body.initialPercentBps = null;
        body.recurringPercentBps = null;
        body.initialFlatAmountCents = null;
        body.recurringFlatAmountCents = null;
      }
    }
    if (formData.multiItemBonusEnabled) {
      body.multiItemBonusType = formData.multiItemBonusType;
      body.multiItemBonusPercentBps =
        formData.multiItemBonusType === 'PERCENT' ? formData.multiItemBonusPercentBps : null;
      body.multiItemBonusFlatCents =
        formData.multiItemBonusType === 'FLAT' ? formData.multiItemBonusFlatCents : null;
    } else {
      body.multiItemBonusType = null;
      body.multiItemBonusPercentBps = null;
      body.multiItemBonusFlatCents = null;
    }
    const validRules = productRuleLines.filter(
      (l) =>
        (l.productId !== '' || l.productBundleId !== '') &&
        (l.productId === '' || l.productBundleId === '') &&
        (l.bonusType === 'PERCENT' ? l.percentBps >= 0 && l.percentBps <= 10000 : l.flatAmountCents >= 0)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const url = editingPlan ? `${API_BASE}/${editingPlan.id}` : API_BASE;
      const method = editingPlan ? 'PATCH' : 'POST';
      const response = await apiFetch(url, {
        method,
        body: JSON.stringify(buildBody()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save plan');
      setShowModal(false);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (planId: number) => {
    setDeleting(true);
    try {
      const response = await apiFetch(`${API_BASE}/${planId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }
      setShowDeleteConfirm(null);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  // Avoid hydration mismatch: render same shell until mounted, then load data
  if (!mounted || loading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/admin/sales-reps"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Sales Reps
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Rep Commission Plans</h1>
            <p className="text-gray-500">
              Create and manage commission structures for sales rep employees
            </p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 font-medium text-white hover:brightness-90"
          >
            <Plus className="h-5 w-5" />
            New Plan
          </button>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">Separate initial &amp; recurring rates</p>
              <p className="mt-1">
                Set different commission rates for first payment vs recurring payments (e.g. 10%
                initial, 5% recurring).
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Multiple items in a sale</p>
              <p className="mt-1">
                Optionally add an extra percentage or flat amount when a sale has multiple items (e.g.
                2+ products). The bonus is applied on top of the base commission.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
              !plan.isActive ? 'opacity-60' : ''
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                {plan.description && (
                  <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  plan.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}
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
                        ? formatPercent(plan.initialPercentBps)
                        : plan.initialFlatAmountCents !== null
                          ? formatCurrency(plan.initialFlatAmountCents)
                          : plan.percentBps
                            ? formatPercent(plan.percentBps)
                            : plan.flatAmountCents
                              ? formatCurrency(plan.flatAmountCents)
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
                        ? formatPercent(plan.recurringPercentBps)
                        : plan.recurringFlatAmountCents !== null
                          ? formatCurrency(plan.recurringFlatAmountCents)
                          : plan.percentBps
                            ? formatPercent(plan.percentBps)
                            : plan.flatAmountCents
                              ? formatCurrency(plan.flatAmountCents)
                              : 'N/A'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2">
                  <span className="text-sm text-gray-600">Commission Rate</span>
                  <span className="font-semibold text-gray-800">
                    {plan.planType === 'PERCENT' && plan.percentBps
                      ? formatPercent(plan.percentBps)
                      : plan.flatAmountCents
                        ? formatCurrency(plan.flatAmountCents)
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
                  Multi-item: {plan.multiItemBonusType === 'FLAT' && plan.multiItemBonusFlatCents != null
                    ? formatCurrency(plan.multiItemBonusFlatCents)
                    : plan.multiItemBonusPercentBps != null
                      ? formatPercent(plan.multiItemBonusPercentBps)
                      : '—'}
                  {plan.multiItemMinQuantity != null && plan.multiItemMinQuantity > 2
                    ? ` (${plan.multiItemMinQuantity}+ items)`
                    : ' (2+ items)'}
                </span>
              )}
              {plan.clawbackEnabled && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Clawback</span>
              )}
              {plan.holdDays > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                  {plan.holdDays}d hold
                </span>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-400">
                {plan.assignmentCount} rep{plan.assignmentCount !== 1 ? 's' : ''} assigned
              </span>
              <div className="flex gap-2">
                <Link
                  href={`/admin/sales-rep/commission-plans/${plan.id}`}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Manage reps & product commissions"
                >
                  <Settings2 className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => handleOpenEditModal(plan)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(plan.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {plans.length === 0 && (
          <div className="col-span-full py-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No sales rep commission plans yet</p>
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 font-medium text-white hover:brightness-90"
            >
              <Plus className="h-5 w-5" />
              Create Your First Plan
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal - same structure as affiliate commission plans */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              {editingPlan ? 'Edit Commission Plan' : 'Create Commission Plan'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Standard 10%"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Commission Type *</label>
                <select
                  value={formData.planType}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, planType: e.target.value as 'FLAT' | 'PERCENT' }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  <option value="PERCENT">Percentage</option>
                  <option value="FLAT">Flat Amount</option>
                </select>
              </div>

              {!formData.useSeperateRates && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {formData.planType === 'PERCENT' ? 'Percentage' : 'Amount'} *
                  </label>
                  <div className="relative mt-1">
                    {formData.planType === 'PERCENT' ? (
                      <>
                        <input
                          type="number"
                          required
                          min={0}
                          max={100}
                          step={0.1}
                          value={formData.percentBps / 100}
                          onChange={(e) =>
                            setFormData((f) => ({
                              ...f,
                              percentBps: Math.round(parseFloat(e.target.value || '0') * 100),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                      </>
                    ) : (
                      <>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input
                          type="number"
                          required
                          min={0}
                          step={0.01}
                          value={formData.flatAmountCents / 100}
                          onChange={(e) =>
                            setFormData((f) => ({
                              ...f,
                              flatAmountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.useSeperateRates}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, useSeperateRates: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-gray-700">
                    Use separate rates for initial &amp; recurring
                  </span>
                </label>
                {formData.useSeperateRates && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-[var(--brand-primary)]">
                        Initial {formData.planType === 'PERCENT' ? '%' : 'Amount'}
                      </label>
                      <div className="relative mt-1">
                        {formData.planType === 'PERCENT' ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={formData.initialPercentBps / 100}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                initialPercentBps: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                          />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={formData.initialFlatAmountCents / 100}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                initialFlatAmountCents: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pl-7 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-700">
                        Recurring {formData.planType === 'PERCENT' ? '%' : 'Amount'}
                      </label>
                      <div className="relative mt-1">
                        {formData.planType === 'PERCENT' ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={formData.recurringPercentBps / 100}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                recurringPercentBps: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={formData.recurringFlatAmountCents / 100}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                recurringFlatAmountCents: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pl-7 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.recurringEnabled}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, recurringEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-gray-700">Enable recurring commissions</span>
                </label>
                {formData.recurringEnabled && (
                  <div className="ml-7">
                    <label className="block text-sm font-medium text-gray-700">
                      Recurring duration
                    </label>
                    <select
                      value={
                        formData.recurringMonths === null
                          ? 'lifetime'
                          : String(formData.recurringMonths)
                      }
                      onChange={(e) =>
                        setFormData((f) => ({
                          ...f,
                          recurringMonths:
                            e.target.value === 'lifetime' ? null : parseInt(e.target.value, 10),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
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

              <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Package className="h-4 w-4" />
                  Custom commission per product or package
                </h3>
                <p className="mt-1 text-xs text-emerald-700">
                  Add lines below to pay an extra % or $ when specific products or packages are sold on this plan.
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
                              value={line.productId !== '' ? `p-${line.productId}` : line.productBundleId !== '' ? `b-${line.productBundleId}` : ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '') {
                                  setProductRuleLines((prev) =>
                                    prev.map((l, i) => (i === idx ? { ...l, productId: '' as const, productBundleId: '' as const } : l))
                                  );
                                } else if (v.startsWith('p-')) {
                                  setProductRuleLines((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, productId: Number(v.slice(2)), productBundleId: '' as const } : l
                                    )
                                  );
                                } else {
                                  setProductRuleLines((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, productId: '' as const, productBundleId: Number(v.slice(2)) } : l
                                    )
                                  );
                                }
                              }}
                              className="w-full max-w-[200px] rounded border border-emerald-300 bg-white px-2 py-1.5 text-gray-900"
                            >
                              <option value="">— Select product or package —</option>
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
                                    i === idx ? { ...l, bonusType: e.target.value as 'PERCENT' | 'FLAT' } : l
                                  )
                                )
                              }
                              className="rounded border border-emerald-300 bg-white px-2 py-1.5 text-gray-900"
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
                                          ? { ...l, percentBps: Math.round(parseFloat(e.target.value || '0') * 100) }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-16 rounded border border-emerald-300 px-2 py-1 text-gray-900"
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
                                          ? { ...l, flatAmountCents: Math.round(parseFloat(e.target.value || '0') * 100) }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-20 rounded border border-emerald-300 px-2 py-1 text-gray-900"
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
                        productId: '' as const,
                        productBundleId: '' as const,
                        bonusType: 'PERCENT' as const,
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

              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.multiItemBonusEnabled}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, multiItemBonusEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-amber-800">
                    Add bonus when sale has multiple items
                  </span>
                </label>
                <p className="mt-1 ml-7 text-xs text-amber-700">
                  Extra commission (% or $) when the sale contains 2+ items (e.g. multi-product orders).
                </p>
                {formData.multiItemBonusEnabled && (
                  <div className="mt-4 ml-7 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-amber-800">Bonus type</label>
                      <select
                        value={formData.multiItemBonusType}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            multiItemBonusType: e.target.value as 'PERCENT' | 'FLAT',
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="PERCENT">Percentage</option>
                        <option value="FLAT">Flat amount ($)</option>
                      </select>
                    </div>
                    {formData.multiItemBonusType === 'PERCENT' ? (
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
                            value={formData.multiItemBonusPercentBps / 100}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                multiItemBonusPercentBps: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white py-2 pr-8 pl-3 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-amber-800">
                          Extra amount ($)
                        </label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={formData.multiItemBonusFlatCents / 100}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                multiItemBonusFlatCents: Math.round(
                                  parseFloat(e.target.value || '0') * 100
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white py-2 pl-7 pr-3 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                        value={formData.multiItemMinQuantity}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            multiItemMinQuantity: Math.max(2, parseInt(e.target.value, 10) || 2),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <p className="mt-0.5 text-xs text-amber-600">Apply when sale has this many items or more (default 2).</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Hold period (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={formData.holdDays}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, holdDays: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.clawbackEnabled}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, clawbackEnabled: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                    />
                    <span className="text-sm text-gray-700">Clawback on refunds</span>
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
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:brightness-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-gray-900">Delete plan?</h2>
            <p className="mb-4 text-sm text-gray-600">
              This will remove or deactivate this commission plan. Sales reps currently assigned to
              it will need to be reassigned to another plan.
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
