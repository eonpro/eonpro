"use client";

import { useState } from "react";
import { logger } from '@/lib/logger';

export default function OrdersStatusPage() {
  const [orderId, setOrderId] = useState("");
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
      setResult({ error: "Failed to fetch order status" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-10 max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">Order Status</h1>
      <p className="text-gray-600">
        Enter a Lifefile order ID (or the ID returned from /api/prescriptions) to check
        status.
      </p>
      <div className="flex gap-2">
        <input
          className="border p-2 flex-1"
          placeholder="Order ID"
          value={orderId}
          onChange={(e: any) => setOrderId(e.target.value)}
        />
        <button
          onClick={checkStatus}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Checking..." : "Check Status"}
        </button>
      </div>
      {result && (
        <pre className="mt-4 bg-gray-900 text-gray-50 text-xs p-4 rounded overflow-auto">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

