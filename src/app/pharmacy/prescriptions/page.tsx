'use client';

import { useState, useEffect } from 'react';
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
      
      const res = await fetch(`/api/pharmacy/prescriptions${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
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
      'PENDING': 'bg-gray-100 text-gray-800',
      'PROCESSING': 'bg-yellow-100 text-yellow-800',
      'SHIPPED': 'bg-blue-100 text-blue-800',
      'DELIVERED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Prescription Tracking</h1>
        <Link
          href="/pharmacy/analytics"
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Back to Analytics
        </Link>
      </div>

      <div className="flex gap-2">
        {['all', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'].map((status: any) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded ${
              filter === status 
                ? 'bg-blue-600 text-white' 
                : 'bg-white border text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i: any) => (
            <div key={i} className="bg-white rounded-lg shadow p-6">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">No prescriptions found</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rx Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medication</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prescriptions.map((rx: any) => (
                <tr key={rx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium">{rx.rxNumber}</td>
                  <td className="px-6 py-4 text-sm">{rx.medicationName}</td>
                  <td className="px-6 py-4 text-sm">{rx.patientName}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(rx.currentStatus)}`}>
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
