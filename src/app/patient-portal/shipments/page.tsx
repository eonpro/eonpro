'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import {
  Package,
  Truck,
  Clock,
  ExternalLink,
  Calendar,
  ArrowLeft,
  RefreshCw,
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
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  items: ShipmentItem[];
  orderedAt: string;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  lastUpdate: string;
}

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

export default function ShipmentsPage() {
  const { branding } = useClinicBranding();
  const { t } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [allShipments, setAllShipments] = useState<Shipment[]>([]);
  const [prescriptionJourney, setPrescriptionJourney] = useState<PrescriptionJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const journey =
        data !== null && typeof data === 'object' && 'prescriptionJourney' in data
          ? (data as { prescriptionJourney?: PrescriptionJourney | null }).prescriptionJourney ?? null
          : null;

      const merged = [...(Array.isArray(active) ? active : []), ...(Array.isArray(delivered) ? delivered : [])];
      merged.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
      setAllShipments(merged);
      setPrescriptionJourney(journey);
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
    await loadShipments();
    setRefreshing(false);
  };

  if (loading) {
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
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
          {error}
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
          {allShipments.map((shipment) => (
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
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      <Truck className="h-5 w-5" style={{ color: primaryColor }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{shipment.carrier}</p>
                      <p className="font-mono text-sm text-gray-500">{shipment.trackingNumber}</p>
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

              {/* Medications & date */}
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

                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {shipment.shippedAt
                    ? `Shipped ${formatDate(shipment.shippedAt)}`
                    : `Ordered ${formatDate(shipment.orderedAt)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
