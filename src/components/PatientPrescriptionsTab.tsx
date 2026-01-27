"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PrescriptionModal from "./PrescriptionModal";
import PatientShippingHistory from "./PatientShippingHistory";
import OrderManagementModal from "./OrderManagementModal";

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
  lifefileOrderId?: string | null;
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
};

export default function PatientPrescriptionsTab({ 
  patient, 
  orders,
  shippingLabelMap 
}: PatientPrescriptionsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const router = useRouter();

  const handlePrescriptionSuccess = () => {
    // Refresh the page to show the new prescription
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
      <section className="border rounded-xl bg-white shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Prescription History</h2>
          <span className="text-sm text-gray-500">
            Total prescriptions: {orders.length}
          </span>
        </div>
        
        {orders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No prescriptions yet.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create First Prescription
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
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
                  <tr key={order.id} className="hover:bg-gray-50 align-top">
                    <td className="border px-3 py-2">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="border px-3 py-2">
                      {order.provider
                        ? `${order.provider.firstName} ${order.provider.lastName}`
                        : "—"}
                    </td>
                    <td className="border px-3 py-2">
                      <ul className="list-disc list-inside space-y-1">
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
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        order.status === "success" 
                          ? "bg-green-100 text-green-800"
                          : order.status === "error"
                          ? "bg-red-100 text-red-800"
                          : order.status === "awaiting_webhook" || order.status === "processing"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        {order.status === "awaiting_webhook" ? "Processing" : order.status ?? "pending"}
                      </span>
                      {order.lastWebhookAt && (
                        <span className="block text-xs text-gray-500 normal-case mt-1">
                          Updated {new Date(order.lastWebhookAt).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="border px-3 py-2 text-sm">
                      {order.trackingNumber ? (
                        <div className="space-y-1">
                          <div>
                            Tracking:{" "}
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
                            <ul className="text-xs text-gray-600 space-y-1">
                              {order.events.slice(0, 3).map((event: any) => (
                                <li key={event.id}>
                                  <span className="font-semibold">
                                    {event.eventType}
                                  </span>{" "}
                                  <span className="text-gray-500">
                                    ({new Date(event.createdAt).toLocaleDateString()})
                                  </span>
                                  {event.note ? ` – ${event.note}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : order.events && order.events.length > 0 ? (
                        <ul className="text-xs text-gray-600 space-y-1">
                          {order.events.slice(0, 2).map((event: any) => (
                            <li key={event.id}>
                              <span className="font-semibold">
                                {event.eventType}
                              </span>{" "}
                              {event.note ? `– ${event.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-400">
                          Awaiting tracking data
                        </span>
                      )}
                    </td>
                    <td className="border px-3 py-2">
                      <button
                        onClick={() => handleManageOrder(order)}
                        className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          order.cancelledAt
                            ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                        disabled={!!order.cancelledAt}
                        title={order.cancelledAt ? "Order has been cancelled" : "Manage order"}
                      >
                        <svg
                          className="w-3.5 h-3.5 mr-1"
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
        <section className="border rounded-xl bg-white shadow p-6">
          <div className="text-center">
            <h3 className="text-lg font-medium mb-2">Need a New Prescription?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create a new prescription order for {patient.firstName} {patient.lastName}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-6 py-3 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors font-medium"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Prescription
            </button>
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
    </div>
  );
}
