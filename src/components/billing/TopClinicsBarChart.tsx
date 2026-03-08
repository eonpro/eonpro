'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ClinicRevenue } from '@/services/billing/billingAnalyticsService';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

interface Props {
  data: ClinicRevenue[];
}

export default function TopClinicsBarChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No clinic revenue data
      </div>
    );
  }

  const chartData = data.map((c) => ({
    name: c.clinicName.length > 20 ? c.clinicName.slice(0, 18) + '...' : c.clinicName,
    fullName: c.clinicName,
    invoiced: c.totalInvoicedCents,
    paid: c.totalPaidCents,
    outstanding: c.outstandingCents,
    rate: c.collectionRate,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" width={120} />
        <Tooltip
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
          labelFormatter={(_label: string, payload: { payload?: { fullName: string; rate: number } }[]) => {
            const item = payload?.[0]?.payload;
            return item ? `${item.fullName} (${item.rate}% collected)` : '';
          }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="paid" name="Paid" stackId="a" fill="#4fa77e" radius={[0, 0, 0, 0]} barSize={20} />
        <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill="#e5e7eb" radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
