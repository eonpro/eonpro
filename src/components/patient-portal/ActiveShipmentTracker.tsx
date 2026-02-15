'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Box,
  Home,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface ActiveShipment {
  id: string;
  orderNumber: string;
  status: 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  statusLabel: string;
  step: number;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  items: Array<{ name: string; strength?: string; quantity: number }>;
  orderedAt: string;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  lastUpdate: string;
  lastLocation: string | null;
  isRefill: boolean;
  refillNumber: number | null;
}

const statusConfig = {
  processing: {
    color: '#F59E0B',
    bgColor: 'from-amber-400 to-orange-500',
    lightBg: 'bg-amber-50',
    icon: Clock,
    message: 'Preparing your order',
  },
  shipped: {
    color: '#3B82F6',
    bgColor: 'from-blue-400 to-blue-500',
    lightBg: 'bg-blue-50',
    icon: Package,
    message: 'Package is on its way!',
  },
  in_transit: {
    color: '#06B6D4',
    bgColor: 'from-cyan-400 to-teal-600',
    lightBg: 'bg-cyan-50',
    icon: Truck,
    message: 'Speeding to you!',
  },
  out_for_delivery: {
    color: '#10B981',
    bgColor: 'from-emerald-400 to-teal-500',
    lightBg: 'bg-emerald-50',
    icon: Truck,
    message: 'Almost there!',
  },
  delivered: {
    color: '#059669',
    bgColor: 'from-green-400 to-emerald-600',
    lightBg: 'bg-green-50',
    icon: CheckCircle2,
    message: 'Delivered!',
  },
  exception: {
    color: '#EF4444',
    bgColor: 'from-red-400 to-rose-500',
    lightBg: 'bg-red-50',
    icon: Package,
    message: 'Attention needed',
  },
};

interface ActiveShipmentTrackerProps {
  primaryColor?: string;
  onShipmentLoaded?: (hasActiveShipment: boolean) => void;
}

