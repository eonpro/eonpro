'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, CreditCard, FileText, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';

interface FinanceStats {
  totalRevenue: number;
  monthlyRevenue: number;
  pendingInvoices: number;
  paidInvoices: number;
}

interface RecentTransaction {
  id: number;
  patientName: string;
  amount: number;
  type: string;
  status: string;
  date: string;
}

export default function AdminFinancePage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);

  useEffect(() => {
    loadFinanceData();
  }, []);

  const loadFinanceData = async () => {
    try {
      const token = localStorage.getItem('token');

      // Fetch dashboard stats
      const dashResponse = await fetch('/api/admin/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (dashResponse.ok) {
        const dashData = await dashResponse.json();
        setStats({
          totalRevenue: dashData.stats?.totalRevenue || 0,
          monthlyRevenue: dashData.stats?.totalRevenue || 0,
          pendingInvoices: 0,
          paidInvoices: 0,
        });
      }

      // Fetch recent invoices
      const invoicesResponse = await fetch('/api/invoices?limit=5', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        if (invoicesData.invoices && Array.isArray(invoicesData.invoices)) {
          const formattedTransactions = invoicesData.invoices.map((inv: any) => ({
            id: inv.id,
            patientName: inv.patient?.firstName && inv.patient?.lastName
              ? `${inv.patient.firstName} ${inv.patient.lastName}`
              : inv.patient?.email || 'Unknown Patient',
            amount: (inv.total || 0) / 100,
            type: 'Invoice',
            status: inv.status || 'Unknown',
            date: inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-',
          }));
          setTransactions(formattedTransactions);

          // Count paid and pending
          const paid = invoicesData.invoices.filter((i: any) => i.status === 'PAID' || i.status === 'paid').length;
          const pending = invoicesData.invoices.filter((i: any) => i.status === 'PENDING' || i.status === 'pending' || i.status === 'SENT').length;

          setStats(prev => prev ? { ...prev, paidInvoices: paid, pendingInvoices: pending } : null);
        }
      }
    } catch (error) {
      console.error('Failed to load finance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      label: 'Total Revenue',
      value: `$${(stats?.totalRevenue || 0).toLocaleString()}`,
      change: stats?.totalRevenue ? '+' : '-',
      trend: 'up',
      icon: DollarSign
    },
    {
      label: 'Monthly Revenue',
      value: `$${(stats?.monthlyRevenue || 0).toLocaleString()}`,
      change: '-',
      trend: 'up',
      icon: TrendingUp
    },
    {
      label: 'Pending Invoices',
      value: stats?.pendingInvoices?.toString() || '0',
      change: '-',
      trend: 'neutral',
      icon: CreditCard
    },
    {
      label: 'Paid Invoices',
      value: stats?.paidInvoices?.toString() || '0',
      change: '-',
      trend: 'up',
      icon: FileText
    },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="text-gray-600 mt-1">Track revenue and manage billing</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </div>
                <span className={`flex items-center text-sm font-medium ${
                  stat.trend === 'up' ? 'text-green-600' :
                  stat.trend === 'down' ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {stat.change !== '-' && stat.trend === 'up' && <ArrowUpRight className="h-4 w-4 mr-1" />}
                  {stat.change !== '-' && stat.trend === 'down' && <ArrowDownRight className="h-4 w-4 mr-1" />}
                  {stat.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
              <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p>No transactions yet</p>
                    <p className="text-sm text-gray-400">Transactions will appear here as you process invoices</p>
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {transaction.patientName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${transaction.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {transaction.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        transaction.status === 'PAID' || transaction.status === 'paid' || transaction.status === 'Completed'
                          ? 'bg-green-100 text-green-800'
                          : transaction.status === 'PENDING' || transaction.status === 'pending' || transaction.status === 'Pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {transaction.date}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
