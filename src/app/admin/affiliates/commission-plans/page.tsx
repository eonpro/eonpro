'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  CheckCircle,
  XCircle,
  RefreshCw,
  Info,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface CommissionPlan {
  id: number;
  name: string;
  description: string | null;
  planType: 'FLAT' | 'PERCENT';
  flatAmountCents: number | null;
  percentBps: number | null;
  // New: Separate initial/recurring rates
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
}

interface PlanFormData {
  name: string;
  description: string;
  planType: 'FLAT' | 'PERCENT';
  // Default rates (used as fallback)
  flatAmountCents: number;
  percentBps: number;
  // Separate initial/recurring rates
  useSeperateRates: boolean;
  initialPercentBps: number;
  initialFlatAmountCents: number;
  recurringPercentBps: number;
  recurringFlatAmountCents: number;
  // Other settings
  appliesTo: string;
  holdDays: number;
  clawbackEnabled: boolean;
  recurringEnabled: boolean;
  recurringMonths: number | null;
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const defaultFormData: PlanFormData = {
  name: '',
  description: '',
  planType: 'PERCENT',
  flatAmountCents: 0,
  percentBps: 1000, // 10%
  useSeperateRates: false,
  initialPercentBps: 1000, // 10%
  initialFlatAmountCents: 0,
  recurringPercentBps: 500, // 5%
  recurringFlatAmountCents: 0,
  appliesTo: 'ALL_PAYMENTS',
  holdDays: 7,
  clawbackEnabled: true,
  recurringEnabled: true,
  recurringMonths: null,
};

export default function CommissionPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommissionPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await apiFetch('/api/admin/commission-plans');

      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingPlan(null);
    setFormData(defaultFormData);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (plan: CommissionPlan) => {
    setEditingPlan(plan);
    // Check if the plan uses separate initial/recurring rates
    const useSeperateRates = !!(
      plan.initialPercentBps !== null ||
      plan.initialFlatAmountCents !== null ||
      plan.recurringPercentBps !== null ||
      plan.recurringFlatAmountCents !== null
    );

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
    });
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Build the request body
      const body: Record<string, unknown> = {
        name: formData.name,
        description: formData.description || null,
        planType: formData.planType,
        appliesTo: formData.appliesTo,
        holdDays: formData.holdDays,
        clawbackEnabled: formData.clawbackEnabled,
        recurringEnabled: formData.recurringEnabled,
        recurringMonths: formData.recurringEnabled ? formData.recurringMonths : null,
      };

      // Set rates based on plan type and whether separate rates are used
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
        // FLAT
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

      const url = editingPlan
        ? `/api/admin/commission-plans/${editingPlan.id}`
        : '/api/admin/commission-plans';

      const method = editingPlan ? 'PATCH' : 'POST';

      const response = await apiFetch(url, {
        method,
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save plan');
      }

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
      const response = await apiFetch(`/api/admin/commission-plans/${planId}`, {
        method: 'DELETE',
      });

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

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => (window.location.href = '/admin/affiliates')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Affiliates
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commission Plans</h1>
            <p className="text-gray-500">Create and manage affiliate commission structures</p>
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

      {/* Info Banner */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">Separate Initial &amp; Recurring Rates</p>
            <p className="mt-1">
              You can now set different commission rates for initial/first payments vs recurring
              payments. For example: 10% on first payment, 5% on monthly recurring payments.
            </p>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
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

            {/* Commission Rates */}
            <div className="mb-4 space-y-2">
              {/* Check if plan has separate rates */}
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

            {/* Settings */}
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              {plan.recurringEnabled && (
                <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                  Recurring {plan.recurringMonths ? `(${plan.recurringMonths} mo)` : '(Lifetime)'}
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

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-400">
                {plan.assignmentCount} affiliate{plan.assignmentCount !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
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
            <p className="mt-2 text-gray-500">No commission plans yet</p>
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              {editingPlan ? 'Edit Commission Plan' : 'Create Commission Plan'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Standard 10% Plan"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              {/* Commission Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Commission Type *</label>
                <select
                  value={formData.planType}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, planType: e.target.value as 'FLAT' | 'PERCENT' }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  <option value="PERCENT">Percentage of Sale</option>
                  <option value="FLAT">Flat Amount</option>
                </select>
              </div>

              {/* Default Rate (used when separate rates not enabled) */}
              {!formData.useSeperateRates && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Commission {formData.planType === 'PERCENT' ? 'Percentage' : 'Amount'} *
                  </label>
                  <div className="relative mt-1">
                    {formData.planType === 'PERCENT' ? (
                      <>
                        <input
                          type="number"
                          required
                          min="0"
                          max="100"
                          step="0.1"
                          value={formData.percentBps / 100}
                          onChange={(e) =>
                            setFormData((f) => ({
                              ...f,
                              percentBps: Math.round(parseFloat(e.target.value || '0') * 100),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          %
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          $
                        </span>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
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

              {/* Separate Initial/Recurring Rates Toggle */}
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
                  <div>
                    <span className="font-medium text-gray-900">
                      Use separate rates for initial &amp; recurring
                    </span>
                    <p className="text-sm text-gray-500">
                      Set different commission rates for first payment vs recurring payments
                    </p>
                  </div>
                </label>

                {formData.useSeperateRates && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {/* Initial Payment Rate */}
                    <div>
                      <label className="block text-sm font-medium text-[var(--brand-primary)]">
                        Initial Payment {formData.planType === 'PERCENT' ? '%' : 'Amount'}
                      </label>
                      <div className="relative mt-1">
                        {formData.planType === 'PERCENT' ? (
                          <>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={formData.initialPercentBps / 100}
                              onChange={(e) =>
                                setFormData((f) => ({
                                  ...f,
                                  initialPercentBps: Math.round(
                                    parseFloat(e.target.value || '0') * 100
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-[var(--brand-primary)] bg-white px-3 py-2 pr-8 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                              %
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.initialFlatAmountCents / 100}
                              onChange={(e) =>
                                setFormData((f) => ({
                                  ...f,
                                  initialFlatAmountCents: Math.round(
                                    parseFloat(e.target.value || '0') * 100
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-[var(--brand-primary)] bg-white py-2 pl-7 pr-3 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                            />
                          </>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--brand-primary)]">First payment commission</p>
                    </div>

                    {/* Recurring Payment Rate */}
                    <div>
                      <label className="block text-sm font-medium text-blue-700">
                        Recurring {formData.planType === 'PERCENT' ? '%' : 'Amount'}
                      </label>
                      <div className="relative mt-1">
                        {formData.planType === 'PERCENT' ? (
                          <>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={formData.recurringPercentBps / 100}
                              onChange={(e) =>
                                setFormData((f) => ({
                                  ...f,
                                  recurringPercentBps: Math.round(
                                    parseFloat(e.target.value || '0') * 100
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 pr-8 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                              %
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.recurringFlatAmountCents / 100}
                              onChange={(e) =>
                                setFormData((f) => ({
                                  ...f,
                                  recurringFlatAmountCents: Math.round(
                                    parseFloat(e.target.value || '0') * 100
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-blue-300 bg-white py-2 pl-7 pr-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-blue-600">Monthly recurring commission</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Recurring Settings */}
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
                      Recurring Duration
                    </label>
                    <select
                      value={
                        formData.recurringMonths === null
                          ? 'lifetime'
                          : formData.recurringMonths.toString()
                      }
                      onChange={(e) =>
                        setFormData((f) => ({
                          ...f,
                          recurringMonths:
                            e.target.value === 'lifetime' ? null : parseInt(e.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    >
                      <option value="lifetime">Lifetime (no limit)</option>
                      <option value="3">3 months</option>
                      <option value="6">6 months</option>
                      <option value="12">12 months (1 year)</option>
                      <option value="24">24 months (2 years)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Other Settings */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Hold Period (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={formData.holdDays}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, holdDays: parseInt(e.target.value) || 0 }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                  <p className="mt-1 text-xs text-gray-500">Days before commission approved</p>
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
                    <span className="text-sm text-gray-700">Enable clawback on refunds</span>
                  </label>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {/* Actions */}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-gray-900">Delete Plan?</h2>
            <p className="mb-4 text-sm text-gray-600">
              This will permanently delete this commission plan. Affiliates currently using this
              plan will need to be reassigned.
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
