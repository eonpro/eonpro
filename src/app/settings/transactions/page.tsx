'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  RefreshCw,
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Calendar,
  Tag,
  PieChart,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

type TransactionCategory =
  | 'new_patient'
  | 'subscription'
  | 'semaglutide'
  | 'tirzepatide'
  | 'consultation'
  | 'lab_work'
  | 'refill'
  | 'one_time'
  | 'other';

interface Transaction {
  id: string;
  type: 'charge' | 'payment' | 'refund' | 'payout' | 'transfer';
  category: TransactionCategory;
  categoryLabel: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  status: string;
  description: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerId: string | null;
  created: number;
  createdAt: string;
  metadata: Record<string, string>;
  paymentMethod: string | null;
  receiptUrl: string | null;
  invoiceId: string | null;
  refundedAmount?: number;
  failureMessage?: string | null;
  productName?: string;
}

interface CategoryBreakdown {
  category: string;
  label: string;
  count: number;
  revenue: number;
  revenueFormatted: string;
  percentage: string;
}

interface Summary {
  totalTransactions: number;
  totalCharges: number;
  totalRefunds: number;
  totalRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  totalRevenueFormatted: string;
  totalRefundedFormatted: string;
  netRevenueFormatted: string;
  byCategory?: CategoryBreakdown[];
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters - Default to charges only (sales data)
  const [filterType, setFilterType] = useState('charges');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(true);

