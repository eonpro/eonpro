'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Receipt,
  Building2,
  DollarSign,
  Search,
  Settings,
  FileText,
  ChevronRight,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

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
  }>({
    prescriptionFeeType: 'FLAT',
    prescriptionFeeAmount: 2000,
    transmissionFeeType: 'FLAT',
    transmissionFeeAmount: 500,
    adminFeeType: 'NONE',
    adminFeeAmount: 0,
    prescriptionCycleDays: 90,
    isActive: true,
  });

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
        body: JSON.stringify(formData),
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
      c.clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clinic.adminEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Billing</h1>
          <p className="mt-1 text-gray-500">Configure platform fees and manage clinic invoices</p>
        </div>
        <button
          onClick={() => router.push('/super-admin/clinic-billing/invoices')}
          className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-white shadow-sm transition-colors hover:bg-[#3d9268]"
        >
          <FileText className="h-5 w-5" />
          View Invoices
        </button>
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
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            placeholder="Search clinics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
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
