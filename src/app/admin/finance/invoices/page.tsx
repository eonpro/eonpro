'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  Filter,
  Download,
  Loader2,
  Plus,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Undo2,
} from 'lucide-react';

interface Invoice {
  id: number;
  invoiceNumber?: string;
  stripeInvoiceId?: string;
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    profileStatus?: string;
  };
  description?: string;
  amount: number;
  total?: number;
  amountPaid?: number;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE' | 'SENT';
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  metadata?: {
    refund?: {
      amount: number;
      refundedAt: string;
      isFullRefund: boolean;
    };
    source?: string;
  };
}

interface InvoiceStats {
  totalOutstanding: number;
  overdueAmount: number;
  paidThisMonth: number;
  averagePaymentTime: number;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

export default function InvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('super_admin-token') || 
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({
        limit: '100', // Get more to calculate stats
        offset: ((page - 1) * 20).toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });

      const response = await fetch(`/api/invoices?${params}`, {
        credentials: 'include',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setInvoices(data.invoices || []);
        setTotalPages(Math.ceil((data.total || 0) / 20));
        
        // Calculate stats from all invoices
        const allInvoices = data.invoices || [];
        const outstanding = allInvoices.filter((i: Invoice) => i.status === 'OPEN' || i.status === 'SENT');
        const overdue = outstanding.filter((i: Invoice) => 
          i.dueDate && new Date(i.dueDate) < new Date()
        );
        
        // Get paid invoices - using amountPaid if available, otherwise amount
        const paidInvoices = allInvoices.filter((i: Invoice) => i.status === 'PAID');
        const paidTotal = paidInvoices.reduce((sum: number, i: Invoice) => 
          sum + (i.amountPaid || i.amount || 0), 0
        );
        
        setStats({
          totalOutstanding: outstanding.reduce((sum: number, i: Invoice) => sum + (i.amount || 0), 0),
          overdueAmount: overdue.reduce((sum: number, i: Invoice) => sum + (i.amount || 0), 0),
          paidThisMonth: paidTotal,
          averagePaymentTime: 0, // Will be calculated from actual data when available
        });
      } else {
        setInvoices([]);
        setStats({
          totalOutstanding: 0,
          overdueAmount: 0,
          paidThisMonth: 0,
          averagePaymentTime: 0,
        });
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const syncInvoice = async (invoiceId: number) => {
    setSyncingId(invoiceId);
    try {
      const token = localStorage.getItem('auth-token') ||
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`/api/invoices/${invoiceId}/sync`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.updated) {
          // Refresh invoices list
          loadInvoices();
        }
        return data;
      }
    } catch (error) {
      console.error('Failed to sync invoice:', error);
    } finally {
      setSyncingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-green-100 text-green-700';
      case 'OPEN': return 'bg-blue-100 text-blue-700';
      case 'DRAFT': return 'bg-gray-100 text-gray-700';
      case 'VOID': return 'bg-red-100 text-red-700';
      case 'UNCOLLECTIBLE': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Filter invoices by search query
  const filteredInvoices = searchQuery.trim() === '' 
    ? invoices 
    : invoices.filter(inv => {
        const query = searchQuery.toLowerCase();
        const patientName = inv.patient 
          ? `${inv.patient.firstName} ${inv.patient.lastName}`.toLowerCase()
          : '';
        const patientEmail = inv.patient?.email?.toLowerCase() || '';
        const invoiceNumber = inv.invoiceNumber?.toLowerCase() || inv.stripeInvoiceId?.toLowerCase() || '';
        const description = inv.description?.toLowerCase() || '';
        
        return patientName.includes(query) ||
               patientEmail.includes(query) ||
               invoiceNumber.includes(query) ||
               description.includes(query);
      });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoice Management</h2>
          <p className="text-sm text-gray-500 mt-1">Create and manage patient invoices</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="p-2 bg-amber-50 rounded-lg w-fit">
            <DollarSign className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {formatCurrency(stats?.totalOutstanding || 0)}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Outstanding</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="p-2 bg-red-50 rounded-lg w-fit">
            <Clock className="h-5 w-5 text-red-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {formatCurrency(stats?.overdueAmount || 0)}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Overdue</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="p-2 bg-green-50 rounded-lg w-fit">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {formatCurrency(stats?.paidThisMonth || 0)}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Paid This Month</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="p-2 bg-blue-50 rounded-lg w-fit">
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">
            {stats?.averagePaymentTime?.toFixed(1) || 0} days
          </h3>
          <p className="text-sm text-gray-500 mt-1">Avg Payment Time</p>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
              >
                <option value="all">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="PAID">Paid</option>
                <option value="VOID">Void</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No invoices found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => {
                      const patientName = invoice.patient
                        ? `${invoice.patient.firstName} ${invoice.patient.lastName}`.trim()
                        : 'Unknown';
                      const patientEmail = invoice.patient?.email || '';
                      const invoiceNumber = invoice.invoiceNumber || invoice.stripeInvoiceId || `INV-${invoice.id}`;
                      const isIncompletePatient = invoice.patient?.firstName === 'Unknown' ||
                                                  invoice.patient?.lastName === 'Customer' ||
                                                  patientEmail.includes('@placeholder.local');
                      const hasRefund = invoice.metadata?.refund;
                      const isFromStripe = invoice.metadata?.source === 'stripe_webhook';

                      return (
                        <tr key={invoice.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">{invoiceNumber}</p>
                            <p className="text-xs text-gray-400">{new Date(invoice.createdAt).toLocaleDateString()}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                                  {patientName}
                                  {isIncompletePatient && (
                                    <span title="Incomplete profile - needs review">
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    </span>
                                  )}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {patientEmail.includes('@placeholder.local')
                                    ? <span className="text-amber-600 text-xs">No email on file</span>
                                    : patientEmail
                                  }
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {formatCurrency(invoice.amount || 0)}
                              </p>
                              {hasRefund && (
                                <p className="text-xs text-red-600 flex items-center gap-1">
                                  <Undo2 className="h-3 w-3" />
                                  Refunded: {formatCurrency(hasRefund.amount)}
                                </p>
                              )}
                              {invoice.amountPaid !== undefined && invoice.amountPaid !== invoice.amount && (
                                <p className="text-xs text-gray-500">
                                  Paid: {formatCurrency(invoice.amountPaid)}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full w-fit ${getStatusColor(invoice.status)}`}>
                                {invoice.status}
                              </span>
                              {hasRefund && (
                                <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 w-fit">
                                  {hasRefund.isFullRefund ? 'REFUNDED' : 'PARTIAL REFUND'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-600">
                              {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              {isFromStripe && (
                                <button
                                  onClick={() => syncInvoice(invoice.id)}
                                  disabled={syncingId === invoice.id}
                                  className="p-1.5 hover:bg-blue-50 rounded text-blue-600 disabled:opacity-50"
                                  title="Sync from Stripe"
                                >
                                  {syncingId === invoice.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                              {invoice.status === 'DRAFT' && (
                                <button className="p-1.5 hover:bg-gray-100 rounded" title="Send">
                                  <Send className="h-4 w-4 text-gray-500" />
                                </button>
                              )}
                              <button className="p-1.5 hover:bg-gray-100 rounded" title="Download">
                                <Download className="h-4 w-4 text-gray-500" />
                              </button>
                              <button className="p-1.5 hover:bg-gray-100 rounded" title="More">
                                <MoreVertical className="h-4 w-4 text-gray-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
