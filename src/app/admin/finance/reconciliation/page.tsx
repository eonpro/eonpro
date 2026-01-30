'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Loader2,
  Link as LinkIcon,
  User,
  DollarSign,
  Clock,
  Settings,
  Play,
} from 'lucide-react';

interface UnmatchedPayment {
  id: number;
  stripePaymentId: string;
  amount: number;
  email: string;
  name: string | null;
  date: string;
  status: 'pending' | 'matched' | 'created' | 'skipped';
  confidence: number;
  suggestedPatientId: number | null;
  suggestedPatientName: string | null;
}

interface ReconciliationRule {
  id: number;
  name: string;
  description: string;
  priority: number;
  matchType: 'email' | 'phone' | 'name' | 'custom';
  isActive: boolean;
  matchCount: number;
}

interface ReconciliationStats {
  totalUnmatched: number;
  matchedToday: number;
  createdToday: number;
  skippedToday: number;
  autoMatchRate: number;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

export default function ReconciliationPage() {
  const [loading, setLoading] = useState(true);
  const [unmatchedPayments, setUnmatchedPayments] = useState<UnmatchedPayment[]>([]);
  const [rules, setRules] = useState<ReconciliationRule[]>([]);
  const [stats, setStats] = useState<ReconciliationStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'rules' | 'history'>('queue');
  const [selectedPayments, setSelectedPayments] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const loadReconciliationData = async () => {
      try {
        const token = localStorage.getItem('auth-token') || 
                      localStorage.getItem('super_admin-token') || 
                      localStorage.getItem('admin-token') ||
                      localStorage.getItem('token');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch('/api/finance/reconciliation', {
          credentials: 'include',
          headers,
        });

        if (response.ok) {
          const data = await response.json();
          setStats(data.stats || {
            totalUnmatched: 0,
            matchedToday: 0,
            createdToday: 0,
            skippedToday: 0,
            autoMatchRate: 0,
          });
          setUnmatchedPayments(data.unmatchedPayments || []);
          setRules(data.rules || []);
        } else {
          // Set empty defaults
          setStats({
            totalUnmatched: 0,
            matchedToday: 0,
            createdToday: 0,
            skippedToday: 0,
            autoMatchRate: 0,
          });
          setUnmatchedPayments([]);
          setRules([]);
        }
      } catch (error) {
        console.error('Failed to load reconciliation data:', error);
        setStats({
          totalUnmatched: 0,
          matchedToday: 0,
          createdToday: 0,
          skippedToday: 0,
          autoMatchRate: 0,
        });
        setUnmatchedPayments([]);
        setRules([]);
      } finally {
        setLoading(false);
      }
    };

    loadReconciliationData();
  }, []);

  const handleMatchPayment = async (paymentId: number, patientId: number) => {
    setProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setUnmatchedPayments(prev => 
        prev.map(p => p.id === paymentId ? { ...p, status: 'matched' as const } : p)
      );
      setProcessing(false);
    }, 500);
  };

  const handleCreatePatient = async (paymentId: number) => {
    setProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setUnmatchedPayments(prev => 
        prev.map(p => p.id === paymentId ? { ...p, status: 'created' as const } : p)
      );
      setProcessing(false);
    }, 500);
  };

  const handleSkipPayment = async (paymentId: number) => {
    setUnmatchedPayments(prev => 
      prev.map(p => p.id === paymentId ? { ...p, status: 'skipped' as const } : p)
    );
  };

  const handleBulkMatch = async () => {
    setProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setUnmatchedPayments(prev => 
        prev.map(p => 
          selectedPayments.includes(p.id) && p.suggestedPatientId 
            ? { ...p, status: 'matched' as const } 
            : p
        )
      );
      setSelectedPayments([]);
      setProcessing(false);
    }, 1000);
  };

  const handleRunAutoMatch = async () => {
    setProcessing(true);
    // Simulate running auto-match rules
    setTimeout(() => {
      setUnmatchedPayments(prev => 
        prev.map(p => 
          p.confidence >= 80 && p.suggestedPatientId 
            ? { ...p, status: 'matched' as const } 
            : p
        )
      );
      setProcessing(false);
    }, 2000);
  };

  const filteredPayments = unmatchedPayments.filter(p => 
    p.status === 'pending' && (
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.stripePaymentId.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const toggleSelectPayment = (id: number) => {
    setSelectedPayments(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPayments.length === filteredPayments.length) {
      setSelectedPayments([]);
    } else {
      setSelectedPayments(filteredPayments.map(p => p.id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-50';
    if (confidence >= 50) return 'text-yellow-600 bg-yellow-50';
    if (confidence > 0) return 'text-orange-600 bg-orange-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reconciliation Center</h2>
          <p className="text-sm text-gray-500 mt-1">
            Match Stripe payments to patients
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAutoMatch}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Run Auto-Match
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalUnmatched}</p>
              <p className="text-xs text-gray-500">Unmatched</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.matchedToday}</p>
              <p className="text-xs text-gray-500">Matched Today</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.createdToday}</p>
              <p className="text-xs text-gray-500">Created Today</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-50 rounded-lg">
              <XCircle className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.skippedToday}</p>
              <p className="text-xs text-gray-500">Skipped Today</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <RefreshCcw className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.autoMatchRate}%</p>
              <p className="text-xs text-gray-500">Auto-Match Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        {(['queue', 'rules', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email, name, or payment ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-80 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {selectedPayments.length > 0 && (
                <button
                  onClick={handleBulkMatch}
                  disabled={processing}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <LinkIcon className="h-4 w-4" />
                  Match Selected ({selectedPayments.length})
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedPayments.length === filteredPayments.length && filteredPayments.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
                      <p className="text-gray-500">All payments are matched!</p>
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedPayments.includes(payment.id)}
                          onChange={() => toggleSelectPayment(payment.id)}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-mono text-gray-600">{payment.stripePaymentId}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(payment.date).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900">{payment.name || 'Unknown'}</p>
                        <p className="text-sm text-gray-500">{payment.email}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(payment.amount)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {payment.suggestedPatientId ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getConfidenceColor(payment.confidence)}`}>
                                {payment.confidence}% match
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              {payment.suggestedPatientName}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No match found</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {payment.suggestedPatientId && (
                            <button
                              onClick={() => handleMatchPayment(payment.id, payment.suggestedPatientId!)}
                              disabled={processing}
                              className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200 disabled:opacity-50"
                            >
                              Match
                            </button>
                          )}
                          <button
                            onClick={() => handleCreatePatient(payment.id)}
                            disabled={processing}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 disabled:opacity-50"
                          >
                            Create
                          </button>
                          <button
                            onClick={() => handleSkipPayment(payment.id)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200"
                          >
                            Skip
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Matching Rules</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Settings className="h-4 w-4" />
              Configure
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <div key={rule.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full text-sm font-medium text-gray-600">
                    {rule.priority}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                        rule.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {rule.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{rule.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{rule.matchCount.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">matches</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Reconciliation history coming soon</p>
          <p className="text-sm text-gray-400 mt-1">View past matching activity and audit trails</p>
        </div>
      )}
    </div>
  );
}
