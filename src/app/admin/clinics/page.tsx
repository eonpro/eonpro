'use client';

import { useState, useEffect } from 'react';
import { logger } from '../../../lib/logger';

import { useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  Settings,
  Users,
  BarChart3,
  DollarSign,
  Calendar,
  Activity,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Edit,
  Trash2,
  Eye,
  ChevronRight,
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
  faviconUrl?: string | null;
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
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is super_admin - only super_admin can access this page
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        const role = parsedUser.role?.toLowerCase();
        setUserRole(role);

        if (role !== 'super_admin') {
          // Redirect non-super-admins to dashboard
          router.replace('/');
          return;
        }

        fetchClinics();
      } catch {
        router.replace('/login');
      }
    } else {
      router.replace('/login');
    }
  }, [router]);

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
  const totals = clinics.reduce(
    (acc, clinic) => ({
      patients: acc.patients + clinic._count.patients,
      providers: acc.providers + clinic._count.providers,
      users: acc.users + clinic._count.users,
      orders: acc.orders + clinic._count.orders,
      revenue: acc.revenue + clinic._count.invoices * 100, // Placeholder calculation
    }),
    { patients: 0, providers: 0, users: 0, orders: 0, revenue: 0 }
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-1/4 rounded bg-gray-200"></div>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded bg-gray-200"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clinic Management</h1>
          <p className="mt-1 text-gray-600">Manage all clinics in your platform</p>
        </div>
        <Link
          href="/admin/clinics/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          Add New Clinic
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clinics</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{clinics.length}</p>
            </div>
            <Building2 className="h-8 w-8 text-blue-500 opacity-50" />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {clinics.filter((c) => c.status === 'ACTIVE').length} active
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Patients</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{totals.patients}</p>
            </div>
            <Users className="h-8 w-8 text-green-500 opacity-50" />
          </div>
          <p className="mt-2 text-xs text-gray-500">Across all clinics</p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Providers</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{totals.providers}</p>
            </div>
            <Activity className="h-8 w-8 text-purple-500 opacity-50" />
          </div>
          <p className="mt-2 text-xs text-gray-500">Active providers</p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{totals.orders}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-500 opacity-50" />
          </div>
          <p className="mt-2 text-xs text-gray-500">This month</p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Revenue</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                ${(totals.revenue / 100).toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600 opacity-50" />
          </div>
          <p className="mt-2 text-xs text-gray-500">Monthly recurring</p>
        </div>
      </div>

      {/* Clinics Table */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">All Clinics</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Patients
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Providers
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {clinics.map((clinic) => (
                <tr key={clinic.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      {/* Show favicon/icon instead of full logo for compact display */}
                      {clinic.faviconUrl ? (
                        <img
                          src={clinic.faviconUrl}
                          alt={clinic.name}
                          className="h-10 w-10 rounded-lg bg-gray-50 object-contain p-1"
                        />
                      ) : (
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg font-bold text-white"
                          style={{ backgroundColor: clinic.primaryColor }}
                        >
                          {clinic.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="ml-3">
                        <p className="text-sm font-semibold text-gray-900">{clinic.name}</p>
                        <p className="text-xs text-gray-500">
                          {clinic.subdomain}.
                          {process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(clinic.status)}`}
                    >
                      {clinic.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${getPlanBadge(clinic.billingPlan)}`}
                    >
                      {clinic.billingPlan}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {clinic._count.patients}
                      <span className="text-gray-500">/{clinic.patientLimit}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                      <div
                        className="h-1.5 rounded-full bg-blue-600"
                        style={{
                          width: `${Math.min(100, (clinic._count.patients / clinic.patientLimit) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {clinic._count.providers}
                      <span className="text-gray-500">/{clinic.providerLimit}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                      <div
                        className="h-1.5 rounded-full bg-green-600"
                        style={{
                          width: `${Math.min(100, (clinic._count.providers / clinic.providerLimit) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {Math.round((clinic._count.patients / clinic.patientLimit) * 100)}%
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {new Date(clinic.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/clinics/${clinic.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/clinics/${clinic.id}/settings`}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Settings className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedClinic(clinic);
                          setShowDeleteModal(true);
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {clinics.length === 0 && (
          <div className="py-12 text-center">
            <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <p className="text-gray-500">No clinics found</p>
            <Link
              href="/admin/clinics/new"
              className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add your first clinic
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
