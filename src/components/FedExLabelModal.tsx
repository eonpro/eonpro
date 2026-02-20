'use client';

import { useState, useMemo, useCallback } from 'react';
import { X, Loader2, Printer, Package, Truck, AlertCircle, Zap, DollarSign } from 'lucide-react';
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

type RateQuote = {
  serviceType: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  surcharges: { type: string; description: string; amount: number }[];
  transitDays: string | null;
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

  const [oneRate, setOneRate] = useState(false);
  const [serviceType, setServiceType] = useState('STANDARD_OVERNIGHT');
  const [packagingType, setPackagingType] = useState('FEDEX_PAK');
  const [weightLbs, setWeightLbs] = useState(1);

  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ trackingNumber: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const availableServices = useMemo(
    () => (oneRate ? FEDEX_SERVICE_TYPES.filter((s) => s.oneRateEligible) : FEDEX_SERVICE_TYPES),
    [oneRate]
  );

  const availablePackaging = useMemo(
    () => (oneRate ? FEDEX_PACKAGING_TYPES.filter((p) => p.oneRateEligible) : FEDEX_PACKAGING_TYPES),
    [oneRate]
  );

  const selectedPackaging = FEDEX_PACKAGING_TYPES.find((p) => p.code === packagingType);
  const maxWeight = oneRate && selectedPackaging?.oneRateMaxLbs ? selectedPackaging.oneRateMaxLbs : 150;

  const handleOneRateToggle = (enabled: boolean) => {
    setOneRate(enabled);
    setRateQuote(null);
    if (enabled) {
      const currentServiceValid = FEDEX_SERVICE_TYPES.find(
        (s) => s.code === serviceType && s.oneRateEligible
      );
      if (!currentServiceValid) setServiceType('STANDARD_OVERNIGHT');

      const currentPkgValid = FEDEX_PACKAGING_TYPES.find(
        (p) => p.code === packagingType && p.oneRateEligible
      );
      if (!currentPkgValid) setPackagingType('FEDEX_PAK');
    }
  };

  const clearRate = useCallback(() => setRateQuote(null), []);

  const handleGetRate = async () => {
    setError(null);
    setRateLoading(true);
    setRateQuote(null);

    try {
      const res = await apiFetch('/api/shipping/fedex/rate', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          origin: {
            address1: origin.address1,
            city: origin.city,
            state: origin.state,
            zip: origin.zip,
          },
          destination: {
            address1: destination.address1,
            city: destination.city,
            state: destination.state,
            zip: destination.zip,
            residential: true,
          },
          serviceType,
          packagingType,
          weightLbs,
          oneRate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get rate');
      setRateQuote(data);
    } catch (err: any) {
      setError(err.message || 'Failed to get rate quote');
    } finally {
      setRateLoading(false);
    }
  };

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
          oneRate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create label');

      setSuccess({ trackingNumber: data.trackingNumber });

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

  const inputCls =
    'rounded-lg border px-3 py-2 text-sm focus:border-[#4D148C] focus:outline-none focus:ring-1 focus:ring-[#4D148C]';

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

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
                    onChange={(e) => { setOrigin({ ...origin, personName: e.target.value }); clearRate(); }}
                    placeholder="Name / Company"
                    className={inputCls}
                  />
                  <input
                    value={origin.phoneNumber}
                    onChange={(e) => { setOrigin({ ...origin, phoneNumber: e.target.value }); clearRate(); }}
                    placeholder="Phone"
                    className={inputCls}
                  />
                </div>
                <input
                  value={origin.address1}
                  onChange={(e) => { setOrigin({ ...origin, address1: e.target.value }); clearRate(); }}
                  placeholder="Address Line 1"
                  className={`w-full ${inputCls}`}
                />
                <input
                  value={origin.address2 || ''}
                  onChange={(e) => { setOrigin({ ...origin, address2: e.target.value }); clearRate(); }}
                  placeholder="Address Line 2 (optional)"
                  className={`w-full ${inputCls}`}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    value={origin.city}
                    onChange={(e) => { setOrigin({ ...origin, city: e.target.value }); clearRate(); }}
                    placeholder="City"
                    className={inputCls}
                  />
                  <input
                    value={origin.state}
                    onChange={(e) => { setOrigin({ ...origin, state: e.target.value }); clearRate(); }}
                    placeholder="State"
                    maxLength={2}
                    className={`uppercase ${inputCls}`}
                  />
                  <input
                    value={origin.zip}
                    onChange={(e) => { setOrigin({ ...origin, zip: e.target.value }); clearRate(); }}
                    placeholder="ZIP"
                    className={inputCls}
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
                    onChange={(e) => { setDestination({ ...destination, personName: e.target.value }); clearRate(); }}
                    placeholder="Recipient Name"
                    className={inputCls}
                  />
                  <input
                    value={destination.phoneNumber}
                    onChange={(e) => { setDestination({ ...destination, phoneNumber: e.target.value }); clearRate(); }}
                    placeholder="Phone"
                    className={inputCls}
                  />
                </div>
                <input
                  value={destination.address1}
                  onChange={(e) => { setDestination({ ...destination, address1: e.target.value }); clearRate(); }}
                  placeholder="Address Line 1"
                  className={`w-full ${inputCls}`}
                />
                <input
                  value={destination.address2 || ''}
                  onChange={(e) => { setDestination({ ...destination, address2: e.target.value }); clearRate(); }}
                  placeholder="Address Line 2 (optional)"
                  className={`w-full ${inputCls}`}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    value={destination.city}
                    onChange={(e) => { setDestination({ ...destination, city: e.target.value }); clearRate(); }}
                    placeholder="City"
                    className={inputCls}
                  />
                  <input
                    value={destination.state}
                    onChange={(e) => { setDestination({ ...destination, state: e.target.value }); clearRate(); }}
                    placeholder="State"
                    maxLength={2}
                    className={`uppercase ${inputCls}`}
                  />
                  <input
                    value={destination.zip}
                    onChange={(e) => { setDestination({ ...destination, zip: e.target.value }); clearRate(); }}
                    placeholder="ZIP"
                    className={inputCls}
                  />
                </div>
              </fieldset>

              {/* Shipping Options */}
              <fieldset className="space-y-3">
                <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <Truck className="h-4 w-4" />
                  Shipping Options
                </legend>

                {/* One Rate Toggle */}
                <div
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    oneRate ? 'border-[#4D148C] bg-purple-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`h-4 w-4 ${oneRate ? 'text-[#4D148C]' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Ship with FedEx One Rate</p>
                      <p className="text-xs text-gray-500">
                        Flat-rate pricing by package size — no fuel or residential surcharges
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={oneRate}
                    onClick={() => handleOneRateToggle(!oneRate)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      oneRate ? 'bg-[#4D148C]' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                        oneRate ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(e) => { setServiceType(e.target.value); clearRate(); }}
                    className={`w-full ${inputCls}`}
                  >
                    {availableServices.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label} — {s.estimatedDays}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Packaging{oneRate ? ' (One Rate)' : ''}
                    </label>
                    <select
                      value={packagingType}
                      onChange={(e) => { setPackagingType(e.target.value); clearRate(); }}
                      className={`w-full ${inputCls}`}
                    >
                      {availablePackaging.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.label}
                          {oneRate && p.oneRateMaxLbs ? ` (up to ${p.oneRateMaxLbs} lbs)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Weight (lbs)</label>
                    <input
                      type="number"
                      min={0.1}
                      max={maxWeight}
                      step={0.1}
                      value={weightLbs}
                      onChange={(e) => { setWeightLbs(parseFloat(e.target.value) || 1); clearRate(); }}
                      className={`w-full ${inputCls}`}
                    />
                  </div>
                </div>

                {selectedService && (
                  <p className="text-xs text-gray-500">
                    Estimated delivery: {selectedService.estimatedDays}
                  </p>
                )}
              </fieldset>

              {/* Rate Quote Display */}
              {rateQuote && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-medium text-blue-800">Estimated Shipping Cost</p>
                    </div>
                    <p className="text-xl font-bold text-blue-900">
                      {formatCurrency(rateQuote.totalCharge, rateQuote.currency)}
                    </p>
                  </div>
                  {rateQuote.transitDays && (
                    <p className="mt-1 text-xs text-blue-600">Transit time: {rateQuote.transitDays}</p>
                  )}
                  {rateQuote.surcharges.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {rateQuote.surcharges.map((s, i) => (
                        <div key={i} className="flex justify-between text-xs text-blue-700">
                          <span>{s.description || s.type}</span>
                          <span>{formatCurrency(s.amount, rateQuote.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t pt-4">
                <button
                  onClick={onClose}
                  disabled={loading || rateLoading}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>

                {!rateQuote ? (
                  <button
                    onClick={handleGetRate}
                    disabled={rateLoading || !origin.address1 || !origin.zip || !destination.address1 || !destination.zip}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-[#4D148C] px-5 py-2 text-sm font-medium text-[#4D148C] transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rateLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Getting Rate...
                      </>
                    ) : (
                      <>
                        <DollarSign className="h-4 w-4" />
                        Get Rate Quote
                      </>
                    )}
                  </button>
                ) : (
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
                        Confirm & Print Label — {formatCurrency(rateQuote.totalCharge, rateQuote.currency)}
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
