'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PrescriptionModal from './PrescriptionModal';
import PatientShippingHistory from './PatientShippingHistory';
import OrderManagementModal from './OrderManagementModal';
import DoseSpotPrescriber from './dosespot/DoseSpotPrescriber';

type Order = {
  id: number;
  createdAt: Date;
  rxs: Array<{
    id: number;
    orderId?: number;
    medicationName?: string;
    medicationKey?: string;
    medName?: string;
    strength?: string;
    sig?: string;
    quantity?: string | number;
    form?: string;
    refills?: string;
  }>;
  provider?: {
    id?: number;
    firstName: string;
    lastName: string;
    npi: string;
  } | null;
  status: string | null;
  fulfillmentChannel?: string | null;
  lifefileOrderId?: string | null;
  doseSpotPrescriptionId?: number | null;
  externalPharmacyName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingMethod?: number | null;
  shippingStatus?: string | null;
  lastWebhookAt?: Date | null;
  cancelledAt?: Date | null;
  events?: Array<{
    id: number;
    eventType: string;
    createdAt: Date;
    note?: string | null;
  }> | null;
};

type PatientPrescriptionsTabProps = {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    dob: string | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    address1: string | null;
    address2?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  orders: Order[];
  shippingLabelMap: Map<string | number, string>;
  doseSpotEnabled?: boolean;
  providerId?: number;
};

