'use client';

import { useState, useEffect } from 'react';

type TabType = 'discounts' | 'promotions' | 'bundles' | 'rules';

interface DiscountCode {
  id: number;
  code: string;
  name: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  currentUses: number;
  maxUses: number | null;
  expiresAt: string | null;
  affiliate?: { name: string };
  _count?: { usages: number };
}

interface Promotion {
  id: number;
  name: string;
  promotionType: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string | null;
  autoApply: boolean;
}

interface Bundle {
  id: number;
  name: string;
  regularPrice: number;
  bundlePrice: number;
  savingsPercent: number;
  isActive: boolean;
  items: Array<{ product: { name: string } }>;
}

const DISCOUNT_TYPES = [
  { value: 'PERCENTAGE', label: 'Percentage Off' },
  { value: 'FIXED_AMOUNT', label: 'Fixed Amount Off' },
  { value: 'FREE_SHIPPING', label: 'Free Shipping' },
  { value: 'FREE_TRIAL', label: 'Free Trial Extension' },
];

const PROMOTION_TYPES = [
  { value: 'SALE', label: 'Sale' },
  { value: 'FLASH_SALE', label: 'Flash Sale' },
  { value: 'SEASONAL', label: 'Seasonal' },
  { value: 'NEW_PATIENT', label: 'New Patient Special' },
  { value: 'LOYALTY', label: 'Loyalty Reward' },
  { value: 'BUNDLE', label: 'Bundle Deal' },
];

