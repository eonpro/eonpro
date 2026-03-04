'use client';

import { useState, useMemo, useCallback } from 'react';
import { X, Loader2, Printer, Package, Truck, AlertCircle, Zap, DollarSign, Download } from 'lucide-react';
import { AddressInput, type AddressData } from '@/components/AddressAutocomplete';
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

type OrderForLabel = {
  id: number;
  createdAt: string | Date;
  primaryMedName?: string | null;
  primaryMedStrength?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  rxs?: Array<{ medName?: string; strength?: string }>;
};

type LabelFormat = 'PDF' | 'ZPLII' | 'PNG';

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
  orders?: OrderForLabel[];
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
  orders = [],
  onClose,
}: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('ZPLII');

  const untrackedOrders = useMemo(
    () => orders.filter((o) => !o.trackingNumber && o.status !== 'cancelled'),
    [orders],
  );

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
  const [success, setSuccess] = useState<{ trackingNumber: string; labelId: number; popupBlocked: boolean } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [redownloading, setRedownloading] = useState(false);

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

  const printLabel4x6 = (base64: string, format: string = 'PDF'): boolean => {
    if (format === 'ZPLII') {
      const blob = new Blob([atob(base64)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FedEx-Label-ZPL.zpl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    const pdfBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(blob);

    const printWin = window.open('', '_blank');
    if (!printWin) return false;

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>FedEx Shipping Label</title>
  <style>
    @page {
      size: 4in 6in;
      margin: 0;
    }
    * { margin: 0; padding: 0; }
    html, body {
      width: 4in;
      height: 6in;
      overflow: hidden;
    }
    iframe {
      width: 4in;
      height: 6in;
      border: none;
    }
    @media print {
      html, body { width: 4in; height: 6in; }
      iframe { width: 4in; height: 6in; }
    }
    @media screen {
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #f3f4f6;
        width: auto;
        height: auto;
        padding: 20px;
        overflow: auto;
      }
      .print-instructions {
        max-width: 420px;
        background: #fef3c7;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        color: #92400e;
        line-height: 1.5;
      }
      .print-instructions strong { color: #78350f; }
      .print-instructions ul { margin: 6px 0 0 16px; }
      .label-container {
        background: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        width: 4in;
        height: 6in;
      }
      .print-btn {
        margin-top: 16px;
        background: #4D148C;
        color: white;
        border: none;
        padding: 10px 32px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        font-family: system-ui, sans-serif;
      }
      .print-btn:hover { background: #3a0f6a; }
    }
  </style>
</head>
<body>
  <div class="print-instructions">
    <strong>Print Settings for Scannable Label:</strong>
    <ul>
      <li>Paper size: <strong>4 x 6 in</strong> (or "4x6 Label")</li>
      <li>Scale: <strong>100% (Actual Size)</strong> — do NOT "Fit to Page"</li>
      <li>Margins: <strong>None</strong></li>
      <li>Uncheck "Headers and Footers"</li>
    </ul>
  </div>
  <div class="label-container">
    <iframe src="${pdfUrl}#toolbar=0&navpanes=0&view=Fit"></iframe>
  </div>
  <button class="print-btn" onclick="window.print()">Print Label (4x6)</button>
</body>
</html>`);
    printWin.document.close();
    return true;
  };

  const downloadLabelFile = (base64: string, trackingNumber: string, format: string = 'PDF') => {
    let blob: Blob;
    let ext: string;

    if (format === 'ZPLII') {
      blob = new Blob([atob(base64)], { type: 'application/octet-stream' });
      ext = 'zpl';
    } else if (format === 'PNG') {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: 'image/png' });
      ext = 'png';
    } else {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: 'application/pdf' });
      ext = 'pdf';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FedEx-Label-${trackingNumber}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRedownload = async () => {
    if (!success) return;
    setRedownloading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/shipping/fedex/label?id=${success.labelId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retrieve label');
      downloadLabelFile(data.labelData, success.trackingNumber, data.labelFormat || 'PDF');
    } catch (err: any) {
      setError(err.message || 'Failed to download label');
    } finally {
      setRedownloading(false);
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
          labelFormat,
          ...(selectedOrderId ? { orderId: selectedOrderId } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create label');

      const fmt = data.labelFormat || labelFormat;
      const opened = printLabel4x6(data.labelData, fmt);
      setSuccess({ trackingNumber: data.trackingNumber, labelId: data.id, popupBlocked: !opened });
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
          {success && (() => {
            const linkedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : null;
            const isZpl = labelFormat === 'ZPLII';
            return (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="font-medium text-green-800">Label created successfully!</p>
                <p className="mt-1 text-sm text-green-700">
                  Tracking: <span className="font-mono font-semibold">{success.trackingNumber}</span>
                </p>
                {linkedOrder && (
                  <p className="mt-1 text-sm text-green-700">
                    Linked to prescription:{' '}
                    <span className="font-semibold">
                      {linkedOrder.primaryMedName || linkedOrder.rxs?.[0]?.medName || 'Order'}
                      {(linkedOrder.primaryMedStrength || linkedOrder.rxs?.[0]?.strength) &&
                        ` ${linkedOrder.primaryMedStrength || linkedOrder.rxs?.[0]?.strength}`}
                    </span>
                  </p>
                )}
                {isZpl ? (
                  <p className="mt-1 text-xs text-green-600">
                    ZPL label file downloaded — send to your Zebra printer.
                  </p>
                ) : success.popupBlocked ? (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-800">
                      Popup was blocked by your browser.
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      Click the button below to download your label.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-green-600">
                    The label has been opened in a new tab for printing.
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleRedownload}
                    disabled={redownloading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#4D148C] px-4 py-2 text-sm font-medium text-[#4D148C] transition hover:bg-purple-50 disabled:opacity-50"
                  >
                    {redownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Re-download Label
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!success && (
            <>
              {/* Link to Prescription */}
              {untrackedOrders.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    <Package className="h-4 w-4" />
                    Link to Prescription (optional)
                  </legend>
                  <select
                    value={selectedOrderId ?? ''}
                    onChange={(e) => setSelectedOrderId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className={`w-full ${inputCls}`}
                  >
                    <option value="">No prescription — ship without linking</option>
                    {untrackedOrders.map((o) => {
                      const med = o.primaryMedName || o.rxs?.[0]?.medName || 'Unknown';
                      const str = o.primaryMedStrength || o.rxs?.[0]?.strength || '';
                      const date = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      return (
                        <option key={o.id} value={o.id}>
                          {med}{str ? ` ${str}` : ''} — {date}
                          {o.status ? ` (${o.status})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-xs text-gray-500">
                    Selecting a prescription will automatically attach the tracking number to it.
                  </p>
                </fieldset>
              )}

              {/* Label Format */}
              <fieldset className="space-y-2">
                <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <Printer className="h-4 w-4" />
                  Label Format
                </legend>
                <div className="flex gap-2">
                  {([
                    { value: 'ZPLII' as LabelFormat, label: 'ZPL (Zebra Thermal)', desc: 'Direct to thermal printer' },
                    { value: 'PDF' as LabelFormat, label: 'PDF', desc: 'For regular printers' },
                    { value: 'PNG' as LabelFormat, label: 'PNG Image', desc: 'Image file' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLabelFormat(opt.value)}
                      className={`flex-1 rounded-lg border p-2.5 text-left transition-colors ${
                        labelFormat === opt.value
                          ? 'border-[#4D148C] bg-purple-50 ring-1 ring-[#4D148C]'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-medium ${labelFormat === opt.value ? 'text-[#4D148C]' : 'text-gray-700'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </fieldset>

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
                <AddressInput
                  value={origin.address1}
                  onChange={(value: string, parsed?: AddressData) => {
                    if (parsed) {
                      setOrigin((prev) => ({
                        ...prev,
                        address1: parsed.address1,
                        city: parsed.city,
                        state: parsed.state,
                        zip: parsed.zip,
                      }));
                      clearRate();
                    } else {
                      setOrigin((prev) => ({ ...prev, address1: value }));
                      clearRate();
                    }
                  }}
                  placeholder="Address Line 1"
                  className="w-full"
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
                <AddressInput
                  value={destination.address1}
                  onChange={(value: string, parsed?: AddressData) => {
                    if (parsed) {
                      setDestination((prev) => ({
                        ...prev,
                        address1: parsed.address1,
                        city: parsed.city,
                        state: parsed.state,
                        zip: parsed.zip,
                      }));
                      clearRate();
                    } else {
                      setDestination((prev) => ({ ...prev, address1: value }));
                      clearRate();
                    }
                  }}
                  placeholder="Address Line 1"
                  className="w-full"
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