export default function PatientPrescriptionsTab({
  patient,
  orders,
  shippingLabelMap,
  doseSpotEnabled = false,
  providerId,
}: PatientPrescriptionsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const router = useRouter();

  const DUPLICATE_WINDOW_DAYS = 3;

  const recentOrders = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DUPLICATE_WINDOW_DAYS);
    return orders.filter((order) => {
      const created = new Date(order.createdAt);
      const isCancelled = !!order.cancelledAt;
      const isErrorOrDeclined = order.status === 'error' || order.status === 'cancelled' || order.status === 'declined';
      return created >= cutoff && !isCancelled && !isErrorOrDeclined;
    });
  }, [orders]);

  const handleNewPrescriptionClick = () => {
    if (recentOrders.length > 0) {
      setShowDuplicateConfirm(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleConfirmDuplicate = () => {
    setShowDuplicateConfirm(false);
    setIsModalOpen(true);
  };

  const handlePrescriptionSuccess = () => {
    router.refresh();
  };

  const handleManageOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsManageModalOpen(true);
  };

  const handleManageSuccess = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Prescription History */}
      <section className="rounded-xl border bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Prescription History</h2>
          <span className="text-sm text-gray-500">Total prescriptions: {orders.length}</span>
        </div>

        {orders.length === 0 ? (
          <div className="py-8 text-center">
            <p className="mb-4 text-gray-500">No prescriptions yet.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleNewPrescriptionClick}
                className="inline-flex items-center rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660]"
              >
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Create First Prescription
              </button>
              {doseSpotEnabled && providerId && (
                <DoseSpotPrescriber
                  patientId={patient.id}
                  prescriberId={providerId}
                  patientName={`${patient.firstName} ${patient.lastName}`}
                  onComplete={() => router.refresh()}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Date</th>
                  <th className="border px-3 py-2 text-left">Provider</th>
                  <th className="border px-3 py-2 text-left">Medications</th>
                  <th className="border px-3 py-2 text-left">Shipping</th>
                  <th className="border px-3 py-2 text-left">Status</th>
                  <th className="border px-3 py-2 text-left">Tracking / Events</th>
                  <th className="border px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id} className="align-top hover:bg-gray-50">
                    <td className="border px-3 py-2">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="border px-3 py-2">
                      {order.provider
                        ? `${order.provider.firstName} ${order.provider.lastName}`
                        : '—'}
                    </td>
                    <td className="border px-3 py-2">
                      <ul className="list-inside list-disc space-y-1">
                        {order.rxs.map((rx: any) => (
                          <li key={rx.id}>
                            {rx.medName || rx.medicationName || rx.medicationKey}
                            {rx.strength && ` (${rx.strength})`}
                            {rx.sig && ` – ${rx.sig}`}
                            {rx.quantity && ` [Qty: ${rx.quantity}]`}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="border px-3 py-2 text-sm">
                      {order.shippingMethod && (
                        <span className="font-semibold">
                          {shippingLabelMap.get(order.shippingMethod) ??
                            `Service ${order.shippingMethod}`}
                        </span>
                      )}
                      {order.fulfillmentChannel === 'dosespot' && order.externalPharmacyName && (
                        <span className="block text-xs text-indigo-600">
                          {order.externalPharmacyName}
                        </span>
                      )}
                      {order.lifefileOrderId && (
                        <span className="block text-xs text-gray-500">
                          Order #{order.lifefileOrderId}
                        </span>
                      )}
                      {order.shippingStatus && (
                        <span className="block text-xs text-gray-500">
                          Shipping status: {order.shippingStatus}
                        </span>
                      )}
                    </td>
                    <td className="border px-3 py-2 capitalize">
                      <div className="flex flex-wrap items-center gap-1">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            order.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : order.status === 'error'
                                ? 'bg-red-100 text-red-800'
                                : order.status === 'awaiting_webhook' || order.status === 'processing'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {order.status === 'awaiting_webhook'
                            ? 'Processing'
                            : (order.status ?? 'pending')}
                        </span>
                        {order.fulfillmentChannel === 'dosespot' && (
                          <span className="inline-flex rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                            External Rx
                          </span>
                        )}
                      </div>
                      {order.lastWebhookAt && (
                        <span className="mt-1 block text-xs normal-case text-gray-500">
                          Updated {new Date(order.lastWebhookAt).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="border px-3 py-2 text-sm">
                      {order.trackingNumber ? (
                        <div className="space-y-1">
                          <div>
                            Tracking:{' '}
                            {order.trackingUrl ? (
                              <a
                                href={order.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#4fa77e] underline"
                              >
                                {order.trackingNumber}
                              </a>
                            ) : (
                              <span className="font-mono">{order.trackingNumber}</span>
                            )}
                          </div>
                          {order.events && order.events.length > 0 && (
                            <ul className="space-y-1 text-xs text-gray-600">
                              {order.events.slice(0, 3).map((event: any) => (
                                <li key={event.id}>
                                  <span className="font-semibold">{event.eventType}</span>{' '}
                                  <span className="text-gray-500">
                                    ({new Date(event.createdAt).toLocaleDateString()})
                                  </span>
                                  {event.note ? ` – ${event.note}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : order.events && order.events.length > 0 ? (
                        <ul className="space-y-1 text-xs text-gray-600">
                          {order.events.slice(0, 2).map((event: any) => (
                            <li key={event.id}>
                              <span className="font-semibold">{event.eventType}</span>{' '}
                              {event.note ? `– ${event.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-400">Awaiting tracking data</span>
                      )}
                    </td>
                    <td className="border px-3 py-2">
                      <button
                        onClick={() => handleManageOrder(order)}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          order.cancelledAt
                            ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        disabled={!!order.cancelledAt}
                        title={order.cancelledAt ? 'Order has been cancelled' : 'Manage order'}
                      >
                        <svg
                          className="mr-1 h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* New Prescription Button */}
      {orders.length > 0 && (
        <section className="rounded-xl border bg-white p-6 shadow">
          <div className="text-center">
            <h3 className="mb-2 text-lg font-medium">Need a New Prescription?</h3>
            <p className="mb-4 text-sm text-gray-600">
              Create a new prescription order for {patient.firstName} {patient.lastName}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleNewPrescriptionClick}
                className="inline-flex items-center rounded-lg bg-[#4fa77e] px-6 py-3 font-medium text-white transition-colors hover:bg-[#3f8660]"
              >
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New Prescription
              </button>
              {doseSpotEnabled && providerId && (
                <DoseSpotPrescriber
                  patientId={patient.id}
                  prescriberId={providerId}
                  patientName={`${patient.firstName} ${patient.lastName}`}
                  onComplete={() => router.refresh()}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Shipping History - Patient Level Tracking */}
      <PatientShippingHistory patientId={patient.id} />

      {/* Prescription Modal */}
      <PrescriptionModal
        patient={patient}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handlePrescriptionSuccess}
      />

      {/* Order Management Modal */}
      {selectedOrder && (
        <OrderManagementModal
          order={selectedOrder}
          isOpen={isManageModalOpen}
          onClose={() => {
            setIsManageModalOpen(false);
            setSelectedOrder(null);
          }}
          onSuccess={handleManageSuccess}
        />
      )}

      {/* Duplicate Prescription Confirmation Dialog */}
      {showDuplicateConfirm && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50"
            onClick={() => setShowDuplicateConfirm(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
              <div className="p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                    <svg
                      className="h-5 w-5 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Duplicate Prescription Warning
                  </h3>
                </div>
                <p className="mb-3 text-sm text-gray-700">
                  This patient already has {recentOrders.length} prescription{recentOrders.length > 1 ? 's' : ''} in the last {DUPLICATE_WINDOW_DAYS} days:
                </p>
                <ul className="mb-4 space-y-2 rounded-lg border border-red-100 bg-red-50 p-3">
                  {recentOrders.slice(0, 3).map((order) => (
                    <li key={order.id} className="flex items-center gap-2 text-sm text-red-800">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
                      <span className="font-medium">
                        {order.rxs.map((rx) => rx.medName || rx.medicationKey).join(', ') || 'Unknown'}
                      </span>
                      <span className="text-red-600">
                        — {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mb-4 text-sm font-medium text-red-700">
                  Are you sure you want to create another prescription?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDuplicateConfirm(false)}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDuplicate}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                  >
                    Continue Anyway
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
