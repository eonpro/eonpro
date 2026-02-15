'use client';

import { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { apiFetch } from '@/lib/api/fetch';

type Order = {
  id: number;
  lifefileOrderId?: string | null;
  status?: string | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  rxs: Array<{
    id: number;
    medName?: string;
    strength?: string;
    quantity?: string | number;
  }>;
  provider?: {
    firstName: string;
    lastName: string;
  } | null;
};

type OrderManagementModalProps = {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const CANCELLATION_REASONS = [
  { value: 'patient_request', label: 'Patient requested cancellation' },
  { value: 'provider_request', label: 'Provider requested cancellation' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'incorrect_medication', label: 'Incorrect medication' },
  { value: 'incorrect_dosage', label: 'Incorrect dosage' },
  { value: 'incorrect_quantity', label: 'Incorrect quantity' },
  { value: 'incorrect_patient_info', label: 'Incorrect patient information' },
  { value: 'insurance_issue', label: 'Insurance issue' },
  { value: 'cost_issue', label: 'Cost/pricing issue' },
  { value: 'other', label: 'Other reason' },
];

// Statuses that can be cancelled
const CANCELLABLE_STATUSES = [
  'pending',
  'sent',
  'submitted',
  'received',
  'processing',
  'awaiting_webhook',
  'error',
];

export default function OrderManagementModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: OrderManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'cancel' | 'modify'>('cancel');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Cancellation form state
  const [cancellationReason, setCancellationReason] = useState('provider_request');
  const [cancellationNotes, setCancellationNotes] = useState('');

  // Modification form state
  const [shippingChanges, setShippingChanges] = useState({
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    recipientPhone: '',
  });
  const [modificationNotes, setModificationNotes] = useState('');

  const canCancel = order.status
    ? CANCELLABLE_STATUSES.includes(order.status.toLowerCase()) && !order.cancelledAt
    : false;

  const handleCancel = async () => {
    if (!canCancel) {
      setError('This order cannot be cancelled');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cancellationReason,
          notes: cancellationNotes || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to cancel order');
      }

      setSuccess(data.warning || 'Order cancelled successfully');

      // Wait a moment to show success message, then close
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
    } finally {
      setLoading(false);
    }
  };

  const handleModify = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Build shipping object only with non-empty values
    const shipping: Record<string, string> = {};
    Object.entries(shippingChanges).forEach(([key, value]) => {
      if (value.trim()) {
        shipping[key] = value.trim();
      }
    });

    // Check if there are any modifications
    if (Object.keys(shipping).length === 0 && !modificationNotes.trim()) {
      setError('Please provide at least one modification');
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch(`/api/orders/${order.id}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipping: Object.keys(shipping).length > 0 ? shipping : undefined,
          notes: modificationNotes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to modify order');
      }

      setSuccess(data.warning || 'Order modified successfully');

      // Wait a moment to show success message, then close
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to modify order');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state
    setCancellationReason('provider_request');
    setCancellationNotes('');
    setShippingChanges({
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      recipientPhone: '',
    });
    setModificationNotes('');
    setError(null);
    setSuccess(null);
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                  Manage Order
                </Dialog.Title>

                {/* Order Summary */}
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Order ID:</span>
                    <span className="font-medium">{order.lifefileOrderId || `#${order.id}`}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span
                      className={`font-medium ${
                        order.cancelledAt ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {order.cancelledAt ? 'Cancelled' : order.status || 'Unknown'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-gray-500">Medications:</span>
                    <span className="font-medium">
                      {order.rxs.map((rx) => rx.medName).join(', ') || '—'}
                    </span>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-4 border-b border-gray-200">
                  <nav className="-mb-px flex space-x-4">
                    <button
                      onClick={() => setActiveTab('cancel')}
                      className={`pb-2 text-sm font-medium ${
                        activeTab === 'cancel'
                          ? 'border-b-2 border-red-500 text-red-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Cancel Order
                    </button>
                    <button
                      onClick={() => setActiveTab('modify')}
                      className={`pb-2 text-sm font-medium ${
                        activeTab === 'modify'
                          ? 'border-b-2 border-blue-500 text-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Modify Shipping
                    </button>
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="mt-4">
                  {activeTab === 'cancel' ? (
                    <div className="space-y-4">
                      {!canCancel ? (
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                          <div className="flex items-start">
                            <svg
                              className="h-5 w-5 text-yellow-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                              />
                            </svg>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-yellow-800">
                                Order Cannot Be Cancelled
                              </p>
                              <p className="mt-1 text-sm text-yellow-700">
                                {order.cancelledAt
                                  ? 'This order has already been cancelled.'
                                  : 'This order is already in fulfillment or has been shipped. Contact the pharmacy directly for assistance.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Cancellation Reason <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={cancellationReason}
                              onChange={(e) => setCancellationReason(e.target.value)}
                              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
                            >
                              {CANCELLATION_REASONS.map((reason) => (
                                <option key={reason.value} value={reason.value}>
                                  {reason.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Additional Notes (Optional)
                            </label>
                            <textarea
                              value={cancellationNotes}
                              onChange={(e) => setCancellationNotes(e.target.value)}
                              rows={3}
                              placeholder="Provide any additional details about the cancellation..."
                              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
                            />
                          </div>

                          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                            <p className="text-sm text-red-700">
                              <strong>Warning:</strong> Cancelling this order will attempt to notify
                              Lifefile. If the order is already being processed, the pharmacy may
                              need to be contacted directly.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                        Update shipping information for this order. Only orders that haven't shipped
                        yet can be modified.
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Address Line 1
                          </label>
                          <input
                            type="text"
                            value={shippingChanges.addressLine1}
                            onChange={(e) =>
                              setShippingChanges({
                                ...shippingChanges,
                                addressLine1: e.target.value,
                              })
                            }
                            placeholder="New address (leave blank to keep current)"
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Address Line 2
                          </label>
                          <input
                            type="text"
                            value={shippingChanges.addressLine2}
                            onChange={(e) =>
                              setShippingChanges({
                                ...shippingChanges,
                                addressLine2: e.target.value,
                              })
                            }
                            placeholder="Apt, Suite, etc."
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">City</label>
                          <input
                            type="text"
                            value={shippingChanges.city}
                            onChange={(e) =>
                              setShippingChanges({ ...shippingChanges, city: e.target.value })
                            }
                            placeholder="City"
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">State</label>
                          <input
                            type="text"
                            value={shippingChanges.state}
                            onChange={(e) =>
                              setShippingChanges({ ...shippingChanges, state: e.target.value })
                            }
                            placeholder="State"
                            maxLength={2}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            ZIP Code
                          </label>
                          <input
                            type="text"
                            value={shippingChanges.zipCode}
                            onChange={(e) =>
                              setShippingChanges({ ...shippingChanges, zipCode: e.target.value })
                            }
                            placeholder="ZIP Code"
                            maxLength={10}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Phone</label>
                          <input
                            type="tel"
                            value={shippingChanges.recipientPhone}
                            onChange={(e) =>
                              setShippingChanges({
                                ...shippingChanges,
                                recipientPhone: e.target.value,
                              })
                            }
                            placeholder="Phone number"
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Notes to Pharmacy
                        </label>
                        <textarea
                          value={modificationNotes}
                          onChange={(e) => setModificationNotes(e.target.value)}
                          rows={2}
                          placeholder="Add notes to the order..."
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Error/Success Messages */}
                {error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    {success}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Close
                  </button>

                  {activeTab === 'cancel' && canCancel && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={loading}
                      className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <svg
                            className="mr-2 h-4 w-4 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                          Cancelling...
                        </>
                      ) : (
                        'Cancel Order'
                      )}
                    </button>
                  )}

                  {activeTab === 'modify' && (
                    <button
                      type="button"
                      onClick={handleModify}
                      disabled={loading}
                      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <svg
                            className="mr-2 h-4 w-4 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
