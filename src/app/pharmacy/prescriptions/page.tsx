'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { logger } from '@/lib/logger';
import Link from 'next/link';

interface Prescription {
  id: number;
  rxNumber: string;
  medicationName: string;
  patientName: string;
  currentStatus: string;
  trackingNumber?: string;
  carrier?: string;
  createdAt: string;
}

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchPrescriptions();
  }, [filter]);

  const fetchPrescriptions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const params = filter !== 'all' ? `?status=${filter}` : '';

      const res = await apiFetch(`/api/pharmacy/prescriptions${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data.prescriptions || []);
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Failed to fetch prescriptions', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-gray-100 text-gray-800',
      PROCESSING: 'bg-yellow-100 text-yellow-800',
      SHIPPED: 'bg-blue-100 text-blue-800',
      DELIVERED: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Prescription Tracking</h1>
        <Link
          href="/pharmacy/analytics"
          className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
        >
          Back to Analytics
        </Link>
      </div>

      <div className="flex gap-2">
        {['all', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'].map((status: any) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded px-4 py-2 ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'border bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i: any) => (
            <div key={i} className="rounded-lg bg-white p-6 shadow">
              <div className="mb-2 h-4 w-1/4 rounded bg-gray-200"></div>
              <div className="h-3 w-1/2 rounded bg-gray-200"></div>
            </div>
          ))}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-8 text-center">
          <p className="text-gray-600">No prescriptions found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Rx Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Medication
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Tracking
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prescriptions.map((rx: any) => (
                <tr key={rx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium">{rx.rxNumber}</td>
                  <td className="px-6 py-4 text-sm">{rx.medicationName}</td>
                  <td className="px-6 py-4 text-sm">{rx.patientName}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${getStatusBadge(rx.currentStatus)}`}
                    >
                      {rx.currentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {rx.trackingNumber ? (
                      <div>
                        <div className="font-mono text-xs">{rx.trackingNumber}</div>
                        <div className="text-xs text-gray-500">{rx.carrier}</div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(rx.createdAt).toLocaleDateString()}
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
