"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { logger } from '@/lib/logger';
import { 
  Loader2, 
  DollarSign, 
  TrendingUp, 
  Users, 
  CreditCard,
  Calendar,
  Search,
  FileText,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { Patient, Provider, Order } from '@/types/models';

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
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const fetchBillingStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/stats");
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch billing stats");
      }
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
    // @ts-ignore
   
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error("[Admin Billing] Error fetching stats:", err);
      setError(errorMessage || "Failed to load billing data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingStats();
  }, [fetchBillingStats]);

  const filteredPayments = stats?.recentPayments?.filter((payment: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      payment.patientName.toLowerCase().includes(query) ||
      payment.description?.toLowerCase().includes(query) ||
      payment.paymentMethod?.toLowerCase().includes(query)
    );
  });

  const filteredInvoices = stats?.pendingInvoices?.filter((invoice: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      invoice.patientName.toLowerCase().includes(query) ||
      invoice.stripeInvoiceNumber?.toLowerCase().includes(query)
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
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600">Error: {error || "Failed to load data"}</p>
        <button onClick={fetchBillingStats} className="mt-4 text-[#4fa77e] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing Overview</h1>
          <p className="mt-1 text-sm text-gray-600">
            Monitor revenue, payments, and manage patient billing
          </p>
        </div>
        <Link
          href="/patients"
          className="flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
        >
          <Users className="h-5 w-5 mr-2" />
          View Patients
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
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

        <div className="bg-white rounded-lg shadow p-6">
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

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {stats.activeSubscriptions}
              </p>
            </div>
            <Calendar className="h-12 w-12 text-purple-500 opacity-30" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Patients</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {stats.totalPatients}
              </p>
            </div>
            <Users className="h-12 w-12 text-orange-500 opacity-30" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search payments and invoices..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
          />
        </div>
      </div>

      {/* Recent Payments and Pending Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-[#4fa77e]" />
              Recent Payments
            </h3>
          </div>
          <div className="p-6">
            {filteredPayments && filteredPayments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {searchQuery ? `No payments found matching "${searchQuery}"` : "No recent payments"}
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredPayments?.slice(0, 10).map((payment: any) => (
                  <li key={payment.id} className="py-3">
                    <Link
                      href={`/patients/${payment.patientId}?tab=billing`}
                      className="flex justify-between items-center hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {payment.patientName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {payment.description || "Payment"} • {payment.paymentMethod || "Card"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(payment.createdAt), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          ${payment.amount.toFixed(2)}
                        </p>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          payment.status === 'SUCCEEDED' 
                            ? 'bg-green-100 text-green-800' 
                            : payment.status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
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
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-orange-500" />
              Pending Invoices
            </h3>
          </div>
          <div className="p-6">
            {filteredInvoices && filteredInvoices.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {searchQuery ? `No invoices found matching "${searchQuery}"` : "No pending invoices"}
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredInvoices?.slice(0, 10).map((invoice: any) => (
                  <li key={invoice.id} className="py-3">
                    <Link
                      href={`/patients/${invoice.patientId}?tab=billing`}
                      className="flex justify-between items-center hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {invoice.patientName}
                        </p>
                        <p className="text-xs text-gray-500">
                          Invoice #{invoice.stripeInvoiceNumber || invoice.id}
                        </p>
                        {invoice.dueDate && (
                          <p className="text-xs text-gray-400">
                            Due: {format(new Date(invoice.dueDate), "MMM dd, yyyy")}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          ${invoice.amount.toFixed(2)}
                        </p>
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
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
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/patients"
            className="flex items-center justify-center px-4 py-3 border-2 border-[#4fa77e] text-[#4fa77e] rounded-lg hover:bg-[#4fa77e] hover:text-white transition"
          >
            <Users className="h-5 w-5 mr-2" />
            View All Patients
          </Link>
          <Link
            href="/admin/influencers"
            className="flex items-center justify-center px-4 py-3 border-2 border-purple-500 text-purple-500 rounded-lg hover:bg-purple-500 hover:text-white transition"
          >
            <DollarSign className="h-5 w-5 mr-2" />
            Manage Commissions
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center px-4 py-3 border-2 border-gray-400 text-gray-600 rounded-lg hover:bg-gray-400 hover:text-white transition"
          >
            <TrendingUp className="h-5 w-5 mr-2" />
            Refresh Stats
          </button>
        </div>
      </div>
    </div>
  );
}
