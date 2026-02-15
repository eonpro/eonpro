'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons/SettingsIcons';
import { toast } from 'sonner';
import { getStoredUser } from '@/lib/auth/stored-role';
import { apiFetch } from '@/lib/api/fetch';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  clinicId: number | null;
  clinic?: { id: number; name: string } | null;
}

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  status: string;
}

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

export default function UserManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const initialFormState = {
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'ADMIN',
    clinicId: '',
    // Provider fields
    npi: '',
    licenseNumber: '',
    licenseState: '',
    deaNumber: '',
    specialty: '',
    phone: '',
    address: '',
    acceptingNewPatients: false,
  };
  const [formData, setFormData] = useState(initialFormState);

  // Check if user is super admin (display only; server enforces on API)
  useEffect(() => {
    const user = getStoredUser();
    const role = (user?.role || '').toLowerCase();
    setIsSuperAdmin(role === 'super_admin');
  }, []);

  // Fetch clinics for dropdown
  const fetchClinics = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      // Try super admin endpoint first, then public
      const endpoints = ['/api/super-admin/clinics', '/api/clinics'];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { headers });
          if (res.ok) {
            const data = await res.json();
            const clinicList = data.clinics || (Array.isArray(data) ? data : []);
            if (clinicList.length > 0) {
              setClinics(clinicList);
              return;
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch clinics from ${endpoint}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch clinics:', err);
    }
  }, []);

  // Fetch users from API
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      if (!token) {
        setError('Not authenticated');
        return;
      }

      const res = await apiFetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchClinics();
  }, [fetchUsers, fetchClinics]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      if (!token) {
        toast.error('Not authenticated');
        return;
      }

      // Build payload
      const payload: any = {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      };

      // Add clinic ID for super admin
      if (isSuperAdmin && formData.clinicId) {
        payload.clinicId = parseInt(formData.clinicId);
      }

      // Add provider-specific fields
      if (formData.role === 'PROVIDER' || formData.role === 'provider') {
        payload.npi = formData.npi;
        payload.licenseNumber = formData.licenseNumber;
        payload.licenseState = formData.licenseState;
        payload.deaNumber = formData.deaNumber || undefined;
        payload.specialty = formData.specialty;
        payload.phone = formData.phone;
      }

      const res = await apiFetch('/api/users/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      toast.success(`User ${formData.email} created successfully!`);
      setShowCreateModal(false);
      setFormData(initialFormState);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      if (!token) {
        toast.error('Not authenticated');
        return;
      }

      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      };

      // Add clinic ID for super admin
      if (isSuperAdmin && formData.clinicId) {
        payload.clinicId = parseInt(formData.clinicId);
      }

      // Add password if provided
      if (formData.password) {
        payload.password = formData.password;
      }

      const res = await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      toast.success(`User ${formData.email} updated successfully!`);
      setShowEditModal(false);
      setEditingUser(null);
      setFormData(initialFormState);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspendUser = async (user: User) => {
    if (
      !confirm(
        `Are you sure you want to ${user.status === 'SUSPENDED' ? 'activate' : 'suspend'} ${user.email}?`
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user status');
      }

      toast.success(
        `User ${user.status === 'SUSPENDED' ? 'activated' : 'suspended'} successfully!`
      );
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status');
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      ...initialFormState,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      clinicId: user.clinicId?.toString() || '',
    });
    setShowEditModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800 ring-1 ring-gray-600/20';
      case 'SUSPENDED':
        return 'bg-red-100 text-red-800 ring-1 ring-red-600/20';
      case 'PENDING_VERIFICATION':
        return 'bg-amber-100 text-amber-800 ring-1 ring-amber-600/20';
      default:
        return 'bg-gray-100 text-gray-800 ring-1 ring-gray-600/20';
    }
  };

  const getRoleColor = (role: string) => {
    const r = role?.toUpperCase();
    switch (r) {
      case 'SUPER_ADMIN':
        return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-800 ring-1 ring-blue-600/20';
      case 'PROVIDER':
        return 'bg-teal-100 text-teal-800 ring-1 ring-teal-600/20';
      case 'INFLUENCER':
        return 'bg-pink-100 text-pink-800 ring-1 ring-pink-600/20';
      case 'PATIENT':
        return 'bg-gray-100 text-gray-800 ring-1 ring-gray-600/20';
      case 'STAFF':
        return 'bg-amber-100 text-amber-800 ring-1 ring-amber-600/20';
      case 'SUPPORT':
        return 'bg-orange-100 text-orange-800 ring-1 ring-orange-600/20';
      default:
        return 'bg-gray-100 text-gray-800 ring-1 ring-gray-600/20';
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-3xl font-bold text-transparent">
            User Management
          </h1>
          <p className="mt-2 text-slate-600">Manage platform users and permissions</p>
        </div>
        <button
          onClick={() => {
            setFormData(initialFormState);
            setShowCreateModal(true);
          }}
          className="flex items-center rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-teal-600 hover:to-emerald-600 hover:shadow-xl"
        >
          <PlusIcon className="mr-2 h-5 w-5" />
          Create User
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-xl">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                User
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Role
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Clinic
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Last Login
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Created
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {users.map((user) => (
              <tr key={user.id} className="transition-colors hover:bg-slate-50/50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-sm font-bold text-white">
                      {user.firstName?.[0]}
                      {user.lastName?.[0]}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-semibold text-slate-900">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-sm text-slate-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold leading-5 ${getRoleColor(user.role)}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="text-sm text-slate-600">
                    {user.clinic?.name || (user.clinicId ? `Clinic #${user.clinicId}` : '—')}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold leading-5 ${getStatusColor(user.status)}`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="space-x-2 whitespace-nowrap px-6 py-4 text-sm font-medium">
                  <button
                    onClick={() => openEditModal(user)}
                    className="rounded-lg px-3 py-1 text-teal-600 transition-colors hover:bg-teal-50 hover:text-teal-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleSuspendUser(user)}
                    className={`${
                      user.status === 'SUSPENDED'
                        ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-900'
                        : 'text-red-600 hover:bg-red-50 hover:text-red-900'
                    } rounded-lg px-3 py-1 transition-colors`}
                  >
                    {user.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-slate-500">No users found</p>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex h-full w-full items-start justify-center overflow-y-auto bg-black/50 pt-10 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6">
              <h3 className="text-xl font-bold text-slate-800">Create New User</h3>
              <p className="mt-1 text-sm text-slate-500">Add a new user to the platform</p>
            </div>

            <form onSubmit={handleCreateUser} className="max-h-[70vh] overflow-y-auto p-6">
              {/* Clinic Selection (Super Admin Only) */}
              {isSuperAdmin && clinics.length > 0 && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <label className="mb-2 block text-sm font-semibold text-amber-800">
                    Assign to Clinic *
                  </label>
                  <select
                    required
                    className="w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-3 outline-none transition-all focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10"
                    value={formData.clinicId}
                    onChange={(e) => setFormData({ ...formData, clinicId: e.target.value })}
                  >
                    <option value="">Select a clinic...</option>
                    {clinics
                      .filter((c) => c.status === 'ACTIVE')
                      .map((clinic) => (
                        <option key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Basic Information */}
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Email *</label>
                  <input
                    type="email"
                    required
                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Min 8 characters"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Role *
                    </label>
                    <select
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
                      <option value="ADMIN">Admin</option>
                      <option value="PROVIDER">Provider</option>
                      <option value="STAFF">Staff</option>
                      <option value="SUPPORT">Support</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Provider-Specific Fields */}
              {(formData.role === 'PROVIDER' || formData.role === 'provider') && (
                <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-4">
                  <h4 className="mb-4 text-sm font-bold text-teal-800">Provider Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-teal-700">
                        NPI *
                      </label>
                      <input
                        type="text"
                        required
                        pattern="[0-9]{10}"
                        maxLength={10}
                        className="w-full rounded-xl border-2 border-teal-200 bg-white px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                        value={formData.npi}
                        onChange={(e) =>
                          setFormData({ ...formData, npi: e.target.value.replace(/\D/g, '') })
                        }
                        placeholder="10 digits"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-teal-700">
                        License # *
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full rounded-xl border-2 border-teal-200 bg-white px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                        value={formData.licenseNumber}
                        onChange={(e) =>
                          setFormData({ ...formData, licenseNumber: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-teal-700">
                        License State *
                      </label>
                      <select
                        required
                        className="w-full rounded-xl border-2 border-teal-200 bg-white px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                        value={formData.licenseState}
                        onChange={(e) => setFormData({ ...formData, licenseState: e.target.value })}
                      >
                        <option value="">Select State</option>
                        {US_STATES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-teal-700">
                        DEA Number
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl border-2 border-teal-200 bg-white px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                        value={formData.deaNumber}
                        onChange={(e) => setFormData({ ...formData, deaNumber: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-teal-700">
                        Specialty *
                      </label>
                      <select
                        required
                        className="w-full rounded-xl border-2 border-teal-200 bg-white px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                        value={formData.specialty}
                        onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                      >
                        <option value="">Select Specialty</option>
                        <option value="PRIMARY_CARE">Primary Care</option>
                        <option value="INTERNAL_MEDICINE">Internal Medicine</option>
                        <option value="FAMILY_MEDICINE">Family Medicine</option>
                        <option value="WEIGHT_MANAGEMENT">Weight Management</option>
                        <option value="ENDOCRINOLOGY">Endocrinology</option>
                        <option value="PSYCHIATRY">Psychiatry</option>
                        <option value="DERMATOLOGY">Dermatology</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-teal-700">
                        Phone *
                      </label>
                      <input
                        type="tel"
                        required
                        className="w-full rounded-xl border-2 border-teal-200 bg-white px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl px-6 py-3 font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:from-teal-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex h-full w-full items-start justify-center overflow-y-auto bg-black/50 pt-10 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6">
              <h3 className="text-xl font-bold text-slate-800">Edit User</h3>
              <p className="mt-1 text-sm text-slate-500">Update user information</p>
            </div>

            <form onSubmit={handleEditUser} className="max-h-[70vh] overflow-y-auto p-6">
              {/* Clinic Selection (Super Admin Only) */}
              {isSuperAdmin && clinics.length > 0 && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <label className="mb-2 block text-sm font-semibold text-amber-800">
                    Assign to Clinic
                  </label>
                  <select
                    className="w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-3 outline-none transition-all focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10"
                    value={formData.clinicId}
                    onChange={(e) => setFormData({ ...formData, clinicId: e.target.value })}
                  >
                    <option value="">No clinic assigned</option>
                    {clinics
                      .filter((c) => c.status === 'ACTIVE')
                      .map((clinic) => (
                        <option key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Basic Information */}
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Email (cannot be changed)
                  </label>
                  <input
                    type="email"
                    disabled
                    className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 outline-none"
                    value={formData.email}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      minLength={8}
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Role *
                    </label>
                    <select
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-teal-400 focus:ring-4 focus:ring-teal-400/10"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
                      <option value="ADMIN">Admin</option>
                      <option value="PROVIDER">Provider</option>
                      <option value="STAFF">Staff</option>
                      <option value="SUPPORT">Support</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                  }}
                  className="rounded-xl px-6 py-3 font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:from-teal-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
