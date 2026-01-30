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
    // Simulate API call
    setTimeout(() => {
      setData({
        balance: {
          available: 4523100,
          pending: 1234500,
          reserved: 50000,
        },
        upcomingPayouts: [
          { id: 'po_1', amount: 1234500, arrivalDate: '2024-03-15', status: 'pending', bankAccount: '****4242' },
          { id: 'po_2', amount: 2345600, arrivalDate: '2024-03-18', status: 'pending', bankAccount: '****4242' },
        ],
        payoutHistory: [
          { id: 'po_3', amount: 4567800, fees: 132500, net: 4435300, arrivalDate: '2024-03-08', status: 'paid' },
          { id: 'po_4', amount: 3456700, fees: 100200, net: 3356500, arrivalDate: '2024-03-01', status: 'paid' },
          { id: 'po_5', amount: 5678900, fees: 164900, net: 5514000, arrivalDate: '2024-02-22', status: 'paid' },
          { id: 'po_6', amount: 4234500, fees: 122800, net: 4111700, arrivalDate: '2024-02-15', status: 'paid' },
          { id: 'po_7', amount: 3987600, fees: 115700, net: 3871900, arrivalDate: '2024-02-08', status: 'paid' },
        ],
        feeBreakdown: {
          stripeFees: 385000,
          platformFees: 125000,
          refundFees: 15000,
          disputeFees: 7500,
          totalFees: 532500,
          feePercentage: 2.9,
        },
        monthlyPayouts: [
          { month: '2024-01', gross: 12500000, fees: 362500, net: 12137500 },
          { month: '2024-02', gross: 14200000, fees: 411800, net: 13788200 },
          { month: '2024-03', gross: 11800000, fees: 342200, net: 11457800 },
        ],
        bankAccounts: [
          { id: 'ba_1', bankName: 'Chase Bank', last4: '4242', isDefault: true },
        ],
      });
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const displayData = data!;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700';
      case 'in_transit': return 'bg-blue-100 text-blue-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payout Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track payouts, balances, and fee analysis
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export History
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {formatCurrency(displayData.balance.available)}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Available Balance</p>
          <p className="text-xs text-gray-400 mt-1">Ready for payout</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {formatCurrency(displayData.balance.pending)}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Pending Balance</p>
          <p className="text-xs text-gray-400 mt-1">Arriving in 2-3 days</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-amber-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {formatCurrency(displayData.balance.reserved)}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Reserved</p>
          <p className="text-xs text-gray-400 mt-1">For disputes/refunds</p>
        </div>
      </div>

      {/* Upcoming Payouts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Payouts</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {displayData.upcomingPayouts.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No upcoming payouts</p>
            </div>
          ) : (
            displayData.upcomingPayouts.map((payout) => (
              <div key={payout.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-50 rounded-lg">
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
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(payout.status)}`}>
                    {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                  </span>
                  <p className="text-sm text-gray-500 mt-1">
                    Est. arrival: {new Date(payout.arrivalDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fee Analysis and Payout Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Breakdown (Last 30 Days)</h3>
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
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Total Fees</span>
                <span className="text-lg font-bold text-red-600">
                  {formatCurrency(displayData.feeBreakdown.totalFees)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Effective rate: {displayData.feeBreakdown.feePercentage}% of gross
              </p>
            </div>
          </div>
        </div>

        {/* Monthly Payout Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Payout Trend</h3>
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
        </div>
      </div>

      {/* Payout History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Payout History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gross</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fees</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayData.payoutHistory.map((payout) => (
                <tr key={payout.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(payout.arrivalDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(payout.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    -{formatCurrency(payout.fees)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600">
                    {formatCurrency(payout.net)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(payout.status)}`}>
                      {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bank Account */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Bank Account</h3>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-lg border border-gray-200">
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
            <span className="inline-flex px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
              Default
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
