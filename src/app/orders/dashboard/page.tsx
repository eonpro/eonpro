"use client";

import { useEffect, useState } from "react";
import { logger } from '@/lib/logger';

type OrderRow = {
  id: number;
  createdAt: string;
  status: string | null;
  shippingStatus: string | null;
  messageId: string;
  referenceId: string;
  lifefileOrderId: string | null;
  primaryMedName: string | null;
  primaryMedStrength: string | null;
  primaryMedForm: string | null;
  errorMessage: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  lastWebhookAt: string | null;
  patient: {
    firstName: string;
    lastName: string;
  } | null;
  events: Array<{
    id: number;
    createdAt: string;
    eventType: string;
    note: string | null;
  }>;
};

export default function OrdersDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/orders/list");
        const data = await res.json();
        setOrders(data.orders ?? []);
      } catch (err: any) {
    // @ts-ignore
   
        logger.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Recent Orders</h1>
      <p className="text-sm text-gray-600 mb-4">
        Showing the 50 most recent orders logged in the local database.
      </p>
      {loading && <p>Loading…</p>}
      {!loading && orders.length === 0 && (
        <p className="text-gray-600">No orders found yet.</p>
      )}
      {!loading && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">ID</th>
                <th className="border px-2 py-1">Created</th>
                <th className="border px-2 py-1">Patient</th>
                <th className="border px-2 py-1">Med</th>
                <th className="border px-2 py-1">Status</th>
                <th className="border px-2 py-1">Lifefile ID</th>
                <th className="border px-2 py-1">Shipping</th>
                <th className="border px-2 py-1">Tracking</th>
                <th className="border px-2 py-1">Last Update</th>
                <th className="border px-2 py-1">Recent Events</th>
                <th className="border px-2 py-1">Error</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">{o.id}</td>
                  <td className="border px-2 py-1">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="border px-2 py-1">
                    {o.patient?.firstName} {o.patient?.lastName}
                  </td>
                  <td className="border px-2 py-1">
                    {o.primaryMedName}
                    {o.primaryMedStrength ? ` (${o.primaryMedStrength})` : ""}
                  </td>
                  <td className="border px-2 py-1">{o.status ?? "—"}</td>
                  <td className="border px-2 py-1">{o.lifefileOrderId ?? "—"}</td>
                  <td className="border px-2 py-1">
                    {o.shippingStatus ?? "—"}
                  </td>
                  <td className="border px-2 py-1 text-xs">
                    {o.trackingNumber ? (
                      o.trackingUrl ? (
                        <a
                          href={o.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#4fa77e] underline"
                        >
                          {o.trackingNumber}
                        </a>
                      ) : (
                        o.trackingNumber
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="border px-2 py-1 text-xs">
                    {o.lastWebhookAt
                      ? new Date(o.lastWebhookAt).toLocaleString()
                      : "Awaiting webhook"}
                  </td>
                  <td className="border px-2 py-1 text-xs text-gray-600">
                    {o.events && o.events.length > 0 ? (
                      <ul className="space-y-1">
                        {o.events.slice(0, 2).map((event: any) => (
                          <li key={event.id}>
                            <span className="font-semibold">{event.eventType}</span>{" "}
                            <span className="text-gray-500">
                              ({new Date(event.createdAt).toLocaleDateString()})
                            </span>
                            {event.note ? ` – ${event.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400">No events yet</span>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-xs text-red-600 max-w-xs">
                    {o.errorMessage ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

