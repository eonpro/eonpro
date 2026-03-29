'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { usePortalSWR } from '@/hooks/usePortalSWR';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { logger } from '@/lib/logger';
import {
  Package,
  PackageCheck,
  Truck,
  Clock,
  ExternalLink,
  Calendar,
  ArrowLeft,
  RefreshCw,
  Check,
} from 'lucide-react';

interface ShipmentItem {
  name: string;
  strength?: string;
  quantity: number;
}

interface Shipment {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  step?: number;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  items: ShipmentItem[];
  orderedAt: string;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  deliveredAt?: string | null;
  lastUpdate: string;
  lastLocation?: string | null;
  patientConfirmedAt: string | null;
  canConfirmReceipt: boolean;
}

const DELIVERY_STEPS = [
  { key: 'processing', label: 'Processing', minStep: 1 },
  { key: 'shipped', label: 'Shipped', minStep: 2 },
  { key: 'in_transit', label: 'In Transit', minStep: 3 },
  { key: 'out_for_delivery', label: 'Out for Delivery', minStep: 4 },
  { key: 'delivered', label: 'Delivered', minStep: 5 },
];

interface PrescriptionJourney {
  stage: 1 | 2 | 3 | 4;
  label: string;
  message: string;
  medicationName: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  orderedAt?: string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TrackingResponse {
  activeShipments?: Shipment[];
  deliveredShipments?: Shipment[];
  prescriptionJourney?: PrescriptionJourney | null;
}

export default function ShipmentsPage() {
  const { branding } = useClinicBranding();
  const { t } = usePatientPortalLanguage();
  const router = useRouter();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const { data, error: swrError, isLoading, isValidating, mutate } = usePortalSWR<TrackingResponse>(
    '/api/patient-portal/tracking',
  );

  const allShipments = useMemo(() => {
    if (!data) return [];
    const active = Array.isArray(data.activeShipments) ? data.activeShipments : [];
    const delivered = Array.isArray(data.deliveredShipments) ? data.deliveredShipments : [];
    const merged = [...active, ...delivered];
    merged.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
    return merged;
  }, [data]);

  const prescriptionJourney = data?.prescriptionJourney ?? null;
  const error = swrError ? (swrError instanceof Error ? swrError.message : 'Failed to load shipments') : null;

  const [refreshing, setRefreshing] = useState(false);
  const [confirmingTrackingNumber, setConfirmingTrackingNumber] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleConfirmReceipt = useCallback(async (trackingNumber: string) => {
    setConfirmError(null);
    setConfirmingTrackingNumber(trackingNumber);
    try {
      const res = await portalFetch('/api/patient-portal/shipments/confirm-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber }),
      });
      if (res.ok) {
        await mutate();
        router.push(`${PATIENT_PORTAL_PATH}/welcome-kit`);
      } else {
        const body = await res.json().catch(() => null);
        const msg = (body as { error?: string })?.error || 'Failed to confirm. Please try again.';
        setConfirmError(msg);
      }
    } catch (err) {
      logger.error('[Shipments] Confirm receipt failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      setConfirmError('Something went wrong. Please try again.');
    } finally {
      setConfirmingTrackingNumber(null);
    }
  }, [mutate, router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await portalFetch('/api/patient-portal/tracking/refresh', { method: 'POST' });
    } catch {
      // Non-blocking — we still re-fetch the data below
    }
    await mutate();
    setRefreshing(false);
  }, [mutate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="relative">
          <div
            className="h-16 w-16 animate-spin rounded-full border-4"
            style={{ borderColor: `${primaryColor}33`, borderTopColor: primaryColor }}
          />
          <Package className="absolute inset-0 m-auto h-6 w-6" style={{ color: primaryColor }} />
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
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
          <span className="flex-1">{error}</span>
          {(error.toLowerCase().includes('session') || error.toLowerCase().includes('log in')) && (
            <a
              href={`/patient-login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/shipments`)}&reason=session_expired`}
              className="shrink-0 rounded-lg bg-red-200 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-300"
            >
              Log in
            </a>
          )}
        </div>
      )}

      {/* Prescription Journey (when no shipments yet) */}
      {allShipments.length === 0 && prescriptionJourney && prescriptionJourney.stage <= 3 && (
        <div
          className="mb-6 overflow-hidden rounded-2xl border bg-white shadow-sm"
          style={{ borderColor: `${primaryColor}20` }}
        >
          <div
            className="flex items-center gap-3 px-5 py-4 text-white"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
          >
            <Clock className="h-6 w-6" />
            <div>
              <p className="text-sm font-medium text-white/90">{prescriptionJourney.label}</p>
              <p className="font-bold text-white">Prescription Status</p>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-700">{prescriptionJourney.message}</p>
          </div>
        </div>
      )}

      {/* Shipment List */}
      {allShipments.length === 0 && (!prescriptionJourney || prescriptionJourney.stage > 3) ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
            <Package className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mb-2 text-lg font-bold text-gray-900">No Shipments Yet</h3>
          <p className="text-gray-500">Your shipments will appear here once your prescriptions are shipped.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allShipments.map((shipment) => {
            const currentStep = shipment.step ?? 1;
            const isException = shipment.status === 'exception';

            return (
            <div
              key={shipment.id}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              {/* Shipment header */}
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: isException ? '#FEE2E2' : `${primaryColor}15` }}
                    >
                      <Truck className="h-5 w-5" style={{ color: isException ? '#DC2626' : primaryColor }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {shipment.statusLabel}
                        {isException && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Attention needed
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">{shipment.carrier} · <span className="font-mono">{shipment.trackingNumber}</span></p>
                    </div>
                  </div>
                  {shipment.trackingUrl && (
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-all hover:brightness-90"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Track
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Delivery Progress Steps */}
              {!isException && (
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center justify-between">
                    {DELIVERY_STEPS.map((step, idx) => {
                      const isCompleted = currentStep > step.minStep;
                      const isCurrent = currentStep === step.minStep;
                      return (
                        <div key={step.key} className="flex flex-1 items-center">
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                                isCompleted
                                  ? 'text-white'
                                  : isCurrent
                                    ? 'text-white ring-4'
                                    : 'bg-gray-100 text-gray-400'
                              }`}
                              style={{
                                ...(isCompleted || isCurrent
                                  ? { backgroundColor: primaryColor }
                                  : {}),
                                ...(isCurrent
                                  ? { ringColor: `${primaryColor}30` }
                                  : {}),
                              }}
                            >
                              {isCompleted ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <span
                              className={`mt-1.5 text-center text-[10px] font-medium leading-tight ${
                                isCompleted || isCurrent ? '' : 'text-gray-400'
                              }`}
                              style={isCompleted || isCurrent ? { color: primaryColor } : undefined}
                            >
                              {step.label}
                            </span>
                          </div>
                          {idx < DELIVERY_STEPS.length - 1 && (
                            <div className="mx-1 mb-5 h-0.5 flex-1" style={{ backgroundColor: isCompleted ? primaryColor : '#e5e7eb' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status detail / last location */}
              {shipment.lastLocation && (
                <div className="border-b border-gray-100 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <Package className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                    </div>
                    <span className="text-gray-700">{shipment.lastLocation}</span>
                  </div>
                </div>
              )}

              {/* Medications, dates & actions */}
              <div className="px-5 py-4">
                <div className="space-y-2">
                  {(shipment.items ?? []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">{item.name}</span>
                      {item.strength && (
                        <span className="text-sm text-gray-500">{item.strength}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Dates row */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  {shipment.shippedAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Shipped {formatDate(shipment.shippedAt)}
                    </span>
                  )}
                  {shipment.estimatedDelivery && shipment.status !== 'delivered' && (
                    <span className="flex items-center gap-1 font-medium" style={{ color: primaryColor }}>
                      <Clock className="h-3.5 w-3.5" />
                      Est. delivery {formatDate(shipment.estimatedDelivery)}
                    </span>
                  )}
                  {shipment.deliveredAt && (
                    <span className="flex items-center gap-1 font-medium text-emerald-600">
                      <Check className="h-3.5 w-3.5" />
                      Delivered {formatDate(shipment.deliveredAt)}
                    </span>
                  )}
                  {!shipment.shippedAt && !shipment.estimatedDelivery && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Ordered {formatDate(shipment.orderedAt)}
                    </span>
                  )}
                </div>

                {/* Delivery confirmation */}
                {shipment.patientConfirmedAt ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-medium text-emerald-700">
                      Received on {formatDate(shipment.patientConfirmedAt)}
                    </span>
                  </div>
                ) : shipment.canConfirmReceipt ? (
                  <button
                    onClick={() => handleConfirmReceipt(shipment.trackingNumber)}
                    disabled={confirmingTrackingNumber === shipment.trackingNumber}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {confirmingTrackingNumber === shipment.trackingNumber ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Confirming...
                      </>
                    ) : (
                      <>
                        <PackageCheck className="h-5 w-5" />
                        I Received My Package
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>
            );
          })}
          {confirmError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {confirmError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
