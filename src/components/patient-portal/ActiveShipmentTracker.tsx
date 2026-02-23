'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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

export interface PrescriptionJourney {
  stage: 1 | 2 | 3 | 4;
  label: string;
  message: string;
  medicationName: string | null;
  orderId?: number;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  orderedAt?: string | null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const lightenChannel = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${lightenChannel(r)}, ${lightenChannel(g)}, ${lightenChannel(b)})`;
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const statusMeta: Record<
  string,
  { icon: typeof Package; message: string }
> = {
  processing: { icon: Clock, message: 'Preparing your order' },
  shipped: { icon: Package, message: 'Package is on its way!' },
  in_transit: { icon: Truck, message: 'Speeding to you!' },
  out_for_delivery: { icon: Truck, message: 'Almost there!' },
  delivered: { icon: CheckCircle2, message: 'Delivered!' },
  exception: { icon: Package, message: 'Attention needed' },
};

interface ActiveShipmentTrackerProps {
  primaryColor?: string;
  onShipmentLoaded?: (hasActiveShipment: boolean) => void;
}

export default function ActiveShipmentTracker({
  primaryColor = '#4fa77e',
  onShipmentLoaded,
}: ActiveShipmentTrackerProps) {
  const { t } = usePatientPortalLanguage();
  const [activeShipments, setActiveShipments] = useState<ActiveShipment[]>([]);
  const [prescriptionJourney, setPrescriptionJourney] = useState<PrescriptionJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const brandLight = lighten(primaryColor, 0.92);
  const brandMedLight = lighten(primaryColor, 0.85);
  const brandDarker = lighten(primaryColor, -0.15);

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
      setPrescriptionJourney(data.prescriptionJourney ?? null);
      const hasContent =
        (data.activeShipments || []).length > 0 || (data.prescriptionJourney != null);
      onShipmentLoaded?.(hasContent);
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

  if (!loading && activeShipments.length === 0 && !prescriptionJourney) {
    return null;
  }

  if (loading) {
    return (
      <div className="mb-6">
        <div
          className="relative overflow-hidden rounded-3xl p-1"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${brandDarker})` }}
        >
          <div className="rounded-[22px] bg-white p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div
                  className="h-16 w-16 animate-pulse rounded-2xl"
                  style={{ background: `linear-gradient(135deg, ${brandLight}, ${brandMedLight})` }}
                />
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

  // Show 4-step prescription journey when we have journey and no tracking yet (stage 1–3)
  const showJourneyCard = prescriptionJourney && prescriptionJourney.stage <= 3;
  const showShipmentCard = activeShipments.length > 0;

  if (showJourneyCard) {
    const journey = prescriptionJourney!;
    const steps = [
      { step: 1, labelKey: 'journeyStep1Label', descKey: 'journeyStep1Desc' },
      { step: 2, labelKey: 'journeyStep2Label', descKey: 'journeyStep2Desc' },
      { step: 3, labelKey: 'journeyStep3Label', descKey: 'journeyStep3Desc' },
      { step: 4, labelKey: 'journeyStep4Label', descKey: 'journeyStep4Desc' },
    ];

    return (
      <div className="mb-6">
        <div
          className="relative overflow-hidden rounded-3xl p-[3px] shadow-xl"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${brandDarker})`,
            boxShadow: `0 25px 50px -12px ${withAlpha(primaryColor, 0.2)}`,
          }}
        >
          <div className="relative overflow-hidden rounded-[21px] bg-white">
            <div
              className="px-6 py-5 text-white"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${brandDarker})`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm"
                >
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/90">
                    {journey.stage === 1
                      ? t('journeyStep1Label')
                      : journey.stage === 3
                        ? t('journeyStep3Label')
                        : journey.stage === 4
                          ? t('journeyStep4Label')
                          : journey.label}
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-white">{t('journeyPrescriptionStatus')}</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="mb-6 text-gray-700">
                {journey.stage === 1
                  ? t('journeyMessageStage1')
                  : journey.stage === 3
                    ? t('journeyMessageStage3WithMed').replace(
                        '{medName}',
                        journey.medicationName || t('journeyYourMedication')
                      )
                    : journey.stage === 4
                      ? t('journeyMessageStage4')
                      : journey.message}
              </p>
              <div className="space-y-4">
                {steps.map((s) => {
                  const isCompleted = journey.stage > s.step;
                  const isCurrent = journey.stage === s.step;
                  return (
                    <div
                      key={s.step}
                      className="flex gap-4 rounded-2xl border p-4 transition-all"
                      style={{
                        borderColor: isCurrent
                          ? withAlpha(primaryColor, 0.5)
                          : isCompleted
                            ? withAlpha(primaryColor, 0.2)
                            : '#e5e7eb',
                        backgroundColor: isCurrent
                          ? withAlpha(primaryColor, 0.06)
                          : isCompleted
                            ? withAlpha(primaryColor, 0.04)
                            : undefined,
                      }}
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
                        style={{
                          backgroundColor:
                            isCompleted || isCurrent ? primaryColor : '#e5e7eb',
                          color: isCompleted || isCurrent ? 'white' : '#9ca3af',
                        }}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          s.step
                        )}
                      </div>
                      <div>
                        <p
                          className="font-semibold"
                          style={
                            isCurrent ? { color: primaryColor } : undefined
                          }
                        >
                          {t('journeyStepPrefix')} {s.step}. {t(s.labelKey)}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-600">{t(s.descKey)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link
                href="/patient-portal/shipments"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: primaryColor }}
              >
                {t('shipmentsViewAll')}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!showShipmentCard) return null;

  const mainShipment = activeShipments[0];
  const meta = statusMeta[mainShipment.status] ?? statusMeta.shipped;
  const StatusIcon = meta.icon;
  const isException = mainShipment.status === 'exception';

  const headerBg = isException
    ? 'linear-gradient(135deg, #EF4444, #F87171)'
    : `linear-gradient(135deg, ${primaryColor}, ${brandDarker})`;

  const progressPercent = Math.min(100, (4 / 4) * 100);

  return (
    <div className="mb-6">
      {/* Main Card */}
      <div
        className="relative overflow-hidden rounded-3xl p-[3px] shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${brandDarker})`,
          boxShadow: `0 25px 50px -12px ${withAlpha(primaryColor, 0.2)}`,
        }}
      >
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="relative overflow-hidden rounded-[21px] bg-white">
          {/* Header */}
          <div className="relative px-6 py-5" style={{ background: headerBg }}>
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
                    <span className="text-sm font-medium text-white/90">{meta.message}</span>
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
              {/* 4-step prescription journey (replaces old Ordered → Shipped → Delivered timeline) */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  {[
                    { icon: Clock, label: 'Provider reviewing', step: 1 },
                    { icon: CheckCircle2, label: 'Prescription approved', step: 2 },
                    { icon: Package, label: 'Pharmacy processing', step: 3 },
                    { icon: Truck, label: 'On the way', step: 4 },
                  ].map((item, idx) => {
                    const journeyStep = 4;
                    const isCompleted = journeyStep > item.step;
                    const isCurrent = journeyStep === item.step;
                    const ItemIcon = item.icon;

                    return (
                      <div key={idx} className="relative flex flex-col items-center">
                        {/* Connector Line */}
                        {idx < 3 && (
                          <div className="absolute left-[50%] top-5 -z-10 h-1 w-full">
                            <div
                              className="h-full transition-all duration-500"
                              style={{
                                backgroundColor: isCompleted ? primaryColor : '#e5e7eb',
                              }}
                            />
                          </div>
                        )}

                        {/* Icon Circle */}
                        <div
                          className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500 ${
                            !isCompleted && !isCurrent ? 'bg-gray-100 text-gray-400' : 'text-white'
                          } ${isCurrent ? 'scale-110' : ''}`}
                          style={
                            isCompleted || isCurrent
                              ? {
                                  background: `linear-gradient(135deg, ${primaryColor}, ${brandDarker})`,
                                  boxShadow: `0 4px 14px ${withAlpha(primaryColor, 0.3)}`,
                                }
                              : undefined
                          }
                        >
                          {isCurrent && (
                            <div
                              className="absolute inset-0 animate-ping rounded-full opacity-30"
                              style={{ backgroundColor: primaryColor }}
                            />
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
                            !isCurrent && !isCompleted ? 'text-gray-400' : ''
                          }`}
                          style={
                            isCurrent || isCompleted
                              ? { color: primaryColor }
                              : undefined
                          }
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
                  <div
                    className="rounded-2xl border p-4"
                    style={{
                      borderColor: withAlpha(primaryColor, 0.2),
                      background: `linear-gradient(135deg, ${brandLight}, ${brandMedLight})`,
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full"
                        style={{ backgroundColor: withAlpha(primaryColor, 0.1) }}
                      >
                        <Clock className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: primaryColor }}>
                        Expected Delivery
                      </span>
                    </div>
                    <p className="text-lg font-bold text-gray-800">
                      {(() => {
                        const d = new Date(mainShipment.estimatedDelivery!);
                        return isNaN(d.getTime()) ? 'Pending' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      })()}
                    </p>
                  </div>
                )}

                {/* Carrier Info */}
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: withAlpha(primaryColor, 0.2),
                    background: `linear-gradient(135deg, ${brandLight}, ${brandMedLight})`,
                  }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: withAlpha(primaryColor, 0.1) }}
                    >
                      <Truck className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: primaryColor }}>
                      Carrier
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-800">{mainShipment.carrier}</p>
                </div>
              </div>

              {/* Last Location */}
              {mainShipment.lastLocation && (
                <div
                  className="mb-4 flex items-start gap-3 rounded-2xl border p-4"
                  style={{
                    borderColor: withAlpha(primaryColor, 0.2),
                    background: `linear-gradient(to right, ${brandLight}, ${brandMedLight})`,
                  }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: withAlpha(primaryColor, 0.1) }}
                  >
                    <MapPin className="h-5 w-5" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: primaryColor }}>Latest Update</p>
                    <p className="font-semibold text-gray-900">{mainShipment.lastLocation}</p>
                    <p className="mt-0.5 text-xs" style={{ color: withAlpha(primaryColor, 0.7) }}>
                      {(() => {
                        const d = new Date(mainShipment.lastUpdate);
                        return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                      })()}
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
                  <div
                    className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: withAlpha(primaryColor, 0.1), color: primaryColor }}
                  >
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
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
                    style={{
                      backgroundColor: primaryColor,
                      boxShadow: `0 10px 30px ${withAlpha(primaryColor, 0.3)}`,
                    }}
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
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold transition-all"
          style={{
            borderColor: withAlpha(primaryColor, 0.3),
            backgroundColor: withAlpha(primaryColor, 0.05),
            color: primaryColor,
          }}
        >
          <Package className="h-5 w-5" />+{activeShipments.length - 1} more shipment
          {activeShipments.length > 2 ? 's' : ''} on the way
        </Link>
      )}

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
