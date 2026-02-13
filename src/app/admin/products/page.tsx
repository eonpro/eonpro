'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Product {
  id: number;
  name: string;
  description: string | null;
  shortDescription: string | null;
  category: string;
  price: number;
  currency: string;
  billingType: string;
  billingInterval: string | null;
  billingIntervalCount: number;
  trialDays: number | null;
  isActive: boolean;
  isVisible: boolean;
  displayOrder: number;
  stripeProductId: string | null;
  stripePriceId: string | null;
  clinic?: { id: number; name: string };
}

const CATEGORIES = [
  { value: 'SERVICE', label: 'Service' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
  { value: 'LAB_TEST', label: 'Lab Test' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'PACKAGE', label: 'Package' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'OTHER', label: 'Other' },
];

const BILLING_INTERVALS = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly (3 months)' },
  { value: 'SEMI_ANNUAL', label: 'Semi-Annual (6 months)' },
  { value: 'ANNUAL', label: 'Annual' },
];

export default function ProductCatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBillingType, setFilterBillingType] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    shortDescription: '',
    category: 'SERVICE',
    price: '',
    billingType: 'ONE_TIME',
    billingInterval: 'MONTHLY',
    trialDays: '',
    isActive: true,
    isVisible: true,
  });

  useEffect(() => {
    loadProducts();
  }, [filterCategory, filterBillingType]);

  const loadProducts = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filterCategory) params.append('category', filterCategory);
      if (filterBillingType) params.append('billingType', filterBillingType);

      const res = await fetch(`/api/products?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const body = {
        name: form.name,
        description: form.description || null,
        shortDescription: form.shortDescription || null,
        category: form.category,
        price: Math.round(parseFloat(form.price) * 100), // Convert to cents
        billingType: form.billingType,
        billingInterval: form.billingType === 'RECURRING' ? form.billingInterval : null,
        trialDays: form.trialDays ? parseInt(form.trialDays) : null,
        isActive: form.isActive,
        isVisible: form.isVisible,
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSuccess(
          editingProduct ? 'Product updated successfully' : 'Product created successfully'
        );
        setShowModal(false);
        resetForm();
        loadProducts();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save product');
      }
    } catch (err) {
      setError('Failed to save product');
    }
  };

  const handleDelete = async (productId: number) => {
    if (!confirm('Are you sure you want to archive this product?')) return;

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSuccess('Product archived');
        loadProducts();
      } else {
        setError('Failed to archive product');
      }
    } catch (err) {
      setError('Failed to archive product');
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      shortDescription: product.shortDescription || '',
      category: product.category,
      price: (product.price / 100).toFixed(2),
      billingType: product.billingType,
      billingInterval: product.billingInterval || 'MONTHLY',
      trialDays: product.trialDays?.toString() || '',
      isActive: product.isActive,
      isVisible: product.isVisible,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingProduct(null);
    setForm({
      name: '',
      description: '',
      shortDescription: '',
      category: 'SERVICE',
      price: '',
      billingType: 'ONE_TIME',
      billingInterval: 'MONTHLY',
      trialDays: '',
      isActive: true,
      isVisible: true,
    });
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getBillingLabel = (product: Product) => {
    if (product.billingType === 'ONE_TIME') return 'One-time';
    const interval = BILLING_INTERVALS.find((i) => i.value === product.billingInterval);
    return interval?.label || product.billingInterval;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#4fa77e]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
            <p className="text-gray-600">Manage your services, packages, and subscription plans</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition hover:bg-[#3d8c66]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Product
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            {success}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4 rounded-lg border bg-white p-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Billing Type</label>
            <select
              value={filterBillingType}
              onChange={(e) => setFilterBillingType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">All Types</option>
              <option value="ONE_TIME">One-time</option>
              <option value="RECURRING">Recurring</option>
            </select>
          </div>
        </div>

        {/* Products Table */}
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Product</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Category</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Price</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Billing</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Stripe</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No products found. Click "Add Product" to create one.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      {product.shortDescription && (
                        <div className="text-sm text-gray-500">{product.shortDescription}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-1 text-sm text-gray-700">
                        {CATEGORIES.find((c) => c.value === product.category)?.label ||
                          product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatPrice(product.price)}
                      {product.billingType === 'RECURRING' && (
                        <span className="text-sm text-gray-500">
                          /{product.billingInterval?.toLowerCase().replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 text-sm ${
                          product.billingType === 'RECURRING'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {getBillingLabel(product)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 text-sm ${
                          product.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {product.stripeProductId ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Synced
                        </span>
                      ) : (
                        <span className="text-gray-400">Not synced</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditModal(product)}
                        className="mr-3 text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white">
            <div className="border-b p-6">
              <h2 className="text-xl font-bold">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="e.g., Semaglutide 0-1.25mg Monthly"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Price (USD) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="w-full rounded-lg border py-2 pl-7 pr-3"
                      placeholder="229.00"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Billing Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="billingType"
                      value="ONE_TIME"
                      checked={form.billingType === 'ONE_TIME'}
                      onChange={(e) => setForm({ ...form, billingType: e.target.value })}
                    />
                    <span>One-time Payment</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="billingType"
                      value="RECURRING"
                      checked={form.billingType === 'RECURRING'}
                      onChange={(e) => setForm({ ...form, billingType: e.target.value })}
                    />
                    <span>Recurring Subscription</span>
                  </label>
                </div>
              </div>

              {form.billingType === 'RECURRING' && (
                <div className="grid grid-cols-2 gap-4 rounded-lg bg-purple-50 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Billing Interval
                    </label>
                    <select
                      value={form.billingInterval}
                      onChange={(e) => setForm({ ...form, billingInterval: e.target.value })}
                      className="w-full rounded-lg border px-3 py-2"
                    >
                      {BILLING_INTERVALS.map((interval) => (
                        <option key={interval.value} value={interval.value}>
                          {interval.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Trial Days (optional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.trialDays}
                      onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                      className="w-full rounded-lg border px-3 py-2"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Short Description (for invoices)
                </label>
                <input
                  type="text"
                  value={form.shortDescription}
                  onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="e.g., Monthly subscription - Semaglutide"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Full Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                  rows={3}
                  placeholder="Detailed description of the product or service..."
                />
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isVisible}
                    onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
                  />
                  <span>Visible to patients</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition hover:bg-[#3d8c66]"
                >
                  {editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
