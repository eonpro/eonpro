'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserCog,
  Plus,
  Search,
  Building2,
  Eye,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
  AlertCircle,
  Check,
  X,
  Shield,
  Calendar,
  FileText,
  Users,
} from 'lucide-react';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
}

interface ProviderClinicAssignment {
  id: number;
  clinicId: number;
  isPrimary: boolean;
  clinic: {
    id: number;
    name: string;
    subdomain: string;
  };
}

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  npi: string;
  email: string | null;
  phone: string | null;
  titleLine: string | null;
  licenseState: string | null;
  licenseNumber: string | null;
  dea: string | null;
  clinicId: number | null;
  primaryClinicId: number | null;
  npiVerifiedAt: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  clinic: {
    id: number;
    name: string;
    subdomain: string;
  } | null;
  providerClinics: ProviderClinicAssignment[];
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  clinicCount: number;
  hasLinkedUser: boolean;
  _count: {
    orders: number;
    appointments: number;
  };
}

export default function SuperAdminProvidersPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create form state
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    npi: '',
    email: '',
    phone: '',
    titleLine: '',
    licenseState: '',
    licenseNumber: '',
    dea: '',
    clinicIds: [] as number[],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchClinics();
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [page, statusFilter, selectedClinic]);

  const getAuthToken = () => {
    return localStorage.getItem('auth-token') ||
           localStorage.getItem('super_admin-token') ||
           localStorage.getItem('SUPER_ADMIN-token');
  };

  const fetchClinics = async () => {
    const token = getAuthToken();
    try {
      const res = await fetch('/api/super-admin/clinics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    }
  };

  const fetchProviders = async () => {
    const token = getAuthToken();
    setFetchError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '25');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (selectedClinic !== 'all') params.set('clinicId', selectedClinic.toString());
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/super-admin/providers?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        setProviders(data.providers || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.totalCount || 0);
      } else {
        setFetchError(data.error || 'Failed to load providers');
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
      setFetchError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProviders();
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const token = getAuthToken();

    try {
      const response = await fetch('/api/super-admin/providers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...createForm,
          clinicIds: createForm.clinicIds.length > 0 ? createForm.clinicIds : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create provider');
      }

      setShowCreateModal(false);
      setCreateForm({
        firstName: '',
        lastName: '',
        npi: '',
        email: '',
        phone: '',
        titleLine: '',
        licenseState: '',
        licenseNumber: '',
        dea: '',
        clinicIds: [],
      });
      fetchProviders();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenDelete = (provider: Provider) => {
    setDeletingProvider(provider);
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDeleteProvider = async () => {
    if (!deletingProvider) return;

    setDeleting(true);
    setDeleteError(null);

    const token = getAuthToken();

    try {
      const hasData = deletingProvider._count.orders > 0 || deletingProvider._count.appointments > 0;
      const response = await fetch(
        `/api/super-admin/providers/${deletingProvider.id}${hasData ? '?force=true' : ''}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete provider');
      }

      setShowDeleteModal(false);
      setDeletingProvider(null);
      fetchProviders();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  const toggleClinicSelection = (clinicId: number) => {
    setCreateForm(f => ({
      ...f,
      clinicIds: f.clinicIds.includes(clinicId)
        ? f.clinicIds.filter(id => id !== clinicId)
        : [...f.clinicIds, clinicId],
    }));
  };

  // Calculate stats
  const assignedCount = providers.filter(p => p.clinicCount > 0).length;
  const unassignedCount = providers.filter(p => p.clinicCount === 0).length;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Providers</h1>
          <p className="text-gray-500">Manage providers across all clinics</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 font-medium text-white hover:bg-[#3d8a66]"
        >
          <Plus className="h-5 w-5" />
          Add Provider
        </button>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="mb-6 rounded-xl border bg-red-50 border-red-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="font-medium text-red-800">{fetchError}</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchProviders();
            }}
            className="p-1.5 rounded-lg hover:bg-white/50 text-red-600"
            title="Retry"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
              <p className="text-sm text-gray-500">Total Providers</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{assignedCount}</p>
              <p className="text-sm text-gray-500">Assigned to Clinics</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{unassignedCount}</p>
              <p className="text-sm text-gray-500">Unassigned</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {providers.filter(p => p.hasLinkedUser).length}
              </p>
              <p className="text-sm text-gray-500">With User Account</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, NPI, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </form>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <select
            value={selectedClinic}
            onChange={(e) => {
              setSelectedClinic(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
              setPage(1);
            }}
            className="appearance-none rounded-lg border border-gray-200 py-2 pl-10 pr-10 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          >
            <option value="all">All Clinics</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'assigned' | 'unassigned');
              setPage(1);
            }}
            className="appearance-none rounded-lg border border-gray-200 py-2 pl-4 pr-10 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          >
            <option value="all">All Status</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Providers Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Provider
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                NPI
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Clinics
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Activity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {providers.map((provider) => (
              <tr key={provider.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">
                      {provider.firstName} {provider.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{provider.email || 'No email'}</p>
                    {provider.titleLine && (
                      <p className="text-xs text-gray-400">{provider.titleLine}</p>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-900">{provider.npi}</span>
                    {provider.npiVerifiedAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        <Shield className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {provider.clinicCount > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {provider.providerClinics.slice(0, 2).map((pc) => (
                        <span
                          key={pc.id}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                            pc.isPrimary
                              ? 'bg-[#4fa77e]/10 text-[#4fa77e] font-medium'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {pc.clinic.name}
                          {pc.isPrimary && <span className="text-[10px]">(Primary)</span>}
                        </span>
                      ))}
                      {provider.clinicCount > 2 && (
                        <span className="text-xs text-gray-400">
                          +{provider.clinicCount - 2} more
                        </span>
                      )}
                    </div>
                  ) : provider.clinic ? (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {provider.clinic.name}
                      <span className="text-[10px] text-gray-400">(Legacy)</span>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm">
                    <div className="flex items-center gap-1 text-gray-600">
                      <FileText className="h-3 w-3" />
                      {provider._count.orders} orders
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-3 w-3" />
                      {provider._count.appointments} appts
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {provider.hasLinkedUser ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        <Users className="h-3 w-3" />
                        User Linked
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        No User
                      </span>
                    )}
                    {provider.lastLogin && (
                      <span className="text-xs text-gray-400">
                        Last: {new Date(provider.lastLogin).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/super-admin/providers/${provider.id}`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/super-admin/providers/${provider.id}?tab=clinics`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#4fa77e]"
                      title="Manage clinics"
                    >
                      <Building2 className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleOpenDelete(provider)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      title="Delete provider"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {providers.length === 0 && (
          <div className="py-12 text-center">
            <UserCog className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No providers found</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-[#4fa77e] hover:text-[#3d8a66] font-medium"
            >
              Add your first provider
            </button>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 25 + 1} to {Math.min(page * 25, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create Provider</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreateProvider} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">NPI *</label>
                <input
                  type="text"
                  required
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={createForm.npi}
                  onChange={(e) => setCreateForm(f => ({ ...f, npi: e.target.value.replace(/\D/g, '') }))}
                  placeholder="10-digit NPI number"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Title Line</label>
                <input
                  type="text"
                  value={createForm.titleLine}
                  onChange={(e) => setCreateForm(f => ({ ...f, titleLine: e.target.value }))}
                  placeholder="e.g., MD, Family Medicine"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">License State</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={createForm.licenseState}
                    onChange={(e) => setCreateForm(f => ({ ...f, licenseState: e.target.value.toUpperCase() }))}
                    placeholder="TX"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">License Number</label>
                  <input
                    type="text"
                    value={createForm.licenseNumber}
                    onChange={(e) => setCreateForm(f => ({ ...f, licenseNumber: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">DEA Number</label>
                <input
                  type="text"
                  value={createForm.dea}
                  onChange={(e) => setCreateForm(f => ({ ...f, dea: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              {/* Clinic Assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Clinics (optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Select clinics this provider should have access to. You can add more clinics later.
                </p>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {clinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      type="button"
                      onClick={() => toggleClinicSelection(clinic.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                        createForm.clinicIds.includes(clinic.id) ? 'bg-[#4fa77e]/5' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        createForm.clinicIds.includes(clinic.id)
                          ? 'bg-[#4fa77e] border-[#4fa77e]'
                          : 'border-gray-300'
                      }`}>
                        {createForm.clinicIds.includes(clinic.id) && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{clinic.name}</p>
                        <p className="text-xs text-gray-500">{clinic.subdomain}.eonpro.io</p>
                      </div>
                      {createForm.clinicIds[0] === clinic.id && (
                        <span className="text-xs text-[#4fa77e] font-medium">Primary</span>
                      )}
                    </button>
                  ))}
                </div>
                {createForm.clinicIds.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {createForm.clinicIds.length} clinic(s) selected. First selected will be primary.
                  </p>
                )}
              </div>

              {createError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-red-100 p-3">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
              Delete Provider?
            </h2>

            <p className="text-gray-600 text-center mb-4">
              Are you sure you want to delete{' '}
              <strong>{deletingProvider.firstName} {deletingProvider.lastName}</strong>?
            </p>

            {(deletingProvider._count.orders > 0 || deletingProvider._count.appointments > 0) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
                <p className="text-sm text-amber-800">
                  <strong>Warning:</strong> This provider has {deletingProvider._count.orders} order(s)
                  and {deletingProvider._count.appointments} appointment(s). Deleting will remove
                  all associated data.
                </p>
              </div>
            )}

            {deleteError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProvider}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
