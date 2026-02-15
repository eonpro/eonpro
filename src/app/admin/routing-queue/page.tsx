'use client';

/**
 * Admin Routing Queue Page
 *
 * View and manage prescription routing queue for manual assignment.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Users,
  Clock,
  UserCheck,
  MapPin,
  Calendar,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface PrescriptionQueueItem {
  orderId: number;
  invoiceId?: number;
  patientId: number;
  patientName: string;
  patientState: string;
  clinicId: number;
  createdAt: string;
  status: string;
  assignedProviderId?: number | null;
}

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  npi: string;
  licenseState: string | null;
  pendingPrescriptions?: number;
  completedToday?: number;
}

interface RoutingConfig {
  routingStrategy: string;
  soapApprovalMode: string;
  compensationEnabled: boolean;
  autoAssignOnPayment: boolean;
}

export default function AdminRoutingQueuePage() {
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [unassigned, setUnassigned] = useState<PrescriptionQueueItem[]>([]);
  const [assigned, setAssigned] = useState<
    { providerId: number; providerName: string; count: number }[]
  >([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);

  // Fetch queue data
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch('/api/admin/routing/queue');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch routing queue');
      }

      const data = await response.json();
      setEnabled(data.enabled);
      setConfig(data.config);
      setUnassigned(data.unassigned || []);
      setAssigned(data.assigned || []);
      setProviders(data.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Assign prescription to provider
  const handleAssign = async (orderId: number) => {
    if (!selectedProvider) {
      setError('Please select a provider');
      return;
    }

    try {
      setAssigning(orderId);
      setError(null);
      setSuccess(null);

      const response = await apiFetch('/api/admin/routing/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          providerId: selectedProvider,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign prescription');
      }

      const data = await response.json();
      setSuccess(`Assigned to ${data.assignment.providerName}`);

      // Refresh the queue
      await fetchQueue();
      setSelectedProvider(null);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAssigning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading routing queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-teal-600" />
                <h1 className="text-2xl font-bold text-gray-900">Prescription Routing Queue</h1>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Manage prescription assignments to providers
              </p>
            </div>
            <button
              onClick={() => fetchQueue()}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-green-700">{success}</span>
          </div>
        )}

        {!enabled ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-yellow-500" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Provider Routing Not Enabled
            </h2>
            <p className="text-gray-600">
              Provider routing is not enabled for this clinic. Contact your super admin to enable
              this feature.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-100 p-3">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{unassigned.length}</p>
                    <p className="text-sm text-gray-500">Unassigned</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-100 p-3">
                    <UserCheck className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {assigned.reduce((sum, a) => sum + a.count, 0)}
                    </p>
                    <p className="text-sm text-gray-500">Assigned</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-3">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{providers.length}</p>
                    <p className="text-sm text-gray-500">Available Providers</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Unassigned Queue */}
              <div className="rounded-xl border border-gray-200 bg-white lg:col-span-2">
                <div className="border-b border-gray-200 p-4">
                  <h2 className="text-lg font-semibold text-gray-900">Unassigned Prescriptions</h2>
                </div>
                {unassigned.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-300" />
                    <p>All prescriptions have been assigned!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {unassigned.map((item) => (
                      <div key={item.orderId} className="p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{item.patientName}</p>
                            <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {item.patientState}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(item.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedProvider || ''}
                              onChange={(e) =>
                                setSelectedProvider(
                                  e.target.value ? parseInt(e.target.value) : null
                                )
                              }
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500"
                            >
                              <option value="">Select Provider</option>
                              {providers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.firstName} {p.lastName}
                                  {p.licenseState && ` (${p.licenseState})`}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAssign(item.orderId)}
                              disabled={!selectedProvider || assigning === item.orderId}
                              className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {assigning === item.orderId ? 'Assigning...' : 'Assign'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Provider Workload */}
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 p-4">
                  <h2 className="text-lg font-semibold text-gray-900">Provider Workload</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {providers.map((provider) => {
                    const assignedCount =
                      assigned.find((a) => a.providerId === provider.id)?.count || 0;
                    return (
                      <div key={provider.id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {provider.firstName} {provider.lastName}
                            </p>
                            <p className="text-sm text-gray-500">
                              {provider.licenseState || 'No state'} • {provider.completedToday || 0}{' '}
                              completed today
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-gray-900">{assignedCount}</p>
                            <p className="text-xs text-gray-500">pending</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
