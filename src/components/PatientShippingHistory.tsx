"use client";

import { useState, useEffect } from "react";

type ShippingUpdate = {
  id: number;
  trackingNumber: string;
  carrier: string;
  trackingUrl?: string | null;
  status: string;
  statusNote?: string | null;
  shippedAt?: string | null;
  estimatedDelivery?: string | null;
  actualDelivery?: string | null;
  medication: {
    name?: string | null;
    strength?: string | null;
    quantity?: string | null;
    form?: string | null;
  };
  lifefileOrderId?: string | null;
  brand?: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  order?: {
    id: number;
    lifefileOrderId?: string | null;
    medicationName?: string | null;
    medicationStrength?: string | null;
    status?: string | null;
  } | null;
};

type PatientShippingHistoryProps = {
  patientId: number;
  showTitle?: boolean;
};

// Status icon and color mapping
const statusConfig: Record<string, { color: string; bgColor: string; icon: string; label: string }> = {
  PENDING: {
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    label: "Pending"
  },
  LABEL_CREATED: {
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    label: "Label Created"
  },
  SHIPPED: {
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
    label: "Shipped"
  },
  IN_TRANSIT: {
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
    label: "In Transit"
  },
  OUT_FOR_DELIVERY: {
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    label: "Out for Delivery"
  },
  DELIVERED: {
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    icon: "M5 13l4 4L19 7",
    label: "Delivered"
  },
  RETURNED: {
    color: "text-red-600",
    bgColor: "bg-red-100",
    icon: "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
    label: "Returned"
  },
  EXCEPTION: {
    color: "text-red-600",
    bgColor: "bg-red-100",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    label: "Exception"
  },
  CANCELLED: {
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    icon: "M6 18L18 6M6 6l12 12",
    label: "Cancelled"
  },
};

export default function PatientShippingHistory({ 
  patientId, 
  showTitle = true 
}: PatientShippingHistoryProps) {
  const [shippingUpdates, setShippingUpdates] = useState<ShippingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchShippingUpdates = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/patients/${patientId}/shipping-updates`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch shipping updates');
        }
        
        const data = await response.json();
        setShippingUpdates(data.shippingUpdates || []);
      } catch (err) {
        console.error('Error fetching shipping updates:', err);
        setError(err instanceof Error ? err.message : 'Failed to load shipping history');
      } finally {
        setLoading(false);
      }
    };

    fetchShippingUpdates();
  }, [patientId]);

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null | undefined): string => {
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
    return statusConfig[status] || statusConfig.PENDING;
  };

  const generateTrackingUrl = (carrier: string, trackingNumber: string): string | null => {
    const carrierUrls: Record<string, string> = {
      'UPS': `https://www.ups.com/track?tracknum=${trackingNumber}`,
      'USPS': `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=2&text28777=&tLabels=${trackingNumber}`,
      'FedEx': `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      'DHL': `https://www.dhl.com/us-en/home/tracking/tracking-global-forwarding.html?submit=1&tracking-id=${trackingNumber}`,
    };
    
    const normalizedCarrier = carrier.toUpperCase();
    for (const [key, url] of Object.entries(carrierUrls)) {
      if (normalizedCarrier.includes(key.toUpperCase())) {
        return url;
      }
    }
    return null;
  };

  if (loading) {
    return (
      <div className="border rounded-xl bg-white shadow p-6">
        {showTitle && (
          <h2 className="text-xl font-semibold mb-4">Shipping History</h2>
        )}
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4fa77e]"></div>
          <span className="ml-3 text-gray-500">Loading shipping history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-xl bg-white shadow p-6">
        {showTitle && (
          <h2 className="text-xl font-semibold mb-4">Shipping History</h2>
        )}
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="mt-2 text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (shippingUpdates.length === 0) {
    return (
      <div className="border rounded-xl bg-white shadow p-6">
        {showTitle && (
          <h2 className="text-xl font-semibold mb-4">Shipping History</h2>
        )}
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <p className="mt-2 text-gray-500">No shipping updates yet</p>
          <p className="text-sm text-gray-400">Updates will appear here when prescriptions are shipped</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-white shadow p-6">
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Shipping History</h2>
          <span className="text-sm text-gray-500">
            {shippingUpdates.length} shipment{shippingUpdates.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {shippingUpdates.map((update) => {
          const config = getStatusConfig(update.status);
          const trackingUrl = update.trackingUrl || generateTrackingUrl(update.carrier, update.trackingNumber);
          
          return (
            <div
              key={update.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              {/* Header Row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${config.bgColor}`}>
                    <svg
                      className={`w-5 h-5 ${config.color}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={config.icon}
                      />
                    </svg>
                  </div>
                  <div>
                    <span className={`text-sm font-semibold ${config.color}`}>
                      {config.label}
                    </span>
                    {update.statusNote && (
                      <p className="text-xs text-gray-500">{update.statusNote}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDateTime(update.createdAt)}
                </span>
              </div>

              {/* Tracking Info */}
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Tracking Number
                    </p>
                    {trackingUrl ? (
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-[#4fa77e] hover:underline"
                      >
                        {update.trackingNumber}
                        <svg
                          className="inline-block w-3 h-3 ml-1"
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
                      <p className="text-sm font-mono">{update.trackingNumber}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Carrier
                    </p>
                    <p className="text-sm font-semibold">{update.carrier}</p>
                  </div>
                </div>
              </div>

              {/* Medication Info (if available) */}
              {(update.medication.name || update.order?.medicationName) && (
                <div className="flex items-center gap-2 mb-3 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span className="text-gray-700">
                    {update.medication.name || update.order?.medicationName}
                    {(update.medication.strength || update.order?.medicationStrength) && (
                      <span className="text-gray-500">
                        {' '}({update.medication.strength || update.order?.medicationStrength})
                      </span>
                    )}
                    {update.medication.quantity && (
                      <span className="text-gray-500"> × {update.medication.quantity}</span>
                    )}
                  </span>
                </div>
              )}

              {/* Dates Row */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                {update.shippedAt && (
                  <div>
                    <p className="text-xs text-gray-500">Shipped</p>
                    <p className="font-medium">{formatDate(update.shippedAt)}</p>
                  </div>
                )}
                {update.estimatedDelivery && (
                  <div>
                    <p className="text-xs text-gray-500">Est. Delivery</p>
                    <p className="font-medium">{formatDate(update.estimatedDelivery)}</p>
                  </div>
                )}
                {update.actualDelivery && (
                  <div>
                    <p className="text-xs text-gray-500">Delivered</p>
                    <p className="font-medium text-emerald-600">{formatDate(update.actualDelivery)}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {update.lifefileOrderId && `Order #${update.lifefileOrderId}`}
                  {update.brand && ` · ${update.brand}`}
                </span>
                <span className="capitalize">{update.source}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
