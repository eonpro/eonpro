'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Receipt,
  Building2,
  DollarSign,
  Settings,
  FileText,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

/** Custom fee rule for complicated per-clinic logic (evaluated in priority order) */
export interface CustomFeeRuleCondition {
  field: string;
  operator: string;
  value: string | number | (string | number)[];
}
export interface CustomFeeRuleCharge {
  type: 'FLAT' | 'PERCENTAGE';
  amountCents?: number;
  basisPoints?: number;
  minCents?: number;
  maxCents?: number;
}
export interface CustomFeeRuleForm {
  id: string;
  name?: string;
  priority: number;
  appliesTo?: 'PRESCRIPTION' | 'TRANSMISSION' | 'BOTH';
  conditions: CustomFeeRuleCondition[];
  action: 'WAIVE' | 'CHARGE';
  charge?: CustomFeeRuleCharge;
}

interface ClinicFeeConfig {
  id: number;
  clinicId: number;
  prescriptionFeeType: 'FLAT' | 'PERCENTAGE';
  prescriptionFeeAmount: number;
  transmissionFeeType: 'FLAT' | 'PERCENTAGE';
  transmissionFeeAmount: number;
  adminFeeType: 'NONE' | 'FLAT_WEEKLY' | 'PERCENTAGE_WEEKLY';
  adminFeeAmount: number;
  prescriptionCycleDays: number;
  isActive: boolean;
  customFeeRules?: CustomFeeRuleForm[] | null;
}

interface ClinicWithConfig {
  clinic: {
    id: number;
    name: string;
    status: string;
    adminEmail: string;
  };
  config: ClinicFeeConfig | null;
  hasConfig: boolean;
  pendingAmountCents?: number;
  pendingCount?: number;
}

interface Summary {
  totalClinics: number;
  configuredClinics: number;
  pendingFees: number;
  invoicedFees: number;
  paidFees: number;
}

