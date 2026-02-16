'use client';

import { useState, useEffect } from 'react';
import { formatPlanPrice } from '@/config/billingPlans';
import { Patient, Provider, Order } from '@/types/models';
import { apiFetch } from '@/lib/api/fetch';

interface Subscription {
  id: number;
  planName: string;
  planDescription: string;
  status: string;
  amount: number;
  interval: string;
  intervalCount: number;
  startDate: string;
  currentPeriodEnd: string;
  nextBillingDate: string | null;
  canceledAt: string | null;
  pausedAt: string | null;
  resumeAt: string | null;
}

interface ShipmentEntry {
  id: number;
  shipmentNumber: number;
  totalShipments: number;
  nextRefillDate: string;
  status: string;
  medicationName: string | null;
  planName: string | null;
  parentRefillId: number | null;
}

interface PatientSubscriptionManagerProps {
  patientId: number;
  patientName: string;
}

export function PatientSubscriptionManager({
  patientId,
  patientName,
}: PatientSubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [shipmentSchedules, setShipmentSchedules] = useState<ShipmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // IMPORTANT: Do NOT send explicit Authorization headers from localStorage.
  // For same-origin requests, apiFetch relies on httpOnly cookies set by the server.
  // Sending a localStorage token overrides the valid cookie with a potentially stale
  // value, causing 401 → session expiration even though the user is authenticated.

  const fetchSubscriptions = async () => {
    try {
      const [subRes, shipRes] = await Promise.all([
        apiFetch(`/api/patients/${patientId}/subscriptions`),
        apiFetch(`/api/patients/${patientId}/shipment-schedule`).catch(() => null),
      ]);

      if (!subRes.ok) throw new Error('Failed to fetch subscriptions');
      const subData = await subRes.json();
      setSubscriptions(subData);

      if (shipRes && shipRes.ok) {
        const shipData = await shipRes.json();
        setShipmentSchedules(shipData.shipments || []);
      }
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [patientId]);

  const handlePause = async (subscriptionId: number) => {
    setProcessingId(subscriptionId);
    try {
      const res = await apiFetch(`/api/subscriptions/${subscriptionId}/pause`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to pause subscription');

      await fetchSubscriptions();
      alert('Subscription paused successfully');
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Error: ${errorMessage}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResume = async (subscriptionId: number) => {
    setProcessingId(subscriptionId);
    try {
      const res = await apiFetch(`/api/subscriptions/${subscriptionId}/resume`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to resume subscription');

      await fetchSubscriptions();
      alert('Subscription resumed successfully');
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Error: ${errorMessage}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (subscriptionId: number) => {
    if (
      !confirm('Are you sure you want to cancel this subscription? This action cannot be undone.')
    ) {
      return;
    }

    setProcessingId(subscriptionId);
    try {
      const res = await apiFetch(`/api/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to cancel subscription');

      await fetchSubscriptions();
      alert('Subscription canceled successfully');
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Error: ${errorMessage}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (subscription: Subscription) => {
    const status = subscription.status.toUpperCase();
    let className = 'px-2 py-1 text-xs font-medium rounded-full ';

    switch (status) {
      case 'ACTIVE':
        className += 'bg-green-100 text-green-800';
        break;
      case 'PAUSED':
        className += 'bg-yellow-100 text-yellow-800';
        break;
      case 'CANCELED':
        className += 'bg-red-100 text-red-800';
        break;
      case 'PAST_DUE':
        className += 'bg-orange-100 text-orange-800';
        break;
      default:
        className += 'bg-gray-100 text-gray-800';
    }

    return <span className={className}>{status}</span>;
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/4 rounded bg-gray-200"></div>
          <div className="space-y-3">
            <div className="h-20 rounded bg-gray-200"></div>
            <div className="h-20 rounded bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-red-600">Error loading subscriptions: {error}</p>
      </div>
    );
  }

  // Group shipments by parent (series)
  const shipmentSeries = shipmentSchedules.reduce<Record<number, ShipmentEntry[]>>((acc, s) => {
    const key = s.parentRefillId || s.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const shipmentStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'PRESCRIBED':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'PENDING_PROVIDER':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'SCHEDULED':
        return 'bg-indigo-50 text-indigo-600 border-indigo-200';
      case 'CANCELLED':
        return 'bg-red-50 text-red-600 border-red-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const hasShipments = Object.keys(shipmentSeries).length > 0;

  if (subscriptions.length === 0 && !hasShipments) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">Subscriptions & Treatment Plans</h3>
        <p className="text-gray-500">No active subscriptions or prepaid treatment plans</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Subscriptions & Treatment Plans</h3>

        {/* Prepaid Shipment Schedules (WellMedR multi-month plans) */}
        {hasShipments && (
          <div className="mb-6">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-700 uppercase tracking-wider">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Prepaid Shipment Plans
            </h4>
            <div className="space-y-4">
              {Object.values(shipmentSeries).map((series) => {
                const first = series[0];
                const sorted = [...series].sort((a, b) => a.shipmentNumber - b.shipmentNumber);
                const completed = sorted.filter((s) => s.status === 'COMPLETED' || s.status === 'PRESCRIBED').length;
                const total = first.totalShipments;
                const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                  <div key={first.id} className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h5 className="font-medium text-gray-900">
                          {first.medicationName || 'GLP-1 Treatment'}
                        </h5>
                        <p className="text-sm text-gray-500">
                          {first.planName || `${total}-shipment plan`} — {completed}/{total} shipped
                        </p>
                      </div>
                      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                        {progressPct}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {/* Timeline */}
                    <div className="space-y-2">
                      {sorted.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full border ${shipmentStatusColor(s.status)}`} />
                            <span className="text-gray-700">
                              Shipment {s.shipmentNumber} — {new Date(s.nextRefillDate).toLocaleDateString()}
                            </span>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${shipmentStatusColor(s.status)}`}>
                            {s.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recurring Stripe Subscriptions */}
        {subscriptions.length > 0 && (
        <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Recurring Subscriptions
        </h4>
        <div className="space-y-4">
          {subscriptions.map((subscription: any) => (
            <div key={subscription.id} className="rounded-lg border p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{subscription.planName}</h4>
                  <p className="text-sm text-gray-600">{subscription.planDescription}</p>
                </div>
                <div className="ml-4">{getStatusBadge(subscription)}</div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <span className="text-gray-600">Amount:</span>
                  <p className="font-medium text-[#4fa77e]">
                    {formatPlanPrice(subscription.amount)}/{subscription.interval}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Started:</span>
                  <p className="font-medium">
                    {new Date(subscription.startDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Current Period:</span>
                  <p className="font-medium">
                    Until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
                {subscription.nextBillingDate && (
                  <div>
                    <span className="text-gray-600">Next Billing:</span>
                    <p className="font-medium">
                      {new Date(subscription.nextBillingDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              {subscription.pausedAt && (
                <div className="mb-3 rounded bg-yellow-50 p-2 text-sm">
                  <span className="text-yellow-800">
                    Paused since {new Date(subscription.pausedAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              {subscription.canceledAt && (
                <div className="mb-3 rounded bg-red-50 p-2 text-sm">
                  <span className="text-red-800">
                    Canceled on {new Date(subscription.canceledAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                {subscription.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => handlePause(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="rounded-lg bg-yellow-100 px-3 py-1.5 text-sm text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Pause'}
                    </button>
                    <button
                      onClick={() => handleCancel(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="rounded-lg bg-red-100 px-3 py-1.5 text-sm text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Cancel'}
                    </button>
                  </>
                )}

                {subscription.status === 'PAUSED' && (
                  <>
                    <button
                      onClick={() => handleResume(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="rounded-lg bg-green-100 px-3 py-1.5 text-sm text-green-800 hover:bg-green-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleCancel(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="rounded-lg bg-red-100 px-3 py-1.5 text-sm text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Cancel'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
        )}
      </div>
    </div>
  );
}
