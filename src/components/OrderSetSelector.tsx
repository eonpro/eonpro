'use client';

import { useState, useEffect, useCallback } from 'react';
import { MEDS } from '@/lib/medications';
import { apiFetch } from '@/lib/api/fetch';
import { logger } from '@/lib/logger';
import MedicationSelector from './MedicationSelector';

// ============================================================================
// TYPES
// ============================================================================

export interface OrderSetItem {
  id?: number;
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply: number;
  sortOrder: number;
}

export interface OrderSet {
  id: number;
  name: string;
  description: string | null;
  items: OrderSetItem[];
}

export interface AppliedMedication {
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply: string;
}

interface OrderSetSelectorProps {
  onApply: (medications: AppliedMedication[]) => void;
}

// ============================================================================
// ICONS
// ============================================================================

const PackageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z" />
    <polyline points="2.32 6.16 12 11 21.68 6.16" />
    <line x1="12" y1="22.76" x2="12" y2="11" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

// ============================================================================
// DAYS SUPPLY OPTIONS (shared)
// ============================================================================

const DAYS_SUPPLY_OPTIONS = [7, 14, 28, 30, 60, 90, 120, 180];

// ============================================================================
// CREATE / EDIT MODAL
// ============================================================================

interface OrderSetFormItem {
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply: number;
}

