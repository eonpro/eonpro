'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  UserCog,
  Building2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  FileText,
  Calendar,
  Save,
  Plus,
  Trash2,
  Star,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Pencil,
  Users,
  Mail,
  Key,
  UserPlus,
  Unlink,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';

interface ClinicAssignment {
  id: number;
  clinicId: number;
  isPrimary: boolean;
  isActive: boolean;
  titleLine: string | null;
  deaNumber: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  createdAt: string;
  updatedAt: string;
  clinic: {
    id: number;
    name: string;
    subdomain: string;
    status: string;
    primaryColor: string | null;
    logoUrl: string | null;
  };
}

interface AvailableClinic {
  id: number;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
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
  signatureDataUrl: string | null;
  clinicId: number | null;
  primaryClinicId: number | null;
  activeClinicId: number | null;
  npiVerifiedAt: string | null;
  npiRawResponse: any;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  clinic: {
    id: number;
    name: string;
    subdomain: string;
    status: string;
  } | null;
  providerClinics: ClinicAssignment[];
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    lastLogin: string | null;
  } | null;
  _count?: {
    orders: number;
    appointments: number;
    approvedSoapNotes: number;
  };
}

interface AuditEntry {
  id: number;
  action: string;
  actorEmail: string;
  diff: any;
  createdAt: string;
}

type TabType = 'overview' | 'clinics';

