'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronLeft,
  DollarSign,
  Users,
  Package,
  Plus,
  Trash2,
  Loader2,
  Edit,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

interface Plan {
  id: number;
  name: string;
  description: string | null;
  planType: string;
  percentBps: number | null;
  flatAmountCents: number | null;
  assignmentCount: number;
}

interface Assignment {
  id: number;
  salesRepId: number;
  salesRep: { id: number; firstName: string; lastName: string; email: string };
  effectiveFrom: string;
  hourlyRateCents: number | null;
}

interface ProductRule {
  id: number;
  productId: number | null;
  product: { id: number; name: string } | null;
  productBundleId: number | null;
  productBundle: { id: number; name: string } | null;
  bonusType: string;
  percentBps: number | null;
  flatAmountCents: number | null;
}

interface SalesRep {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
}

interface Bundle {
  id: number;
  name: string;
}

const API_PLANS = '/api/admin/sales-rep/commission-plans';

export default function SalesRepCommissionPlanDetailPage() {
  const params = useParams();
  const planId = params?.id ? Number(params.id) : null;
  const [mounted, setMounted] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rules, setRules] = useState<ProductRule[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add rep
  const [addRepId, setAddRepId] = useState<number | ''>('');
  const [addHourlyCents, setAddHourlyCents] = useState<string>('');
  const [addingRep, setAddingRep] = useState(false);

  // Add product rule
  const [ruleProductId, setRuleProductId] = useState<number | ''>('');
  const [ruleBundleId, setRuleBundleId] = useState<number | ''>('');
  const [ruleType, setRuleType] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [rulePercentBps, setRulePercentBps] = useState<string>('5');
  const [ruleFlatCents, setRuleFlatCents] = useState<string>('');
  const [addingRule, setAddingRule] = useState(false);

  const fetchPlan = async () => {
    if (!planId) return;
    const res = await apiFetch(`${API_PLANS}/${planId}`);
    if (res.ok) {
      const data = await res.json();
      setPlan(data.plan || null);
    }
  };

  const fetchAssignments = async () => {
    if (!planId) return;
    const res = await apiFetch(`${API_PLANS}/${planId}/assignments`);
    if (res.ok) {
      const data = await res.json();
      setAssignments(data.assignments || []);
    }
  };

  const fetchRules = async () => {
    if (!planId) return;
    const res = await apiFetch(`${API_PLANS}/${planId}/product-rules`);
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules || []);
    }
  };

  const fetchSalesReps = async () => {
    const res = await apiFetch('/api/admin/sales-reps');
    if (res.ok) {
      const data = await res.json();
      setSalesReps(data.salesReps || []);
    }
  };

  const fetchProductsAndBundles = async () => {
    const [pRes, bRes] = await Promise.all([
      apiFetch('/api/products?activeOnly=true'),
      apiFetch('/api/bundles?activeOnly=true'),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setProducts(data.products || []);
    }
    if (bRes.ok) {
      const data = await bRes.json();
      setBundles(data.bundles || []);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !planId) return;
    setLoading(true);
    Promise.all([
      fetchPlan(),
      fetchAssignments(),
      fetchRules(),
      fetchSalesReps(),
      fetchProductsAndBundles(),
    ]).finally(() => setLoading(false));
  }, [mounted, planId]);

  const handleAddRep = async () => {
    if (!planId || addRepId === '') return;
    setAddingRep(true);
    setError(null);
    try {
      const hourly =
        addHourlyCents.trim() === ''
          ? undefined
          : Math.round(parseFloat(addHourlyCents) * 100);
      const res = await apiFetch(`${API_PLANS}/${planId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          salesRepId: Number(addRepId),
          hourlyRateCents: hourly,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add rep');
      setAddRepId('');
      setAddHourlyCents('');
      fetchAssignments();
      fetchPlan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add rep');
    } finally {
      setAddingRep(false);
    }
  };

  const handleUpdateHourly = async (assignmentId: number, hourlyRateCents: number | null) => {
    if (!planId) return;
    const res = await apiFetch(
      `${API_PLANS}/${planId}/assignments/${assignmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ hourlyRateCents }),
      }
    );
    if (res.ok) {
      fetchAssignments();
    }
  };

  const handleRemoveAssignment = async (assignmentId: number) => {
    if (!planId || !confirm('Remove this rep from the plan?')) return;
    const res = await apiFetch(
      `${API_PLANS}/${planId}/assignments/${assignmentId}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      fetchAssignments();
      fetchPlan();
    }
  };

  const handleAddRule = async () => {
    if (!planId) return;
    const productId = ruleProductId === '' ? undefined : Number(ruleProductId);
    const productBundleId = ruleBundleId === '' ? undefined : Number(ruleBundleId);
    if ((!productId && !productBundleId) || (productId && productBundleId)) {
      setError('Select either a product or a package, not both.');
      return;
    }
    if (ruleType === 'PERCENT') {
      const bps = Math.round(parseFloat(rulePercentBps || '0') * 100);
      if (bps < 0 || bps > 10000) {
        setError('Percentage must be 0–100.');
        return;
      }
    } else {
      const cents = Math.round(parseFloat(ruleFlatCents || '0') * 100);
      if (cents < 0) {
        setError('Amount must be >= 0.');
        return;
      }
    }
    setAddingRule(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        bonusType: ruleType,
        productId: productId ?? null,
        productBundleId: productBundleId ?? null,
      };
      if (ruleType === 'PERCENT') {
        body.percentBps = Math.round(parseFloat(rulePercentBps || '0') * 100);
        body.flatAmountCents = null;
      } else {
        body.flatAmountCents = Math.round(parseFloat(ruleFlatCents || '0') * 100);
        body.percentBps = null;
      }
      const res = await apiFetch(`${API_PLANS}/${planId}/product-rules`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add rule');
      setRuleProductId('');
      setRuleBundleId('');
      setRulePercentBps('5');
      setRuleFlatCents('');
      fetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add rule');
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (!planId || !confirm('Delete this product/package commission rule?')) return;
    const res = await apiFetch(
      `${API_PLANS}/${planId}/product-rules/${ruleId}`,
      { method: 'DELETE' }
    );
    if (res.ok) fetchRules();
  };

  if (!mounted || loading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!planId || !plan) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Plan not found.</p>
        <Link
          href="/admin/sales-rep/commission-plans"
          className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--brand-primary)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Commission Plans
        </Link>
      </div>
    );
  }

  const assignedRepIds = new Set(assignments.map((a) => a.salesRepId));
  const availableReps = salesReps.filter((r) => !assignedRepIds.has(r.id));

  return (
    <div className="p-6">
      <Link
        href="/admin/sales-rep/commission-plans"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Commission Plans
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
          {plan.description && (
            <p className="mt-1 text-gray-500">{plan.description}</p>
          )}
          <p className="mt-1 text-sm text-gray-400">
            Base: {plan.planType === 'PERCENT' && plan.percentBps != null
              ? formatPercent(plan.percentBps)
              : plan.flatAmountCents != null
                ? formatCurrency(plan.flatAmountCents)
                : 'N/A'}
          </p>
        </div>
        <Link
          href={`/admin/sales-rep/commission-plans?edit=${plan.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Edit className="h-4 w-4" />
          Edit Plan
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Assigned reps + hourly rate */}
      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Users className="h-5 w-5" />
          Assigned reps & hourly rate
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Rep</th>
                <th className="pb-2 font-medium">Hourly rate</th>
                <th className="w-20 pb-2" />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {a.salesRep.firstName} {a.salesRep.lastName}
                    <span className="ml-1 text-gray-400">({a.salesRep.email})</span>
                  </td>
                  <td className="py-2">
                    <HourlyRateInput
                      valueCents={a.hourlyRateCents}
                      onSave={(cents) => handleUpdateHourly(a.id, cents)}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveAssignment(a.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4">
          <div>
            <label className="block text-xs font-medium text-gray-500">Add rep</label>
            <select
              value={addRepId === '' ? '' : addRepId}
              onChange={(e) => setAddRepId(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select rep</option>
              {availableReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.firstName} {r.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Hourly rate ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Optional"
              value={addHourlyCents}
              onChange={(e) => setAddHourlyCents(e.target.value)}
              className="mt-1 w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={addRepId === '' || addingRep}
            onClick={handleAddRep}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90 disabled:opacity-50"
          >
            {addingRep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
      </section>

      {/* Product / package commissions */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Package className="h-5 w-5" />
          Product & package commissions
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Add an extra commission (% or $) when specific products or packages are sold by a rep on
          this plan.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium">Bonus</th>
                <th className="w-20 pb-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {r.product ? r.product.name : r.productBundle ? r.productBundle.name : '—'}
                  </td>
                  <td className="py-2">
                    {r.bonusType === 'PERCENT' && r.percentBps != null
                      ? formatPercent(r.percentBps)
                      : r.flatAmountCents != null
                        ? formatCurrency(r.flatAmountCents)
                        : '—'}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(r.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4">
          <div>
            <label className="block text-xs font-medium text-gray-500">Product</label>
            <select
              value={ruleProductId === '' ? '' : ruleProductId}
              onChange={(e) => {
                setRuleProductId(e.target.value === '' ? '' : Number(e.target.value));
                if (e.target.value !== '') setRuleBundleId('');
              }}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Package</label>
            <select
              value={ruleBundleId === '' ? '' : ruleBundleId}
              onChange={(e) => {
                setRuleBundleId(e.target.value === '' ? '' : Number(e.target.value));
                if (e.target.value !== '') setRuleProductId('');
              }}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {bundles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Type</label>
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as 'PERCENT' | 'FLAT')}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="PERCENT">Percentage</option>
              <option value="FLAT">Flat ($)</option>
            </select>
          </div>
          {ruleType === 'PERCENT' ? (
            <div>
              <label className="block text-xs font-medium text-gray-500">Extra %</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={rulePercentBps}
                onChange={(e) => setRulePercentBps(e.target.value)}
                className="mt-1 w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500">Extra $</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={ruleFlatCents}
                onChange={(e) => setRuleFlatCents(e.target.value)}
                className="mt-1 w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <button
            type="button"
            disabled={
              (ruleProductId === '' && ruleBundleId === '') ||
              addingRule ||
              (ruleType === 'PERCENT' ? !rulePercentBps : ruleFlatCents === '')
            }
            onClick={handleAddRule}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90 disabled:opacity-50"
          >
            {addingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add rule
          </button>
        </div>
      </section>
    </div>
  );
}

function HourlyRateInput({
  valueCents,
  onSave,
}: {
  valueCents: number | null;
  onSave: (cents: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(
    valueCents != null ? (valueCents / 100).toFixed(2) : ''
  );

  useEffect(() => {
    setInput(valueCents != null ? (valueCents / 100).toFixed(2) : '');
  }, [valueCents]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-gray-400">$</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => {
            const v = input.trim() === '' ? null : Math.round(parseFloat(input) * 100);
            if (v !== null && (isNaN(v) || v < 0)) return;
            onSave(v);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = input.trim() === '' ? null : Math.round(parseFloat(input) * 100);
              if (v !== null && (isNaN(v) || v < 0)) return;
              onSave(v);
              setEditing(false);
            }
          }}
          className="w-20 rounded border border-gray-300 px-1 py-0.5 text-sm"
          autoFocus
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left hover:underline"
    >
      {valueCents != null ? formatCurrency(valueCents) : 'Set rate'}
    </button>
  );
}
