'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, Filter, Globe, Users, Edit, Eye, Settings } from 'lucide-react';
import { apiGet } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  status: string;
  adminEmail: string;
  billingPlan: string;
  primaryColor: string;
  createdAt: string;
  _count?: {
    patients: number;
    providers: number;
    users: number;
  };
}

export default function ClinicsListPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    setLoadError(null);
    try {
      const response = await apiGet('/api/super-admin/clinics');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setLoadError((errorData.error as string) || 'Failed to load clinics');
        return;
      }
      const data = await response.json();
      setClinics(data.clinics || []);
    } catch (error: unknown) {
      const err = error as { isAuthError?: boolean; message?: string };
      if (err?.isAuthError) {
        // Session expired: SessionExpirationHandler will show modal and redirect
        return;
      }
      setLoadError(err?.message ?? 'Failed to load clinics');
    } finally {
      setLoading(false);
    }
  };

  const filteredClinics = clinics.filter((clinic) => {
    const matchesSearch =
      normalizedIncludes(clinic.name, searchTerm) ||
      normalizedIncludes(clinic.subdomain, searchTerm) ||
      normalizedIncludes(clinic.adminEmail, searchTerm);
    const matchesStatus = statusFilter === 'all' || clinic.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-[#4fa77e]/10 text-[#4fa77e]';
      case 'TRIAL':
        return 'bg-blue-100 text-blue-700';
      case 'SUSPENDED':
        return 'bg-red-100 text-red-700';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-600';
      case 'PENDING_SETUP':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinics</h1>
          <p className="mt-1 text-gray-500">Manage all clinics on the platform</p>
        </div>
        <button
          onClick={() => { window.location.href = '/super-admin/clinics/new'; }}
          className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-white shadow-sm transition-colors hover:bg-[#3d9268]"
        >
          <Plus className="h-5 w-5" />
          Create Clinic
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          {loadError}
        </div>
      )}

      {/* Search & Filters */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search clinics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-4 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              <option value="all">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PENDING_SETUP">Pending Setup</option>
            </select>
          </div>
        </div>
      </div>

      {/* Clinics Grid */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent"></div>
          <p className="text-gray-500">Loading clinics...</p>
        </div>
      ) : filteredClinics.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">No clinics found</h3>
          <p className="mb-4 text-gray-500">
            {searchTerm ? 'Try adjusting your search' : 'Create your first clinic to get started'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => { window.location.href = '/super-admin/clinics/new'; }}
              className="rounded-xl bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3d9268]"
            >
              Create Clinic
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredClinics.map((clinic) => (
            <div
              key={clinic.id}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Clinic Header with Color */}
              <div
                className="h-1.5"
                style={{ backgroundColor: clinic.primaryColor || '#4fa77e' }}
              />

              <div className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
                      style={{ backgroundColor: clinic.primaryColor || '#4fa77e' }}
                    >
                      {clinic.name[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{clinic.name}</h3>
                      <p className="text-sm text-gray-500">{clinic.adminEmail}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(clinic.status)}`}
                  >
                    {clinic.status}
                  </span>
                </div>

                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Globe className="h-4 w-4 text-gray-400" />
                    <span>{clinic.subdomain}.eonpro.io</span>
                  </div>
                  {clinic.customDomain && (
                    <div className="flex items-center gap-2 text-sm text-[#4fa77e]">
                      <Globe className="h-4 w-4" />
                      <span>{clinic.customDomain}</span>
                    </div>
                  )}
                </div>

                <div className="mb-4 flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    <span>{clinic._count?.patients || 0} patients</span>
                  </div>
                  <span>{clinic._count?.providers || 0} providers</span>
                </div>

                <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
                  <button
                    onClick={() => {
                      window.location.href = `/super-admin/clinics/${clinic.id}`;
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-[#4fa77e] transition-colors hover:bg-[#4fa77e]/10"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <button
                    onClick={() => {
                      window.location.href = `/super-admin/clinics/${clinic.id}`;
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      window.location.href = `/super-admin/clinics/${clinic.id}/settings`;
                    }}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