export default function SuperAdminProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerId = parseInt(params.id as string);

  const [provider, setProvider] = useState<Provider | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tabs
  const initialTab = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Edit form
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    titleLine: '',
    licenseState: '',
    licenseNumber: '',
    dea: '',
  });

  // Clinic assignment
  const [availableClinics, setAvailableClinics] = useState<AvailableClinic[]>([]);
  const [showAddClinicModal, setShowAddClinicModal] = useState(false);
  const [addClinicForm, setAddClinicForm] = useState({
    clinicId: '',
    isPrimary: false,
    titleLine: '',
    deaNumber: '',
    licenseNumber: '',
    licenseState: '',
  });
  const [addingClinic, setAddingClinic] = useState(false);

  // User account management
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    sendInvite: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [unlinkingUser, setUnlinkingUser] = useState(false);

  // Password reset
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: '',
    sendNotification: false,
  });
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // NPI Verification
  const [showNpiModal, setShowNpiModal] = useState(false);
  const [verifyingNpi, setVerifyingNpi] = useState(false);
  const [npiVerificationResult, setNpiVerificationResult] = useState<{
    valid: boolean;
    basic?: {
      firstName?: string;
      lastName?: string;
      first_name?: string;
      last_name?: string;
      credential?: string;
      namePrefix?: string;
    };
    addresses?: Array<{
      addressPurpose?: string;
      addressType?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    }>;
  } | null>(null);
  const [npiError, setNpiError] = useState<string | null>(null);

  useEffect(() => {
    if (providerId) {
      fetchProvider();
    }
  }, [providerId]);

  const getAuthToken = () => {
    return localStorage.getItem('auth-token') ||
           localStorage.getItem('super_admin-token') ||
           localStorage.getItem('SUPER_ADMIN-token');
  };

  const fetchProvider = async () => {
    const token = getAuthToken();
    setError(null);

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        setProvider(data.provider);
        setAuditHistory(data.auditHistory || []);
        setEditForm({
          firstName: data.provider.firstName || '',
          lastName: data.provider.lastName || '',
          email: data.provider.email || '',
          phone: data.provider.phone || '',
          titleLine: data.provider.titleLine || '',
          licenseState: data.provider.licenseState || '',
          licenseNumber: data.provider.licenseNumber || '',
          dea: data.provider.dea || '',
        });
      } else {
        setError(data.error || 'Failed to load provider');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchClinicAssignments = async () => {
    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/clinics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        setAvailableClinics(data.availableClinics || []);
        // Refresh provider data too
        if (data.clinicAssignments) {
          setProvider(prev => prev ? {
            ...prev,
            providerClinics: data.clinicAssignments.filter((a: ClinicAssignment) => a.isActive),
          } : null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch clinic assignments:', err);
    }
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (res.ok) {
        setProvider(data.provider);
        setEditMode(false);
        setSuccessMessage('Provider updated successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to update provider');
      }
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAddClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addClinicForm.clinicId) return;

    setAddingClinic(true);
    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/clinics`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clinicId: parseInt(addClinicForm.clinicId),
          isPrimary: addClinicForm.isPrimary,
          titleLine: addClinicForm.titleLine || undefined,
          deaNumber: addClinicForm.deaNumber || undefined,
          licenseNumber: addClinicForm.licenseNumber || undefined,
          licenseState: addClinicForm.licenseState || undefined,
        }),
      });

      if (res.ok) {
        setShowAddClinicModal(false);
        setAddClinicForm({
          clinicId: '',
          isPrimary: false,
          titleLine: '',
          deaNumber: '',
          licenseNumber: '',
          licenseState: '',
        });
        fetchProvider();
        fetchClinicAssignments();
        setSuccessMessage('Provider assigned to clinic');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to assign clinic');
      }
    } catch (err) {
      setError('Failed to assign clinic');
    } finally {
      setAddingClinic(false);
    }
  };

  const handleRemoveClinic = async (clinicId: number) => {
    if (!confirm('Are you sure you want to remove this provider from this clinic?')) return;

    const token = getAuthToken();

    try {
      const res = await fetch(
        `/api/super-admin/providers/${providerId}/clinics?clinicId=${clinicId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (res.ok) {
        fetchProvider();
        fetchClinicAssignments();
        setSuccessMessage('Provider removed from clinic');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove clinic');
      }
    } catch (err) {
      setError('Failed to remove clinic');
    }
  };

  const handleSetPrimary = async (clinicId: number) => {
    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/clinics`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clinicId, isPrimary: true }),
      });

      if (res.ok) {
        fetchProvider();
        setSuccessMessage('Primary clinic updated');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update primary clinic');
      }
    } catch (err) {
      setError('Failed to update primary clinic');
    }
  };

  // User account handlers
  const handleCreateUserAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createUserForm.email || !createUserForm.password) {
      setError('Email and password are required');
      return;
    }

    if (createUserForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setCreatingUser(true);
    setError(null);
    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: createUserForm.email,
          password: createUserForm.password,
          firstName: createUserForm.firstName || provider?.firstName,
          lastName: createUserForm.lastName || provider?.lastName,
          sendInvite: createUserForm.sendInvite,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowCreateUserModal(false);
        setCreateUserForm({
          email: '',
          password: '',
          firstName: '',
          lastName: '',
          sendInvite: false,
        });
        setShowPassword(false);
        fetchProvider();
        setSuccessMessage('User account created successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to create user account');
      }
    } catch (err) {
      setError('Failed to create user account');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUnlinkUser = async () => {
    if (!confirm('Are you sure you want to unlink this user account from the provider? The user account will not be deleted, just disconnected.')) {
      return;
    }

    setUnlinkingUser(true);
    setError(null);
    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/user`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (res.ok) {
        fetchProvider();
        setSuccessMessage('User account unlinked');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to unlink user account');
      }
    } catch (err) {
      setError('Failed to unlink user account');
    } finally {
      setUnlinkingUser(false);
    }
  };

  // Initialize create user form with provider data
  const openCreateUserModal = () => {
    setCreateUserForm({
      email: provider?.email || '',
      password: '',
      firstName: provider?.firstName || '',
      lastName: provider?.lastName || '',
      sendInvite: false,
    });
    setShowPassword(false);
    setShowCreateUserModal(true);
  };

  // Generate random password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreateUserForm(f => ({ ...f, password }));
    setShowPassword(true);
  };

  // Generate random password for reset
  const generateResetPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPasswordForm(f => ({ ...f, password }));
    setShowResetPassword(true);
  };

  // Reset password handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetPasswordForm.password) {
      setError('Password is required');
      return;
    }

    if (resetPasswordForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setResettingPassword(true);
    setError(null);
    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/user`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: resetPasswordForm.password,
          sendNotification: resetPasswordForm.sendNotification,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowResetPasswordModal(false);
        setResetPasswordForm({ password: '', sendNotification: false });
        setShowResetPassword(false);
        setSuccessMessage('Password reset successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  // Open reset password modal
  const openResetPasswordModal = () => {
    setResetPasswordForm({ password: '', sendNotification: false });
    setShowResetPassword(false);
    setShowResetPasswordModal(true);
  };

  // Verify NPI with national registry (just lookup, no save)
  const handleVerifyNpi = async () => {
    if (!provider?.npi) return;

    setVerifyingNpi(true);
    setNpiError(null);
    setNpiVerificationResult(null);

    try {
      const res = await fetch('/api/providers/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ npi: provider.npi }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify NPI');
      }

      setNpiVerificationResult(data.result);
      setShowNpiModal(true);
    } catch (err) {
      setNpiError(err instanceof Error ? err.message : 'Failed to verify NPI');
      setShowNpiModal(true);
    } finally {
      setVerifyingNpi(false);
    }
  };

  // Verify NPI AND save to provider profile
  const handleVerifyAndSaveNpi = async () => {
    if (!provider?.npi) return;

    setVerifyingNpi(true);
    setNpiError(null);
    setError(null);

    const token = getAuthToken();

    try {
      const res = await fetch(`/api/super-admin/providers/${providerId}/verify-npi`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify NPI');
      }

      // Update local state with verified data
      setNpiVerificationResult(data.result);
      
      // Refresh provider data to get updated npiVerifiedAt
      await fetchProvider();
      
      setShowNpiModal(false);
      setSuccessMessage('NPI verified and saved to provider profile');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setNpiError(err instanceof Error ? err.message : 'Failed to verify NPI');
    } finally {
      setVerifyingNpi(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'clinics' && provider) {
      fetchClinicAssignments();
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  if (error && !provider) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Provider</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="text-red-600 hover:text-red-800 font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!provider) return null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-1 p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {provider.firstName} {provider.lastName}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-sm text-gray-500">NPI: {provider.npi}</span>
            {provider.npiVerifiedAt ? (
              <button
                onClick={() => setShowNpiModal(true)}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 hover:bg-green-200 transition-colors"
                title="View NPI verification details"
              >
                <ShieldCheck className="h-3 w-3" />
                Verified
              </button>
            ) : (
              <button
                onClick={handleVerifyNpi}
                disabled={verifyingNpi}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50"
                title="Verify NPI with national registry"
              >
                {verifyingNpi ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {verifyingNpi ? 'Verifying...' : 'Verify NPI'}
              </button>
            )}
            {provider.user && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                <Users className="h-3 w-3" />
                User Linked
              </span>
            )}
          </div>
        </div>
        <Link
          href="/super-admin/providers"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          View All Providers
        </Link>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {provider.providerClinics.length || (provider.clinic ? 1 : 0)}
              </p>
              <p className="text-sm text-gray-500">Clinics</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{provider._count?.orders ?? 0}</p>
              <p className="text-sm text-gray-500">Orders</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 text-purple-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{provider._count?.appointments ?? 0}</p>
              <p className="text-sm text-gray-500">Appointments</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {provider.lastLogin
                  ? new Date(provider.lastLogin).toLocaleDateString()
                  : 'Never'}
              </p>
              <p className="text-sm text-gray-500">Last Login</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-b-2 border-[#4fa77e] text-[#4fa77e]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('clinics')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'clinics'
                ? 'border-b-2 border-[#4fa77e] text-[#4fa77e]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Clinics
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Provider Information</h2>
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="inline-flex items-center gap-1 text-sm text-[#4fa77e] hover:text-[#3d8a66]"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditForm({
                        firstName: provider.firstName || '',
                        lastName: provider.lastName || '',
                        email: provider.email || '',
                        phone: provider.phone || '',
                        titleLine: provider.titleLine || '',
                        licenseState: provider.licenseState || '',
                        licenseNumber: provider.licenseNumber || '',
                        dea: provider.dea || '',
                      });
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {editMode ? (
                <form onSubmit={handleSaveProvider} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">First Name</label>
                      <input
                        type="text"
                        value={editForm.firstName}
                        onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Last Name</label>
                      <input
                        type="text"
                        value={editForm.lastName}
                        onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phone</label>
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Title Line</label>
                      <input
                        type="text"
                        value={editForm.titleLine}
                        onChange={(e) => setEditForm(f => ({ ...f, titleLine: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">License State</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={editForm.licenseState}
                        onChange={(e) => setEditForm(f => ({ ...f, licenseState: e.target.value.toUpperCase() }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">License Number</label>
                      <input
                        type="text"
                        value={editForm.licenseNumber}
                        onChange={(e) => setEditForm(f => ({ ...f, licenseNumber: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">DEA Number</label>
                    <input
                      type="text"
                      value={editForm.dea}
                      onChange={(e) => setEditForm(f => ({ ...f, dea: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                    >
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-gray-500">Name</dt>
                    <dd className="font-medium text-gray-900">{provider.firstName} {provider.lastName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">NPI</dt>
                    <dd className="font-mono text-gray-900">{provider.npi}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Email</dt>
                    <dd className="text-gray-900">{provider.email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Phone</dt>
                    <dd className="text-gray-900">{provider.phone || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Title Line</dt>
                    <dd className="text-gray-900">{provider.titleLine || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">License</dt>
                    <dd className="text-gray-900">
                      {provider.licenseNumber && provider.licenseState
                        ? `${provider.licenseNumber} (${provider.licenseState})`
                        : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">DEA Number</dt>
                    <dd className="text-gray-900">{provider.dea || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Created</dt>
                    <dd className="text-gray-900">{new Date(provider.createdAt).toLocaleDateString()}</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* User Account Management */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">User Account</h3>
                {provider.user ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    <Check className="h-3 w-3" />
                    Linked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <AlertCircle className="h-3 w-3" />
                    Not Linked
                  </span>
                )}
              </div>

              {provider.user ? (
                <>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="h-10 w-10 rounded-full bg-[#4fa77e] flex items-center justify-center text-white font-semibold">
                        {provider.user.firstName.charAt(0)}{provider.user.lastName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {provider.user.firstName} {provider.user.lastName}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{provider.user.email}</p>
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="flex justify-between">
                        <span className="text-gray-500">Role:</span>
                        <span className="text-gray-900 uppercase font-medium">{provider.user.role}</span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-gray-500">Last Login:</span>
                        <span className="text-gray-900">
                          {provider.user.lastLogin
                            ? new Date(provider.user.lastLogin).toLocaleDateString()
                            : 'Never'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={openResetPasswordModal}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                    >
                      <Key className="h-4 w-4" />
                      Reset Password
                    </button>
                    <button
                      onClick={handleUnlinkUser}
                      disabled={unlinkingUser}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {unlinkingUser ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4" />
                      )}
                      {unlinkingUser ? 'Unlinking...' : 'Unlink User Account'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center py-4">
                    <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <UserPlus className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      No user account linked
                    </p>
                    <p className="text-xs text-gray-500">
                      Create an account to enable provider login
                    </p>
                  </div>
                  <button
                    onClick={openCreateUserModal}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[#4fa77e] hover:bg-[#3d8a66] rounded-lg transition-colors"
                  >
                    <UserPlus className="h-4 w-4" />
                    Create User Account
                  </button>
                </>
              )}
            </div>

            {/* Audit History */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
              {auditHistory.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {auditHistory.slice(0, 10).map((entry) => (
                    <div key={entry.id} className="text-sm border-l-2 border-gray-200 pl-3">
                      <p className="font-medium text-gray-900">{entry.action.replace(/_/g, ' ')}</p>
                      <p className="text-gray-500">by {entry.actorEmail}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No activity recorded</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clinics' && (
        <div className="space-y-6">
          {/* Clinic Assignments */}
          <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Clinic Assignments</h2>
              <button
                onClick={() => setShowAddClinicModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d8a66]"
              >
                <Plus className="h-4 w-4" />
                Add Clinic
              </button>
            </div>

            {provider.providerClinics.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {provider.providerClinics.map((assignment) => (
                  <div key={assignment.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
                    <div
                      className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ backgroundColor: assignment.clinic.primaryColor || '#4fa77e' }}
                    >
                      {assignment.clinic.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{assignment.clinic.name}</p>
                        {assignment.isPrimary && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                            <Star className="h-3 w-3" />
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{assignment.clinic.subdomain}.eonpro.io</p>
                      {assignment.titleLine && (
                        <p className="text-xs text-gray-400 mt-1">
                          Title: {assignment.titleLine}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!assignment.isPrimary && (
                        <button
                          onClick={() => handleSetPrimary(assignment.clinicId)}
                          className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                          title="Set as primary"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveClinic(assignment.clinicId)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove from clinic"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : provider.clinic ? (
              <div className="p-4">
                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-lg">
                  <Building2 className="h-8 w-8 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">{provider.clinic.name}</p>
                    <p className="text-sm text-gray-500">Legacy assignment (clinicId: {provider.clinicId})</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Consider migrating to the new clinic assignment system
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">This provider is not assigned to any clinics</p>
                <button
                  onClick={() => setShowAddClinicModal(true)}
                  className="text-[#4fa77e] hover:text-[#3d8a66] font-medium"
                >
                  Assign to a clinic
                </button>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Multi-Clinic Provider</p>
                <p className="text-sm text-blue-700 mt-1">
                  Providers can be assigned to multiple clinics with different credentials per clinic.
                  The primary clinic determines which clinic the provider sees by default when logging in.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Clinic Modal */}
      {showAddClinicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add to Clinic</h2>
              <button
                onClick={() => setShowAddClinicModal(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddClinic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Clinic *</label>
                {availableClinics.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    {availableClinics.map((clinic) => (
                      <button
                        key={clinic.id}
                        type="button"
                        onClick={() => setAddClinicForm(f => ({ ...f, clinicId: clinic.id.toString() }))}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                          addClinicForm.clinicId === clinic.id.toString() ? 'bg-[#4fa77e]/5 border-l-4 border-[#4fa77e]' : ''
                        }`}
                      >
                        <div
                          className="h-8 w-8 rounded flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: clinic.primaryColor || '#4fa77e' }}
                        >
                          {clinic.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{clinic.name}</p>
                          <p className="text-xs text-gray-500">{clinic.subdomain}.eonpro.io</p>
                        </div>
                        {addClinicForm.clinicId === clinic.id.toString() && (
                          <Check className="h-5 w-5 text-[#4fa77e] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    Provider is already assigned to all available clinics
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPrimary"
                  checked={addClinicForm.isPrimary}
                  onChange={(e) => setAddClinicForm(f => ({ ...f, isPrimary: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
                />
                <label htmlFor="isPrimary" className="text-sm text-gray-700">
                  Set as primary clinic
                </label>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Clinic-Specific Credentials (Optional)
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500">Title Line</label>
                    <input
                      type="text"
                      value={addClinicForm.titleLine}
                      onChange={(e) => setAddClinicForm(f => ({ ...f, titleLine: e.target.value }))}
                      placeholder="e.g., MD, Internal Medicine"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500">DEA Number</label>
                      <input
                        type="text"
                        value={addClinicForm.deaNumber}
                        onChange={(e) => setAddClinicForm(f => ({ ...f, deaNumber: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500">License State</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={addClinicForm.licenseState}
                        onChange={(e) => setAddClinicForm(f => ({ ...f, licenseState: e.target.value.toUpperCase() }))}
                        placeholder="TX"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">License Number</label>
                    <input
                      type="text"
                      value={addClinicForm.licenseNumber}
                      onChange={(e) => setAddClinicForm(f => ({ ...f, licenseNumber: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddClinicModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!addClinicForm.clinicId || addingClinic}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {addingClinic ? 'Adding...' : 'Add to Clinic'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NPI Verification Modal */}
      {showNpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">NPI Verification</h2>
              <button
                onClick={() => {
                  setShowNpiModal(false);
                  setNpiError(null);
                  setNpiVerificationResult(null);
                }}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* NPI Number */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-gray-500">NPI Number</p>
                <p className="font-mono text-lg font-semibold text-gray-900">{provider?.npi}</p>
              </div>
              <a
                href={`https://npiregistry.cms.hhs.gov/provider-view/${provider?.npi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[#4fa77e] hover:text-[#3d8a66]"
              >
                View on CMS
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Error State */}
            {npiError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-800">Verification Failed</p>
                    <p className="text-sm text-red-700 mt-1">{npiError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Already Verified State */}
            {provider?.npiVerifiedAt && !npiVerificationResult && !npiError && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-4">
                <div className="flex gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800">NPI Verified</p>
                    <p className="text-sm text-green-700 mt-1">
                      Verified on {new Date(provider.npiVerifiedAt).toLocaleDateString()} at {new Date(provider.npiVerifiedAt).toLocaleTimeString()}
                    </p>
                    {provider.npiRawResponse && (
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs text-green-600 font-medium mb-2">Registry Information:</p>
                        <div className="space-y-1 text-sm">
                          {provider.npiRawResponse.basic && (
                            <>
                              <p>
                                <span className="text-green-600">Name:</span>{' '}
                                <span className="text-green-800">
                                  {provider.npiRawResponse.basic.namePrefix && `${provider.npiRawResponse.basic.namePrefix} `}
                                  {provider.npiRawResponse.basic.firstName || provider.npiRawResponse.basic.first_name}{' '}
                                  {provider.npiRawResponse.basic.lastName || provider.npiRawResponse.basic.last_name}
                                  {provider.npiRawResponse.basic.credential && `, ${provider.npiRawResponse.basic.credential}`}
                                </span>
                              </p>
                            </>
                          )}
                          {provider.npiRawResponse.addresses?.[0] && (
                            <p>
                              <span className="text-green-600">Location:</span>{' '}
                              <span className="text-green-800">
                                {provider.npiRawResponse.addresses[0].city}, {provider.npiRawResponse.addresses[0].state} {provider.npiRawResponse.addresses[0].postalCode}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Fresh Verification Result */}
            {npiVerificationResult && (
              <div className={`rounded-lg ${npiVerificationResult.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border p-4 mb-4`}>
                <div className="flex gap-3">
                  {npiVerificationResult.valid ? (
                    <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${npiVerificationResult.valid ? 'text-green-800' : 'text-red-800'}`}>
                      {npiVerificationResult.valid ? 'Valid NPI - Provider Found' : 'Invalid NPI'}
                    </p>
                    {npiVerificationResult.basic && (
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-gray-500 text-xs">Registry Name</p>
                            <p className="text-gray-900 font-medium">
                              {npiVerificationResult.basic.namePrefix && `${npiVerificationResult.basic.namePrefix} `}
                              {npiVerificationResult.basic.firstName || npiVerificationResult.basic.first_name}{' '}
                              {npiVerificationResult.basic.lastName || npiVerificationResult.basic.last_name}
                            </p>
                          </div>
                          {npiVerificationResult.basic.credential && (
                            <div>
                              <p className="text-gray-500 text-xs">Credential</p>
                              <p className="text-gray-900 font-medium">{npiVerificationResult.basic.credential}</p>
                            </div>
                          )}
                        </div>

                        {/* Compare names */}
                        {provider && (
                          <div className="mt-2 p-2 bg-white/50 rounded-lg">
                            <p className="text-xs text-gray-500 mb-1">Name Comparison:</p>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700">System: <strong>{provider.firstName} {provider.lastName}</strong></span>
                              {(npiVerificationResult.basic.firstName || npiVerificationResult.basic.first_name)?.toLowerCase() === provider.firstName.toLowerCase() &&
                               (npiVerificationResult.basic.lastName || npiVerificationResult.basic.last_name)?.toLowerCase() === provider.lastName.toLowerCase() ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-700">
                                  <Check className="h-3 w-3" />
                                  Match
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                                  <AlertCircle className="h-3 w-3" />
                                  Different
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {npiVerificationResult.addresses && npiVerificationResult.addresses.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 font-medium mb-2">Practice Locations:</p>
                        <div className="space-y-2">
                          {npiVerificationResult.addresses.map((addr, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="inline-block px-1.5 py-0.5 text-xs bg-gray-200 text-gray-700 rounded mr-2">
                                {addr.addressPurpose}
                              </span>
                              {addr.city}, {addr.state} {addr.postalCode}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowNpiModal(false);
                  setNpiError(null);
                  setNpiVerificationResult(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {!provider?.npiVerifiedAt && (
                <button
                  type="button"
                  onClick={handleVerifyAndSaveNpi}
                  disabled={verifyingNpi}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {verifyingNpi ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Save as Verified
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create User Account Modal */}
      {showCreateUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create User Account</h2>
              <button
                onClick={() => setShowCreateUserModal(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Create a login account for <strong>{provider?.firstName} {provider?.lastName}</strong> so they can access the system.
            </p>

            <form onSubmit={handleCreateUserAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="provider@clinic.com"
                    required
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This will be used for login
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={createUserForm.password}
                      onChange={(e) => setCreateUserForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Minimum 8 characters"
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-gray-300 pl-10 pr-10 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="px-3 py-2 text-sm font-medium text-[#4fa77e] bg-[#4fa77e]/10 hover:bg-[#4fa77e]/20 rounded-lg whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={createUserForm.firstName}
                    onChange={(e) => setCreateUserForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder={provider?.firstName || 'First name'}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={createUserForm.lastName}
                    onChange={(e) => setCreateUserForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder={provider?.lastName || 'Last name'}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              {/* Info box about clinic assignment */}
              {provider && provider.providerClinics.length > 0 && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Clinic Access:</strong> The user will automatically have access to:
                  </p>
                  <ul className="text-sm text-blue-700 mt-1 space-y-0.5">
                    {provider.providerClinics.slice(0, 3).map((pc) => (
                      <li key={pc.clinicId} className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {pc.clinic.name}
                        {pc.isPrimary && <span className="text-xs">(Primary)</span>}
                      </li>
                    ))}
                    {provider.providerClinics.length > 3 && (
                      <li className="text-xs text-blue-600">
                        +{provider.providerClinics.length - 3} more clinic(s)
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Warning if no clinics assigned */}
              {provider && provider.providerClinics.length === 0 && !provider.clinic && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">No Clinic Assigned</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        This provider is not assigned to any clinic. Consider assigning them to a clinic first.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser || !createUserForm.email || !createUserForm.password}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creatingUser ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Create Account
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Reset Password</h2>
              <button
                onClick={() => setShowResetPasswordModal(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Set a new password for <strong>{provider?.user?.firstName} {provider?.user?.lastName}</strong> ({provider?.user?.email}).
            </p>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <strong>Important:</strong> The user will need to use this new password to login.
                  Consider sending them the credentials securely.
                </div>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={resetPasswordForm.password}
                      onChange={(e) => setResetPasswordForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Minimum 8 characters"
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-gray-300 pl-10 pr-10 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generateResetPassword}
                    className="px-3 py-2 text-sm font-medium text-[#4fa77e] bg-[#4fa77e]/10 hover:bg-[#4fa77e]/20 rounded-lg whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetPasswordModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword || !resetPasswordForm.password}
                  className="flex-1 rounded-lg bg-amber-600 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resettingPassword ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4" />
                      Reset Password
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