export default function ActiveShipmentTracker({
  primaryColor = '#4fa77e',
  onShipmentLoaded,
}: ActiveShipmentTrackerProps) {
  const [activeShipments, setActiveShipments] = useState<ActiveShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/patient-portal/tracking', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setActiveShipments([]);
          onShipmentLoaded?.(false);
          return;
        }
        throw new Error('Failed to fetch tracking');
      }

      const data = await response.json();
      setActiveShipments(data.activeShipments || []);
      onShipmentLoaded?.((data.activeShipments || []).length > 0);
    } catch (err) {
      console.error('Error fetching shipments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
      onShipmentLoaded?.(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
    const interval = setInterval(fetchShipments, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!loading && activeShipments.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="mb-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-500 via-teal-500 to-emerald-500 p-1">
          <div className="rounded-[22px] bg-white p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 animate-pulse rounded-2xl bg-gradient-to-br from-blue-100 to-emerald-100" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="h-5 w-48 animate-pulse rounded-full bg-gray-200" />
                <div className="h-4 w-32 animate-pulse rounded-full bg-gray-100" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) return null;

  const mainShipment = activeShipments[0];
  const config = statusConfig[mainShipment.status];
  const StatusIcon = config.icon;

  // Calculate progress percentage
  const progressPercent = Math.min(100, ((mainShipment.step - 1) / 4) * 100);

  return (
    <div className="mb-6">
      {/* Main Card with Animated Border */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-500 via-teal-500 to-emerald-500 p-[3px] shadow-2xl shadow-teal-500/20">
        {/* Animated shimmer effect */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="relative overflow-hidden rounded-[21px] bg-white">
          {/* Header with Gradient */}
          <div className={`relative bg-gradient-to-r ${config.bgColor} px-6 py-5`}>
            {/* Floating particles effect */}
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="absolute left-10 top-2 h-2 w-2 animate-bounce rounded-full bg-white/30"
                style={{ animationDelay: '0s' }}
              />
              <div
                className="absolute right-20 top-4 h-3 w-3 animate-bounce rounded-full bg-white/20"
                style={{ animationDelay: '0.5s' }}
              />
              <div
                className="absolute bottom-3 left-1/3 h-2 w-2 animate-bounce rounded-full bg-white/25"
                style={{ animationDelay: '1s' }}
              />
            </div>

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Animated Icon Container */}
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-2xl bg-white/20" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/30 backdrop-blur-sm">
                    {mainShipment.status === 'in_transit' ||
                    mainShipment.status === 'out_for_delivery' ? (
                      <div className="animate-[truck_1s_ease-in-out_infinite]">
                        <Truck className="h-7 w-7 text-white" />
                      </div>
                    ) : (
                      <StatusIcon className="h-7 w-7 text-white" />
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-white/80" />
                    <span className="text-sm font-medium text-white/90">{config.message}</span>
                  </div>
                  <h2 className="mt-0.5 text-xl font-bold text-white">
                    {mainShipment.statusLabel}
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setExpanded(!expanded)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white transition-all hover:scale-105 hover:bg-white/30"
              >
                {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-white/0 via-white/50 to-white/0" />
                </div>
              </div>
            </div>
          </div>

          {/* Expanded Content */}
          {expanded && (
            <div className="p-6">
              {/* Visual Timeline */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  {[
                    { icon: Box, label: 'Ordered', step: 1 },
                    { icon: Package, label: 'Shipped', step: 2 },
                    { icon: Truck, label: 'In Transit', step: 3 },
                    { icon: Truck, label: 'Out for Delivery', step: 4 },
                    { icon: Home, label: 'Delivered', step: 5 },
                  ].map((item, idx) => {
                    const isCompleted = mainShipment.step > item.step;
                    const isCurrent = mainShipment.step === item.step;
                    const ItemIcon = item.icon;

                    return (
                      <div key={idx} className="relative flex flex-col items-center">
                        {/* Connector Line */}
                        {idx < 4 && (
                          <div className="absolute left-[50%] top-5 -z-10 h-1 w-full">
                            <div
                              className={`h-full transition-all duration-500 ${
                                isCompleted
                                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                  : 'bg-gray-200'
                              }`}
                            />
                          </div>
                        )}

                        {/* Icon Circle */}
                        <div
                          className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500 ${
                            isCompleted
                              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                              : isCurrent
                                ? 'scale-110 bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                                : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {isCurrent && (
                            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-30" />
                          )}
                          {isCompleted ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <ItemIcon className="h-5 w-5" />
                          )}
                        </div>

                        {/* Label */}
                        <span
                          className={`mt-2 text-center text-xs font-medium ${
                            isCurrent
                              ? 'text-emerald-600'
                              : isCompleted
                                ? 'text-emerald-600'
                                : 'text-gray-400'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info Cards Grid */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                {/* Estimated Delivery */}
                {mainShipment.estimatedDelivery && mainShipment.status !== 'delivered' && (
                  <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10">
                        <Clock className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-medium text-emerald-600">
                        Expected Delivery
                      </span>
                    </div>
                    <p className="text-lg font-bold text-emerald-800">
                      {new Date(mainShipment.estimatedDelivery).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                )}

                {/* Carrier Info */}
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-blue-50 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10">
                      <Truck className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <span className="text-xs font-medium text-blue-600">Carrier</span>
                  </div>
                  <p className="text-lg font-bold text-blue-800">{mainShipment.carrier}</p>
                </div>
              </div>

              {/* Last Location */}
              {mainShipment.lastLocation && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <MapPin className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-emerald-600">Latest Update</p>
                    <p className="font-semibold text-emerald-900">{mainShipment.lastLocation}</p>
                    <p className="mt-0.5 text-xs text-emerald-500">
                      {new Date(mainShipment.lastUpdate).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Medication Contents */}
              <div className="mb-4 rounded-2xl bg-gray-50 p-4">
                <p className="mb-2 text-xs font-medium text-gray-500">📦 Package Contents</p>
                {mainShipment.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">
                      {item.name}
                      {item.strength && (
                        <span className="font-normal text-gray-500"> {item.strength}</span>
                      )}
                    </span>
                    {item.quantity > 1 && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                        ×{item.quantity}
                      </span>
                    )}
                  </div>
                ))}
                {mainShipment.isRefill && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <Sparkles className="h-3 w-3" />
                    Refill #{mainShipment.refillNumber || ''}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {mainShipment.trackingUrl && (
                  <a
                    href={mainShipment.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-primary)] px-6 py-4 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
                  >
                    <Truck className="h-5 w-5" />
                    Track on {mainShipment.carrier}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Link
                  href="/patient-portal/shipments"
                  className="flex items-center justify-center rounded-2xl border-2 border-gray-200 px-5 py-4 font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                >
                  View All
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Shipments Indicator */}
      {activeShipments.length > 1 && (
        <Link
          href="/patient-portal/shipments"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-sm font-semibold text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-50"
        >
          <Package className="h-5 w-5" />+{activeShipments.length - 1} more shipment
          {activeShipments.length > 2 ? 's' : ''} on the way
        </Link>
      )}

      {/* CSS for custom animations */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes truck {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(2px);
          }
          75% {
            transform: translateX(-2px);
          }
        }
      `}</style>
    </div>
  );
}
