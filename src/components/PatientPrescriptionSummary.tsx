'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/fetch';

type TrackingEntry = {
  id: string;
  type: string;
  trackingNumber: string;
  carrier: string;
  trackingUrl: string | null;
  status: string;
  statusNote: string | null;
  medicationName: string | null;
  medicationStrength: string | null;
  medicationQuantity: string | null;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  orderId: number | null;
  lifefileOrderId: string | null;
  source: string;
  createdAt: string;
  isRefill: boolean;
  refillNumber: number | null;
};

type Medication = {
  name: string;
  strength: string;
  form: string;
  quantity: string;
  displayName: string;
};

type UnmatchedPrescription = {
  orderId: number;
  rxId: number;
  medName: string;
  strength: string;
  form: string;
  quantity: string;
  displayName: string;
};

type PatientPrescriptionSummaryProps = {
  patientId: number;
};

const CARRIERS = [
  { value: 'UPS', label: 'UPS' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'USPS', label: 'USPS' },
  { value: 'DHL', label: 'DHL' },
  { value: 'Other', label: 'Other' },
];

// Auto-detect carrier from tracking number pattern
function detectCarrierFromTrackingNumber(trackingNumber: string): string {
  const tn = trackingNumber.trim().toUpperCase();
  if (!tn) return 'UPS'; // default
  if (/^1Z[A-Z0-9]{16}$/i.test(tn)) return 'UPS';
  if (/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(tn)) return 'FedEx';
  if (/^\d{20,22}$/.test(tn) || /^(94|93|92|91|9[0-5])\d{18,20}$/.test(tn)) return 'USPS';
  if (/^\d{10}$/.test(tn)) return 'DHL';
  return 'Other';
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  PENDING: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Pending' },
  LABEL_CREATED: { color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Label Created' },
  SHIPPED: { color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Shipped' },
  IN_TRANSIT: { color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'In Transit' },
  OUT_FOR_DELIVERY: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    label: 'Out for Delivery',
  },
  DELIVERED: { color: 'text-emerald-600', bgColor: 'bg-emerald-100', label: 'Delivered' },
  RETURNED: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'Returned' },
  EXCEPTION: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'Exception' },
  CANCELLED: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Cancelled' },
};