export default function PricingManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('discounts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Data
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  // Modals
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  
  // Discount form
  const [discountForm, setDiscountForm] = useState({
    code: '',
    name: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    maxUses: '',
    maxUsesPerPatient: '',
    expiresAt: '',
    minOrderAmount: '',
    firstTimeOnly: false,
    applyToRecurring: false,
    recurringDuration: '',
  });

  // Promotion form
  const [promotionForm, setPromotionForm] = useState({
    name: '',
    promotionType: 'SALE',
    discountType: 'PERCENTAGE',
    discountValue: '',
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: '',
    bannerText: '',
    autoApply: true,
  });

  // Bundle form
  const [bundleForm, setBundleForm] = useState({
    name: '',
    description: '',
    bundlePrice: '',
    selectedProducts: [] as number[],
  });

  useEffect(() => {
    loadData();
    loadProducts();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [discountsRes, promotionsRes, bundlesRes] = await Promise.all([
        fetch('/api/discounts', { headers }),
        fetch('/api/promotions', { headers }),
        fetch('/api/bundles', { headers }),
      ]);

      if (discountsRes.ok) {
        const data = await discountsRes.json();
        setDiscounts(data.discountCodes || []);
      }
      if (promotionsRes.ok) {
        const data = await promotionsRes.json();
        setPromotions(data.promotions || []);
      }
      if (bundlesRes.ok) {
        const data = await bundlesRes.json();
        setBundles(data.bundles || []);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/products?activeOnly=true', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to load products');
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };

  const formatDiscount = (type: string, value: number) => {
    if (type === 'PERCENTAGE') return `${value}%`;
    return formatCurrency(value);
  };

  // Create discount code
  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...discountForm,
          discountValue: parseFloat(discountForm.discountValue),
          maxUses: discountForm.maxUses ? parseInt(discountForm.maxUses) : null,
          maxUsesPerPatient: discountForm.maxUsesPerPatient ? parseInt(discountForm.maxUsesPerPatient) : null,
          minOrderAmount: discountForm.minOrderAmount ? Math.round(parseFloat(discountForm.minOrderAmount) * 100) : null,
          recurringDuration: discountForm.recurringDuration ? parseInt(discountForm.recurringDuration) : null,
          expiresAt: discountForm.expiresAt || null,
        }),
      });
      
      if (res.ok) {
        setSuccess('Discount code created!');
        setShowDiscountModal(false);
        loadData();
        setDiscountForm({
          code: '', name: '', discountType: 'PERCENTAGE', discountValue: '',
          maxUses: '', maxUsesPerPatient: '', expiresAt: '', minOrderAmount: '',
          firstTimeOnly: false, applyToRecurring: false, recurringDuration: '',
        });
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create discount');
      }
    } catch (err) {
      setError('Failed to create discount');
    }
  };

  // Create promotion
  const handleCreatePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...promotionForm,
          discountValue: parseFloat(promotionForm.discountValue),
          endsAt: promotionForm.endsAt || null,
        }),
      });
      
      if (res.ok) {
        setSuccess('Promotion created!');
        setShowPromotionModal(false);
        loadData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create promotion');
      }
    } catch (err) {
      setError('Failed to create promotion');
    }
  };

  // Create bundle
  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: bundleForm.name,
          description: bundleForm.description,
          bundlePrice: Math.round(parseFloat(bundleForm.bundlePrice) * 100),
          items: bundleForm.selectedProducts.map(id => ({ productId: id, quantity: 1 })),
        }),
      });
      
      if (res.ok) {
        setSuccess('Bundle created!');
        setShowBundleModal(false);
        loadData();
        setBundleForm({ name: '', description: '', bundlePrice: '', selectedProducts: [] });
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create bundle');
      }
    } catch (err) {
      setError('Failed to create bundle');
    }
  };

  const tabs = [
    { id: 'discounts', label: 'Discount Codes', count: discounts.length },
    { id: 'promotions', label: 'Promotions', count: promotions.length },
    { id: 'bundles', label: 'Bundles', count: bundles.length },
    { id: 'rules', label: 'Pricing Rules', count: 0 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4fa77e]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Pricing & Promotions</h1>
        <p className="text-gray-600">Manage discount codes, promotions, bundles, and pricing rules</p>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError('')} className="ml-4 text-red-500">Dismiss</button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
            <button onClick={() => setSuccess('')} className="ml-4 text-green-500">Dismiss</button>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border mb-6">
          <div className="border-b">
            <nav className="flex">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-[#4fa77e] text-[#4fa77e]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                    {tab.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Discount Codes Tab */}
            {activeTab === 'discounts' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Discount Codes</h2>
                  <button
                    onClick={() => setShowDiscountModal(true)}
                    className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c66]"
                  >
                    + Create Code
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-medium">Code</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">Discount</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">Usage</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">Expires</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
                        <th className="text-right px-4 py-3 text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-500">No discount codes yet</td></tr>
                      ) : discounts.map(dc => (
                        <tr key={dc.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-mono font-bold text-[#4fa77e]">{dc.code}</div>
                            <div className="text-sm text-gray-500">{dc.name}</div>
                          </td>
                          <td className="px-4 py-3">{formatDiscount(dc.discountType, dc.discountValue)}</td>
                          <td className="px-4 py-3">
                            {dc.currentUses} / {dc.maxUses || '∞'}
                          </td>
                          <td className="px-4 py-3">
                            {dc.expiresAt ? new Date(dc.expiresAt).toLocaleDateString() : 'Never'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-sm ${
                              dc.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {dc.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                            <button className="text-red-600 hover:text-red-800">Disable</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Promotions Tab */}
            {activeTab === 'promotions' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Promotions & Specials</h2>
                  <button
                    onClick={() => setShowPromotionModal(true)}
                    className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c66]"
                  >
                    + Create Promotion
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {promotions.length === 0 ? (
                    <div className="col-span-3 text-center py-8 text-gray-500">No promotions yet</div>
                  ) : promotions.map(promo => (
                    <div key={promo.id} className="bg-white border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-1 text-xs rounded ${
                          promo.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {promo.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
                          {promo.promotionType.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg">{promo.name}</h3>
                      <div className="text-2xl font-bold text-[#4fa77e] my-2">
                        {formatDiscount(promo.discountType, promo.discountValue)} OFF
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(promo.startsAt).toLocaleDateString()} - 
                        {promo.endsAt ? new Date(promo.endsAt).toLocaleDateString() : ' Ongoing'}
                      </div>
                      {promo.autoApply && (
                        <div className="mt-2 text-xs text-blue-600">Auto-applies at checkout</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bundles Tab */}
            {activeTab === 'bundles' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Product Bundles</h2>
                  <button
                    onClick={() => setShowBundleModal(true)}
                    className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c66]"
                  >
                    + Create Bundle
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bundles.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-gray-500">No bundles yet</div>
                  ) : bundles.map(bundle => (
                    <div key={bundle.id} className="bg-white border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg">{bundle.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded ${
                          bundle.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {bundle.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 my-2">
                        <span className="text-2xl font-bold text-[#4fa77e]">
                          {formatCurrency(bundle.bundlePrice)}
                        </span>
                        <span className="text-gray-400 line-through">
                          {formatCurrency(bundle.regularPrice)}
                        </span>
                        <span className="text-sm text-green-600 font-medium">
                          Save {bundle.savingsPercent.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        Includes: {bundle.items.map(i => i.product.name).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing Rules Tab */}
            {activeTab === 'rules' && (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-medium">Dynamic Pricing Rules</h3>
                <p className="mt-2">Create rules for volume discounts, loyalty pricing, and more.</p>
                <button className="mt-4 px-4 py-2 bg-[#4fa77e] text-white rounded-lg">
                  + Create Rule
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discount Code Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Create Discount Code</h2>
            </div>
            <form onSubmit={handleCreateDiscount} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Code *</label>
                  <input
                    type="text"
                    value={discountForm.code}
                    onChange={e => setDiscountForm({...discountForm, code: e.target.value.toUpperCase()})}
                    className="w-full border rounded-lg px-3 py-2 font-mono"
                    placeholder="WELCOME20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={discountForm.name}
                    onChange={e => setDiscountForm({...discountForm, name: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Welcome Discount"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Discount Type</label>
                  <select
                    value={discountForm.discountType}
                    onChange={e => setDiscountForm({...discountForm, discountType: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {DISCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {discountForm.discountType === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount ($)'}
                  </label>
                  <input
                    type="number"
                    step={discountForm.discountType === 'PERCENTAGE' ? '1' : '0.01'}
                    min="0"
                    max={discountForm.discountType === 'PERCENTAGE' ? '100' : undefined}
                    value={discountForm.discountValue}
                    onChange={e => setDiscountForm({...discountForm, discountValue: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max Total Uses</label>
                  <input
                    type="number"
                    min="1"
                    value={discountForm.maxUses}
                    onChange={e => setDiscountForm({...discountForm, maxUses: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Per Patient</label>
                  <input
                    type="number"
                    min="1"
                    value={discountForm.maxUsesPerPatient}
                    onChange={e => setDiscountForm({...discountForm, maxUsesPerPatient: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Expires At</label>
                <input
                  type="datetime-local"
                  value={discountForm.expiresAt}
                  onChange={e => setDiscountForm({...discountForm, expiresAt: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Minimum Order ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountForm.minOrderAmount}
                  onChange={e => setDiscountForm({...discountForm, minOrderAmount: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="No minimum"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={discountForm.firstTimeOnly}
                    onChange={e => setDiscountForm({...discountForm, firstTimeOnly: e.target.checked})}
                  />
                  <span>First-time customers only</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={discountForm.applyToRecurring}
                    onChange={e => setDiscountForm({...discountForm, applyToRecurring: e.target.checked})}
                  />
                  <span>Apply to recurring payments</span>
                </label>
              </div>

              {discountForm.applyToRecurring && (
                <div>
                  <label className="block text-sm font-medium mb-1">Apply for how many billing cycles?</label>
                  <input
                    type="number"
                    min="1"
                    value={discountForm.recurringDuration}
                    onChange={e => setDiscountForm({...discountForm, recurringDuration: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Forever"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowDiscountModal(false)} className="px-4 py-2 text-gray-600">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c66]">
                  Create Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promotion Modal */}
      {showPromotionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Create Promotion</h2>
            </div>
            <form onSubmit={handleCreatePromotion} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Promotion Name *</label>
                <input
                  type="text"
                  value={promotionForm.name}
                  onChange={e => setPromotionForm({...promotionForm, name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Summer Sale 2026"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={promotionForm.promotionType}
                    onChange={e => setPromotionForm({...promotionForm, promotionType: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {PROMOTION_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Discount</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={promotionForm.discountValue}
                      onChange={e => setPromotionForm({...promotionForm, discountValue: e.target.value})}
                      className="flex-1 border rounded-lg px-3 py-2"
                      required
                    />
                    <select
                      value={promotionForm.discountType}
                      onChange={e => setPromotionForm({...promotionForm, discountType: e.target.value})}
                      className="border rounded-lg px-2"
                    >
                      <option value="PERCENTAGE">%</option>
                      <option value="FIXED_AMOUNT">$</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Starts At *</label>
                  <input
                    type="datetime-local"
                    value={promotionForm.startsAt}
                    onChange={e => setPromotionForm({...promotionForm, startsAt: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ends At</label>
                  <input
                    type="datetime-local"
                    value={promotionForm.endsAt}
                    onChange={e => setPromotionForm({...promotionForm, endsAt: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Banner Text (optional)</label>
                <input
                  type="text"
                  value={promotionForm.bannerText}
                  onChange={e => setPromotionForm({...promotionForm, bannerText: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Save 20% - Limited Time Only!"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={promotionForm.autoApply}
                  onChange={e => setPromotionForm({...promotionForm, autoApply: e.target.checked})}
                />
                <span>Auto-apply at checkout</span>
              </label>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowPromotionModal(false)} className="px-4 py-2 text-gray-600">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c66]">
                  Create Promotion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bundle Modal */}
      {showBundleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Create Bundle</h2>
            </div>
            <form onSubmit={handleCreateBundle} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Bundle Name *</label>
                <input
                  type="text"
                  value={bundleForm.name}
                  onChange={e => setBundleForm({...bundleForm, name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="3-Month Weight Loss Program"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={bundleForm.description}
                  onChange={e => setBundleForm({...bundleForm, description: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Select Products *</label>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {products.map(product => (
                    <label key={product.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 border-b last:border-b-0">
                      <input
                        type="checkbox"
                        checked={bundleForm.selectedProducts.includes(product.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setBundleForm({...bundleForm, selectedProducts: [...bundleForm.selectedProducts, product.id]});
                          } else {
                            setBundleForm({...bundleForm, selectedProducts: bundleForm.selectedProducts.filter(id => id !== product.id)});
                          }
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-gray-500">{formatCurrency(product.price)}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Regular total: {formatCurrency(
                    bundleForm.selectedProducts.reduce((sum, id) => {
                      const p = products.find(pr => pr.id === id);
                      return sum + (p?.price || 0);
                    }, 0)
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Bundle Price ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bundleForm.bundlePrice}
                  onChange={e => setBundleForm({...bundleForm, bundlePrice: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowBundleModal(false)} className="px-4 py-2 text-gray-600">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c66]"
                  disabled={bundleForm.selectedProducts.length < 2}
                >
                  Create Bundle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
