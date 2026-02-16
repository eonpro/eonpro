'use client';

import { useEffect, useState } from 'react';
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  CreditCard,
  Building2,
  AlertCircle,
  FileText,
  Settings,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Payout {
  id: number;
  createdAt: string;
  amountCents: number;
  feeCents: number;
  netAmountCents: number;
  methodType: string;
  status: string;
  completedAt: string | null;
  failureReason: string | null;
}

interface PayoutMethod {
  id: number;
  methodType: string;
  isDefault: boolean;
  isVerified: boolean;
  paypalEmail?: string;
  bankAccountLast4?: string;
  stripeAccountStatus?: string;
}

interface TaxDoc {
  documentType: string;
  taxYear: number;
  status: string;
}

interface PayoutsData {
  payouts: Payout[];
  methods: PayoutMethod[];
  taxDocs: TaxDoc[];
  balance: {
    availableCents: number;
    pendingCents: number;
    minimumPayoutCents: number;
  };
  requirements: {
    taxDocRequired: boolean;
    hasValidTaxDoc: boolean;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
  SCHEDULED: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Scheduled' },
  PROCESSING: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Processing' },
  COMPLETED: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Completed' },
  FAILED: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Failed' },
  CANCELLED: { color: 'bg-gray-100 text-gray-800', icon: XCircle, label: 'Cancelled' },
};

const methodIcons: Record<string, any> = {
  STRIPE_CONNECT: CreditCard,
  PAYPAL: DollarSign,
  BANK_WIRE: Building2,
  CHECK: FileText,
  MANUAL: Settings,
};

export default function PayoutsPage() {
  const [data, setData] = useState<PayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'methods' | 'tax'>('history');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');

    try {
      const [payoutsRes, methodsRes, taxRes, balanceRes] = await Promise.all([
        apiFetch('/api/affiliate/payouts'),
        apiFetch('/api/affiliate/account/payout-method'),
        apiFetch('/api/affiliate/tax-documents'),
        apiFetch('/api/affiliate/summary'),
      ]);

      const payoutsData = payoutsRes.ok ? await payoutsRes.json() : { payouts: [] };
      const methodsData = methodsRes.ok ? await methodsRes.json() : { methods: [] };
      const taxData = taxRes.ok ? await taxRes.json() : { documents: [], requirements: {} };
      const balanceData = balanceRes.ok ? await balanceRes.json() : { summary: {} };

      setData({
        payouts: payoutsData.payouts || [],
        methods: methodsData.methods || [],
        taxDocs: taxData.documents || [],
        balance: {
          availableCents: balanceData.summary?.commissionApprovedCents || 0,
          pendingCents: balanceData.summary?.commissionPendingCents || 0,
          minimumPayoutCents: 5000, // $50 default
        },
        requirements: {
          taxDocRequired: taxData.requirements?.taxDocRequired || false,
          hasValidTaxDoc: taxData.requirements?.hasValidDoc || false,
        },
      });
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <p className="mt-1 text-gray-500">Manage your earnings and payment methods</p>
      </div>

      {/* Balance Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-[var(--brand-primary-light)]0 to-[var(--brand-primary)] p-6 text-white">
          <p className="text-sm font-medium text-white/80">Available for Payout</p>
          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(data?.balance.availableCents || 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Pending</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatCurrency(data?.balance.pendingCents || 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Minimum Payout</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatCurrency(data?.balance.minimumPayoutCents || 5000)}
          </p>
        </div>
      </div>

      {/* Tax Document Alert */}
      {data?.requirements.taxDocRequired && !data?.requirements.hasValidTaxDoc && (
        <div className="mb-6 rounded-xl bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">Tax Documents Required</p>
              <p className="mt-1 text-sm text-amber-700">
                You've earned over $600 this year. Please submit a W-9 form to continue receiving
                payouts.
              </p>
              <button
                onClick={() => setActiveTab('tax')}
                className="mt-2 text-sm font-medium text-amber-700 underline hover:text-amber-800"
              >
                Submit Tax Documents
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'history', label: 'Payout History' },
            { id: 'methods', label: 'Payment Methods' },
            { id: 'tax', label: 'Tax Documents' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 pb-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="rounded-xl bg-white shadow-sm">
          {data?.payouts && data.payouts.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {data.payouts.map((payout) => {
                const status = statusConfig[payout.status] || statusConfig.PENDING;
                const StatusIcon = status.icon;
                const MethodIcon = methodIcons[payout.methodType] || DollarSign;

                return (
                  <div key={payout.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg bg-gray-100 p-2 text-gray-600">
                        <MethodIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatCurrency(payout.netAmountCents)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatDate(payout.createdAt)}
                          {payout.feeCents > 0 && (
                            <span className="ml-2 text-gray-400">
                              (Fee: {formatCurrency(payout.feeCents)})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No payouts yet</p>
            </div>
          )}
        </div>
      )}

      {/* Methods Tab */}
      {activeTab === 'methods' && (
        <div className="space-y-4">
          {data?.methods && data.methods.length > 0 ? (
            data.methods.map((method) => {
              const MethodIcon = methodIcons[method.methodType] || DollarSign;

              return (
                <div
                  key={method.id}
                  className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg bg-[var(--brand-primary-light)] p-2 text-[var(--brand-primary)]">
                      <MethodIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {method.methodType.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-gray-500">
                        {method.paypalEmail ||
                          (method.bankAccountLast4 && `****${method.bankAccountLast4}`) ||
                          'Connected'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {method.isDefault && (
                      <span className="rounded-full bg-[var(--brand-primary-light)] px-2 py-1 text-xs font-medium text-[var(--brand-primary)]">
                        Default
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        method.isVerified
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {method.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl bg-white py-12 text-center shadow-sm">
              <CreditCard className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No payment methods set up</p>
              <p className="mt-1 text-sm text-gray-400">Contact support to add a payout method</p>
            </div>
          )}
        </div>
      )}

      {/* Tax Tab */}
      {activeTab === 'tax' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Tax documents (W-9 for US, W-8BEN for non-US) are required for
              affiliates earning more than $600 per year. Documents must be submitted before payouts
              can be processed.
            </p>
          </div>

          {data?.taxDocs && data.taxDocs.length > 0 ? (
            data.taxDocs.map((doc, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-gray-100 p-2 text-gray-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{doc.documentType}</p>
                    <p className="text-sm text-gray-500">Tax Year {doc.taxYear}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    doc.status === 'VERIFIED'
                      ? 'bg-green-100 text-green-700'
                      : doc.status === 'SUBMITTED'
                        ? 'bg-blue-100 text-blue-700'
                        : doc.status === 'REJECTED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {doc.status}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-white py-12 text-center shadow-sm">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No tax documents submitted</p>
              <button className="mt-4 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90">
                Submit W-9 Form
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
