'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Receipt, Building2, DollarSign, Search, Settings, FileText,
  ChevronRight, Check, X, AlertCircle
} from 'lucide-react';

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
  const [formData, setFormData] = useState({
    prescriptionFeeType: 'FLAT' as const,
    prescriptionFeeAmount: 2000,
    transmissionFeeType: 'FLAT' as const,
    transmissionFeeAmount: 500,
    adminFeeType: 'NONE' as const,
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

      const response = await fetch('/api/super-admin/clinic-fees', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
        setSummary(data.summary || null);
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
      const response = await fetch(`/api/super-admin/clinic-fees/${selectedClinic.clinic.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  const filteredClinics = clinics.filter((c) =>
    c.clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.clinic.adminEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Billing</h1>
          <p className="text-gray-500 mt-1">Configure platform fees and manage clinic invoices</p>
        </div>
        <button
          onClick={() => router.push('/super-admin/clinic-billing/invoices')}
          className="px-4 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] transition-colors flex items-center gap-2 shadow-sm"
        >
          <FileText className="h-5 w-5" />
          View Invoices
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#4fa77e]/10 rounded-xl">
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-xl">
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-xl">
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search clinics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
          />
        </div>
      </div>

      {/* Clinics List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#4fa77e] border-t-transparent" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prescription Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transmission Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cycle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClinics.map((item) => (
                <tr key={item.clinic.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">{item.clinic.name}</p>
                      <p className="text-sm text-gray-500">{item.clinic.adminEmail}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.config
                      ? formatFee(item.config.prescriptionFeeType, item.config.prescriptionFeeAmount)
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.config
                      ? formatFee(item.config.transmissionFeeType, item.config.transmissionFeeAmount)
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.config && item.config.adminFeeType !== 'NONE'
                      ? `${formatFee(
                          item.config.adminFeeType === 'PERCENTAGE_WEEKLY' ? 'PERCENTAGE' : 'FLAT',
                          item.config.adminFeeAmount
                        )}/week`
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.config ? `${item.config.prescriptionCycleDays} days` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.config ? (
                      item.config.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <Check className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          <X className="h-3 w-3" />
                          Inactive
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        Not Configured
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => openConfigModal(item)}
                      className="text-[#4fa77e] hover:text-[#3d9268] p-2 rounded-lg hover:bg-[#4fa77e]/10 transition-colors"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Configuration Modal */}
      {configModalOpen && selectedClinic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">
                Configure Fees - {selectedClinic.clinic.name}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Prescription Fee */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Medical Prescription Fee (EONPRO Provider)
                </label>
                <div className="flex gap-3">
                  <select
                    value={formData.prescriptionFeeType}
                    onChange={(e) =>
                      setFormData({ ...formData, prescriptionFeeType: e.target.value as 'FLAT' | 'PERCENTAGE' })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  >
                    <option value="FLAT">Flat Fee</option>
                    <option value="PERCENTAGE">Percentage</option>
                  </select>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.prescriptionFeeType === 'FLAT' ? '$' : ''}
                    </span>
                    <input
                      type="number"
                      value={formData.prescriptionFeeType === 'FLAT' ? formData.prescriptionFeeAmount / 100 : formData.prescriptionFeeAmount / 100}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          prescriptionFeeAmount: Math.round(parseFloat(e.target.value) * 100),
                        })
                      }
                      className="w-full pl-8 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.prescriptionFeeType === 'PERCENTAGE' ? '%' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transmission Fee */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transmission Fee (Clinic Provider)
                </label>
                <div className="flex gap-3">
                  <select
                    value={formData.transmissionFeeType}
                    onChange={(e) =>
                      setFormData({ ...formData, transmissionFeeType: e.target.value as 'FLAT' | 'PERCENTAGE' })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  >
                    <option value="FLAT">Flat Fee</option>
                    <option value="PERCENTAGE">Percentage</option>
                  </select>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.transmissionFeeType === 'FLAT' ? '$' : ''}
                    </span>
                    <input
                      type="number"
                      value={formData.transmissionFeeType === 'FLAT' ? formData.transmissionFeeAmount / 100 : formData.transmissionFeeAmount / 100}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          transmissionFeeAmount: Math.round(parseFloat(e.target.value) * 100),
                        })
                      }
                      className="w-full pl-8 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {formData.transmissionFeeType === 'PERCENTAGE' ? '%' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin Fee */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Weekly Admin Fee
                </label>
                <div className="flex gap-3">
                  <select
                    value={formData.adminFeeType}
                    onChange={(e) =>
                      setFormData({ ...formData, adminFeeType: e.target.value as 'NONE' | 'FLAT_WEEKLY' | 'PERCENTAGE_WEEKLY' })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  >
                    <option value="NONE">None</option>
                    <option value="FLAT_WEEKLY">Flat Fee</option>
                    <option value="PERCENTAGE_WEEKLY">% of Weekly Sales</option>
                  </select>
                  {formData.adminFeeType !== 'NONE' && (
                    <div className="flex-1 relative">
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
                        className="w-full pl-8 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prescription Cycle (Days)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  No fee charged for same patient + medication until this many days pass
                </p>
                <input
                  type="number"
                  value={formData.prescriptionCycleDays}
                  onChange={(e) =>
                    setFormData({ ...formData, prescriptionCycleDays: parseInt(e.target.value) || 90 })
                  }
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Enable Billing</p>
                  <p className="text-sm text-gray-500">Turn on/off fee collection for this clinic</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4fa77e]"></div>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveConfig}
                disabled={saving}
                className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d9268] transition-colors disabled:opacity-50"
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
