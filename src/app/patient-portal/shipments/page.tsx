'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  ChevronRight,
  Calendar,
  AlertTriangle,
  History,
  ArrowLeft,
  RefreshCw,
  Box,
  Home,
  Sparkles,
} from 'lucide-react';

interface Shipment {
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
    label: 'Processing',
    color: '#F59E0B',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    gradient: 'from-amber-400 to-orange-500',
    icon: Clock,
  },
  shipped: {
    label: 'Shipped',
    color: '#3B82F6',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    gradient: 'from-blue-400 to-blue-600',
    icon: Package,
  },
  in_transit: {
    label: 'In Transit',
    color: '#06B6D4',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-700',
    gradient: 'from-cyan-400 to-teal-600',
    icon: Truck,
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: '#10B981',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    gradient: 'from-emerald-400 to-teal-500',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered',
    color: '#059669',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    gradient: 'from-green-400 to-emerald-600',
    icon: CheckCircle2,
  },
  exception: {
    label: 'Exception',
    color: '#EF4444',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    gradient: 'from-red-400 to-rose-500',
    icon: AlertTriangle,
  },
};

export default function ShipmentsPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [activeShipments, setActiveShipments] = useState<Shipment[]>([]);
  const [deliveredShipments, setDeliveredShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await portalFetch('/api/patient-portal/tracking');

      if (!response.ok) {
        if (response.status === 401) {
          setError('Please log in to view your shipments');
          return;
        }
        throw new Error('Failed to load shipments');
      }

      const data = await safeParseJson(response);
      const active =
        data !== null && typeof data === 'object' && 'activeShipments' in data
          ? ((data as { activeShipments?: Shipment[] }).activeShipments ?? [])
          : [];
      const delivered =
        data !== null && typeof data === 'object' && 'deliveredShipments' in data
          ? ((data as { deliveredShipments?: Shipment[] }).deliveredShipments ?? [])
          : [];
      setActiveShipments(Array.isArray(active) ? active : []);
      setDeliveredShipments(Array.isArray(delivered) ? delivered : []);

      if (Array.isArray(active) && active.length > 0) {
        setSelectedShipment(active[0] as Shipment);
        setActiveTab('active');
      } else if (Array.isArray(delivered) && delivered.length > 0) {
        setSelectedShipment(delivered[0] as Shipment);
        setActiveTab('history');
      }
    } catch (err) {
      logger.error('Error loading shipments', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      setError(err instanceof Error ? err.message : 'Failed to load shipments');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    await loadShipments();
    setRefreshing(false);
  };

  const currentShipments = activeTab === 'active' ? activeShipments : deliveredShipments;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <Package className="absolute inset-0 m-auto h-6 w-6 text-emerald-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/patient-portal"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shipment Tracking</h1>
            <p className="mt-0.5 text-gray-500">Track your medication deliveries</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:shadow-md disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
        <button
          onClick={() => {
            setActiveTab('active');
            if (activeShipments.length > 0) setSelectedShipment(activeShipments[0]);
          }}
          className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
            activeTab === 'active'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Truck className="h-4 w-4" />
          Active ({activeShipments.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            if (deliveredShipments.length > 0) setSelectedShipment(deliveredShipments[0]);
          }}
          className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <History className="h-4 w-4" />
          History ({deliveredShipments.length})
        </button>
      </div>

      {currentShipments.length === 0 ? (
        <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50">
            {activeTab === 'active' ? (
              <Package className="h-10 w-10 text-gray-400" />
            ) : (
              <History className="h-10 w-10 text-gray-400" />
            )}
          </div>
          <h3 className="mb-2 text-xl font-bold text-gray-900">
            {activeTab === 'active' ? 'No Active Shipments' : 'No Delivery History'}
          </h3>
          <p className="text-gray-500">
            {activeTab === 'active'
              ? 'Your orders will appear here once shipped.'
              : 'Your past deliveries will be stored here.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Shipment List */}
          <div className="space-y-3 lg:col-span-1">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              {activeTab === 'active' ? 'Active Orders' : 'Past Deliveries'}
            </h2>
            {currentShipments.map((shipment) => {
              const config = statusConfig[shipment.status];
              const StatusIcon = config.icon;
              const isSelected = selectedShipment?.id === shipment.id;

              return (
                <button
                  key={shipment.id}
                  onClick={() => setSelectedShipment(shipment)}
                  className={`w-full rounded-2xl border-2 bg-white p-4 text-left transition-all ${
                    isSelected
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/10'
                      : 'border-transparent shadow-sm hover:border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl p-2.5 ${config.bgColor}`}>
                      <StatusIcon className="h-5 w-5" style={{ color: config.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-gray-900">
                          {shipment.orderNumber}
                        </p>
                        {shipment.isRefill && (
                          <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <Sparkles className="h-3 w-3" />
                            Refill
                          </span>
                        )}
                      </div>
                      <p className={`text-sm font-medium ${config.textColor}`}>
                        {shipment.statusLabel}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-400">
                        {shipment.items.map((i) => i.name).join(', ')}
                      </p>
                    </div>
                    <ChevronRight
                      className={`h-5 w-5 flex-shrink-0 transition-colors ${
                        isSelected ? 'text-emerald-500' : 'text-gray-300'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Shipment Details */}
          {selectedShipment && (
            <div className="space-y-6 lg:col-span-2">
              {/* Status Hero Card */}
              <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg">
                <div
                  className={`relative bg-gradient-to-r ${statusConfig[selectedShipment.status].gradient} px-8 py-8`}
                >
                  {/* Decorative elements */}
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
                    <div className="absolute -bottom-5 -left-5 h-24 w-24 rounded-full bg-white/10" />
                  </div>

                  <div className="relative flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-sm font-medium text-white/80">Order Status</p>
                      <p className="text-3xl font-bold text-white">
                        {selectedShipment.statusLabel}
                      </p>
                      <p className="mt-1 text-white/70">{selectedShipment.orderNumber}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedShipment.isRefill && (
                        <span className="flex items-center gap-1 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
                          <Sparkles className="h-4 w-4" />
                          Refill #{selectedShipment.refillNumber || ''}
                        </span>
                      )}
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                        <Package className="h-7 w-7 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Delivery Info */}
                  {(selectedShipment.estimatedDelivery || selectedShipment.deliveredAt) && (() => {
                    const dateStr = selectedShipment.deliveredAt || selectedShipment.estimatedDelivery!;
                    const parsed = new Date(dateStr);
                    const isValid = !isNaN(parsed.getTime());
                    return (
                      <div className="relative mt-6 rounded-2xl bg-white/20 p-4 backdrop-blur-sm">
                        <p className="text-xs font-medium text-white/80">
                          {selectedShipment.status === 'delivered'
                            ? 'Delivered On'
                            : 'Expected Delivery'}
                        </p>
                        <p className="text-xl font-bold text-white">
                          {isValid
                            ? parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                            : 'Date unavailable'}
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Visual Timeline */}
                {selectedShipment.status !== 'exception' && (
                  <div className="px-8 py-6">
                    <div className="flex items-center justify-between">
                      {[
                        { icon: Box, label: 'Ordered', step: 1 },
                        { icon: Package, label: 'Shipped', step: 2 },
                        { icon: Truck, label: 'In Transit', step: 3 },
                        { icon: Truck, label: 'Out for Delivery', step: 4 },
                        { icon: Home, label: 'Delivered', step: 5 },
                      ].map((item, idx) => {
                        const isCompleted = selectedShipment.step > item.step;
                        const isCurrent = selectedShipment.step === item.step;
                        const ItemIcon = item.icon;

                        return (
                          <div key={idx} className="relative flex flex-col items-center">
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
                )}
              </div>

              {/* Tracking Info Card */}
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-bold text-gray-900">Tracking Information</h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-blue-100 bg-[var(--brand-primary-light)] p-4">
                      <p className="mb-1 text-xs font-medium text-blue-600">Carrier</p>
                      <p className="text-lg font-bold text-blue-900">{selectedShipment.carrier}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-slate-50 p-4">
                      <p className="mb-1 text-xs font-medium text-gray-500">Tracking Number</p>
                      <p className="break-all font-mono text-sm font-semibold text-gray-900">
                        {selectedShipment.trackingNumber}
                      </p>
                    </div>
                  </div>

                  {selectedShipment.lastLocation && (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                        <MapPin className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-emerald-600">Latest Update</p>
                        <p className="font-semibold text-emerald-900">
                          {selectedShipment.lastLocation}
                        </p>
                        <p className="mt-0.5 text-xs text-emerald-500">
                          {(() => {
                            const d = new Date(selectedShipment.lastUpdate);
                            return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                          })()}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedShipment.trackingUrl && (
                    <a
                      href={selectedShipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand-primary)] px-6 py-4 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.01] hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.99]"
                    >
                      <Truck className="h-5 w-5" />
                      Track on {selectedShipment.carrier}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>

              {/* Order Items Card */}
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-bold text-gray-900">📦 Package Contents</h3>

                <div className="space-y-3">
                  {selectedShipment.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-2xl bg-gray-50 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${primaryColor}15` }}
                        >
                          <Package className="h-5 w-5" style={{ color: primaryColor }} />
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900">{item.name}</span>
                          {item.strength && (
                            <span className="ml-2 text-sm text-gray-500">{item.strength}</span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-600">
                        Qty: {item.quantity}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 text-sm text-gray-500">
                  <Calendar className="h-4 w-4" />
                  {(() => {
                    const d = new Date(selectedShipment.orderedAt);
                    return isNaN(d.getTime())
                      ? 'Order date unavailable'
                      : `Ordered on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
