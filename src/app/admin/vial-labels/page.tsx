'use client';

import { useMemo, useState } from 'react';
import { LOGOS_PRODUCTS } from '@/data/logosProducts';

const VIAL_LABEL_SHEET_MAX = 33;

type InjectableProduct = {
  id: number;
  label: string;
};

const injectableProducts: InjectableProduct[] = LOGOS_PRODUCTS
  .filter((product) => /inj|injectable|vial/i.test(product.form) || /vial/i.test(product.name))
  .map((product) => ({
    id: product.id,
    label: `${product.name} ${product.strength ? `(${product.strength})` : ''}`.trim(),
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default function VialLabelsPage() {
  const [productId, setProductId] = useState<number>(injectableProducts[0]?.id ?? 0);
  const [batchNumber, setBatchNumber] = useState('');
  const [budIsoDate, setBudIsoDate] = useState('');
  const [quantity, setQuantity] = useState<number>(VIAL_LABEL_SHEET_MAX);
  const [proofMode, setProofMode] = useState(false);
  const [yearColor, setYearColor] = useState('#137bc1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProductName = useMemo(() => {
    return injectableProducts.find((item) => item.id === productId)?.label ?? 'Selected product';
  }, [productId]);

  async function generatePdf() {
    setError(null);
    if (!productId) {
      setError('Please select a product.');
      return;
    }
    if (!batchNumber.trim()) {
      setError('Please enter a batch number.');
      return;
    }
    if (!budIsoDate) {
      setError('Please choose a BUD date.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/vial-labels/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          batchNumber: batchNumber.trim().toUpperCase(),
          budIsoDate,
          quantity,
          proofMode,
          yearColor,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to generate the PDF.');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `logosrx-vial-labels-${batchNumber.trim().toUpperCase()}${proofMode ? '-proof' : ''}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not generate label sheet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Vial Label Generator</h1>
        <p className="mt-2 text-sm text-gray-600">
          Build print-ready OL950LP label sheets (3 x 11). Output is vector PDF with Code 128 batch barcodes.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Product</label>
            <select
              value={productId}
              onChange={(event) => setProductId(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              {injectableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">BUD (Beyond Use Date)</label>
            <input
              type="date"
              value={budIsoDate}
              onChange={(event) => setBudIsoDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Batch Number</label>
            <input
              type="text"
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value.toUpperCase())}
              placeholder="Example: LG396000936"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Labels to Print</label>
            <input
              type="number"
              min={1}
              max={VIAL_LABEL_SHEET_MAX}
              value={quantity}
              disabled={proofMode}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isNaN(parsed)) return;
                setQuantity(Math.max(1, Math.min(VIAL_LABEL_SHEET_MAX, parsed)));
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              {proofMode
                ? 'Proof mode prints one centered label for alignment/visual checks.'
                : `OL950LP sheets hold ${VIAL_LABEL_SHEET_MAX} labels.`}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">BUD Year Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={yearColor}
                onChange={(event) => setYearColor(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={yearColor}
                onChange={(event) => setYearColor(event.target.value)}
                placeholder="#137bc1"
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Match the medication name color from the template.
            </p>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={proofMode}
                onChange={(event) => setProofMode(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              Proof mode (single centered label)
            </label>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <p>
            <span className="font-semibold">Selected:</span> {selectedProductName}
          </p>
          <p className="mt-1">
            Use your printer&apos;s highest-quality setting (600 DPI or higher) and print at 100% scale.
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={generatePdf}
          disabled={loading}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Generating PDF...' : proofMode ? 'Generate Proof PDF' : 'Generate Label Sheet PDF'}
        </button>
      </div>
    </div>
  );
}
