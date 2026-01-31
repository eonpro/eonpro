'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Clock,
  Copy,
  Check,
  AlertCircle,
  Pencil,
  X,
  RefreshCw,
  Save,
  Link as LinkIcon,
} from 'lucide-react';

interface RefCode {
  id: number;
  refCode: string;
  isActive: boolean;
  createdAt: string;
}

interface CommissionPlan {
  id: number;
  name: string;
  planType: string;
  flatAmountCents: number | null;
  percentBps: number | null;
  initialPercentBps: number | null;
  initialFlatAmountCents: number | null;
  recurringPercentBps: number | null;
  recurringFlatAmountCents: number | null;
  recurringEnabled: boolean;
  isActive: boolean;
  clinicId: number;
}

interface PlanAssignment {
  id: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  commissionPlan: CommissionPlan;
}

interface Affiliate {
  id: number;
  displayName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  clinicId: number;
  clinic: {
    id: number;
    name: string;
    subdomain: string | null;
  };
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    lastLogin: string | null;
    status: string;
    phone: string | null;
  };
  refCodes: RefCode[];
  planAssignments: PlanAssignment[];
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

export default function SuperAdminAffiliateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const affiliateId = parseInt(params.id as string);

  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    status: '',
    firstName: '',
    lastName: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalConversions: 0,
    totalRevenueCents: 0,
    totalCommissionCents: 0,
    pendingCommissionCents: 0,
    paidCommissionCents: 0,
  });

  // Available plans for the clinic (for future use)
  const [, setAvailablePlans] = useState<CommissionPlan[]>([]);

  useEffect(() => {
    if (affiliateId) {
      fetchAffiliate();
    }
  }, [affiliateId]);

  const getAuthToken = () => {
    return localStorage.getItem('auth-token') ||
           localStorage.getItem('super_admin-token') ||
           localStorage.getItem('SUPER_ADMIN-token');
  };

  const fetchAffiliate = async () => {
    const token = getAuthToken();
    setError(null);

    try {
      const res = await fetch(`/api/super-admin/affiliates/${affiliateId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        setAffiliate(data.affiliate);
        setEditForm({
          displayName: data.affiliate.displayName || '',
          status: data.affiliate.status || 'ACTIVE',
          firstName: data.affiliate.user?.firstName || '',
          lastName: data.affiliate.user?.lastName || '',
          email: data.affiliate.user?.email || '',
        });

        // Calculate stats from plan assignments and events if available
        // For now, we'll fetch additional data
        fetchAffiliateStats();
        fetchAvailablePlans(data.affiliate.clinicId);
      } else {
        setError(data.error || 'Failed to load affiliate');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchAffiliateStats = async () => {
    const token = getAuthToken();
    
    try {
      // Try to fetch stats from the main affiliates endpoint
      const res = await fetch(`/api/super-admin/affiliates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const affiliateData = data.affiliates?.find((a: any) => a.id === affiliateId);
        if (affiliateData?.stats) {
          setStats({
            totalConversions: affiliateData.stats.totalConversions || 0,
            totalRevenueCents: affiliateData.stats.totalRevenueCents || 0,
            totalCommissionCents: affiliateData.stats.totalCommissionCents || 0,
            pendingCommissionCents: affiliateData.stats.pendingCommissionCents || 0,
            paidCommissionCents: affiliateData.stats.paidCommissionCents || 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchAvailablePlans = async (clinicId: number) => {
    const token = getAuthToken();
    
    try {
      const res = await fetch(`/api/super-admin/affiliates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const clinicPlans = (data.plans || []).filter(
          (p: CommissionPlan) => p.clinicId === clinicId && p.isActive
        );
        setAvailablePlans(clinicPlans);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/affiliates/${affiliateId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (res.ok) {
        setEditMode(false);
        setSuccessMessage('Affiliate updated successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
        fetchAffiliate();
      } else {
        setError(data.error || 'Failed to update affiliate');
      }
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
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

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  const getCurrentPlan = () => {
    if (!affiliate?.planAssignments?.length) return null;
    return affiliate.planAssignments.find(pa => !pa.effectiveTo)?.commissionPlan || null;
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  if (error && !affiliate) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Affiliate</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="text-red-600 hover:text-red-800 font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!affiliate) return null;

  const currentPlan = getCurrentPlan();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-1 p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {affiliate.displayName}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{affiliate.user.email}</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[affiliate.status] || 'bg-gray-100 text-gray-800'}`}>
              {affiliate.status}
            </span>
          </div>
        </div>
        <Link
          href="/super-admin/affiliates"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          View All Affiliates
        </Link>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalConversions}</p>
              <p className="text-sm text-gray-500">Conversions</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalRevenueCents)}</p>
              <p className="text-sm text-gray-500">Total Revenue</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalCommissionCents)}</p>
              <p className="text-sm text-gray-500">Total Earned</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {affiliate.user.lastLogin
                  ? new Date(affiliate.user.lastLogin).toLocaleDateString()
                  : 'Never'}
              </p>
              <p className="text-sm text-gray-500">Last Login</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Affiliate Information */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Affiliate Information</h2>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center gap-1 text-sm text-[#4fa77e] hover:text-[#3d8a66]"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              ) : (
                <button
                  onClick={() => {
                    setEditMode(false);
                    setEditForm({
                      displayName: affiliate.displayName || '',
                      status: affiliate.status || 'ACTIVE',
                      firstName: affiliate.user?.firstName || '',
                      lastName: affiliate.user?.lastName || '',
                      email: affiliate.user?.email || '',
                    });
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>

            {editMode ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Display Name</label>
                  <input
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input
                      type="text"
                      value={editForm.firstName}
                      onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      type="text"
                      value={editForm.lastName}
                      onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-gray-500">Display Name</dt>
                  <dd className="font-medium text-gray-900">{affiliate.displayName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Status</dt>
                  <dd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[affiliate.status] || 'bg-gray-100 text-gray-800'}`}>
                      {affiliate.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Name</dt>
                  <dd className="font-medium text-gray-900">
                    {affiliate.user.firstName} {affiliate.user.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="text-gray-900">{affiliate.user.email}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd className="text-gray-900">{affiliate.user.phone || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Created</dt>
                  <dd className="text-gray-900">{new Date(affiliate.createdAt).toLocaleDateString()}</dd>
                </div>
              </dl>
            )}
          </div>

          {/* Ref Codes */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Referral Codes</h2>
              <span className="text-sm text-gray-500">
                {affiliate.refCodes.filter(r => r.isActive).length} active
              </span>
            </div>

            {affiliate.refCodes.length > 0 ? (
              <div className="space-y-3">
                {affiliate.refCodes.map((ref) => (
                  <div
                    key={ref.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      ref.isActive ? 'bg-gray-50' : 'bg-gray-100 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <LinkIcon className={`h-5 w-5 ${ref.isActive ? 'text-[#4fa77e]' : 'text-gray-400'}`} />
                      <div>
                        <code className="font-mono font-medium text-gray-900">{ref.refCode}</code>
                        <p className="text-xs text-gray-500">
                          Created {new Date(ref.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!ref.isActive && (
                        <span className="text-xs text-gray-500">Inactive</span>
                      )}
                      <button
                        onClick={() => handleCopyCode(ref.refCode)}
                        className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200"
                      >
                        {copiedCode === ref.refCode ? (
                          <>
                            <Check className="h-3 w-3 text-green-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy Link
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <LinkIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No referral codes</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Clinic */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Clinic</h3>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="h-10 w-10 rounded-lg bg-[#4fa77e] flex items-center justify-center text-white font-bold">
                {affiliate.clinic.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{affiliate.clinic.name}</p>
                <p className="text-sm text-gray-500">{affiliate.clinic.subdomain}.eonpro.io</p>
              </div>
            </div>
            <Link
              href={`/super-admin/clinics/${affiliate.clinicId}`}
              className="mt-3 block text-center text-sm text-[#4fa77e] hover:text-[#3d8a66]"
            >
              View Clinic Details
            </Link>
          </div>

          {/* Commission Plan */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Commission Plan</h3>
            {currentPlan ? (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900">{currentPlan.name}</p>
                <div className="mt-2 text-sm text-gray-600">
                  {(() => {
                    const hasSeperateRates = currentPlan.initialPercentBps !== null || 
                      currentPlan.initialFlatAmountCents !== null ||
                      currentPlan.recurringPercentBps !== null ||
                      currentPlan.recurringFlatAmountCents !== null;
                    
                    if (hasSeperateRates) {
                      const initialRate = currentPlan.planType === 'PERCENT' 
                        ? formatPercent(currentPlan.initialPercentBps ?? currentPlan.percentBps ?? 0)
                        : formatCurrency(currentPlan.initialFlatAmountCents ?? currentPlan.flatAmountCents ?? 0);
                      const recurringRate = currentPlan.planType === 'PERCENT'
                        ? formatPercent(currentPlan.recurringPercentBps ?? currentPlan.percentBps ?? 0)
                        : formatCurrency(currentPlan.recurringFlatAmountCents ?? currentPlan.flatAmountCents ?? 0);
                      
                      return (
                        <>
                          <p>Initial: <span className="font-medium">{initialRate}</span></p>
                          <p>Recurring: <span className="font-medium">{recurringRate}</span></p>
                        </>
                      );
                    }
                    
                    const rate = currentPlan.planType === 'PERCENT' && currentPlan.percentBps
                      ? formatPercent(currentPlan.percentBps)
                      : currentPlan.flatAmountCents
                        ? formatCurrency(currentPlan.flatAmountCents)
                        : 'N/A';
                    
                    return <p>Rate: <span className="font-medium">{rate}</span></p>;
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <DollarSign className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No commission plan assigned</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setEditMode(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Edit Affiliate
              </button>
              <Link
                href={`/super-admin/commission-plans`}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <DollarSign className="h-4 w-4" />
                Manage Plans
              </Link>
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Activity</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-900">{new Date(affiliate.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Updated</span>
                <span className="text-gray-900">{new Date(affiliate.updatedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Login</span>
                <span className="text-gray-900">
                  {affiliate.user.lastLogin
                    ? new Date(affiliate.user.lastLogin).toLocaleDateString()
                    : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
