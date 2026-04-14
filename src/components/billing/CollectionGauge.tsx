'use client';

import type { CollectionMetrics } from '@/services/billing/billingAnalyticsService';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);

interface Props {
  data: CollectionMetrics;
}

export default function CollectionGauge({ data }: Props) {
  const rate = data.collectionRate;
  const circumference = 2 * Math.PI * 80;
  const offset = circumference - (rate / 100) * circumference;

  const rateColor = rate >= 80 ? '#4fa77e' : rate >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-48 w-48">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="80" fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            stroke={rateColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color: rateColor }}>
            {rate}%
          </span>
          <span className="text-xs text-gray-500">Collection Rate</span>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3 text-center text-sm">
        <div className="rounded-xl bg-green-50 p-3">
          <p className="text-xs text-gray-500">Collected</p>
          <p className="font-semibold text-green-700">{formatCurrency(data.totalPaidCents)}</p>
        </div>
        <div className="rounded-xl bg-yellow-50 p-3">
          <p className="text-xs text-gray-500">Outstanding</p>
          <p className="font-semibold text-yellow-700">
            {formatCurrency(data.totalOutstandingCents)}
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-xs text-gray-500">Overdue</p>
          <p className="font-semibold text-red-700">{formatCurrency(data.totalOverdueCents)}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-xs text-gray-500">Avg Days to Pay</p>
          <p className="font-semibold text-blue-700">{data.avgDaysToPayment} days</p>
        </div>
      </div>
    </div>
  );
}
