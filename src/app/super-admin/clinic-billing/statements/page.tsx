'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, FileText, Download, Building2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Clinic { id: number; name: string }

interface LineItem {
  date: string;
  type: 'invoice' | 'payment' | 'credit';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementData {
  clinic: { id: number; name: string; adminEmail: string };
  period: { startDate: string; endDate: string };
  openingBalance: number;
  lineItems: LineItem[];
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  invoiceCount: number;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export default function StatementsPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinic, setSelectedClinic] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/api/super-admin/clinic-fees');
        if (res.ok) {
          const data = await res.json();
          setClinics(data.clinics?.map((c: { clinic: Clinic }) => c.clinic) || []);
        }
      } catch { /* silent */ }
    };
    load();
  }, []);

  const fetchStatement = async () => {
    if (!selectedClinic) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ clinicId: selectedClinic, startDate, endDate });
      const res = await apiFetch(`/api/super-admin/clinic-statements?${params}`);
      if (res.ok) setStatement(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const exportCSV = () => {
    if (!statement) return;
    const rows = [
      ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
      ['', '', '', 'Opening Balance', '', '', (statement.openingBalance / 100).toFixed(2)],
      ...statement.lineItems.map((l) => [
        formatDate(l.date),
        l.type,
        l.reference,
        `"${l.description}"`,
        l.debit ? (l.debit / 100).toFixed(2) : '',
        l.credit ? (l.credit / 100).toFixed(2) : '',
        (l.balance / 100).toFixed(2),
      ]),
      ['', '', '', 'Closing Balance', (statement.totalDebits / 100).toFixed(2), (statement.totalCredits / 100).toFixed(2), (statement.closingBalance / 100).toFixed(2)],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${statement.clinic.name.replace(/\s/g, '-')}-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => router.push('/super-admin/clinic-billing')} className="rounded-lg p-2 hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Account Statements</h1>
          <p className="mt-1 text-gray-500">Generate statements of account per clinic</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-sm font-medium text-gray-700">Clinic</label>
          <select value={selectedClinic} onChange={(e) => setSelectedClinic(e.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20">
            <option value="">Select clinic...</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
        </div>
        <button onClick={fetchStatement} disabled={!selectedClinic || loading} className="rounded-lg bg-[#4fa77e] px-6 py-2.5 text-white hover:bg-[#3d9268] disabled:opacity-50">
          {loading ? 'Loading...' : 'Generate'}
        </button>
      </div>

      {/* Statement */}
      {statement && (
        <div className="space-y-6">
          {/* Statement Header */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Statement of Account</h2>
                <div className="mt-2 flex items-center gap-2 text-gray-600">
                  <Building2 className="h-4 w-4" />
                  <span className="font-medium">{statement.clinic.name}</span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Period: {formatDate(statement.period.startDate)} - {formatDate(statement.period.endDate)}
                </p>
              </div>
              <button onClick={exportCSV} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Opening Balance</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(statement.openingBalance)}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Total Invoiced</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(statement.totalDebits)}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Total Payments</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(statement.totalCredits)}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Closing Balance</p>
              <p className={`text-xl font-bold ${statement.closingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(statement.closingBalance)}
              </p>
            </div>
          </div>

          {/* Line Items */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium uppercase text-gray-500 ${['Debit', 'Credit', 'Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Opening Balance Row */}
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(statement.period.startDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={3}>Opening Balance</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500" />
                  <td className="px-4 py-3 text-right text-sm text-gray-500" />
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(statement.openingBalance)}</td>
                </tr>
                {statement.lineItems.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(item.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.type === 'invoice' ? 'bg-blue-100 text-blue-700' : item.type === 'credit' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.reference}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600">{item.debit > 0 ? formatCurrency(item.debit) : ''}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-600">{item.credit > 0 ? formatCurrency(item.credit) : ''}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(item.balance)}</td>
                  </tr>
                ))}
                {/* Closing Balance Row */}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900" colSpan={4}>Closing Balance</td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">{formatCurrency(statement.totalDebits)}</td>
                  <td className="px-4 py-3 text-right text-sm text-green-600">{formatCurrency(statement.totalCredits)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(statement.closingBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {statement.lineItems.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">No transactions found for this period</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