function OrderSetModal({
  orderSet,
  onClose,
  onSaved,
}: {
  orderSet?: OrderSet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(orderSet?.name || '');
  const [description, setDescription] = useState(orderSet?.description || '');
  const [items, setItems] = useState<OrderSetFormItem[]>(
    orderSet?.items.map((i) => ({
      medicationKey: i.medicationKey,
      sig: i.sig,
      quantity: i.quantity,
      refills: i.refills,
      daysSupply: i.daysSupply,
    })) || [{ medicationKey: '', sig: '', quantity: '1', refills: '0', daysSupply: 30 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { medicationKey: '', sig: '', quantity: '1', refills: '0', daysSupply: 30 },
    ]);

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof OrderSetFormItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const validItems = items.filter((i) => i.medicationKey);
    if (validItems.length === 0) {
      setError('At least one medication is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        items: validItems.map((i, idx) => ({
          medicationKey: String(i.medicationKey),
          sig: i.sig != null && i.sig !== '' ? String(i.sig) : '',
          quantity: String(i.quantity ?? '1'),
          refills: String(i.refills ?? '0'),
          daysSupply: Number(i.daysSupply) || 30,
          sortOrder: idx,
        })),
      };

      const url = orderSet ? `/api/clinic/order-sets/${orderSet.id}` : '/api/clinic/order-sets';
      const method = orderSet ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let data: { error?: string; details?: string } = {};
        try {
          data = await res.json();
        } catch {
          data = { error: `Request failed (${res.status})` };
        }
        const message = data.details ? `${data.error || 'Failed to save'}: ${data.details}` : (data.error || 'Failed to save');
        throw new Error(message);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save order set');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!orderSet) return;
    if (!confirm(`Delete "${orderSet.name}"? This cannot be undone.`)) return;

    try {
      const res = await apiFetch(`/api/clinic/order-sets/${orderSet.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onSaved();
      onClose();
    } catch {
      setError('Failed to delete order set');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {orderSet ? 'Edit Order Set' : 'Create Order Set'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., TRT Bundle, GLP-1 Starter Pack"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#17aa7b] focus:ring-2 focus:ring-[#17aa7b]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#17aa7b] focus:ring-2 focus:ring-[#17aa7b]"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Medications ({items.length})
              </label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-sm font-medium text-[#17aa7b] hover:text-[#128a63]"
              >
                <PlusIcon /> Add
              </button>
            </div>

            {items.map((item, idx) => {
              const med = item.medicationKey ? MEDS[item.medicationKey] : null;
              return (
                <div key={idx} className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">#{idx + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>

                  <MedicationSelector
                    value={item.medicationKey}
                    onChange={(key) => {
                      updateItem(idx, 'medicationKey', key);
                      const newMed = MEDS[key];
                      if (newMed?.sigTemplates?.[0]) {
                        const t = newMed.sigTemplates[0];
                        updateItem(idx, 'sig', t.sig);
                        updateItem(idx, 'quantity', t.quantity);
                        updateItem(idx, 'refills', t.refills);
                        if (t.daysSupply != null) updateItem(idx, 'daysSupply', t.daysSupply);
                      }
                    }}
                    showCategoryBadge={true}
                  />

                  <textarea
                    value={item.sig}
                    onChange={(e) => updateItem(idx, 'sig', e.target.value)}
                    placeholder="Sig (directions)"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-[#17aa7b] focus:ring-1 focus:ring-[#17aa7b]"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500">Qty</label>
                      <input
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500">Refills</label>
                      <input
                        value={item.refills}
                        onChange={(e) => updateItem(idx, 'refills', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500">Days</label>
                      <select
                        value={item.daysSupply}
                        onChange={(e) => updateItem(idx, 'daysSupply', Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {DAYS_SUPPLY_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {med && (
                    <p className="text-xs text-gray-400">
                      {med.name} {med.strength} ({med.formLabel || med.form})
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between border-t bg-gray-50 px-6 py-4">
          <div>
            {orderSet && (
              <button
                onClick={handleDelete}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#17aa7b] px-4 py-2 text-sm font-medium text-white hover:bg-[#128a63] disabled:opacity-50"
            >
              {saving ? 'Saving...' : orderSet ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN SELECTOR COMPONENT
// ============================================================================

export default function OrderSetSelector({ onApply }: OrderSetSelectorProps) {
  const [orderSets, setOrderSets] = useState<OrderSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSet, setEditingSet] = useState<OrderSet | null>(null);

  const fetchOrderSets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/clinic/order-sets');
      if (res.ok) {
        const data = await res.json();
        setOrderSets(data.orderSets || []);
      }
    } catch (err) {
      logger.error('[OrderSetSelector] Failed to fetch', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrderSets();
  }, [fetchOrderSets]);

  const handleApply = (set: OrderSet) => {
    const medications: AppliedMedication[] = set.items.map((item) => ({
      medicationKey: item.medicationKey,
      sig: item.sig,
      quantity: item.quantity,
      refills: item.refills,
      daysSupply: String(item.daysSupply),
    }));
    setSelectedId(set.id);
    onApply(medications);
  };

  const handleEdit = (set: OrderSet, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSet(set);
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-400">Loading order sets...</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <PackageIcon />
            Order Sets
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingSet(null);
              setShowModal(true);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#17aa7b] hover:bg-[#e9f7f2]"
          >
            <PlusIcon /> New
          </button>
        </div>

        {orderSets.length === 0 ? (
          <p className="py-2 text-center text-xs text-gray-400">
            No order sets yet. Create one to quickly prescribe medication bundles.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {orderSets.map((set) => {
              const isSelected = selectedId === set.id;
              const medNames = set.items
                .map((i) => {
                  const med = MEDS[i.medicationKey];
                  return med ? med.name.split(' ')[0] : i.medicationKey;
                })
                .join(' + ');

              return (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => handleApply(set)}
                  className={`group relative rounded-lg border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-[#17aa7b] bg-[#e9f7f2] ring-1 ring-[#17aa7b]'
                      : 'border-gray-200 bg-white hover:border-[#17aa7b] hover:bg-[#f6fefb]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{set.name}</span>
                    {isSelected && (
                      <span className="text-[#17aa7b]">
                        <CheckIcon />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleEdit(set, e)}
                      className="ml-1 rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-gray-500 group-hover:opacity-100"
                      title="Edit order set"
                    >
                      <SettingsIcon />
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {set.items.length} med{set.items.length !== 1 ? 's' : ''}: {medNames}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <OrderSetModal
          orderSet={editingSet}
          onClose={() => {
            setShowModal(false);
            setEditingSet(null);
          }}
          onSaved={fetchOrderSets}
        />
      )}
    </>
  );
}
