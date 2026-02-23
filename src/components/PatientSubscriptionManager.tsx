'use client';

import { useState, useEffect } from 'react';
import { formatPlanPrice, getGroupedPlans, getPlanById } from '@/config/billingPlans';
import { apiFetch } from '@/lib/api/fetch';
import { getRefillDefaultsForPlanDuration } from '@/services/refill/refillPlanDefaults';

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
  stripeSubscriptionId: string | null;
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
  clinicSubdomain?: string | null;
}

export function PatientSubscriptionManager({
  patientId,
  patientName,
  clinicSubdomain,
}: PatientSubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [shipmentSchedules, setShipmentSchedules] = useState<ShipmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Manual enrollment form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualPlanId, setManualPlanId] = useState('');
  const [manualStartDate, setManualStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [manualNotes, setManualNotes] = useState('');
  const [manualQueueRefill, setManualQueueRefill] = useState(true);
  const [manualRefillFrequency, setManualRefillFrequency] = useState<
    'MONTHLY' | 'QUARTERLY' | 'SEMESTER' | 'ANNUAL'
  >('QUARTERLY');
  const [manualRefillCount, setManualRefillCount] = useState(1);
  const [manualRefillHint, setManualRefillHint] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  // Edit prepaid shipment
  const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editPlanName, setEditPlanName] = useState('');
  const [editMedicationName, setEditMedicationName] = useState('');
  const [shipmentActionId, setShipmentActionId] = useState<number | null>(null);

  // When plan changes, apply smart refill defaults (6mo → 1 refill quarterly, 12mo → 3 refills quarterly, etc.)
  useEffect(() => {
    if (!manualPlanId || !clinicSubdomain) {
      setManualRefillHint(null);
      return;
    }
    const plan = getPlanById(manualPlanId, clinicSubdomain);
    const months = plan?.months;
    if (months == null || months < 1) {
      setManualRefillHint(null);
      return;
    }
    const defaults = getRefillDefaultsForPlanDuration(months);
    setManualRefillFrequency(defaults.refillFrequency);
    setManualRefillCount(defaults.refillCount);
    setManualRefillHint(defaults.hint ?? null);
  }, [manualPlanId, clinicSubdomain]);

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

  const handleManualEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPlanId) {
      setManualError('Please select a plan');
      return;
    }

    setManualSubmitting(true);
    setManualError(null);
    setManualSuccess(null);

    try {
      const res = await apiFetch(`/api/patients/${patientId}/subscriptions/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: manualPlanId,
          startDate: manualStartDate || undefined,
          notes: manualNotes || undefined,
          queueRefill: manualQueueRefill,
          refillCount: manualQueueRefill ? manualRefillCount : 1,
          refillFrequency: manualQueueRefill ? manualRefillFrequency : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enroll');

      const refillMsg =
        data.refills?.length > 0
          ? data.refills.length === 1
            ? ' — 1 refill queued for admin review'
            : ` — ${data.refills.length} refills queued for admin/provider approval`
          : '';
      setManualSuccess(`Enrolled in ${data.subscription.planName}` + refillMsg);
      setManualPlanId('');
      setManualNotes('');
      setManualQueueRefill(true);
      setManualRefillFrequency('QUARTERLY');
      setManualRefillCount(1);
      setManualRefillHint(null);
      setShowManualForm(false);
      await fetchSubscriptions();
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setManualSubmitting(false);
    }
  };

  const groupedPlans = getGroupedPlans(clinicSubdomain);

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

  const canEditOrDeleteShipment = (status: string) => {
    const terminal = ['COMPLETED', 'PRESCRIBED', 'CANCELLED'];
    return !terminal.includes(status);
  };

  const openEditShipment = (s: ShipmentEntry) => {
    setEditingShipmentId(s.id);
    setEditDate(new Date(s.nextRefillDate).toISOString().split('T')[0]);
    setEditPlanName(s.planName || '');
    setEditMedicationName(s.medicationName || '');
  };

  const closeEditShipment = () => {
    setEditingShipmentId(null);
    setEditDate('');
    setEditPlanName('');
    setEditMedicationName('');
  };

  const handleSaveShipmentEdit = async () => {
    if (editingShipmentId == null) return;
    setShipmentActionId(editingShipmentId);
    try {
      const res = await apiFetch(
        `/api/patients/${patientId}/refill-queue/${editingShipmentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nextRefillDate: editDate || undefined,
            planName: editPlanName || undefined,
            medicationName: editMedicationName || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update shipment');
      }
      closeEditShipment();
      await fetchSubscriptions();
      setManualSuccess('Shipment date updated');
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setShipmentActionId(null);
    }
  };

  const handleDeleteShipment = async (s: ShipmentEntry) => {
    if (!confirm(`Remove shipment ${s.shipmentNumber} (${new Date(s.nextRefillDate).toLocaleDateString()})? This will cancel the refill.`)) return;
    setShipmentActionId(s.id);
    try {
      const res = await apiFetch(
        `/api/patients/${patientId}/refill-queue/${s.id}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Deleted from patient billing' }) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove shipment');
      }
      await fetchSubscriptions();
      setManualSuccess('Shipment removed');
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setShipmentActionId(null);
    }
  };

  const manualEnrollmentForm = (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <form onSubmit={handleManualEnroll} className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">Manual Enrollment</h4>
          <button
            type="button"
            onClick={() => { setShowManualForm(false); setManualError(null); setManualSuccess(null); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>

        {manualError && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700">{manualError}</div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Plan</label>
          <select
            value={manualPlanId}
            onChange={(e) => setManualPlanId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
            required
          >
            <option value="">Select a plan...</option>
            {Object.entries(groupedPlans).map(([key, group]) => (
              <optgroup key={key} label={group.label}>
                {group.plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {formatPlanPrice(plan.price)}
                    {plan.isRecurring ? ' /recurring' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Start Date</label>
          <input
            type="date"
            value={manualStartDate}
            onChange={(e) => setManualStartDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Notes <span className="font-normal text-gray-400">(e.g., &quot;Paid via old EMR through 03/2026&quot;)</span>
          </label>
          <textarea
            value={manualNotes}
            onChange={(e) => setManualNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
            placeholder="Migration notes..."
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={manualQueueRefill}
            onChange={(e) => setManualQueueRefill(e.target.checked)}
            className="rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
          />
          Queue refills for admin/provider approval
        </label>

        {manualQueueRefill && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Refill frequency
              </label>
              <select
                value={manualRefillFrequency}
                onChange={(e) =>
                  setManualRefillFrequency(
                    e.target.value as 'MONTHLY' | 'QUARTERLY' | 'SEMESTER' | 'ANNUAL'
                  )
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
              >
                <option value="MONTHLY">Monthly (every 1 month)</option>
                <option value="QUARTERLY">Quarterly (every 3 months)</option>
                <option value="SEMESTER">Semesters (every 6 months)</option>
                <option value="ANNUAL">12 months (every 12 months)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Number of refills to queue
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={manualRefillCount}
                onChange={(e) =>
                  setManualRefillCount(
                    Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1))
                  )
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
              />
              <p className="mt-1 text-xs text-gray-500">
                Refills are queued on these dates (start date + frequency) unless the subscription
                is cancelled or paused. Each goes to admin for approval.
              </p>
              {manualRefillHint && (
                <p className="mt-1.5 text-xs text-[#4fa77e] bg-[#4fa77e]/10 rounded px-2 py-1.5">
                  {manualRefillHint}
                </p>
              )}
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={manualSubmitting || !manualPlanId}
          className="w-full rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f8660] disabled:opacity-50"
        >
          {manualSubmitting ? 'Enrolling...' : 'Enroll Patient'}
        </button>
      </form>
    </div>
  );

  if (subscriptions.length === 0 && !hasShipments) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Subscriptions & Treatment Plans</h3>
          {!showManualForm && (
            <button
              onClick={() => setShowManualForm(true)}
              className="rounded-lg border border-[#4fa77e] px-3 py-1.5 text-sm font-medium text-[#4fa77e] hover:bg-[#4fa77e]/5"
            >
              + Manual Enrollment
            </button>
          )}
        </div>
        {manualSuccess && (
          <div className="mb-4 rounded bg-green-50 p-2 text-sm text-green-700">{manualSuccess}</div>
        )}
        {showManualForm ? manualEnrollmentForm : (
          <p className="text-gray-500">No active subscriptions or prepaid treatment plans</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Subscriptions & Treatment Plans</h3>
          {!showManualForm && (
            <button
              onClick={() => setShowManualForm(true)}
              className="rounded-lg border border-[#4fa77e] px-3 py-1.5 text-sm font-medium text-[#4fa77e] hover:bg-[#4fa77e]/5"
            >
              + Manual Enrollment
            </button>
          )}
        </div>

        {manualSuccess && (
          <div className="mb-4 rounded bg-green-50 p-2 text-sm text-green-700">{manualSuccess}</div>
        )}

        {showManualForm && <div className="mb-6">{manualEnrollmentForm}</div>}

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
                        <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`h-2.5 w-2.5 shrink-0 rounded-full border ${shipmentStatusColor(s.status)}`} />
                            <span className="text-gray-700">
                              Shipment {s.shipmentNumber} — {new Date(s.nextRefillDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${shipmentStatusColor(s.status)}`}>
                              {s.status.replace(/_/g, ' ')}
                            </span>
                            {canEditOrDeleteShipment(s.status) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditShipment(s)}
                                  disabled={shipmentActionId !== null}
                                  className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
                                  title="Edit"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteShipment(s)}
                                  disabled={shipmentActionId !== null}
                                  className="rounded p-1 text-gray-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                                  title="Remove"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Edit shipment modal */}
        {editingShipmentId != null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeEditShipment}>
            <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h4 className="mb-3 font-semibold text-gray-900">Edit shipment date</h4>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Plan name (optional)</label>
                  <input
                    type="text"
                    value={editPlanName}
                    onChange={(e) => setEditPlanName(e.target.value)}
                    placeholder="e.g. Tirzepatide 12 Months"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Medication (optional)</label>
                  <input
                    type="text"
                    value={editMedicationName}
                    onChange={(e) => setEditMedicationName(e.target.value)}
                    placeholder="e.g. Tirzepatide"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveShipmentEdit}
                  disabled={shipmentActionId !== null}
                  className="flex-1 rounded-lg bg-[#4fa77e] px-3 py-2 text-sm font-medium text-white hover:bg-[#3f8660] disabled:opacity-50"
                >
                  {shipmentActionId === editingShipmentId ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={closeEditShipment}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
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
                <div className="ml-4 flex items-center gap-2">
                  {getStatusBadge(subscription)}
                  {!subscription.stripeSubscriptionId && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      Manual
                    </span>
                  )}
                </div>
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
