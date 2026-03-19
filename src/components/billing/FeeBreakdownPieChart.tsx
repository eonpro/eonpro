'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { FeeBreakdown } from '@/services/billing/billingAnalyticsService';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

const COLORS = ['#4fa77e', '#3b82f6', '#f59e0b'];

interface Props {
  data: FeeBreakdown;
}

export default function FeeBreakdownPieChart({ data }: Props) {
  const segments = [
    { name: 'Prescription', value: data.prescriptionFees, count: data.prescriptionCount },
    { name: 'Transmission', value: data.transmissionFees, count: data.transmissionCount },
    { name: 'Admin', value: data.adminFees, count: data.adminCount },
  ].filter((s) => s.value > 0);

  if (!segments.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No fee data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={segments}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {segments.map((_entry, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={((value: number | undefined, _name: string, props: { payload: { count: number } }) =>
            `${formatCurrency(value ?? 0)} (${props.payload.count} events)`) as any}
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
