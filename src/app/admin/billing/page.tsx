'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import {
  Loader2,
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  Calendar,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { Patient, Provider, Order } from '@/types/models';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface BillingStats {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  totalPatients: number;
  recentPayments: Array<{
    id: number;
    patientName: string;
    patientId: number;
    amount: number;
    status: string;
    createdAt: string;
    paymentMethod?: string;
    description?: string;
  }>;
  pendingInvoices: Array<{
    id: number;
    patientName: string;
    patientId: number;
    amount: number;
    dueDate?: string;
    stripeInvoiceNumber?: string;
  }>;
}

export default function AdminBillingPage() {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const fetchBillingStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/billing/stats');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch billing stats');
      }
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      // @ts-ignore

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[Admin Billing] Error fetching stats:', err);
      setError(errorMessage || 'Failed to load billing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingStats();
  }, [fetchBillingStats]);

  const filteredPayments = stats?.recentPayments?.filter((payment: any) => {
    if (!searchQuery) return true;
    return (
      normalizedIncludes(payment.patientName || '', searchQuery) ||
      normalizedIncludes(payment.description || '', searchQuery) ||
      normalizedIncludes(payment.paymentMethod || '', searchQuery)
    );
  });

  const filteredInvoices = stats?.pendingInvoices?.filter((invoice: any) => {
    if (!searchQuery) return true;
    return (
      normalizedIncludes(invoice.patientName || '', searchQuery) ||
      normalizedIncludes(invoice.stripeInvoiceNumber || '', searchQuery)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#4fa77e]" />
        <p className="ml-3 text-gray-600">Loading billing data...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="py-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <p className="text-red-600">Error: {error || 'Failed to load data'}</p>
        <button onClick={fetchBillingStats} className="mt-4 text-[#4fa77e] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing Overview</h1>
          <p className="mt-1 text-sm text-gray-600">
            Monitor revenue, payments, and manage patient billing
          </p>
        </div>
        <Link
          href="/patients"
          className="flex items-center rounded-md bg-[#4fa77e] px-4 py-2 text-white transition hover:bg-[#3a8a6b]"
        >
          <Users className="mr-2 h-5 w-5" />
          View Patients
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${stats.totalRevenue.toFixed(2)}
              </p>
            </div>
            <DollarSign className="h-12 w-12 text-[#4fa77e] opacity-30" />
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                ${stats.monthlyRevenue.toFixed(2)}
              </p>
            </div>
            <TrendingUp className="h-12 w-12 text-blue-500 opacity-30" />
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {stats.activeSubscriptions}
              </p>
            </div>
            <Calendar className="h-12 w-12 text-[var(--brand-primary)] opacity-30" />
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Patients</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.totalPatients}</p>
            </div>
            <Users className="h-12 w-12 text-orange-500 opacity-30" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="relative">
          <input
            type="text"
            placeholder="Search payments and invoices..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
          />
        </div>
      </div>

      {/* Recent Payments and Pending Invoices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="flex items-center text-xl font-semibold text-gray-800">
              <CreditCard className="mr-2 h-5 w-5 text-[#4fa77e]" />
              Recent Payments
            </h3>
          </div>
          <div className="p-6">
            {filteredPayments && filteredPayments.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                {searchQuery ? `No payments found matching "${searchQuery}"` : 'No recent payments'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredPayments?.slice(0, 10).map((payment: any) => (
                  <li key={payment.id} className="py-3">
                    <Link
                      href={`/patients/${payment.patientId}?tab=billing`}
                      className="-mx-2 flex items-center justify-between rounded px-2 py-1 transition hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{payment.patientName}</p>
                        <p className="text-xs text-gray-500">
                          {payment.description || 'Payment'} • {payment.paymentMethod || 'Card'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(payment.createdAt), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          ${payment.amount.toFixed(2)}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            payment.status === 'SUCCEEDED'
                              ? 'bg-green-100 text-green-800'
                              : payment.status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Pending Invoices */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="flex items-center text-xl font-semibold text-gray-800">
              <FileText className="mr-2 h-5 w-5 text-orange-500" />
              Pending Invoices
            </h3>
          </div>
          <div className="p-6">
            {filteredInvoices && filteredInvoices.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                {searchQuery
                  ? `No invoices found matching "${searchQuery}"`
                  : 'No pending invoices'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredInvoices?.slice(0, 10).map((invoice: any) => (
                  <li key={invoice.id} className="py-3">
                    <Link
                      href={`/patients/${invoice.patientId}?tab=billing`}
                      className="-mx-2 flex items-center justify-between rounded px-2 py-1 transition hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{invoice.patientName}</p>
                        <p className="text-xs text-gray-500">
                          Invoice #{invoice.stripeInvoiceNumber || invoice.id}
                        </p>
                        {invoice.dueDate && (
                          <p className="text-xs text-gray-400">
                            Due: {format(new Date(invoice.dueDate), 'MMM dd, yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          ${invoice.amount.toFixed(2)}
                        </p>
                        <span className="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                          Pending
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-xl font-semibold text-gray-800">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/patients"
            className="flex items-center justify-center rounded-lg border-2 border-[#4fa77e] px-4 py-3 text-[#4fa77e] transition hover:bg-[#4fa77e] hover:text-white"
          >
            <Users className="mr-2 h-5 w-5" />
            View All Patients
          </Link>
          <Link
            href="/admin/affiliates"
            className="flex items-center justify-center rounded-lg border-2 border-[var(--brand-primary)] px-4 py-3 text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary)] hover:text-white"
          >
            <DollarSign className="mr-2 h-5 w-5" />
            Manage Commissions
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center rounded-lg border-2 border-gray-400 px-4 py-3 text-gray-600 transition hover:bg-gray-400 hover:text-white"
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            Refresh Stats
          </button>
        </div>
      </div>
    </div>
  );
}