  // Pagination
  const [hasMore, setHasMore] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  const fetchTransactions = useCallback(
    async (append = false) => {
      try {
        setLoading(true);
        setError(null);

        // Try multiple token storage locations (same pattern as other settings pages)
        const token =
          localStorage.getItem('auth-token') ||
          localStorage.getItem('admin-token') ||
          localStorage.getItem('super_admin-token') ||
          localStorage.getItem('token');

        if (!token) {
          throw new Error('No authentication token found. Please log in again.');
        }

        const params = new URLSearchParams({
          limit: '50',
          type: filterType,
          status: filterStatus,
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          ...(append && lastId && { starting_after: lastId }),
        });

        const response = await apiFetch(`/api/stripe/transactions?${params}`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch transactions');
        }

        const data = await response.json();

        if (append) {
          setTransactions((prev) => [...prev, ...data.transactions]);
        } else {
          setTransactions(data.transactions);
        }

        setSummary(data.summary);
        setHasMore(data.pagination.hasMore);
        setLastId(data.pagination.lastId || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
      } finally {
        setLoading(false);
      }
    },
    [filterType, filterStatus, startDate, endDate, lastId]
  );

  useEffect(() => {
    fetchTransactions();
  }, [filterType, filterStatus, startDate, endDate]);

  const filteredTransactions = transactions.filter((tx) => {
    // Filter by category
    if (filterCategory !== 'all' && tx.category !== filterCategory) {
      return false;
    }

    // Filter by search term
    if (searchTerm) {
      return (
        normalizedIncludes(tx.id || '', searchTerm) ||
        normalizedIncludes(tx.customerEmail || '', searchTerm) ||
        normalizedIncludes(tx.customerName || '', searchTerm) ||
        normalizedIncludes(tx.description || '', searchTerm) ||
        normalizedIncludes(tx.categoryLabel || '', searchTerm) ||
        normalizedIncludes(tx.productName || '', searchTerm)
      );
    }

    return true;
  });

  const exportCSV = () => {
    const headers = [
      'Date',
      'ID',
      'Type',
      'Category',
      'Customer',
      'Email',
      'Amount',
      'Status',
      'Description',
      'Product',
    ];
    const rows = filteredTransactions.map((tx) => [
      new Date(tx.createdAt).toLocaleDateString(),
      tx.id,
      tx.type,
      tx.categoryLabel || '',
      tx.customerName || '',
      tx.customerEmail || '',
      tx.amountFormatted,
      tx.status,
      tx.description || '',
      tx.productName || '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTypeIcon = (type: string, amount: number) => {
    if (type === 'refund' || amount < 0) {
      return <ArrowDownLeft className="h-4 w-4 text-red-500" />;
    }
    return <ArrowUpRight className="h-4 w-4 text-green-500" />;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      succeeded: 'bg-green-100 text-green-800',
      paid: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      canceled: 'bg-gray-100 text-gray-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      semaglutide: 'bg-blue-100 text-blue-800',
      tirzepatide: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
      subscription: 'bg-emerald-100 text-emerald-800',
      new_patient: 'bg-amber-100 text-amber-800',
      consultation: 'bg-cyan-100 text-cyan-800',
      lab_work: 'bg-pink-100 text-pink-800',
      refill: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
      one_time: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="mt-1 text-gray-500">View all Stripe transactions for your clinic</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchTransactions()}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-xl font-bold text-gray-900">{summary.totalRevenueFormatted}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2">
                <ArrowDownLeft className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Refunded</p>
                <p className="text-xl font-bold text-gray-900">{summary.totalRefundedFormatted}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Net Revenue</p>
                <p className="text-xl font-bold text-emerald-600">{summary.netRevenueFormatted}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Transactions</p>
                <p className="text-xl font-bold text-gray-900">{summary.totalTransactions}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {summary?.byCategory && summary.byCategory.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <button
            onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-[var(--brand-primary)]" />
              <h3 className="font-semibold text-gray-900">Sales by Category</h3>
            </div>
            {showCategoryBreakdown ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {showCategoryBreakdown && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary.byCategory.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() =>
                    setFilterCategory(filterCategory === cat.category ? 'all' : cat.category)
                  }
                  className={`rounded-lg border p-3 text-left transition-all ${
                    filterCategory === cat.category
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-light)] ring-2 ring-[var(--brand-primary-medium)]'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(cat.category)}`}
                    >
                      {cat.label}
                    </span>
                    <span className="text-xs text-gray-500">{cat.percentage}%</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{cat.revenueFormatted}</p>
                  <p className="text-xs text-gray-500">
                    {cat.count} transaction{cat.count !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <input
              type="text"
              placeholder="Search by ID, customer, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          >
            <option value="charges">Sales (Charges)</option>
            <option value="all">All Transactions</option>
            <option value="refunds">Refunds Only</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Categories</option>
            <option value="semaglutide">Semaglutide</option>
            <option value="tirzepatide">Tirzepatide</option>
            <option value="subscription">Subscription</option>
            <option value="new_patient">New Patient</option>
            <option value="consultation">Consultation</option>
            <option value="lab_work">Lab Work</option>
            <option value="refill">Refill</option>
            <option value="one_time">One-Time Purchase</option>
            <option value="other">Other</option>
          </select>

          {/* Date Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
          >
            <Calendar className="h-4 w-4" />
            Date Range
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Date Range */}
        {showFilters && (
          <div className="mt-4 flex gap-4 border-t border-gray-200 pt-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="self-end px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Clear Dates
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="font-medium text-red-800">Error loading transactions</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Amount
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin" />
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <CreditCard className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="text-sm text-gray-900">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(tx.type, tx.amount)}
                        <span className="text-sm font-medium capitalize text-gray-700">
                          {tx.type}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getCategoryColor(tx.category)}`}
                      >
                        <Tag className="h-3 w-3" />
                        {tx.categoryLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{tx.customerName || '—'}</div>
                      <div className="text-xs text-gray-500">{tx.customerEmail || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate text-sm text-gray-700">
                        {tx.description || '—'}
                      </div>
                      {tx.paymentMethod && (
                        <div className="text-xs capitalize text-gray-500">
                          via {tx.paymentMethod.replace('_', ' ')}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span
                        className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}
                      >
                        {tx.amountFormatted}
                      </span>
                      <div className="text-xs text-gray-500">{tx.currency}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(tx.status)}`}
                      >
                        {getStatusIcon(tx.status)}
                        {tx.status}
                      </span>
                      {tx.failureMessage && (
                        <div className="mt-1 text-xs text-red-500">{tx.failureMessage}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tx.receiptUrl && (
                        <a
                          href={tx.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                        >
                          Receipt
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {hasMore && (
          <div className="border-t border-gray-200 px-4 py-4 text-center">
            <button
              onClick={() => fetchTransactions(true)}
              disabled={loading}
              className="rounded-lg bg-gray-100 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
