"use client";

import { useState, useEffect } from "react";

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

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  PENDING: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Pending' },
  LABEL_CREATED: { color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Label Created' },
  SHIPPED: { color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Shipped' },
  IN_TRANSIT: { color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'In Transit' },
  OUT_FOR_DELIVERY: { color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'Out for Delivery' },
  DELIVERED: { color: 'text-emerald-600', bgColor: 'bg-emerald-100', label: 'Delivered' },
  RETURNED: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'Returned' },
  EXCEPTION: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'Exception' },
  CANCELLED: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Cancelled' },
};

export default function PatientPrescriptionSummary({ patientId }: PatientPrescriptionSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrescriptionDate, setLastPrescriptionDate] = useState<string | null>(null);
  const [lastMedication, setLastMedication] = useState<string | null>(null);
  const [trackingEntries, setTrackingEntries] = useState<TrackingEntry[]>([]);
  
  // Add tracking form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingTracking, setAddingTracking] = useState(false);
  const [formData, setFormData] = useState({
    trackingNumber: '',
    carrier: 'UPS',
    medicationName: '',
    medicationStrength: '',
    medicationQuantity: '',
    isRefill: false,
    refillNumber: 1,
    notes: '',
  });

  const fetchTrackingData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/patients/${patientId}/tracking`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tracking data');
      }
      
      const data = await response.json();
      setLastPrescriptionDate(data.lastPrescriptionDate);
      setLastMedication(data.lastMedication);
      setTrackingEntries(data.trackingEntries || []);
    } catch (err) {
      console.error('Error fetching tracking data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracking data');
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
      const response = await fetch(`/api/patients/${patientId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: formData.trackingNumber.trim(),
          carrier: formData.carrier,
          medicationName: formData.medicationName.trim() || undefined,
          medicationStrength: formData.medicationStrength.trim() || undefined,
          medicationQuantity: formData.medicationQuantity.trim() || undefined,
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
        medicationName: '',
        medicationStrength: '',
        medicationQuantity: '',
        isRefill: false,
        refillNumber: 1,
        notes: '',
      });
      setShowAddForm(false);
      fetchTrackingData();
    } catch (err) {
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
      <div className="border rounded-xl bg-white shadow p-6">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#4fa77e]"></div>
          <span className="ml-2 text-gray-500 text-sm">Loading prescription data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-xl bg-white shadow p-6">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-white shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#4fa77e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">Prescription & Tracking</h2>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-[#4fa77e] border border-[#4fa77e] rounded-lg hover:bg-[#4fa77e]/5 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Tracking
        </button>
      </div>

      {/* Last Prescription Info */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Last Prescription</p>
            <p className="text-lg font-semibold text-gray-900">
              {lastPrescriptionDate ? formatDate(lastPrescriptionDate) : 'No prescriptions'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Medication</p>
            <p className="text-lg font-semibold text-gray-900">
              {lastMedication || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Add Tracking Form */}
      {showAddForm && (
        <form onSubmit={handleAddTracking} className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">Add Tracking Entry</h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tracking Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.trackingNumber}
                onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                placeholder="1Z999AA10123456784"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                required
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Carrier <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
              >
                {CARRIERS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Medication Name</label>
              <input
                type="text"
                value={formData.medicationName}
                onChange={(e) => setFormData({ ...formData, medicationName: e.target.value })}
                placeholder="Semaglutide"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Strength</label>
              <input
                type="text"
                value={formData.medicationStrength}
                onChange={(e) => setFormData({ ...formData, medicationStrength: e.target.value })}
                placeholder="0.5mg"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="text"
                value={formData.medicationQuantity}
                onChange={(e) => setFormData({ ...formData, medicationQuantity: e.target.value })}
                placeholder="4"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isRefill}
                  onChange={(e) => setFormData({ ...formData, isRefill: e.target.checked })}
                  className="w-4 h-4 text-[#4fa77e] rounded focus:ring-[#4fa77e]"
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
                    onChange={(e) => setFormData({ ...formData, refillNumber: parseInt(e.target.value) || 1 })}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingTracking || !formData.trackingNumber.trim()}
              className="px-4 py-2 text-sm text-white bg-[#4fa77e] rounded-lg hover:bg-[#3f8660] disabled:opacity-50"
            >
              {addingTracking ? 'Adding...' : 'Add Entry'}
            </button>
          </div>
        </form>
      )}

      {/* Tracking Entries List */}
      {trackingEntries.length === 0 ? (
        <div className="text-center py-6">
          <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
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
                className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Status and Date */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                      {entry.isRefill && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                          Refill #{entry.refillNumber || '—'}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(entry.shippedAt || entry.createdAt)}
                      </span>
                    </div>

                    {/* Tracking Number with Link */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 uppercase">{entry.carrier}:</span>
                      {entry.trackingUrl ? (
                        <a
                          href={entry.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-mono text-[#4fa77e] hover:underline inline-flex items-center"
                        >
                          {entry.trackingNumber}
                          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-sm font-mono">{entry.trackingNumber}</span>
                      )}
                    </div>

                    {/* Medication Info */}
                    {entry.medicationName && (
                      <p className="text-sm text-gray-600 mt-1">
                        {entry.medicationName}
                        {entry.medicationStrength && ` ${entry.medicationStrength}`}
                        {entry.medicationQuantity && ` × ${entry.medicationQuantity}`}
                      </p>
                    )}

                    {/* Delivery Dates */}
                    {(entry.estimatedDelivery || entry.actualDelivery) && (
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
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
                  <span className="text-xs text-gray-400 capitalize">
                    {entry.source}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
