'use client';

import { useState, useEffect } from 'react';
import {
  Wallet,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  Loader2,
  Building2,
  ArrowRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';

interface PayoutData {
  balance: {
    available: number;
    pending: number;
    reserved: number;
  };
  upcomingPayouts: Array<{
    id: string;
    amount: number;
    arrivalDate: string;
    status: 'pending' | 'in_transit' | 'paid';
    bankAccount: string;
  }>;
  payoutHistory: Array<{
    id: string;
    amount: number;
    fees: number;
    net: number;
    arrivalDate: string;
    status: string;
  }>;
  feeBreakdown: {
    stripeFees: number;
    platformFees: number;
    refundFees: number;
    disputeFees: number;
    totalFees: number;
    feePercentage: number;
  };
  monthlyPayouts: Array<{
    month: string;
    gross: number;
    fees: number;
    net: number;
  }>;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    last4: string;
    isDefault: boolean;
  }>;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

const formatCurrencyCompact = (cents: number) => {
  const dollars = cents / 100;
  if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(1)}M`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
};

export default function PayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PayoutData | null>(null);

  useEffect(() => {
    const loadPayoutData = async () => {
      try {
        const token =
          localStorage.getItem('auth-token') ||
          localStorage.getItem('super_admin-token') ||
          localStorage.getItem('admin-token') ||
          localStorage.getItem('token');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch('/api/finance/payouts', {
          credentials: 'include',
          headers,
        });

        if (response.ok) {
          const payoutData = await response.json();
          setData(payoutData);
        } else {
          // Set empty data structure if API fails
          setData({
            balance: { available: 0, pending: 0, reserved: 0 },
            upcomingPayouts: [],
            payoutHistory: [],
            feeBreakdown: {
              stripeFees: 0,
              platformFees: 0,
              refundFees: 0,
              disputeFees: 0,
              totalFees: 0,
              feePercentage: 0,
            },
            monthlyPayouts: [],
            bankAccounts: [],
          });
        }
      } catch (error) {
        console.error('Failed to load payout data:', error);
        setData({
          balance: { available: 0, pending: 0, reserved: 0 },
          upcomingPayouts: [],
          payoutHistory: [],
          feeBreakdown: {
            stripeFees: 0,
            platformFees: 0,
            refundFees: 0,
            disputeFees: 0,
            totalFees: 0,
            feePercentage: 0,
          },
          monthlyPayouts: [],
          bankAccounts: [],
        });
      } finally {
        setLoading(false);
      }
    };

    loadPayoutData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const displayData = data!;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'in_transit':
        return 'bg-blue-100 text-blue-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payout Management</h2>
          <p className="mt-1 text-sm text-gray-500">Track payouts, balances, and fee analysis</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export History
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-emerald-50 p-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.balance.available)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Available Balance</p>
          <p className="mt-1 text-xs text-gray-400">Ready for payout</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-blue-50 p-2">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.balance.pending)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Pending Balance</p>
          <p className="mt-1 text-xs text-gray-400">Arriving in 2-3 days</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-amber-50 p-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.balance.reserved)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Reserved</p>
          <p className="mt-1 text-xs text-gray-400">For disputes/refunds</p>
        </div>
      </div>

      {/* Upcoming Payouts */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Payouts</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {displayData.upcomingPayouts.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">No upcoming payouts</p>
            </div>
          ) : (
            displayData.upcomingPayouts.map((payout) => (
              <div
                key={payout.id}
                className="flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <ArrowRight className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(payout.amount)}
                    </p>
                    <p className="text-sm text-gray-500">
                      To account ending in {payout.bankAccount}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(payout.status)}`}
                  >
                    {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                  </span>
                  <p className="mt-1 text-sm text-gray-500">
                    Est. arrival: {new Date(payout.arrivalDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fee Analysis and Payout Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fee Breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Fee Breakdown (Last 30 Days)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Stripe Processing Fees</span>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(displayData.feeBreakdown.stripeFees)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Platform Fees</span>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(displayData.feeBreakdown.platformFees)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Refund Fees</span>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(displayData.feeBreakdown.refundFees)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Dispute Fees</span>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(displayData.feeBreakdown.disputeFees)}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Total Fees</span>
                <span className="text-lg font-bold text-red-600">
                  {formatCurrency(displayData.feeBreakdown.totalFees)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Effective rate: {displayData.feeBreakdown.feePercentage}% of gross
              </p>
            </div>
          </div>
        </div>

        {/* Monthly Payout Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Monthly Payout Trend</h3>
          {displayData.monthlyPayouts.length === 0 ? (
            <div className="flex h-[250px] flex-col items-center justify-center text-gray-400">
              <TrendingUp className="mb-3 h-12 w-12" />
              <p className="text-gray-500">No payout history available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={displayData.monthlyPayouts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(value as number)}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                />
                <Legend />
                <Bar dataKey="gross" name="Gross" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fees" name="Fees" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Payout History */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900">Payout History</h3>
        </div>
        {displayData.payoutHistory.length === 0 ? (
          <div className="p-8 text-center">
            <Wallet className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No payout history available</p>
            <p className="mt-1 text-sm text-gray-400">Payouts will appear here once processed</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Gross
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Fees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Net
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayData.payoutHistory.map((payout) => (
                  <tr key={payout.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {new Date(payout.arrivalDate).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {formatCurrency(payout.amount)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-red-600">
                      -{formatCurrency(payout.fees)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600">
                      {formatCurrency(payout.net)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(payout.status)}`}
                      >
                        {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bank Account */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Bank Account</h3>
        {displayData.bankAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-400">
            <Building2 className="mb-3 h-12 w-12" />
            <p className="text-gray-500">No bank account connected</p>
            <p className="mt-1 text-sm text-gray-400">
              Connect a bank account in Stripe to receive payouts
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <Building2 className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {displayData.bankAccounts[0].bankName}
                </p>
                <p className="text-sm text-gray-500">
                  Account ending in {displayData.bankAccounts[0].last4}
                </p>
              </div>
            </div>
            {displayData.bankAccounts[0].isDefault && (
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                Default
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
