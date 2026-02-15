'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Shield,
  Plus,
  Globe,
  Activity,
  TrendingUp,
  ArrowUpRight,
  MoreHorizontal,
} from 'lucide-react';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  status: string;
  adminEmail: string;
  billingPlan: string;
  patientLimit: number;
  providerLimit: number;
  createdAt: string;
  _count?: {
    patients: number;
    providers: number;
    users: number;
  };
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalClinics: 0,
    activeClinics: 0,
    totalPatients: 0,
    totalProviders: 0,
  });

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch('/api/super-admin/clinics', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
        setStats({
          totalClinics: data.clinics?.length || 0,
          activeClinics: data.clinics?.filter((c: Clinic) => c.status === 'ACTIVE').length || 0,
          totalPatients: data.totalPatients || 0,
          totalProviders: data.totalProviders || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setLoading(false);
    }
  };

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
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan?.toLowerCase()) {
      case 'enterprise':
        return 'text-[var(--brand-primary)]';
      case 'professional':
        return 'text-blue-600';
      case 'starter':
        return 'text-gray-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
        <p className="mt-1 text-gray-500">Manage all clinics, branding, and platform settings</p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Clinics */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Clinics</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.totalClinics}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Active Clinics */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Clinics</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.activeClinics}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4fa77e]">
              <Activity className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Total Patients */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Patients</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {stats.totalPatients.toLocaleString()}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-primary)]">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Total Providers */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Providers</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.totalProviders}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500">
              <Shield className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <button
          onClick={() => router.push('/super-admin/clinics/new')}
          className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[#4fa77e] p-4 text-white shadow-sm transition-all hover:bg-[#3d9268]"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium">Create Clinic</span>
        </button>
        <button
          onClick={() => router.push('/super-admin/clinics')}
          className="flex flex-col items-center justify-center gap-2 rounded-xl bg-blue-600 p-4 text-white shadow-sm transition-all hover:bg-blue-700"
        >
          <Building2 className="h-6 w-6" />
          <span className="text-sm font-medium">Manage Clinics</span>
        </button>
        <button
          onClick={() => router.push('/super-admin/settings')}
          className="flex flex-col items-center justify-center gap-2 rounded-xl bg-gray-600 p-4 text-white shadow-sm transition-all hover:bg-gray-700"
        >
          <TrendingUp className="h-6 w-6" />
          <span className="text-sm font-medium">Global Settings</span>
        </button>
      </div>

      {/* All Clinics Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">All Clinics</h2>
          <button
            onClick={() => router.push('/super-admin/clinics')}
            className="flex items-center gap-1 text-sm font-medium text-[#4fa77e] hover:text-[#3d9268]"
          >
            View All
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent"></div>
            <p className="text-gray-500">Loading clinics...</p>
          </div>
        ) : clinics.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">No clinics yet</h3>
            <p className="mb-4 text-gray-500">Create your first clinic to get started</p>
            <button
              onClick={() => router.push('/super-admin/clinics/new')}
              className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3d9268]"
            >
              Create Clinic
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Clinic
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    URL
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Patients
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clinics.map((clinic) => (
                  <tr key={clinic.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{clinic.name}</p>
                        <p className="text-sm text-gray-500">{clinic.adminEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600">{clinic.subdomain}.eonpro.io</span>
                      </div>
                      {clinic.customDomain && (
                        <p className="mt-0.5 text-xs text-[#4fa77e]">{clinic.customDomain}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(clinic.status)}`}
                      >
                        {clinic.status}
                      </span>
                    </td>
                    <td
                      className={`px-6 py-4 text-sm font-medium capitalize ${getPlanColor(clinic.billingPlan)}`}
                    >
                      {clinic.billingPlan}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-600">
                      {clinic._count?.patients || 0}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          window.location.href = `/super-admin/clinics/${clinic.id}`;
                        }}
                        className="text-sm font-medium text-[#4fa77e] hover:text-[#3d9268]"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