export default function ClinicBillingPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicWithConfig[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<ClinicWithConfig | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<{
    prescriptionFeeType: 'FLAT' | 'PERCENTAGE';
    prescriptionFeeAmount: number;
    transmissionFeeType: 'FLAT' | 'PERCENTAGE';
    transmissionFeeAmount: number;
    adminFeeType: 'NONE' | 'FLAT_WEEKLY' | 'PERCENTAGE_WEEKLY';
    adminFeeAmount: number;
    prescriptionCycleDays: number;
    isActive: boolean;
    customFeeRules: CustomFeeRuleForm[];
  }>({
    prescriptionFeeType: 'FLAT',
    prescriptionFeeAmount: 2000,
    transmissionFeeType: 'FLAT',
    transmissionFeeAmount: 500,
    adminFeeType: 'NONE',
    adminFeeAmount: 0,
    prescriptionCycleDays: 90,
    isActive: true,
    customFeeRules: [],
  });
  const [customRulesExpanded, setCustomRulesExpanded] = useState(false);

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await apiFetch('/api/super-admin/clinic-fees');

      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics ?? []);
        setSummary(data.summary ?? null);
      } else {
        const err = await response.json().catch(() => ({}));
        console.error('Clinic fees error', response.status, err);
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const openConfigModal = async (clinic: ClinicWithConfig) => {
    setSelectedClinic(clinic);

    if (clinic.config) {
      setFormData({
        prescriptionFeeType: clinic.config.prescriptionFeeType,
        prescriptionFeeAmount: clinic.config.prescriptionFeeAmount,
        transmissionFeeType: clinic.config.transmissionFeeType,
        transmissionFeeAmount: clinic.config.transmissionFeeAmount,
        adminFeeType: clinic.config.adminFeeType,
        adminFeeAmount: clinic.config.adminFeeAmount,
        prescriptionCycleDays: clinic.config.prescriptionCycleDays,
        isActive: clinic.config.isActive,
        customFeeRules: Array.isArray(clinic.config.customFeeRules)
          ? clinic.config.customFeeRules
          : [],
      });
    } else {
      setFormData({
        prescriptionFeeType: 'FLAT',
        prescriptionFeeAmount: 2000,
        transmissionFeeType: 'FLAT',
        transmissionFeeAmount: 500,
        adminFeeType: 'NONE',
        adminFeeAmount: 0,
        prescriptionCycleDays: 90,
        isActive: true,
        customFeeRules: [],
      });
    }

    setConfigModalOpen(true);
  };

  const saveConfig = async () => {
    if (!selectedClinic) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await apiFetch(`/api/super-admin/clinic-fees/${selectedClinic.clinic.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prescriptionFeeType: formData.prescriptionFeeType,
          prescriptionFeeAmount: formData.prescriptionFeeAmount,
          transmissionFeeType: formData.transmissionFeeType,
          transmissionFeeAmount: formData.transmissionFeeAmount,
          adminFeeType: formData.adminFeeType,
          adminFeeAmount: formData.adminFeeAmount,
          prescriptionCycleDays: formData.prescriptionCycleDays,
          isActive: formData.isActive,
          customFeeRules: formData.customFeeRules.length
            ? formData.customFeeRules.map((r) => ({
                ...r,
                conditions: r.conditions.map((c) => ({
                  ...c,
                  value:
                    (c.operator === 'in' || c.operator === 'notIn') && typeof c.value === 'string'
                      ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
                      : c.value,
                })),
              }))
            : null,
        }),
      });

      if (response.ok) {
        setConfigModalOpen(false);
        fetchClinics();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatFee = (type: string, amount: number) => {
    if (type === 'PERCENTAGE') {
      return `${(amount / 100).toFixed(1)}%`;
    }
    return formatCurrency(amount);
  };

  const filteredClinics = clinics.filter(
    (c) =>
      normalizedIncludes(c.clinic.name, searchTerm) ||
      normalizedIncludes(c.clinic.adminEmail, searchTerm)
  );

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Billing</h1>
          <p className="mt-1 text-gray-500">Configure platform fees and manage clinic invoices</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/super-admin/clinic-billing/reports')}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <FileText className="h-5 w-5" />
            Billing Reports
          </button>
          <button
            onClick={() => router.push('/super-admin/clinic-billing/invoices')}
            className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-white shadow-sm transition-colors hover:bg-[#3d9268]"
          >
            <FileText className="h-5 w-5" />
            View Invoices
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#4fa77e]/10 p-2">
                <Building2 className="h-5 w-5 text-[#4fa77e]" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Configured Clinics</p>
                <p className="text-xl font-bold text-gray-900">
                  {summary.configuredClinics} / {summary.totalClinics}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-yellow-100 p-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Fees</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(summary.pendingFees)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-2">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Invoiced</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(summary.invoicedFees)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-100 p-2">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Paid</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(summary.paidFees)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="relative">
          <input
            type="text"
            placeholder="Search clinics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-4 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>
      </div>

      {/* Clinics List */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Prescription Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Transmission Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Admin Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Cycle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClinics.map((item) => (
                <tr key={item.clinic.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{item.clinic.name}</p>
                      <p className="text-sm text-gray-500">{item.clinic.adminEmail}</p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {item.config
                      ? formatFee(
                          item.config.prescriptionFeeType,
                          item.config.prescriptionFeeAmount
                        )
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {item.config
                      ? formatFee(
                          item.config.transmissionFeeType,
                          item.config.transmissionFeeAmount
                        )
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {item.config && item.config.adminFeeType !== 'NONE'
                      ? `${formatFee(
                          item.config.adminFeeType === 'PERCENTAGE_WEEKLY' ? 'PERCENTAGE' : 'FLAT',
                          item.config.adminFeeAmount
                        )}/week`
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {item.config ? `${item.config.prescriptionCycleDays} days` : '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {(item.pendingAmountCents ?? 0) > 0 ? (
                      <span className="font-medium text-[#4fa77e]">
                        {formatCurrency(item.pendingAmountCents ?? 0)}
                        <span className="ml-1 text-gray-500">
                          ({item.pendingCount ?? 0} fees)
                        </span>
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {item.config ? (
                      item.config.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <Check className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                          <X className="h-3 w-3" />
                          Inactive
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                        Not Configured
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(item.pendingAmountCents ?? 0) > 0 && item.config?.isActive && (
                        <button
                          onClick={() =>
                            router.push(
                              `/super-admin/clinic-billing/invoices?create=1&clinicId=${item.clinic.id}`
                            )
                          }
                          className="rounded-lg bg-[#4fa77e] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#3d9268]"
                        >
                          Create invoice
                        </button>
                      )}
                      <button
                        onClick={() => openConfigModal(item)}
                        className="rounded-lg p-2 text-[#4fa77e] transition-colors hover:bg-[#4fa77e]/10 hover:text-[#3d9268]"
                        title="Configure fees"
                      >
                        <Settings className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Configuration Modal */}
      {configModalOpen && selectedClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900">
                Configure Fees - {selectedClinic.clinic.name}
              </h2>
            </div>

            <div className="space-y-6 p-6">
              {/* Prescription Fee */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Medical Prescription Fee (EONPRO Provider)
                </label>
                <div className="flex gap-3">
                  <select
                    value={formData.prescriptionFeeType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        prescriptionFeeType: e.target.value as 'FLAT' | 'PERCENTAGE',
                      })
                    }
                    className="rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  >
                    <option value="FLAT">Flat Fee</option>
                    <option value="PERCENTAGE">Percentage</option>
                  </select>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.prescriptionFeeType === 'FLAT' ? '$' : ''}
                    </span>
                    <input
                      type="number"
                      value={
                        formData.prescriptionFeeType === 'FLAT'
                          ? formData.prescriptionFeeAmount / 100
                          : formData.prescriptionFeeAmount / 100
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          prescriptionFeeAmount: Math.round(parseFloat(e.target.value) * 100),
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-10 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.prescriptionFeeType === 'PERCENTAGE' ? '%' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transmission Fee */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Transmission Fee (Clinic Provider)
                </label>
                <div className="flex gap-3">
                  <select
                    value={formData.transmissionFeeType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        transmissionFeeType: e.target.value as 'FLAT' | 'PERCENTAGE',
                      })
                    }
                    className="rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  >
                    <option value="FLAT">Flat Fee</option>
                    <option value="PERCENTAGE">Percentage</option>
                  </select>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.transmissionFeeType === 'FLAT' ? '$' : ''}
                    </span>
                    <input
                      type="number"
                      value={
                        formData.transmissionFeeType === 'FLAT'
                          ? formData.transmissionFeeAmount / 100
                          : formData.transmissionFeeAmount / 100
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          transmissionFeeAmount: Math.round(parseFloat(e.target.value) * 100),
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-10 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.transmissionFeeType === 'PERCENTAGE' ? '%' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin Fee */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Weekly Admin Fee
                </label>
                <div className="flex gap-3">
                  <select
                    value={formData.adminFeeType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        adminFeeType: e.target.value as
                          | 'NONE'
                          | 'FLAT_WEEKLY'
                          | 'PERCENTAGE_WEEKLY',
                      })
                    }
                    className="rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  >
                    <option value="NONE">None</option>
                    <option value="FLAT_WEEKLY">Flat Fee</option>
                    <option value="PERCENTAGE_WEEKLY">% of Weekly Sales</option>
                  </select>
                  {formData.adminFeeType !== 'NONE' && (
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                        {formData.adminFeeType === 'FLAT_WEEKLY' ? '$' : ''}
                      </span>
                      <input
                        type="number"
                        value={formData.adminFeeAmount / 100}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            adminFeeAmount: Math.round(parseFloat(e.target.value) * 100),
                          })
                        }
                        className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-10 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                        {formData.adminFeeType === 'PERCENTAGE_WEEKLY' ? '%' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Prescription Cycle */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Prescription Cycle (Days)
                </label>
                <p className="mb-2 text-xs text-gray-500">
                  No fee charged for same patient + medication until this many days pass
                </p>
                <input
                  type="number"
                  value={formData.prescriptionCycleDays}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      prescriptionCycleDays: parseInt(e.target.value) || 90,
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                />
              </div>

              {/* Custom rules: complicated per-clinic logic */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <button
                  type="button"
                  onClick={() => setCustomRulesExpanded(!customRulesExpanded)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm font-medium text-gray-700">
                    Custom fee rules (optional)
                  </span>
                  {customRulesExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  Priority-ordered rules: first match wins. Use for waiving by medication, tiered
                  fees, min/max caps, etc. Leave empty to use only the standard fees above.
                </p>
                {customRulesExpanded && (
                  <div className="mt-4 space-y-4">
                    {formData.customFeeRules.map((rule, idx) => (
                      <div
                        key={rule.id}
                        className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">
                            Rule {idx + 1} (priority {rule.priority})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                customFeeRules: formData.customFeeRules.filter((r) => r.id !== rule.id),
                              })
                            }
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            title="Remove rule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <label className="block text-xs text-gray-500">Name (optional)</label>
                            <input
                              type="text"
                              value={rule.name ?? ''}
                              onChange={(e) => {
                                const next = [...formData.customFeeRules];
                                next[idx] = { ...rule, name: e.target.value || undefined };
                                setFormData({ ...formData, customFeeRules: next });
                              }}
                              placeholder="e.g. GLP-1 waiver"
                              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500">Priority (lower first)</label>
                            <input
                              type="number"
                              min={0}
                              value={rule.priority}
                              onChange={(e) => {
                                const next = [...formData.customFeeRules];
                                next[idx] = { ...rule, priority: parseInt(e.target.value, 10) || 0 };
                                setFormData({ ...formData, customFeeRules: next });
                              }}
                              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500">Applies to</label>
                            <select
                              value={rule.appliesTo ?? 'BOTH'}
                              onChange={(e) => {
                                const next = [...formData.customFeeRules];
                                next[idx] = {
                                  ...rule,
                                  appliesTo: e.target.value as 'PRESCRIPTION' | 'TRANSMISSION' | 'BOTH',
                                };
                                setFormData({ ...formData, customFeeRules: next });
                              }}
                              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs"
                            >
                              <option value="BOTH">Prescription &amp; Transmission</option>
                              <option value="PRESCRIPTION">Prescription only</option>
                              <option value="TRANSMISSION">Transmission only</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500">Then</label>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <select
                                value={rule.action}
                                onChange={(e) => {
                                  const next = [...formData.customFeeRules];
                                  const action = e.target.value as 'WAIVE' | 'CHARGE';
                                  next[idx] = {
                                    ...rule,
                                    action,
                                    charge:
                                      action === 'CHARGE'
                                        ? { type: 'FLAT', amountCents: rule.charge?.amountCents ?? 0 }
                                        : undefined,
                                  };
                                  setFormData({ ...formData, customFeeRules: next });
                                }}
                                className="rounded border border-gray-200 px-2 py-1 text-xs"
                              >
                                <option value="WAIVE">Waive fee</option>
                                <option value="CHARGE">Charge</option>
                              </select>
                              {rule.action === 'CHARGE' && (
                                <>
                                  <select
                                    value={rule.charge?.type ?? 'FLAT'}
                                    onChange={(e) => {
                                      const next = [...formData.customFeeRules];
                                      const type = e.target.value as 'FLAT' | 'PERCENTAGE';
                                      next[idx] = {
                                        ...rule,
                                        charge: {
                                          ...rule.charge,
                                          type,
                                          amountCents: rule.charge?.amountCents ?? 0,
                                          basisPoints: rule.charge?.basisPoints ?? 0,
                                        },
                                      };
                                      setFormData({ ...formData, customFeeRules: next });
                                    }}
                                    className="rounded border border-gray-200 px-2 py-1 text-xs"
                                  >
                                    <option value="FLAT">Flat $</option>
                                    <option value="PERCENTAGE">% of order</option>
                                  </select>
                                  {rule.charge?.type === 'FLAT' ? (
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={((rule.charge?.amountCents ?? 0) / 100).toFixed(2)}
                                      onChange={(e) => {
                                        const next = [...formData.customFeeRules];
                                        next[idx] = {
                                          ...rule,
                                          charge: {
                                            ...rule.charge,
                                            type: 'FLAT',
                                            amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                                          },
                                        };
                                        setFormData({ ...formData, customFeeRules: next });
                                      }}
                                      className="w-20 rounded border border-gray-200 px-2 py-1 text-xs"
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.1}
                                      value={((rule.charge?.basisPoints ?? 0) / 100).toFixed(1)}
                                      onChange={(e) => {
                                        const next = [...formData.customFeeRules];
                                        next[idx] = {
                                          ...rule,
                                          charge: {
                                            ...rule.charge,
                                            type: 'PERCENTAGE',
                                            basisPoints: Math.round(parseFloat(e.target.value || '0') * 100),
                                          },
                                        };
                                        setFormData({ ...formData, customFeeRules: next });
                                      }}
                                      className="w-16 rounded border border-gray-200 px-2 py-1 text-xs"
                                    />
                                  )}
                                  <span className="text-xs text-gray-500">
                                    Min $ <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={((rule.charge?.minCents ?? 0) / 100).toFixed(2)}
                                      onChange={(e) => {
                                        const next = [...formData.customFeeRules];
                                        next[idx] = {
                                          ...rule,
                                          charge: {
                                            type: rule.charge?.type ?? 'FLAT',
                                            ...rule.charge,
                                            minCents: Math.round(parseFloat(e.target.value || '0') * 100),
                                          },
                                        };
                                        setFormData({ ...formData, customFeeRules: next });
                                      }}
                                      className="w-16 rounded border border-gray-200 px-1 py-0.5 text-xs"
                                    />
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Max $ <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={((rule.charge?.maxCents ?? 0) / 100).toFixed(2)}
                                      onChange={(e) => {
                                        const next = [...formData.customFeeRules];
                                        const v = e.target.value;
                                        next[idx] = {
                                          ...rule,
                                          charge: {
                                            type: rule.charge?.type ?? 'FLAT',
                                            ...rule.charge,
                                            maxCents: v === '' ? undefined : Math.round(parseFloat(v || '0') * 100),
                                          },
                                        };
                                        setFormData({ ...formData, customFeeRules: next });
                                      }}
                                      className="w-16 rounded border border-gray-200 px-1 py-0.5 text-xs"
                                    />
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500">Conditions (all must match)</label>
                            <div className="mt-1 space-y-1">
                              {rule.conditions.map((cond, cidx) => (
                                <div key={cidx} className="flex flex-wrap items-center gap-1">
                                  <select
                                    value={cond.field}
                                    onChange={(e) => {
                                      const next = [...formData.customFeeRules];
                                      const conds = [...rule.conditions];
                                      conds[cidx] = { ...cond, field: e.target.value };
                                      next[idx] = { ...rule, conditions: conds };
                                      setFormData({ ...formData, customFeeRules: next });
                                    }}
                                    className="rounded border border-gray-200 px-1 py-0.5 text-xs"
                                  >
                                    <option value="feeType">Fee type</option>
                                    <option value="orderTotalCents">Order total (cents)</option>
                                    <option value="medicationKey">Medication key</option>
                                    <option value="medName">Med name</option>
                                    <option value="form">Form</option>
                                    <option value="rxCount">RX count</option>
                                    <option value="providerType">Provider type</option>
                                  </select>
                                  <select
                                    value={cond.operator}
                                    onChange={(e) => {
                                      const next = [...formData.customFeeRules];
                                      const conds = [...rule.conditions];
                                      conds[cidx] = { ...cond, operator: e.target.value };
                                      next[idx] = { ...rule, conditions: conds };
                                      setFormData({ ...formData, customFeeRules: next });
                                    }}
                                    className="rounded border border-gray-200 px-1 py-0.5 text-xs"
                                  >
                                    <option value="eq">equals</option>
                                    <option value="neq">not equals</option>
                                    <option value="gte">≥</option>
                                    <option value="lte">≤</option>
                                    <option value="gt">&gt;</option>
                                    <option value="lt">&lt;</option>
                                    <option value="contains">contains</option>
                                    <option value="startsWith">starts with</option>
                                    <option value="endsWith">ends with</option>
                                    <option value="in">in list</option>
                                    <option value="notIn">not in list</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={Array.isArray(cond.value) ? cond.value.join(',') : String(cond.value)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const isNum = cond.field === 'orderTotalCents' || cond.field === 'rxCount';
                                      const value = isNum ? (parseInt(raw, 10) || 0) : raw;
                                      const next = [...formData.customFeeRules];
                                      const conds = [...rule.conditions];
                                      conds[cidx] = { ...cond, value };
                                      next[idx] = { ...rule, conditions: conds };
                                      setFormData({ ...formData, customFeeRules: next });
                                    }}
                                    placeholder="Value"
                                    className="w-24 rounded border border-gray-200 px-1 py-0.5 text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...formData.customFeeRules];
                                      const conds = rule.conditions.filter((_, i) => i !== cidx);
                                      next[idx] = { ...rule, conditions: conds };
                                      setFormData({ ...formData, customFeeRules: next });
                                    }}
                                    className="rounded p-0.5 text-red-600 hover:bg-red-50"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...formData.customFeeRules];
                                  const conds = [...rule.conditions, { field: 'medName', operator: 'contains', value: '' }];
                                  next[idx] = { ...rule, conditions: conds };
                                  setFormData({ ...formData, customFeeRules: next });
                                }}
                                className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                              >
                                <Plus className="h-3 w-3" /> Add condition
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          customFeeRules: [
                            ...formData.customFeeRules,
                            {
                              id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                              priority: formData.customFeeRules.length * 10,
                              conditions: [],
                              action: 'CHARGE',
                              charge: { type: 'FLAT', amountCents: 0 },
                            },
                          ],
                        })
                      }
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      <Plus className="h-4 w-4" /> Add rule
                    </button>
                  </div>
                )}
                {!customRulesExpanded && formData.customFeeRules.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {formData.customFeeRules.length} rule(s) configured
                  </p>
                )}
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Enable Billing</p>
                  <p className="text-sm text-gray-500">
                    Turn on/off fee collection for this clinic
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 p-6">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={saveConfig}
                disabled={saving}
                className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3d9268] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
