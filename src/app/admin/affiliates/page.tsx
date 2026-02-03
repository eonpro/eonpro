'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Link as LinkIcon,
  DollarSign,
  TrendingUp,
  Eye,
  Copy,
  Check,
  BarChart3,
  Target,
} from 'lucide-react';

interface Affiliate {
  id: number;
  displayName: string;
  status: string;
  createdAt: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    lastLogin: string | null;
    status: string;
  };
  refCodes: Array<{
    id: number;
    refCode: string;
    isActive: boolean;
  }>;
  currentPlan: {
    id: number;
    name: string;
    planType: string;
    flatAmountCents: number | null;
    percentBps: number | null;
    initialPercentBps?: number | null;
    initialFlatAmountCents?: number | null;
    recurringPercentBps?: number | null;
    recurringFlatAmountCents?: number | null;
  } | null;
  stats: {
    totalConversions: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
  };
}

interface CommissionPlan {
  id: number;
  name: string;
  planType: string;
  flatAmountCents: number | null;
  percentBps: number | null;
  // Separate initial/recurring rates
  initialPercentBps: number | null;
  initialFlatAmountCents: number | null;
  recurringPercentBps: number | null;
  recurringFlatAmountCents: number | null;
  recurringEnabled: boolean;
  isActive: boolean;
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

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    displayName: '',
    firstName: '',
    lastName: '',
    initialRefCode: '',
    commissionPlanId: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const [affiliatesRes, plansRes] = await Promise.all([
        fetch('/api/admin/affiliates', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/commission-plans', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (affiliatesRes.ok) {
        const data = await affiliatesRes.json();
        setAffiliates(data.affiliates);
      }

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans.filter((p: CommissionPlan) => p.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...createForm,
          commissionPlanId: createForm.commissionPlanId 
            ? parseInt(createForm.commissionPlanId) 
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create affiliate');
      }

      setShowCreateModal(false);
      setCreateForm({
        email: '',
        password: '',
        displayName: '',
        firstName: '',
        lastName: '',
        initialRefCode: '',
        commissionPlanId: '',
      });
      fetchData();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?ref=${code}`;
    
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (e) {
      console.error('Failed to copy');
    }
  };

  const filteredAffiliates = affiliates.filter(a => 
    a.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.refCodes.some(r => r.refCode.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliates</h1>
          <p className="text-gray-500">Manage your affiliate partners</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/admin/affiliates/reports"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="h-5 w-5" />
            Reports
          </a>
          <a
            href="/admin/affiliates/code-performance"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            <Target className="h-5 w-5" />
            Code Performance
          </a>
          <a
            href="/admin/affiliates/commission-plans"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            <DollarSign className="h-5 w-5" />
            Plans
          </a>
          <a
            href="/admin/affiliates/applications"
            className="inline-flex items-center gap-2 rounded-lg border border-violet-600 px-4 py-2 font-medium text-violet-600 hover:bg-violet-50"
          >
            <Users className="h-5 w-5" />
            Applications
          </a>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700"
          >
            <Plus className="h-5 w-5" />
            Add Affiliate
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliates.length}</p>
              <p className="text-sm text-gray-500">Total Affiliates</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {affiliates.reduce((sum, a) => sum + a.stats.totalConversions, 0)}
              </p>
              <p className="text-sm text-gray-500">Total Conversions</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(affiliates.reduce((sum, a) => sum + a.stats.totalCommissionCents, 0))}
              </p>
              <p className="text-sm text-gray-500">Total Commissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or ref code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Affiliates Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Affiliate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Ref Codes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Stats
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredAffiliates.map((affiliate) => (
              <tr key={affiliate.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{affiliate.displayName}</p>
                    <p className="text-sm text-gray-500">{affiliate.user.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {affiliate.refCodes.slice(0, 3).map((ref) => (
                      <button
                        key={ref.id}
                        onClick={() => handleCopyCode(ref.refCode)}
                        className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700 hover:bg-gray-200"
                      >
                        {ref.refCode}
                        {copiedCode === ref.refCode ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    ))}
                    {affiliate.refCodes.length > 3 && (
                      <span className="text-xs text-gray-400">
                        +{affiliate.refCodes.length - 3} more
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  {affiliate.currentPlan ? (
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {affiliate.currentPlan.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(() => {
                          const plan = affiliate.currentPlan!;
                          const hasSeperateRates = plan.initialPercentBps !== null || 
                            plan.initialFlatAmountCents !== null ||
                            plan.recurringPercentBps !== null ||
                            plan.recurringFlatAmountCents !== null;
                          
                          if (hasSeperateRates) {
                            const initialRate = plan.planType === 'PERCENT' 
                              ? formatPercent(plan.initialPercentBps ?? plan.percentBps ?? 0)
                              : formatCurrency(plan.initialFlatAmountCents ?? plan.flatAmountCents ?? 0);
                            const recurringRate = plan.planType === 'PERCENT'
                              ? formatPercent(plan.recurringPercentBps ?? plan.percentBps ?? 0)
                              : formatCurrency(plan.recurringFlatAmountCents ?? plan.flatAmountCents ?? 0);
                            return `${initialRate} / ${recurringRate}`;
                          }
                          
                          return plan.planType === 'PERCENT' && plan.percentBps
                            ? formatPercent(plan.percentBps)
                            : plan.flatAmountCents
                              ? formatCurrency(plan.flatAmountCents)
                              : 'N/A';
                        })()}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No plan</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm">
                    <p className="text-gray-900">
                      {affiliate.stats.totalConversions} conversions
                    </p>
                    <p className="text-gray-500">
                      {formatCurrency(affiliate.stats.totalCommissionCents)} earned
                    </p>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[affiliate.status] || 'bg-gray-100 text-gray-800'}`}>
                    {affiliate.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <a
                    href={`/admin/affiliates/${affiliate.id}`}
                    className="inline-flex rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Eye className="h-5 w-5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAffiliates.length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No affiliates found</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Create Affiliate</h2>
            
            <form onSubmit={handleCreateAffiliate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Password *</label>
                <input
                  type="password"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Display Name *</label>
                <input
                  type="text"
                  required
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Initial Ref Code</label>
                <input
                  type="text"
                  value={createForm.initialRefCode}
                  onChange={(e) => setCreateForm(f => ({ ...f, initialRefCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g., PARTNER_ABC"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Commission Plan</label>
                <select
                  value={createForm.commissionPlanId}
                  onChange={(e) => setCreateForm(f => ({ ...f, commissionPlanId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">Select a plan...</option>
                  {plans.map((plan) => {
                    // Check if plan has separate initial/recurring rates
                    const hasSeperateRates = plan.initialPercentBps !== null || 
                      plan.initialFlatAmountCents !== null ||
                      plan.recurringPercentBps !== null ||
                      plan.recurringFlatAmountCents !== null;
                    
                    let rateDisplay = '';
                    if (hasSeperateRates) {
                      const initialRate = plan.planType === 'PERCENT' 
                        ? formatPercent(plan.initialPercentBps ?? plan.percentBps ?? 0)
                        : formatCurrency(plan.initialFlatAmountCents ?? plan.flatAmountCents ?? 0);
                      const recurringRate = plan.planType === 'PERCENT'
                        ? formatPercent(plan.recurringPercentBps ?? plan.percentBps ?? 0)
                        : formatCurrency(plan.recurringFlatAmountCents ?? plan.flatAmountCents ?? 0);
                      rateDisplay = `${initialRate} initial / ${recurringRate} recurring`;
                    } else {
                      rateDisplay = plan.planType === 'PERCENT' && plan.percentBps
                        ? formatPercent(plan.percentBps)
                        : plan.flatAmountCents
                          ? formatCurrency(plan.flatAmountCents)
                          : 'N/A';
                    }
                    
                    return (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} ({rateDisplay})
                      </option>
                    );
                  })}
                </select>
              </div>

              {createError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}

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
                  disabled={creating}
                  className="flex-1 rounded-lg bg-violet-600 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
