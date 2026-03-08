'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { AgingBucket } from '@/services/billing/billingAnalyticsService';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

const COLORS = ['#4fa77e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

interface Props {
  data: AgingBucket[];
}

export default function ARAgingBarChart({ data }: Props) {
  if (!data.length || data.every((b) => b.amountCents === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No outstanding invoices
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
        />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" width={60} />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Amount']}
          labelFormatter={(label: string) => {
            const bucket = data.find((b) => b.label === label);
            return bucket ? `${bucket.range} (${bucket.invoiceCount} invoices)` : label;
          }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="amountCents" radius={[0, 6, 6, 0]} barSize={28}>
          {data.map((_entry, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
