'use client';

import { useState, useEffect } from 'react';
import { logger } from '../../../lib/logger';

import { useRouter } from 'next/navigation';
import { 
  Building2, Plus, Settings, Users, BarChart3, DollarSign, 
  Calendar, Activity, TrendingUp, AlertCircle, CheckCircle,
  Edit, Trash2, Eye, ChevronRight
} from 'lucide-react';
import Link from 'next/link';

interface ClinicData {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string | null;
  status: string;
  billingPlan: string;
  patientLimit: number;
  providerLimit: number;
  storageLimit: number;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  createdAt: string;
  _count: {
    patients: number;
    providers: number;
    users: number;
    orders: number;
    invoices: number;
  };
}

export default function ClinicsAdminPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClinic, setSelectedClinic] = useState<ClinicData | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  useEffect(() => {
    fetchClinics();
  }, []);
  
  const fetchClinics = async () => {
    try {
      const response = await fetch('/api/admin/clinics');
      if (response.ok) {
        const data = await response.json();
        // API returns { clinics: [...] }, extract the array
        setClinics(data.clinics || []);
      }
    } catch (error) {
      logger.error('Error fetching clinics:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteClinic = async (clinicId: number) => {
    if (!confirm('Are you sure you want to delete this clinic? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/admin/clinics/${clinicId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        fetchClinics();
        setShowDeleteModal(false);
        setSelectedClinic(null);
      }
    } catch (error) {
      logger.error('Error deleting clinic:', error);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'TRIAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'SUSPENDED':
        return 'bg-red-100 text-red-800';
      case 'EXPIRED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'enterprise':
        return 'bg-gradient-to-r from-purple-600 to-blue-600 text-white';
      case 'professional':
        return 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white';
      case 'starter':
        return 'bg-gradient-to-r from-gray-600 to-gray-700 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };
  
  // Calculate totals
  const totals = clinics.reduce((acc, clinic) => ({
    patients: acc.patients + clinic._count.patients,
    providers: acc.providers + clinic._count.providers,
    users: acc.users + clinic._count.users,
    orders: acc.orders + clinic._count.orders,
    revenue: acc.revenue + (clinic._count.invoices * 100), // Placeholder calculation
  }), { patients: 0, providers: 0, users: 0, orders: 0, revenue: 0 });
  
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clinic Management</h1>
          <p className="text-gray-600 mt-1">Manage all clinics in your platform</p>
        </div>
        <Link
          href="/admin/clinics/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add New Clinic
        </Link>
      </div>
      
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clinics</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{clinics.length}</p>
            </div>
            <Building2 className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {clinics.filter(c => c.status === 'ACTIVE').length} active
          </p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Patients</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.patients}</p>
            </div>
            <Users className="w-8 h-8 text-green-500 opacity-50" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Across all clinics
          </p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Providers</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.providers}</p>
            </div>
            <Activity className="w-8 h-8 text-purple-500 opacity-50" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Active providers
          </p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.orders}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-orange-500 opacity-50" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            This month
          </p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Revenue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${(totals.revenue / 100).toLocaleString()}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600 opacity-50" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Monthly recurring
          </p>
        </div>
      </div>
      
      {/* Clinics Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">All Clinics</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patients
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Providers
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {clinics.map((clinic) => (
                <tr key={clinic.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {clinic.logoUrl ? (
                        <img 
                          src={clinic.logoUrl} 
                          alt={clinic.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: clinic.primaryColor }}
                        >
                          {clinic.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="ml-3">
                        <p className="text-sm font-semibold text-gray-900">{clinic.name}</p>
                        <p className="text-xs text-gray-500">
                          {clinic.subdomain}.{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(clinic.status)}`}>
                      {clinic.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${getPlanBadge(clinic.billingPlan)}`}>
                      {clinic.billingPlan}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {clinic._count.patients}
                      <span className="text-gray-500">/{clinic.patientLimit}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                      <div 
                        className="bg-blue-600 h-1.5 rounded-full" 
                        style={{ width: `${Math.min(100, (clinic._count.patients / clinic.patientLimit) * 100)}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {clinic._count.providers}
                      <span className="text-gray-500">/{clinic.providerLimit}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                      <div 
                        className="bg-green-600 h-1.5 rounded-full" 
                        style={{ width: `${Math.min(100, (clinic._count.providers / clinic.providerLimit) * 100)}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {Math.round((clinic._count.patients / clinic.patientLimit) * 100)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(clinic.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/clinics/${clinic.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/admin/clinics/${clinic.id}/settings`}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Settings className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedClinic(clinic);
                          setShowDeleteModal(true);
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {clinics.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No clinics found</p>
            <Link
              href="/admin/clinics/new"
              className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add your first clinic
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
