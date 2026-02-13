'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
  patientId: number | null;
  patient: {
    id: number;
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
  const searchParams = useSearchParams();
  const submitted = searchParams.get('submitted') === '1';

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/orders/list');
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
      {/* Success Banner */}
      {submitted && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <svg
            className="h-5 w-5 flex-shrink-0 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Prescription submitted successfully!</span>
          <span className="text-sm">The order is now being processed by the pharmacy.</span>
        </div>
      )}

      {/* Header with Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Recent Orders</h1>
          <p className="mt-1 text-sm text-gray-600">
            Showing the 50 most recent orders logged in the local database.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/patients"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            View Patients
          </Link>
          <Link
            href="/admin/orders"
            className="inline-flex items-center rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660]"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            Orders Admin
          </Link>
        </div>
      </div>
      {loading && <p>Loading…</p>}
      {!loading && orders.length === 0 && <p className="text-gray-600">No orders found yet.</p>}
      {!loading && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
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
                  <td className="border px-2 py-1">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="border px-2 py-1">
                    {o.patient ? (
                      <Link
                        href={`/patients/${o.patient.id}?tab=prescriptions`}
                        className="font-medium text-[#4fa77e] hover:underline"
                      >
                        {o.patient.firstName} {o.patient.lastName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    {o.primaryMedName}
                    {o.primaryMedStrength ? ` (${o.primaryMedStrength})` : ''}
                  </td>
                  <td className="border px-2 py-1">{o.status ?? '—'}</td>
                  <td className="border px-2 py-1">{o.lifefileOrderId ?? '—'}</td>
                  <td className="border px-2 py-1">{o.shippingStatus ?? '—'}</td>
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
                      '—'
                    )}
                  </td>
                  <td className="border px-2 py-1 text-xs">
                    {o.lastWebhookAt
                      ? new Date(o.lastWebhookAt).toLocaleString()
                      : 'Awaiting webhook'}
                  </td>
                  <td className="border px-2 py-1 text-xs text-gray-600">
                    {o.events && o.events.length > 0 ? (
                      <ul className="space-y-1">
                        {o.events.slice(0, 2).map((event: any) => (
                          <li key={event.id}>
                            <span className="font-semibold">{event.eventType}</span>{' '}
                            <span className="text-gray-500">
                              ({new Date(event.createdAt).toLocaleDateString()})
                            </span>
                            {event.note ? ` – ${event.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400">No events yet</span>
                    )}
                  </td>
                  <td className="max-w-xs border px-2 py-1 text-xs text-red-600">
                    {o.errorMessage ?? ''}
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
