'use client';

import { useState } from 'react';
import { X, Loader2, Printer, Package, Truck, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { FEDEX_SERVICE_TYPES, FEDEX_PACKAGING_TYPES } from '@/lib/fedex-services';

type Address = {
  personName: string;
  companyName?: string;
  phoneNumber: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  zip: string;
};

type Props = {
  patientId: number;
  clinicAddress?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  clinicName?: string;
  clinicPhone?: string;
  patientName: string;
  patientPhone: string;
  patientAddress: {
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  onClose: () => void;
};

export default function FedExLabelModal({
  patientId,
  clinicAddress,
  clinicName,
  clinicPhone,
  patientName,
  patientPhone,
  patientAddress,
  onClose,
}: Props) {
  const [origin, setOrigin] = useState<Address>({
    personName: clinicName || '',
    phoneNumber: clinicPhone || '',
    address1: clinicAddress?.address1 || '',
    address2: clinicAddress?.address2 || '',
    city: clinicAddress?.city || '',
    state: clinicAddress?.state || '',
    zip: clinicAddress?.zip || '',
  });

  const [destination, setDestination] = useState<Address>({
    personName: patientName,
    phoneNumber: patientPhone,
    address1: patientAddress.address1,
    address2: patientAddress.address2 || '',
    city: patientAddress.city,
    state: patientAddress.state,
    zip: patientAddress.zip,
  });

  const [serviceType, setServiceType] = useState('FEDEX_GROUND');
  const [packagingType, setPackagingType] = useState('YOUR_PACKAGING');
  const [weightLbs, setWeightLbs] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ trackingNumber: string } | null>(null);

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch('/api/shipping/fedex/label', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          origin,
          destination,
          serviceType,
          packagingType,
          weightLbs,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create label');
      }

      setSuccess({ trackingNumber: data.trackingNumber });

      // Decode base64 PDF and open in new tab for printing
      const pdfBytes = Uint8Array.from(atob(data.labelPdf), (c) => c.charCodeAt(0));
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  const selectedService = FEDEX_SERVICE_TYPES.find((s) => s.code === serviceType);

  const isOriginValid =
    origin.personName && origin.address1 && origin.city && origin.state && origin.zip && origin.phoneNumber;
  const isDestValid =
    destination.personName &&
    destination.address1 &&
    destination.city &&
    destination.state &&
    destination.zip &&
    destination.phoneNumber;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#4D148C]" />
            <h2 className="text-lg font-semibold">Create FedEx Shipping Label</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Success state */}
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-medium text-green-800">Label created successfully!</p>
              <p className="mt-1 text-sm text-green-700">
                Tracking: <span className="font-mono font-semibold">{success.trackingNumber}</span>
              </p>
              <p className="mt-1 text-xs text-green-600">
                The label PDF has been opened in a new tab for printing.
              </p>
              <button
                onClick={onClose}
                className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Done
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!success && (
            <>
              {/* Origin Address */}
              <fieldset className="space-y-3">
                <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <Package className="h-4 w-4" />
                  From (Origin)
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={origin.personName}
                    onChange={(e) => setOrigin({ ...origin, personName: e.target.value })}
                    placeholder="Name / Company"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                  <input
                    value={origin.phoneNumber}
                    onChange={(e) => setOrigin({ ...origin, phoneNumber: e.target.value })}
                    placeholder="Phone"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                </div>
                <input
                  value={origin.address1}
                  onChange={(e) => setOrigin({ ...origin, address1: e.target.value })}
                  placeholder="Address Line 1"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                />
                <input
                  value={origin.address2 || ''}
                  onChange={(e) => setOrigin({ ...origin, address2: e.target.value })}
                  placeholder="Address Line 2 (optional)"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    value={origin.city}
                    onChange={(e) => setOrigin({ ...origin, city: e.target.value })}
                    placeholder="City"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                  <input
                    value={origin.state}
                    onChange={(e) => setOrigin({ ...origin, state: e.target.value })}
                    placeholder="State"
                    maxLength={2}
                    className="rounded-lg border px-3 py-2 text-sm uppercase focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                  <input
                    value={origin.zip}
                    onChange={(e) => setOrigin({ ...origin, zip: e.target.value })}
                    placeholder="ZIP"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                </div>
              </fieldset>

              {/* Destination Address */}
              <fieldset className="space-y-3">
                <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <Package className="h-4 w-4" />
                  To (Destination)
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={destination.personName}
                    onChange={(e) => setDestination({ ...destination, personName: e.target.value })}
                    placeholder="Recipient Name"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                  <input
                    value={destination.phoneNumber}
                    onChange={(e) => setDestination({ ...destination, phoneNumber: e.target.value })}
                    placeholder="Phone"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                </div>
                <input
                  value={destination.address1}
                  onChange={(e) => setDestination({ ...destination, address1: e.target.value })}
                  placeholder="Address Line 1"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                />
                <input
                  value={destination.address2 || ''}
                  onChange={(e) => setDestination({ ...destination, address2: e.target.value })}
                  placeholder="Address Line 2 (optional)"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    value={destination.city}
                    onChange={(e) => setDestination({ ...destination, city: e.target.value })}
                    placeholder="City"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                  <input
                    value={destination.state}
                    onChange={(e) => setDestination({ ...destination, state: e.target.value })}
                    placeholder="State"
                    maxLength={2}
                    className="rounded-lg border px-3 py-2 text-sm uppercase focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                  <input
                    value={destination.zip}
                    onChange={(e) => setDestination({ ...destination, zip: e.target.value })}
                    placeholder="ZIP"
                    className="rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  />
                </div>
              </fieldset>

              {/* Shipping Options */}
              <fieldset className="space-y-3">
                <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <Truck className="h-4 w-4" />
                  Shipping Options
                </legend>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                  >
                    {FEDEX_SERVICE_TYPES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label} — {s.estimatedDays}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Packaging</label>
                    <select
                      value={packagingType}
                      onChange={(e) => setPackagingType(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                    >
                      {FEDEX_PACKAGING_TYPES.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Weight (lbs)</label>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={weightLbs}
                      onChange={(e) => setWeightLbs(parseFloat(e.target.value) || 1)}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]"
                    />
                  </div>
                </div>

                {selectedService && (
                  <p className="text-xs text-gray-500">
                    Estimated delivery: {selectedService.estimatedDays}
                  </p>
                )}
              </fieldset>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t pt-4">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !isOriginValid || !isDestValid}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4D148C] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#3a0f6a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating Label...
                    </>
                  ) : (
                    <>
                      <Printer className="h-4 w-4" />
                      Generate & Print Label
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
