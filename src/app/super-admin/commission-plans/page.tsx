'use client';

import { useEffect, useState } from 'react';
import {
  DollarSign,
  Plus,
  Building2,
  ChevronDown,
  Percent,
  Edit2,
  Trash2,
  Users,
  Clock,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface Clinic {
  id: number;
  name: string;
  subdomain: string | null;
}

interface CommissionPlan {
  id: number;
  name: string;
  description: string | null;
  planType: 'FLAT' | 'PERCENT';
  flatAmountCents: number | null;
  percentBps: number | null;
  appliesTo: string;
  holdDays: number;
  clawbackEnabled: boolean;
  isActive: boolean;
  createdAt: string;
  clinicId: number;
  clinic?: {
    id: number;
    name: string;
    subdomain: string | null;
  };
  assignmentCount?: number;
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

const appliesToLabels: Record<string, string> = {
  FIRST_PAYMENT_ONLY: 'First Payment Only',
  ALL_PAYMENTS: 'All Payments',
  SUBSCRIPTION_LIFETIME: 'Subscription Lifetime',
};

export default function SuperAdminCommissionPlansPage() {
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<number | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommissionPlan | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    clinicId: '',
    name: '',
    description: '',
    planType: 'PERCENT' as 'FLAT' | 'PERCENT',
    flatAmountCents: '',
    percentBps: '',
    appliesTo: 'FIRST_PAYMENT_ONLY',
    holdDays: '0',
    clawbackEnabled: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('auth-token');
    setError(null);

    try {
      // Fetch clinics first
      const clinicsRes = await apiFetch('/api/super-admin/clinics');

      if (clinicsRes.ok) {
        const clinicsData = await clinicsRes.json();
        setClinics(clinicsData.clinics || []);
      }

      // Fetch all commission plans across all clinics
      const plansRes = await apiFetch('/api/super-admin/commission-plans');

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans || []);
      } else {
        const data = await plansRes.json();
        if (data.error?.includes('not found') || data.details?.includes('migration')) {
          setError('Database tables not found. Please run migrations first.');
        } else {
          setError(data.error || 'Failed to load commission plans');
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      clinicId: '',
      name: '',
      description: '',
      planType: 'PERCENT',
      flatAmountCents: '',
      percentBps: '',
      appliesTo: 'FIRST_PAYMENT_ONLY',
      holdDays: '0',
      clawbackEnabled: false,
    });
    setFormError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setEditingPlan(null);
    setShowCreateModal(true);
  };

  const openEditModal = (plan: CommissionPlan) => {
    setFormData({
      clinicId: plan.clinicId.toString(),
      name: plan.name,
      description: plan.description || '',
      planType: plan.planType,
      flatAmountCents: plan.flatAmountCents ? (plan.flatAmountCents / 100).toString() : '',
      percentBps: plan.percentBps ? (plan.percentBps / 100).toString() : '',
      appliesTo: plan.appliesTo,
      holdDays: plan.holdDays.toString(),
      clawbackEnabled: plan.clawbackEnabled,
    });
    setEditingPlan(plan);
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const token = localStorage.getItem('auth-token');

    try {
      const payload = {
        clinicId: parseInt(formData.clinicId),
        name: formData.name,
        description: formData.description || null,
        planType: formData.planType,
        flatAmountCents:
          formData.planType === 'FLAT'
            ? Math.round(parseFloat(formData.flatAmountCents) * 100)
            : null,
        percentBps:
          formData.planType === 'PERCENT'
            ? Math.round(parseFloat(formData.percentBps) * 100)
            : null,
        appliesTo: formData.appliesTo,
        holdDays: parseInt(formData.holdDays) || 0,
        clawbackEnabled: formData.clawbackEnabled,
      };

      const url = editingPlan
        ? `/api/super-admin/commission-plans/${editingPlan.id}`
        : '/api/super-admin/commission-plans';

      const response = await fetch(url, {
        method: editingPlan ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save plan');
      }

      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (planId: number) => {
    const token = localStorage.getItem('auth-token');

    try {
      const response = await apiFetch(`/api/super-admin/commission-plans/${planId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }

      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const togglePlanStatus = async (plan: CommissionPlan) => {
    const token = localStorage.getItem('auth-token');

    try {
      const response = await apiFetch(`/api/super-admin/commission-plans/${plan.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !plan.isActive }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update plan');
      }

      fetchData();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  // Filter plans
  const filteredPlans = plans.filter((p) => {
    const matchesSearch =
      normalizedIncludes(p.name, searchQuery) ||
      (p.description && normalizedIncludes(p.description, searchQuery));
    const matchesClinic = selectedClinic === 'all' || p.clinicId === selectedClinic;
    return matchesSearch && matchesClinic;
  });

  // Stats
  const activePlans = plans.filter((p) => p.isActive).length;
  const totalAssignments = plans.reduce((sum, p) => sum + (p.assignmentCount || 0), 0);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission Plans</h1>
          <p className="text-gray-500">Manage affiliate commission structures across all clinics</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 font-medium text-white hover:bg-[#3d8a66]"
        >
          <Plus className="h-5 w-5" />
          Create Plan
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="font-medium text-red-800">{error}</p>
            <p className="mt-1 text-sm text-red-600">
              Run <code className="rounded bg-red-100 px-1">npx prisma migrate deploy</code> to
              create the required tables.
            </p>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{plans.length}</p>
              <p className="text-sm text-gray-500">Total Plans</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activePlans}</p>
              <p className="text-sm text-gray-500">Active Plans</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalAssignments}</p>
              <p className="text-sm text-gray-500">Affiliates Assigned</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2 text-orange-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{clinics.length}</p>
              <p className="text-sm text-gray-500">Clinics</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search plans..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-4 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <select
            value={selectedClinic}
            onChange={(e) =>
              setSelectedClinic(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
            }
            className="appearance-none rounded-lg border border-gray-200 py-2 pl-10 pr-10 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          >
            <option value="all">All Clinics</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPlans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border-2 bg-white p-5 shadow-sm transition-colors ${
              plan.isActive ? 'border-transparent' : 'border-gray-200 opacity-60'
            }`}
          >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                  {!plan.isActive && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      Inactive
                    </span>
                  )}
                </div>
                {plan.clinic && <p className="mt-0.5 text-xs text-gray-500">{plan.clinic.name}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(plan)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(plan.id)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Commission Rate */}
            <div className="mb-3 rounded-lg bg-gradient-to-r from-[#4fa77e]/5 to-[#4fa77e]/5 p-4">
              <div className="flex items-center gap-2">
                {plan.planType === 'PERCENT' ? (
                  <>
                    <Percent className="h-5 w-5 text-[#4fa77e]" />
                    <span className="text-2xl font-bold text-[#3d8a66]">
                      {plan.percentBps ? formatPercent(plan.percentBps) : 'N/A'}
                    </span>
                  </>
                ) : (
                  <>
                    <DollarSign className="h-5 w-5 text-[#4fa77e]" />
                    <span className="text-2xl font-bold text-[#3d8a66]">
                      {plan.flatAmountCents ? formatCurrency(plan.flatAmountCents) : 'N/A'}
                    </span>
                  </>
                )}
                <span className="ml-1 text-sm text-gray-500">
                  {plan.planType === 'PERCENT' ? 'of sale' : 'per conversion'}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Applies to</span>
                <span className="font-medium text-gray-700">
                  {appliesToLabels[plan.appliesTo] || plan.appliesTo}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-gray-500">
                  <Clock className="h-3.5 w-3.5" /> Hold period
                </span>
                <span className="font-medium text-gray-700">
                  {plan.holdDays === 0 ? 'Immediate' : `${plan.holdDays} days`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-gray-500">
                  <RotateCcw className="h-3.5 w-3.5" /> Clawback
                </span>
                <span
                  className={`font-medium ${plan.clawbackEnabled ? 'text-orange-600' : 'text-gray-400'}`}
                >
                  {plan.clawbackEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {plan.assignmentCount !== undefined && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                  <span className="flex items-center gap-1 text-gray-500">
                    <Users className="h-3.5 w-3.5" /> Affiliates
                  </span>
                  <span className="font-medium text-gray-700">{plan.assignmentCount}</span>
                </div>
              )}
            </div>

            {/* Toggle Active Status */}
            <div className="mt-4 border-t border-gray-100 pt-3">
              <button
                onClick={() => togglePlanStatus(plan)}
                className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                  plan.isActive
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                {plan.isActive ? 'Deactivate Plan' : 'Activate Plan'}
              </button>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {filteredPlans.length === 0 && !error && (
          <div className="col-span-full py-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No commission plans found</p>
            <button
              onClick={openCreateModal}
              className="mt-4 font-medium text-[#4fa77e] hover:text-[#3d8a66]"
            >
              Create your first plan
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingPlan ? 'Edit Commission Plan' : 'Create Commission Plan'}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Clinic */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Clinic *</label>
                <select
                  required
                  value={formData.clinicId}
                  onChange={(e) => setFormData((f) => ({ ...f, clinicId: e.target.value }))}
                  disabled={!!editingPlan}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e] disabled:bg-gray-100"
                >
                  <option value="">Select a clinic...</option>
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Standard 10%, VIP Partner"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description of this plan..."
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              {/* Plan Type */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Commission Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((f) => ({ ...f, planType: 'PERCENT' }))}
                    className={`relative rounded-lg border-2 p-3 transition-colors ${
                      formData.planType === 'PERCENT'
                        ? 'border-[#4fa77e] bg-[#4fa77e]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formData.planType === 'PERCENT' && (
                      <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#4fa77e]">
                        <CheckCircle className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <Percent
                      className={`mx-auto mb-1 h-5 w-5 ${formData.planType === 'PERCENT' ? 'text-[#4fa77e]' : 'text-gray-400'}`}
                    />
                    <p
                      className={`text-sm font-medium ${formData.planType === 'PERCENT' ? 'text-[#3d8a66]' : 'text-gray-600'}`}
                    >
                      Percentage
                    </p>
                    <p className="text-xs text-gray-500">% of sale value</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((f) => ({ ...f, planType: 'FLAT' }))}
                    className={`relative rounded-lg border-2 p-3 transition-colors ${
                      formData.planType === 'FLAT'
                        ? 'border-[#4fa77e] bg-[#4fa77e]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formData.planType === 'FLAT' && (
                      <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#4fa77e]">
                        <CheckCircle className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <DollarSign
                      className={`mx-auto mb-1 h-5 w-5 ${formData.planType === 'FLAT' ? 'text-[#4fa77e]' : 'text-gray-400'}`}
                    />
                    <p
                      className={`text-sm font-medium ${formData.planType === 'FLAT' ? 'text-[#3d8a66]' : 'text-gray-600'}`}
                    >
                      Flat Rate
                    </p>
                    <p className="text-xs text-gray-500">Fixed $ per conversion</p>
                  </button>
                </div>
              </div>

              {/* Commission Amount */}
              {formData.planType === 'PERCENT' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Commission Percentage *
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      required
                      step="0.1"
                      min="0"
                      max="100"
                      value={formData.percentBps}
                      onChange={(e) => setFormData((f) => ({ ...f, percentBps: e.target.value }))}
                      placeholder="10"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      %
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Enter the percentage (e.g., 10 for 10%)
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Commission Amount *
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.flatAmountCents}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, flatAmountCents: e.target.value }))
                      }
                      placeholder="50.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pl-7 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Fixed amount per conversion in USD</p>
                </div>
              )}

              {/* Applies To */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Applies To *</label>
                <select
                  value={formData.appliesTo}
                  onChange={(e) => setFormData((f) => ({ ...f, appliesTo: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                >
                  <option value="FIRST_PAYMENT_ONLY">First Payment Only</option>
                  <option value="ALL_PAYMENTS">All Payments</option>
                  <option value="SUBSCRIPTION_LIFETIME">Subscription Lifetime</option>
                </select>
              </div>

              {/* Hold Days */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Hold Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.holdDays}
                  onChange={(e) => setFormData((f) => ({ ...f, holdDays: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Days before commission is approved (0 = immediate)
                </p>
              </div>

              {/* Clawback */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="clawback"
                  checked={formData.clawbackEnabled}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, clawbackEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
                />
                <label htmlFor="clawback" className="text-sm text-gray-700">
                  Enable clawback (reverse commissions on refunds/chargebacks)
                </label>
              </div>

              {/* Error */}
              {formError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Plan?</h3>
              <p className="mt-2 text-sm text-gray-500">
                This will permanently delete this commission plan. Affiliates using this plan will
                need to be reassigned.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