export default function PatientPrescriptionSummary({ patientId }: PatientPrescriptionSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrescriptionDate, setLastPrescriptionDate] = useState<string | null>(null);
  const [lastMedications, setLastMedications] = useState<Medication[]>([]);
  const [trackingEntries, setTrackingEntries] = useState<TrackingEntry[]>([]);
  const [unmatchedPrescriptions, setUnmatchedPrescriptions] = useState<UnmatchedPrescription[]>(
    []
  );

  // Add tracking form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingTracking, setAddingTracking] = useState(false);
  const [formData, setFormData] = useState({
    trackingNumber: '',
    carrier: 'UPS',
    selectedPrescriptionId: '', // 'orderId-rxId' or ''
    medicationName: '',
    medicationStrength: '',
    medicationQuantity: '',
    orderId: null as number | null,
    isRefill: false,
    refillNumber: 1,
    notes: '',
  });

  const fetchTrackingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/patients/${patientId}/tracking`);

      if (!response.ok) {
        // Don't treat 404 (no data) as an error - just show empty state
        if (response.status === 404) {
          setLastPrescriptionDate(null);
          setLastMedications([]);
          setTrackingEntries([]);
          return;
        }
        // For auth errors, silently fail and show empty state
        if (response.status === 401 || response.status === 403) {
          console.warn('Auth error fetching tracking data, showing empty state');
          setTrackingEntries([]);
          return;
        }
        throw new Error('Failed to fetch tracking data');
      }

      const data = await response.json();
      setLastPrescriptionDate(data.lastPrescriptionDate);
      // Use new medications array, fallback to legacy single medication
      if (data.lastMedications && data.lastMedications.length > 0) {
        setLastMedications(data.lastMedications);
      } else if (data.lastMedication) {
        // Backward compatibility: convert single medication to array format
        setLastMedications([
          {
            name: data.lastMedication,
            strength: '',
            form: '',
            quantity: '',
            displayName: data.lastMedication,
          },
        ]);
      } else {
        setLastMedications([]);
      }
      setTrackingEntries(data.trackingEntries || []);
      setUnmatchedPrescriptions(data.unmatchedPrescriptions || []);
    } catch (err) {
      if ((err as { isAuthError?: boolean })?.isAuthError) {
        // Session expired - SessionExpirationHandler modal will show
        return;
      }
      console.error('Error fetching tracking data:', err);
      // Show empty state instead of error for network issues
      setTrackingEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackingData();
  }, [patientId]);

  const handleAddTracking = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.trackingNumber.trim() || !formData.carrier) {
      return;
    }

    setAddingTracking(true);

    try {
      const response = await apiFetch(`/api/patients/${patientId}/tracking`, {
        method: 'POST',
        body: JSON.stringify({
          trackingNumber: formData.trackingNumber.trim(),
          carrier: formData.carrier,
          orderId: formData.orderId || undefined,
          medicationName: formData.medicationName.trim() || undefined,
          medicationStrength: formData.medicationStrength.trim() || undefined,
          medicationQuantity: formData.medicationQuantity.trim() || '1',
          isRefill: formData.isRefill,
          refillNumber: formData.isRefill ? formData.refillNumber : undefined,
          notes: formData.notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add tracking');
      }

      // Reset form and refresh data
      setFormData({
        trackingNumber: '',
        carrier: 'UPS',
        selectedPrescriptionId: '',
        medicationName: '',
        medicationStrength: '',
        medicationQuantity: '',
        orderId: null,
        isRefill: false,
        refillNumber: 1,
        notes: '',
      });
      setShowAddForm(false);
      fetchTrackingData();
    } catch (err) {
      if ((err as { isAuthError?: boolean })?.isAuthError) {
        // Session expired - SessionExpirationHandler modal will show
        return;
      }
      alert(err instanceof Error ? err.message : 'Failed to add tracking');
    } finally {
      setAddingTracking(false);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.SHIPPED;
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow">
        <div className="flex items-center justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[#4fa77e]"></div>
          <span className="ml-2 text-sm text-gray-500">Loading prescription data...</span>
        </div>
      </div>
    );
  }

  // Note: We no longer show error state - just empty state instead
  // This prevents confusing "Failed to fetch" messages when there's simply no data

  return (
    <div className="rounded-xl border bg-white p-6 shadow">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-[#4fa77e]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">Prescription & Tracking</h2>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center rounded-lg border border-[#4fa77e] px-3 py-1.5 text-sm font-medium text-[#4fa77e] transition-colors hover:bg-[#4fa77e]/5"
        >
          <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Tracking
        </button>
      </div>

      {/* Last Prescription Info */}
      <div className="mb-4 rounded-lg bg-gray-50 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Last Prescription</p>
            <p className="text-lg font-semibold text-gray-900">
              {lastPrescriptionDate ? formatDate(lastPrescriptionDate) : 'No prescriptions'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {lastMedications.length > 1
                ? `Medications (${lastMedications.length})`
                : 'Medication'}
            </p>
            {lastMedications.length === 0 ? (
              <p className="text-lg font-semibold text-gray-900">—</p>
            ) : lastMedications.length === 1 ? (
              <p className="text-lg font-semibold text-gray-900">
                {lastMedications[0].displayName}
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {lastMedications.map((med, index) => (
                  <li key={index} className="flex items-start text-sm font-medium text-gray-900">
                    <span className="mr-2 text-[#4fa77e]">•</span>
                    <span>{med.displayName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Add Tracking Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddTracking}
          className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4"
        >
          <h3 className="mb-3 text-sm font-semibold text-blue-900">Add Tracking Entry</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Tracking Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.trackingNumber}
                onChange={(e) => {
                  const v = e.target.value;
                  const detected = detectCarrierFromTrackingNumber(v);
                  setFormData((prev) => ({
                    ...prev,
                    trackingNumber: v,
                    carrier: detected !== 'Other' ? detected : prev.carrier,
                  }));
                }}
                placeholder="FedEx: 888705580712 · UPS: 1Z036E5K0321370144"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Carrier <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
              >
                {CARRIERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Match to Prescription (optional)
              </label>
              <select
                value={formData.selectedPrescriptionId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setFormData((prev) => ({
                      ...prev,
                      selectedPrescriptionId: '',
                      medicationName: '',
                      medicationStrength: '',
                      medicationQuantity: '',
                      orderId: null,
                    }));
                    return;
                  }
                  const rx = unmatchedPrescriptions.find(
                    (p) => `${p.orderId}-${p.rxId}` === val
                  );
                  if (rx) {
                    setFormData((prev) => ({
                      ...prev,
                      selectedPrescriptionId: val,
                      medicationName: rx.medName,
                      medicationStrength: rx.strength,
                      medicationQuantity: rx.quantity,
                      orderId: rx.orderId,
                    }));
                  }
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
              >
                <option value="">
                  {unmatchedPrescriptions.length === 0
                    ? 'No unmatched prescriptions'
                    : '— Select prescription or type manually below —'}
                </option>
                {unmatchedPrescriptions.map((rx) => (
                  <option key={`${rx.orderId}-${rx.rxId}`} value={`${rx.orderId}-${rx.rxId}`}>
                    {rx.displayName}
                  </option>
                ))}
              </select>
              {unmatchedPrescriptions.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Only prescriptions not yet matched to tracking are listed.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Medication Name
              </label>
              <input
                type="text"
                value={formData.medicationName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, medicationName: e.target.value }))
                }
                placeholder="e.g. Semaglutide"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Strength</label>
              <input
                type="text"
                value={formData.medicationStrength}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, medicationStrength: e.target.value }))
                }
                placeholder="e.g. 0.5mg"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Quantity <span className="font-normal text-gray-500">(vials in this shipment)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(formData.medicationQuantity || '1', 10) || 1;
                    const next = Math.max(1, current - 1);
                    setFormData((prev) => ({ ...prev, medicationQuantity: String(next) }));
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-lg font-semibold text-gray-600 hover:border-[#4fa77e] hover:bg-gray-50 hover:text-[#4fa77e]"
                  aria-label="Decrease vials"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={formData.medicationQuantity || '1'}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setFormData((prev) => ({ ...prev, medicationQuantity: '' }));
                      return;
                    }
                    const num = parseInt(v, 10);
                    if (!isNaN(num)) {
                      setFormData((prev) => ({
                        ...prev,
                        medicationQuantity: String(Math.min(24, Math.max(1, num))),
                      }));
                    }
                  }}
                  className="w-20 rounded-lg border-2 border-gray-300 px-3 py-2 text-center text-sm font-medium focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
                  title="Number of vials in this shipment (1–24)"
                  aria-label="Vials in shipment"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(formData.medicationQuantity || '1', 10) || 1;
                    const next = Math.min(24, current + 1);
                    setFormData((prev) => ({ ...prev, medicationQuantity: String(next) }));
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-lg font-semibold text-gray-600 hover:border-[#4fa77e] hover:bg-gray-50 hover:text-[#4fa77e]"
                  aria-label="Increase vials"
                >
                  +
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                One shipment can include multiple vials — use +/− or type the total (1–24).
              </p>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isRefill}
                  onChange={(e) => setFormData({ ...formData, isRefill: e.target.checked })}
                  className="h-4 w-4 rounded text-[#4fa77e] focus:ring-[#4fa77e]"
                />
                <span className="text-sm text-gray-700">This is a refill</span>
              </label>

              {formData.isRefill && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Refill #</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.refillNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, refillNumber: parseInt(e.target.value) || 1 })
                    }
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingTracking || !formData.trackingNumber.trim()}
              className="rounded-lg bg-[#4fa77e] px-4 py-2 text-sm text-white hover:bg-[#3f8660] disabled:opacity-50"
            >
              {addingTracking ? 'Adding...' : 'Add Entry'}
            </button>
          </div>
        </form>
      )}

      {/* Tracking Entries List */}
      {trackingEntries.length === 0 ? (
        <div className="py-6 text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No tracking entries yet</p>
          <p className="text-xs text-gray-400">Click "Add Tracking" to add a shipment</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">
            Tracking History ({trackingEntries.length})
          </p>

          {trackingEntries.map((entry) => {
            const statusConfig = getStatusConfig(entry.status);

            return (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Status and Date */}
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                      {entry.isRefill && (
                        <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          Refill #{entry.refillNumber || '—'}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(entry.shippedAt || entry.createdAt)}
                      </span>
                    </div>

                    {/* Tracking Number with Link */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase text-gray-500">{entry.carrier}:</span>
                      {entry.trackingUrl ? (
                        <a
                          href={entry.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center font-mono text-sm text-[#4fa77e] hover:underline"
                        >
                          {entry.trackingNumber}
                          <svg
                            className="ml-1 h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ) : (
                        <span className="font-mono text-sm">{entry.trackingNumber}</span>
                      )}
                    </div>

                    {/* Medication Info */}
                    {entry.medicationName && (
                      <p className="mt-1 text-sm text-gray-600">
                        {entry.medicationName}
                        {entry.medicationStrength && ` ${entry.medicationStrength}`}
                        {entry.medicationQuantity && ` × ${entry.medicationQuantity}`}
                      </p>
                    )}

                    {/* Delivery Dates */}
                    {(entry.estimatedDelivery || entry.actualDelivery) && (
                      <div className="mt-1 flex gap-4 text-xs text-gray-500">
                        {entry.estimatedDelivery && !entry.actualDelivery && (
                          <span>Est. delivery: {formatDate(entry.estimatedDelivery)}</span>
                        )}
                        {entry.actualDelivery && (
                          <span className="text-emerald-600">
                            Delivered: {formatDate(entry.actualDelivery)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Source Badge */}
                  <span className="text-xs capitalize text-gray-400">{entry.source}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
