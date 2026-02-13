'use client';

import { useState } from 'react';
import { logger } from '@/lib/logger';

export default function OrdersStatusPage() {
  const [orderId, setOrderId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function checkStatus() {
    if (!orderId) return;
    try {
      setLoading(true);
      setResult(null);
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      // @ts-ignore

      logger.error(err);
      setResult({ error: 'Failed to fetch order status' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4 p-10">
      <h1 className="text-3xl font-bold">Order Status</h1>
      <p className="text-gray-600">
        Enter a Lifefile order ID (or the ID returned from /api/prescriptions) to check status.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 border p-2"
          placeholder="Order ID"
          value={orderId}
          onChange={(e: any) => setOrderId(e.target.value)}
        />
        <button
          onClick={checkStatus}
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Check Status'}
        </button>
      </div>
      {result && (
        <pre className="mt-4 overflow-auto rounded bg-gray-900 p-4 text-xs text-gray-50">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
