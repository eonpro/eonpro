'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Users, Shield, Plus, Globe, Activity, 
  TrendingUp, ArrowUpRight, MoreHorizontal
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
        headers: { 'Authorization': `Bearer ${token}` },
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
      case 'ACTIVE': return 'bg-[#4fa77e]/10 text-[#4fa77e]';
      case 'TRIAL': return 'bg-blue-100 text-blue-700';
      case 'SUSPENDED': return 'bg-red-100 text-red-700';
      case 'INACTIVE': return 'bg-gray-100 text-gray-600';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan?.toLowerCase()) {
      case 'enterprise': return 'text-purple-600';
      case 'professional': return 'text-blue-600';
      case 'starter': return 'text-gray-600';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage all clinics, branding, and platform settings</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* Total Clinics */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Clinics</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalClinics}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Active Clinics */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Clinics</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.activeClinics}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#4fa77e] flex items-center justify-center">
              <Activity className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Total Patients */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Patients</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalPatients.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Total Providers */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Providers</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalProviders}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => router.push('/super-admin/clinics/new')}
          className="bg-[#4fa77e] hover:bg-[#3d9268] text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm"
        >
          <Plus className="h-6 w-6" />
          <span className="font-medium text-sm">Create Clinic</span>
        </button>
        <button
          onClick={() => router.push('/super-admin/clinics')}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm"
        >
          <Building2 className="h-6 w-6" />
          <span className="font-medium text-sm">Manage Clinics</span>
        </button>
        <button
          onClick={() => router.push('/super-admin/settings')}
          className="bg-gray-600 hover:bg-gray-700 text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm"
        >
          <TrendingUp className="h-6 w-6" />
          <span className="font-medium text-sm">Global Settings</span>
        </button>
      </div>

      {/* All Clinics Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">All Clinics</h2>
          <button
            onClick={() => router.push('/super-admin/clinics')}
            className="text-sm text-[#4fa77e] hover:text-[#3d9268] font-medium flex items-center gap-1"
          >
            View All
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
        
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#4fa77e] border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-500">Loading clinics...</p>
          </div>
        ) : clinics.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No clinics yet</h3>
            <p className="text-gray-500 mb-4">Create your first clinic to get started</p>
            <button
              onClick={() => router.push('/super-admin/clinics/new')}
              className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d9268] transition-colors"
            >
              Create Clinic
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Clinic</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">URL</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Patients</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clinics.map((clinic) => (
                  <tr key={clinic.id} className="hover:bg-gray-50/50 transition-colors">
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
                        <p className="text-xs text-[#4fa77e] mt-0.5">{clinic.customDomain}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(clinic.status)}`}>
                        {clinic.status}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm font-medium capitalize ${getPlanColor(clinic.billingPlan)}`}>
                      {clinic.billingPlan}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                      {clinic._count?.patients || 0}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => { window.location.href = `/super-admin/clinics/${clinic.id}`; }}
                        className="text-[#4fa77e] hover:text-[#3d9268] text-sm font-medium"
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
