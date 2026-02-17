'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Star,
  RefreshCw,
  Search,
  Clock,
  Wifi,
  WifiOff,
  Globe,
  Monitor,
  Smartphone,
  Calendar,
  Activity,
  LogIn,
  MapPin,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  status: string;
}

interface UserClinic {
  id: number;
  clinicId: number;
  role: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  clinic: Clinic;
}

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface SessionData {
  isOnline: boolean;
  sessionId: string;
  startedAt: string;
  lastActivity: string;
  ipAddress: string;
  userAgent: string;
  durationMinutes: number;
  durationFormatted: string;
}

interface LoginHistoryEntry {
  id: number;
  createdAt: string;
  ipAddress: string;
  details: any;
}

interface UserStats {
  totalLogins: number;
  lastLogin: string | null;
  accountCreated: string;
}

export default function UserClinicsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = parseInt(params.id as string);

  const [user, setUser] = useState<User | null>(null);
  const [userClinics, setUserClinics] = useState<UserClinic[]>([]);
  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (userId) {
      fetchUserClinics();
      fetchAllClinics();
    }
  }, [userId]);

  // Auto-refresh session data every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchUserClinics, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const fetchUserClinics = async () => {
    try {
      const response = await apiFetch(`/api/super-admin/users/${userId}/clinics`);

      if (response.ok) {
        const data = await response.json();
        setUserClinics(data.userClinics || []);
        setSession(data.session || null);
        setLoginHistory(data.loginHistory || []);
        setStats(data.stats || null);

        if (data.user) {
          setUser(data.user);
        }

        if ((!data.userClinics || data.userClinics.length === 0) && data.legacyClinic) {
          setUserClinics([
            {
              id: 0,
              clinicId: data.legacyClinic.id,
              role: data.user?.role || 'staff',
              isPrimary: true,
              isActive: true,
              createdAt: new Date().toISOString(),
              clinic: data.legacyClinic,
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Error fetching user clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllClinics = async () => {
    try {
      const response = await apiFetch('/api/super-admin/clinics');

      if (response.ok) {
        const data = await response.json();
        setAllClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Error fetching clinics:', error);
    }
  };

  const handleAddToClinic = async () => {
    if (!selectedClinicId || !selectedRole) {
      alert('Please select a clinic and role');
      return;
    }

    setAdding(true);
    try {
      const response = await apiFetch(`/api/super-admin/users/${userId}/clinics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: selectedClinicId,
          role: selectedRole,
          isPrimary: userClinics.length === 0,
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        setSelectedClinicId(null);
        setSelectedRole('');
        fetchUserClinics();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add user to clinic');
      }
    } catch (error) {
      console.error('Error adding to clinic:', error);
      alert('Failed to add user to clinic');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveFromClinic = async (clinicId: number) => {
    if (!confirm('Are you sure you want to remove this user from this clinic?')) return;

    try {
      const response = await apiFetch(
        `/api/super-admin/users/${userId}/clinics?clinicId=${clinicId}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        fetchUserClinics();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to remove user from clinic');
      }
    } catch (error) {
      console.error('Error removing from clinic:', error);
      alert('Failed to remove user from clinic');
    }
  };

  const handleSetPrimary = async (clinicId: number) => {
    try {
      const response = await apiFetch(`/api/super-admin/users/${userId}/clinics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          isPrimary: true,
          role: userClinics.find((uc) => uc.clinicId === clinicId)?.role,
        }),
      });

      if (response.ok) {
        fetchUserClinics();
      }
    } catch (error) {
      console.error('Error setting primary clinic:', error);
    }
  };

  const getDeviceIcon = (userAgent: string) => {
    if (!userAgent) return <Globe className="h-4 w-4" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      SUPER_ADMIN: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
      ADMIN: 'bg-blue-100 text-blue-800',
      PROVIDER: 'bg-green-100 text-green-800',
      STAFF: 'bg-gray-100 text-gray-800',
      SUPPORT: 'bg-orange-100 text-orange-800',
    };
    return colors[role?.toUpperCase()] || 'bg-gray-100 text-gray-800';
  };

  const availableClinics = allClinics
    .filter((clinic) => !userClinics.some((uc) => uc.clinicId === clinic.id))
    .filter(
      (clinic) =>
        normalizedIncludes(clinic.name, searchTerm) ||
        normalizedIncludes(clinic.subdomain, searchTerm)
    );

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: '#efece7' }}
      >
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#efece7' }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-2 transition-colors hover:bg-white/50"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">User Session & Clinics</h1>
            <p className="text-gray-600">View session details and manage clinic access</p>
          </div>
          <button
            onClick={fetchUserClinics}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-white/50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* User Card + Session Status */}
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-2xl font-bold text-emerald-700">
                    {user
                      ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`
                      : 'U'}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {user ? `${user.firstName} ${user.lastName}` : `User #${userId}`}
                  </h2>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeColor(user?.role || '')}`}
                    >
                      {user?.role}
                    </span>
                    {session?.isOnline ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                        </span>
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        <WifiOff className="h-3 w-3" />
                        Offline
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Add to Clinic
              </button>
            </div>
          </div>

          {/* Session Details - Only show if online */}
          {session?.isOnline && (
            <div className="border-t border-gray-100 bg-green-50/50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Activity className="h-4 w-4 text-green-600" />
                Active Session
              </h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-gray-100 bg-white p-3">
                  <p className="mb-1 text-xs text-gray-500">Logged In At</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(session.startedAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(session.startedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-3">
                  <p className="mb-1 text-xs text-gray-500">Session Duration</p>
                  <p className="text-sm font-medium text-green-600">{session.durationFormatted}</p>
                  <p className="text-xs text-gray-500">Active session</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-3">
                  <p className="mb-1 text-xs text-gray-500">Last Activity</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatTimeAgo(session.lastActivity)}
                  </p>
                  <p className="text-xs text-gray-500">Recent action</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-3">
                  <p className="mb-1 text-xs text-gray-500">Device / IP</p>
                  <div className="flex items-center gap-1.5">
                    {getDeviceIcon(session.userAgent)}
                    <span className="truncate text-sm font-medium text-gray-900">
                      {session.ipAddress || 'Unknown'}
                    </span>
                  </div>
                  <p className="truncate text-xs text-gray-500" title={session.userAgent}>
                    {session.userAgent?.split(' ')[0] || 'Unknown browser'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Account Stats */}
          {stats && (
            <div className="border-t border-gray-100 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Calendar className="h-4 w-4 text-gray-500" />
                Account Statistics
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalLogins}</p>
                  <p className="text-xs text-gray-500">Total Logins</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {stats.lastLogin ? formatDate(stats.lastLogin) : 'Never'}
                  </p>
                  <p className="text-xs text-gray-500">Last Login</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {stats.accountCreated ? formatDate(stats.accountCreated) : '-'}
                  </p>
                  <p className="text-xs text-gray-500">Account Created</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Clinic Assignments */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <Building2 className="h-4 w-4 text-gray-500" />
                Assigned Clinics ({userClinics.length})
              </h3>
            </div>

            {userClinics.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No clinic assignments</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Add to a clinic
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {userClinics.map((uc) => (
                  <div
                    key={uc.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50/50"
                  >
                    <div className="flex items-center gap-3">
                      {/* Favicon/Icon - small square */}
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: uc.clinic.primaryColor || '#3B82F6' }}
                      >
                        {uc.clinic.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {uc.clinic.name}
                          </p>
                          {uc.isPrimary && (
                            <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                              <Star className="h-3 w-3" />
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{uc.clinic.subdomain}.eonpro.io</p>
                        <p className="text-xs text-gray-400">
                          Role: <span className="font-medium">{uc.role}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!uc.isPrimary && (
                        <button
                          onClick={() => handleSetPrimary(uc.clinicId)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                          title="Set as primary"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveFromClinic(uc.clinicId)}
                        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Login History */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <LogIn className="h-4 w-4 text-gray-500" />
                Recent Login History
              </h3>
            </div>

            {loginHistory.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No login history</p>
              </div>
            ) : (
              <div className="max-h-[400px] divide-y divide-gray-50 overflow-y-auto">
                {loginHistory.map((entry, index) => (
                  <div key={entry.id} className="flex items-center gap-3 p-3 hover:bg-gray-50/50">
                    <div
                      className={`rounded-lg p-2 ${index === 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}
                    >
                      <LogIn className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(entry.createdAt)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MapPin className="h-3 w-3" />
                        <span>{entry.ipAddress || 'Unknown IP'}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{formatTimeAgo(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50/80 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">Multi-Clinic Access</p>
              <p className="mt-1 text-sm text-blue-700">
                Users assigned to multiple clinics can switch between them using the clinic switcher
                in the header. They will see different data based on the active clinic.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add to Clinic Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Add User to Clinic</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clinics..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Select Clinic
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {availableClinics.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      {searchTerm
                        ? 'No matching clinics found'
                        : 'User is already assigned to all clinics'}
                    </div>
                  ) : (
                    availableClinics.map((clinic) => (
                      <button
                        key={clinic.id}
                        onClick={() => setSelectedClinicId(clinic.id)}
                        className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50 ${
                          selectedClinicId === clinic.id
                            ? 'border-l-4 border-emerald-500 bg-emerald-50'
                            : ''
                        }`}
                      >
                        <div
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-sm font-bold text-white"
                          style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
                        >
                          {clinic.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {clinic.name}
                          </p>
                          <p className="text-xs text-gray-500">{clinic.subdomain}.eonpro.io</p>
                        </div>
                        {selectedClinicId === clinic.id && (
                          <Check className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Role in this Clinic
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select a role</option>
                  <option value="ADMIN">Admin - Full clinic access</option>
                  <option value="PROVIDER">Provider - Patient care access</option>
                  <option value="STAFF">Staff - Limited administrative access</option>
                  <option value="SUPPORT">Support - Customer service access</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-200 p-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToClinic}
                disabled={!selectedClinicId || !selectedRole || adding}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adding ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add to Clinic
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
