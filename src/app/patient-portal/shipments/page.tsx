'use client';

import { useState, useEffect } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  ChevronRight,
  Calendar,
} from 'lucide-react';

interface Shipment {
  id: string;
  orderNumber: string;
  status: 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered';
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  items: Array<{ name: string; quantity: number }>;
  orderedAt: string;
  shippedAt?: string;
  estimatedDelivery?: string;
  deliveredAt?: string;
  lastUpdate: string;
  lastLocation?: string;
}

const statusConfig = {
  processing: {
    label: 'Processing',
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    icon: Clock,
    step: 1,
  },
  shipped: {
    label: 'Shipped',
    color: '#3B82F6',
    bgColor: '#DBEAFE',
    icon: Package,
    step: 2,
  },
  in_transit: {
    label: 'In Transit',
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
    icon: Truck,
    step: 3,
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: '#10B981',
    bgColor: '#D1FAE5',
    icon: Truck,
    step: 4,
  },
  delivered: {
    label: 'Delivered',
    color: '#059669',
    bgColor: '#D1FAE5',
    icon: CheckCircle2,
    step: 5,
  },
};

const steps = [
  { label: 'Ordered', status: 'processing' },
  { label: 'Shipped', status: 'shipped' },
  { label: 'In Transit', status: 'in_transit' },
  { label: 'Out for Delivery', status: 'out_for_delivery' },
  { label: 'Delivered', status: 'delivered' },
];

export default function ShipmentsPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    // Demo shipments - in production, fetch from API
    const demoShipments: Shipment[] = [
      {
        id: '1',
        orderNumber: 'ORD-2024-001234',
        status: 'in_transit',
        carrier: 'USPS',
        trackingNumber: '9400111899223033005678',
        trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223033005678',
        items: [
          { name: 'Semaglutide 5mg/mL', quantity: 1 },
          { name: 'Syringes (10 pack)', quantity: 1 },
        ],
        orderedAt: '2026-01-15T10:30:00Z',
        shippedAt: '2026-01-16T14:00:00Z',
        estimatedDelivery: '2026-01-22',
        lastUpdate: '2026-01-18T08:45:00Z',
        lastLocation: 'Miami, FL Distribution Center',
      },
      {
        id: '2',
        orderNumber: 'ORD-2024-001189',
        status: 'delivered',
        carrier: 'FedEx',
        trackingNumber: '794644790132',
        trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=794644790132',
        items: [{ name: 'Semaglutide 5mg/mL', quantity: 1 }],
        orderedAt: '2025-12-20T09:00:00Z',
        shippedAt: '2025-12-21T11:00:00Z',
        estimatedDelivery: '2025-12-24',
        deliveredAt: '2025-12-23T15:30:00Z',
        lastUpdate: '2025-12-23T15:30:00Z',
        lastLocation: 'Delivered to front door',
      },
    ];

    setShipments(demoShipments);
    setSelectedShipment(demoShipments[0]);
    setLoading(false);
  };

  const getStatusStep = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig]?.step || 1;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Shipment Tracking</h1>
        <p className="mt-1 text-gray-500">Track your medication deliveries</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Shipment List */}
        <div className="space-y-3 lg:col-span-1">
          <h2 className="mb-2 text-sm font-medium text-gray-500">Your Orders</h2>
          {shipments.map((shipment) => {
            const config = statusConfig[shipment.status];
            const StatusIcon = config.icon;
            const isSelected = selectedShipment?.id === shipment.id;

            return (
              <button
                key={shipment.id}
                onClick={() => setSelectedShipment(shipment)}
                className={`w-full rounded-xl border-2 bg-white p-4 text-left transition-all ${
                  isSelected ? '' : 'border-transparent hover:border-gray-200'
                }`}
                style={isSelected ? { borderColor: primaryColor } : {}}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg p-2" style={{ backgroundColor: config.bgColor }}>
                    <StatusIcon className="h-5 w-5" style={{ color: config.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{shipment.orderNumber}</p>
                    <p className="text-sm font-medium" style={{ color: config.color }}>
                      {config.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {shipment.items.length} item{shipment.items.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight
                    className={`h-5 w-5 transition-colors ${isSelected ? '' : 'text-gray-300'}`}
                    style={isSelected ? { color: primaryColor } : {}}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Shipment Details */}
        {selectedShipment && (
          <div className="space-y-6 lg:col-span-2">
            {/* Status Card */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="p-6" style={{ backgroundColor: primaryColor }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="mb-1 text-sm text-white/80">Order Status</p>
                    <p className="text-2xl font-semibold text-white">
                      {statusConfig[selectedShipment.status].label}
                    </p>
                  </div>
                  <Package className="h-10 w-10 text-white/50" />
                </div>

                {selectedShipment.estimatedDelivery && selectedShipment.status !== 'delivered' && (
                  <div className="mt-4 rounded-xl bg-white/20 p-3">
                    <p className="text-xs text-white/80">Estimated Delivery</p>
                    <p className="font-semibold text-white">
                      {new Date(selectedShipment.estimatedDelivery).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Progress Timeline */}
              <div className="p-6">
                <div className="relative">
                  {/* Progress Line */}
                  <div className="absolute left-4 right-4 top-4 h-0.5 bg-gray-200">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${((getStatusStep(selectedShipment.status) - 1) / 4) * 100}%`,
                        backgroundColor: primaryColor,
                      }}
                    />
                  </div>

                  {/* Steps */}
                  <div className="relative flex justify-between">
                    {steps.map((step, index) => {
                      const isCompleted = getStatusStep(selectedShipment.status) > index + 1;
                      const isCurrent = getStatusStep(selectedShipment.status) === index + 1;

                      return (
                        <div key={step.status} className="flex flex-col items-center">
                          <div
                            className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                              isCompleted || isCurrent
                                ? 'text-white'
                                : 'border-2 border-gray-200 bg-white text-gray-400'
                            }`}
                            style={
                              isCompleted || isCurrent ? { backgroundColor: primaryColor } : {}
                            }
                          >
                            {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                          </div>
                          <p
                            className={`mt-2 text-center text-xs ${isCurrent ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                          >
                            {step.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Tracking Info */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-gray-900">Tracking Information</h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Carrier</p>
                    <p className="font-semibold text-gray-900">{selectedShipment.carrier}</p>
                  </div>
                  <div className="text-right">
                    <p className="mb-1 text-xs text-gray-500">Tracking Number</p>
                    <p className="font-mono text-sm text-gray-900">
                      {selectedShipment.trackingNumber}
                    </p>
                  </div>
                </div>

                {selectedShipment.lastLocation && (
                  <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4">
                    <MapPin className="mt-0.5 h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Last Location</p>
                      <p className="text-sm text-blue-700">{selectedShipment.lastLocation}</p>
                      <p className="mt-1 text-xs text-blue-500">
                        {new Date(selectedShipment.lastUpdate).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )}

                <a
                  href={selectedShipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Track on {selectedShipment.carrier}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Order Items */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-gray-900">Order Items</h3>

              <div className="space-y-3">
                {selectedShipment.items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded-lg p-2"
                        style={{ backgroundColor: `${primaryColor}15` }}
                      >
                        <Package className="h-5 w-5" style={{ color: primaryColor }} />
                      </div>
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                    <span className="text-gray-500">Qty: {item.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                Ordered on{' '}
                {new Date(selectedShipment.orderedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
