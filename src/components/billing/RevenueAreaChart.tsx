'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { MonthlyRevenue } from '@/services/billing/billingAnalyticsService';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

interface Props {
  data: MonthlyRevenue[];
}

export default function RevenueAreaChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No revenue data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4fa77e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4fa77e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
        <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 12 }} stroke="#9ca3af" width={80} />
        <Tooltip
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="prescriptionFees"
          name="Prescription"
          stackId="1"
          stroke="#4fa77e"
          fill="url(#rxGrad)"
        />
        <Area
          type="monotone"
          dataKey="transmissionFees"
          name="Transmission"
          stackId="1"
          stroke="#3b82f6"
          fill="url(#txGrad)"
        />
        <Area
          type="monotone"
          dataKey="adminFees"
          name="Admin"
          stackId="1"
          stroke="#f59e0b"
          fill="url(#adminGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
