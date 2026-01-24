'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Plus, Search, Filter, Globe, Users, 
  Edit, Eye, Settings
} from 'lucide-react';

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
  const router = useRouter();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      
      if (!token) {
        router.push('/login?redirect=/super-admin/clinics&reason=session_expired');
        return;
      }

      const response = await fetch('/api/super-admin/clinics', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('auth-token');
        localStorage.removeItem('super_admin-token');
        router.push('/login?redirect=/super-admin/clinics&reason=session_expired');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClinics = clinics.filter(clinic => {
    const matchesSearch = clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         clinic.subdomain.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         clinic.adminEmail.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || clinic.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-[#4fa77e]/10 text-[#4fa77e]';
      case 'TRIAL': return 'bg-blue-100 text-blue-700';
      case 'SUSPENDED': return 'bg-red-100 text-red-700';
      case 'INACTIVE': return 'bg-gray-100 text-gray-600';
      case 'PENDING_SETUP': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinics</h1>
          <p className="text-gray-500 mt-1">Manage all clinics on the platform</p>
        </div>
        <button
          onClick={() => router.push('/super-admin/clinics/new')}
          className="px-4 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="h-5 w-5" />
          Create Clinic
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search clinics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e] bg-white"
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
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#4fa77e] border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-500">Loading clinics...</p>
        </div>
      ) : filteredClinics.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No clinics found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm ? 'Try adjusting your search' : 'Create your first clinic to get started'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => router.push('/super-admin/clinics/new')}
              className="px-4 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] transition-colors"
            >
              Create Clinic
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClinics.map((clinic) => (
            <div
              key={clinic.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Clinic Header with Color */}
              <div 
                className="h-1.5"
                style={{ backgroundColor: clinic.primaryColor || '#4fa77e' }}
              />
              
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: clinic.primaryColor || '#4fa77e' }}
                    >
                      {clinic.name[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{clinic.name}</h3>
                      <p className="text-sm text-gray-500">{clinic.adminEmail}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(clinic.status)}`}>
                    {clinic.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
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

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    <span>{clinic._count?.patients || 0} patients</span>
                  </div>
                  <span>{clinic._count?.providers || 0} providers</span>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => router.push(`/super-admin/clinics/${clinic.id}`)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-[#4fa77e] hover:bg-[#4fa77e]/10 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <button
                    onClick={() => router.push(`/super-admin/clinics/${clinic.id}/edit`)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => router.push(`/super-admin/clinics/${clinic.id}/settings`)}
                    className="px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
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
