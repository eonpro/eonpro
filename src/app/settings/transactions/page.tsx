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
  Search,
  Calendar,
  Tag,
  PieChart
} from 'lucide-react';

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
  
  // Filters
  const [filterType, setFilterType] = useState('all');
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

  const fetchTransactions = useCallback(async (append = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // Try multiple token storage locations (same pattern as other settings pages)
      const token = localStorage.getItem('auth-token') || 
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

      const response = await fetch(`/api/stripe/transactions?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch transactions');
      }

      const data = await response.json();
      
      if (append) {
        setTransactions(prev => [...prev, ...data.transactions]);
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
  }, [filterType, filterStatus, startDate, endDate, lastId]);

  useEffect(() => {
    fetchTransactions();
  }, [filterType, filterStatus, startDate, endDate]);

  const filteredTransactions = transactions.filter(tx => {
    // Filter by category
    if (filterCategory !== 'all' && tx.category !== filterCategory) {
      return false;
    }
    
    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        tx.id.toLowerCase().includes(search) ||
        tx.customerEmail?.toLowerCase().includes(search) ||
        tx.customerName?.toLowerCase().includes(search) ||
        tx.description?.toLowerCase().includes(search) ||
        tx.categoryLabel?.toLowerCase().includes(search) ||
        tx.productName?.toLowerCase().includes(search)
      );
    }
    
    return true;
  });

  const exportCSV = () => {
    const headers = ['Date', 'ID', 'Type', 'Category', 'Customer', 'Email', 'Amount', 'Status', 'Description', 'Product'];
    const rows = filteredTransactions.map(tx => [
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
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
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
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTypeIcon = (type: string, amount: number) => {
    if (type === 'refund' || amount < 0) {
      return <ArrowDownLeft className="w-4 h-4 text-red-500" />;
    }
    return <ArrowUpRight className="w-4 h-4 text-green-500" />;
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
      tirzepatide: 'bg-purple-100 text-purple-800',
      subscription: 'bg-emerald-100 text-emerald-800',
      new_patient: 'bg-amber-100 text-amber-800',
      consultation: 'bg-cyan-100 text-cyan-800',
      lab_work: 'bg-pink-100 text-pink-800',
      refill: 'bg-indigo-100 text-indigo-800',
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
          <p className="text-gray-500 mt-1">View all Stripe transactions for your clinic</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchTransactions()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-xl font-bold text-gray-900">{summary.totalRevenueFormatted}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <ArrowDownLeft className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Refunded</p>
                <p className="text-xl font-bold text-gray-900">{summary.totalRefundedFormatted}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Net Revenue</p>
                <p className="text-xl font-bold text-emerald-600">{summary.netRevenueFormatted}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-blue-600" />
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
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <button
            onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Sales by Category</h3>
            </div>
            {showCategoryBreakdown ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          
          {showCategoryBreakdown && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {summary.byCategory.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => setFilterCategory(filterCategory === cat.category ? 'all' : cat.category)}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    filterCategory === cat.category 
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(cat.category)}`}>
                      {cat.label}
                    </span>
                    <span className="text-xs text-gray-500">{cat.percentage}%</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{cat.revenueFormatted}</p>
                  <p className="text-xs text-gray-500">{cat.count} transaction{cat.count !== 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by ID, customer, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Types</option>
            <option value="charges">Charges</option>
            <option value="refunds">Refunds</option>
            <option value="payouts">Payouts</option>
          </select>
          
          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Calendar className="w-4 h-4" />
            Date Range
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        
        {/* Date Range */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="self-end px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Clear Dates
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <div>
            <p className="font-medium text-red-800">Error loading transactions</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(tx.type, tx.amount)}
                        <span className="text-sm font-medium capitalize text-gray-700">
                          {tx.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(tx.category)}`}>
                        <Tag className="w-3 h-3" />
                        {tx.categoryLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{tx.customerName || '—'}</div>
                      <div className="text-xs text-gray-500">{tx.customerEmail || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700 max-w-xs truncate">
                        {tx.description || '—'}
                      </div>
                      {tx.paymentMethod && (
                        <div className="text-xs text-gray-500 capitalize">
                          via {tx.paymentMethod.replace('_', ' ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {tx.amountFormatted}
                      </span>
                      <div className="text-xs text-gray-500">{tx.currency}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(tx.status)}`}>
                        {getStatusIcon(tx.status)}
                        {tx.status}
                      </span>
                      {tx.failureMessage && (
                        <div className="text-xs text-red-500 mt-1">{tx.failureMessage}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tx.receiptUrl && (
                        <a
                          href={tx.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-sm"
                        >
                          Receipt
                          <ExternalLink className="w-3 h-3" />
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
          <div className="px-4 py-4 border-t border-gray-200 text-center">
            <button
              onClick={() => fetchTransactions(true)}
              disabled={loading}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
