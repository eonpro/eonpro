'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Users, Settings, BarChart3, Shield, Plus, 
  Globe, Palette, CreditCard, Activity, AlertCircle, LogOut
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
    totalRevenue: 0,
  });

  useEffect(() => {
    // Check if user is super admin
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      if (userData.role !== 'SUPER_ADMIN' && userData.role !== 'super_admin') {
        router.push('/admin');
        return;
      }
    }
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
          totalRevenue: data.totalRevenue || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Clinics', value: stats.totalClinics, icon: Building2, color: 'bg-blue-500' },
    { label: 'Active Clinics', value: stats.activeClinics, icon: Activity, color: 'bg-green-500' },
    { label: 'Total Patients', value: stats.totalPatients.toLocaleString(), icon: Users, color: 'bg-purple-500' },
    { label: 'Total Providers', value: stats.totalProviders, icon: Shield, color: 'bg-orange-500' },
  ];

  const quickActions = [
    { label: 'Create Clinic', icon: Plus, href: '/super-admin/clinics/new', color: 'bg-emerald-600' },
    { label: 'Manage Clinics', icon: Building2, href: '/super-admin/clinics', color: 'bg-blue-600' },
    { label: 'White Label Settings', icon: Palette, href: '/super-admin/branding', color: 'bg-purple-600' },
    { label: 'Global Settings', icon: Settings, href: '/super-admin/settings', color: 'bg-gray-600' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'TRIAL': return 'bg-blue-100 text-blue-800';
      case 'SUSPENDED': return 'bg-red-100 text-red-800';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('user');
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-8 w-8 text-emerald-400" />
                <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
              </div>
              <p className="text-slate-300">Manage all clinics, branding, and platform settings</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/super-admin/clinics/new')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Plus className="h-5 w-5" />
                Create Clinic
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 rounded-lg font-medium flex items-center gap-2 transition-colors text-red-200"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                onClick={() => router.push(action.href)}
                className={`${action.color} hover:opacity-90 text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all`}
              >
                <Icon className="h-6 w-6" />
                <span className="font-medium text-sm">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Recent Clinics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">All Clinics</h2>
            <button
              onClick={() => router.push('/super-admin/clinics')}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              View All →
            </button>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600">Loading clinics...</p>
            </div>
          ) : clinics.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No clinics yet</h3>
              <p className="text-gray-600 mb-4">Create your first clinic to get started</p>
              <button
                onClick={() => router.push('/super-admin/clinics/new')}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Create Clinic
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clinic</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patients</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {clinics.map((clinic) => (
                    <tr key={clinic.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{clinic.name}</p>
                          <p className="text-sm text-gray-500">{clinic.adminEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm">
                          <Globe className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">{clinic.subdomain}.eonpro.app</span>
                        </div>
                        {clinic.customDomain && (
                          <p className="text-xs text-emerald-600 mt-1">{clinic.customDomain}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(clinic.status)}`}>
                          {clinic.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">{clinic.billingPlan}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{clinic._count?.patients || 0}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/super-admin/clinics/${clinic.id}`)}
                          className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
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
    </div>
  );
}

