'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  GripVertical,
  Search,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { LOGOS_PRODUCTS } from '@/data/logosProducts';
import { MEDS } from '@/lib/medications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderSetItem {
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply: number;
  sortOrder: number;
}

interface OrderSet {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  items: OrderSetItem[];
}

type FormItem = OrderSetItem & { _key: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let keyCounter = 0;
function nextKey() {
  return `item_${++keyCounter}_${Date.now()}`;
}

function emptyFormItem(sortOrder: number): FormItem {
  return {
    _key: nextKey(),
    medicationKey: '',
    sig: '',
    quantity: '1',
    refills: '0',
    daysSupply: 30,
    sortOrder,
  };
}

function medLabel(medKey: string): string {
  const config = MEDS[medKey];
  if (config) return `${config.name} – ${config.strength} (${config.formLabel ?? config.form})`;
  const product = LOGOS_PRODUCTS.find((p) => String(p.id) === medKey);
  if (product) return `${product.name} – ${product.strength} (${product.form})`;
  return medKey;
}

// ---------------------------------------------------------------------------
// Medication Combobox
// ---------------------------------------------------------------------------

function MedicationCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    return LOGOS_PRODUCTS.map((p) => ({
      key: String(p.id),
      label: medLabel(String(p.id)),
      searchText: `${p.name} ${p.strength} ${p.form}`.toLowerCase(),
    }));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.searchText.includes(q));
  }, [options, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = value ? medLabel(value) : '';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <span className={value ? 'truncate text-gray-900' : 'text-gray-400'}>
          {value ? selectedLabel : 'Select medication…'}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search medications…"
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">No medications found</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    opt.key === value
                      ? 'bg-indigo-50 font-medium text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Set Form Modal
// ---------------------------------------------------------------------------

function OrderSetFormModal({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial: { name: string; description: string; items: FormItem[] } | null;
  onSave: (data: { name: string; description: string; items: FormItem[] }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isEdit = initial !== null;
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [items, setItems] = useState<FormItem[]>(
    initial?.items && initial.items.length > 0
      ? initial.items.map((it, i) => ({ ...it, _key: it._key || nextKey(), sortOrder: i }))
      : [emptyFormItem(0)]
  );
  const [errors, setErrors] = useState<string[]>([]);

  const addItem = () => {
    setItems((prev) => [...prev, emptyFormItem(prev.length)]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it._key !== key);
      return next.length === 0
        ? [emptyFormItem(0)]
        : next.map((it, i) => ({ ...it, sortOrder: i }));
    });
  };

  const updateItem = (key: string, field: keyof OrderSetItem, value: string | number) => {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, [field]: value } : it)));
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    setItems((prev) => {
      const next = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next.map((it, i) => ({ ...it, sortOrder: i }));
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!name.trim()) errs.push('Order set name is required.');
    const validItems = items.filter((it) => it.medicationKey);
    if (validItems.length === 0) errs.push('At least one medication must be selected.');
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    onSave({ name: name.trim(), description: description.trim(), items: validItems });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Order Set' : 'Create Order Set'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 px-6 py-5">
            {/* Errors */}
            {errors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                {errors.map((err, i) => (
                  <p key={i} className="flex items-center gap-2 text-sm text-red-700">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Name & Description */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. GLP-1 Month 1"
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  maxLength={500}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Medications */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Medications <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Medication
                </button>
              </div>

              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={item._key}
                    className="rounded-xl border border-gray-200 bg-gray-50/50 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveItem(idx, 'up')}
                            disabled={idx === 0}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            title="Move up"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-xs font-medium text-gray-500">#{idx + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item._key)}
                        className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove medication"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <MedicationCombobox
                        value={item.medicationKey}
                        onChange={(key) => {
                          updateItem(item._key, 'medicationKey', key);
                          const config = MEDS[key];
                          if (config) {
                            if (config.defaultSig) updateItem(item._key, 'sig', config.defaultSig);
                            if (config.defaultQuantity)
                              updateItem(item._key, 'quantity', config.defaultQuantity);
                            if (config.defaultRefills)
                              updateItem(item._key, 'refills', config.defaultRefills);
                          }
                        }}
                      />

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">
                            Sig / Directions
                          </label>
                          <input
                            value={item.sig}
                            onChange={(e) => updateItem(item._key, 'sig', e.target.value)}
                            placeholder="Directions for use"
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">Quantity</label>
                          <input
                            value={item.quantity}
                            onChange={(e) => updateItem(item._key, 'quantity', e.target.value)}
                            placeholder="1"
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">Refills</label>
                          <input
                            value={item.refills}
                            onChange={(e) => updateItem(item._key, 'refills', e.target.value)}
                            placeholder="0"
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">Days Supply</label>
                          <input
                            type="number"
                            value={item.daysSupply}
                            onChange={(e) =>
                              updateItem(
                                item._key,
                                'daysSupply',
                                parseInt(e.target.value, 10) || 30
                              )
                            }
                            min={1}
                            max={365}
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      {/* Sig Templates quick-pick */}
                      {item.medicationKey && MEDS[item.medicationKey]?.sigTemplates && (
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">
                            Quick Sig Templates
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {MEDS[item.medicationKey].sigTemplates!.map((tmpl) => (
                              <button
                                key={tmpl.label}
                                type="button"
                                onClick={() => {
                                  updateItem(item._key, 'sig', tmpl.sig);
                                  updateItem(item._key, 'quantity', tmpl.quantity);
                                  updateItem(item._key, 'refills', tmpl.refills);
                                  if (tmpl.daysSupply)
                                    updateItem(item._key, 'daysSupply', tmpl.daysSupply);
                                }}
                                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                {tmpl.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Order Set'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  name,
  onConfirm,
  onClose,
  deleting,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h3 className="mb-1 text-lg font-semibold text-gray-900">Delete Order Set</h3>
        <p className="mb-6 text-sm text-gray-500">
          Are you sure you want to delete <span className="font-medium text-gray-700">{name}</span>?
          This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function OrderSetsPage() {
  const [orderSets, setOrderSets] = useState<OrderSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSet, setEditingSet] = useState<OrderSet | null>(null);
  const [deletingSet, setDeletingSet] = useState<OrderSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchOrderSets = useCallback(async () => {
    try {
      const res = await fetch('/api/clinic/order-sets');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrderSets(Array.isArray(data.orderSets) ? data.orderSets : []);
    } catch {
      setOrderSets([]);
      showToast('Failed to load order sets', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchOrderSets();
  }, [fetchOrderSets]);

  const handleCreate = () => {
    setEditingSet(null);
    setShowForm(true);
  };

  const handleEdit = (set: OrderSet) => {
    setEditingSet(set);
    setShowForm(true);
  };

  const handleSave = async (data: { name: string; description: string; items: FormItem[] }) => {
    setSaving(true);
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        items: data.items.map((it, i) => ({
          medicationKey: it.medicationKey,
          sig: it.sig || '',
          quantity: it.quantity || '1',
          refills: it.refills || '0',
          daysSupply: it.daysSupply || 30,
          sortOrder: i,
        })),
      };

      const isEdit = editingSet !== null;
      const url = isEdit ? `/api/clinic/order-sets/${editingSet.id}` : '/api/clinic/order-sets';

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || 'Failed to save');
      }

      showToast(isEdit ? 'Order set updated' : 'Order set created', 'success');
      setShowForm(false);
      setEditingSet(null);
      await fetchOrderSets();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save order set', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSet) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinic/order-sets/${deletingSet.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Order set deleted', 'success');
      setDeletingSet(null);
      await fetchOrderSets();
    } catch {
      showToast('Failed to delete order set', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gray-100" />
          <div className="h-4 w-48 rounded bg-gray-100" />
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prescription Order Sets</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create reusable prescription templates for quick ordering
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Order Set
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-6 top-6 z-[70] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      {orderSets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-500">No order sets yet</p>
          <button
            type="button"
            onClick={handleCreate}
            className="mt-3 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            Create your first order set
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orderSets.map((set) => (
            <div
              key={set.id}
              className="rounded-xl border border-gray-100 bg-white p-5 transition-colors hover:border-gray-200"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{set.name}</h3>
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Active
                    </span>
                  </div>
                  {set.description && (
                    <p className="mt-0.5 text-sm text-gray-500">{set.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {set.items.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
                      >
                        {medLabel(item.medicationKey)}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    {set.items.length} medication{set.items.length !== 1 ? 's' : ''} &middot;
                    Created {new Date(set.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(set)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingSet(set)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <OrderSetFormModal
          initial={
            editingSet
              ? {
                  name: editingSet.name,
                  description: editingSet.description || '',
                  items: editingSet.items.map((it) => ({
                    ...it,
                    _key: nextKey(),
                  })),
                }
              : null
          }
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingSet(null);
          }}
          saving={saving}
        />
      )}

      {/* Delete Confirm */}
      {deletingSet && (
        <DeleteConfirmModal
          name={deletingSet.name}
          onConfirm={handleDelete}
          onClose={() => setDeletingSet(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
