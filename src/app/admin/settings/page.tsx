'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Building2, Users, Shield, Bell, CreditCard, Globe, Save,
  ExternalLink, CheckCircle, Clock, Link2, Plus, Pencil, Trash2,
  X, Eye, EyeOff, AlertCircle, Loader2, Palette, BarChart3,
  FileText, RefreshCw, Search, ChevronDown, ChevronRight
} from 'lucide-react';

// Types
interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain: string | null;
  status: string;
  adminEmail: string;
  supportEmail: string | null;
  phone: string | null;
  timezone: string;
  address: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  } | null;
  billingPlan: string;
  patientLimit: number;
  providerLimit: number;
  storageLimit: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  buttonTextColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePlatformAccount: boolean;
  lifefileEnabled: boolean;
  _count: {
    patients: number;
    users: number;
    providers: number;
    orders: number;
  };
}

interface ClinicSettings {
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  language: string;
  sessionTimeout: number;
  requireTwoFactor: boolean;
  auditLoggingEnabled: boolean;
  autoLogoutEnabled: boolean;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  notifyOnNewPatient: boolean;
  notifyOnNewOrder: boolean;
  notifyOnPrescriptionReady: boolean;
  notifyOnRefillRequest: boolean;
}

interface User {
  id: number;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  lastLogin: string | null;
  provider?: {
    npi: string;
    licenseNumber: string;
    licenseState: string;
  };
}

interface AuditLog {
  id: number;
  createdAt: string;
  action: string;
  details: any;
  ipAddress: string | null;
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface ClinicStats {
  patients: { total: number; active: number; newThisMonth: number; limit: number; usagePercent: number };
  users: { total: number; active: number; providers: number; providerLimit: number };
  orders: { total: number; thisMonth: number; pending: number; completed: number };
  support: { totalTickets: number; openTickets: number };
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<ClinicStats | null>(null);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Form states
  const [phone, setPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [address, setAddress] = useState({
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  // User management
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    email: '', firstName: '', lastName: '', phone: '', role: 'STAFF', password: '',
    npi: '', licenseNumber: '', licenseState: '', specialty: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [userError, setUserError] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Settings form
  const [settingsForm, setSettingsForm] = useState<Partial<ClinicSettings>>({});

  // Audit log filters
  const [logFilter, setLogFilter] = useState({ action: '', page: 1 });
  const [logPagination, setLogPagination] = useState({ total: 0, totalPages: 1 });

  // Load initial data
  useEffect(() => {
    loadClinicInfo();
    loadSettings();
    loadStats();
  }, []);

  // Load users when tab changes
  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) {
      loadUsers();
    }
    if (activeTab === 'audit' && auditLogs.length === 0) {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadClinicInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/clinic/info');
      if (res.ok) {
        const data = await res.json();
        setClinic(data.clinic);
        setPhone(data.clinic.phone || '');
        setSupportEmail(data.clinic.supportEmail || '');
        if (data.clinic.address) {
          setAddress({
            address1: data.clinic.address.address1 || '',
            address2: data.clinic.address.address2 || '',
            city: data.clinic.address.city || '',
            state: data.clinic.address.state || '',
            zip: data.clinic.address.zip || '',
            country: data.clinic.address.country || 'US',
          });
        }
      }
    } catch (err) {
      console.error('Failed to load clinic info:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/clinic/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSettingsForm(data.settings);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/clinic/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/admin/clinic/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoadingLogs(true);
      const params = new URLSearchParams({
        page: logFilter.page.toString(),
        limit: '20',
      });
      if (logFilter.action) params.append('action', logFilter.action);

      const res = await fetch(`/api/admin/clinic/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs);
        setLogPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [logFilter]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab, logFilter, loadAuditLogs]);

  const saveClinicInfo = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clinic/info', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone || null,
          supportEmail: supportEmail || null,
          address: address.address1 ? address : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setClinic(data.clinic);
        alert('Contact information saved successfully!');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
      }
    } catch (err) {
      alert('Failed to save contact information');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clinic/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        alert('Settings saved successfully!');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save settings');
      }
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    setUserError('');

    try {
      const url = editingUser
        ? `/api/admin/clinic/users/${editingUser.id}`
        : '/api/admin/clinic/users';
      const method = editingUser ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...userForm,
          ...(editingUser && !userForm.password && { password: undefined }),
        }),
      });

      if (res.ok) {
        setShowUserModal(false);
        resetUserForm();
        loadUsers();
      } else {
        const err = await res.json();
        setUserError(err.error || 'Failed to save user');
      }
    } catch {
      setUserError('Failed to save user');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeactivateUser = async (userId: number) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return;
    try {
      const res = await fetch(`/api/admin/clinic/users/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        loadUsers();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to deactivate user');
      }
    } catch {
      alert('Failed to deactivate user');
    }
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || '',
      role: user.role,
      password: '',
      npi: user.provider?.npi || '',
      licenseNumber: user.provider?.licenseNumber || '',
      licenseState: user.provider?.licenseState || '',
      specialty: '',
    });
    setShowUserModal(true);
  };

  const resetUserForm = () => {
    setEditingUser(null);
    setUserForm({
      email: '', firstName: '', lastName: '', phone: '', role: 'STAFF', password: '',
      npi: '', licenseNumber: '', licenseState: '', specialty: '',
    });
    setUserError('');
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setUserForm({ ...userForm, password: pwd });
  };

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'clinic', name: 'Clinic Info', icon: Building2 },
    { id: 'users', name: 'User Management', icon: Users },
    { id: 'settings', name: 'General Settings', icon: Settings },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'branding', name: 'Branding', icon: Palette },
    { id: 'billing', name: 'Billing & Payments', icon: CreditCard },
    { id: 'integrations', name: 'Integrations', icon: Globe },
    { id: 'audit', name: 'Audit Logs', icon: FileText },
  ];

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase())
  );

  const roleOptions = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'PROVIDER', label: 'Provider' },
    { value: 'STAFF', label: 'Staff' },
    { value: 'SUPPORT', label: 'Support' },
  ];

  const stateOptions = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your clinic settings and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-emerald-50 text-emerald-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[600px]">
          {/* Overview Tab */}
          {activeTab === 'overview' && clinic && stats && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Clinic Overview</h2>
                  <p className="text-gray-600 text-sm">{clinic.name}</p>
                </div>
                <button onClick={loadStats} className="p-2 hover:bg-gray-100 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-emerald-700">{stats.patients.total}</p>
                  <p className="text-sm text-emerald-600">Total Patients</p>
                  <div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(stats.patients.usagePercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">
                    {stats.patients.usagePercent}% of {stats.patients.limit} limit
                  </p>
                </div>

                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-blue-700">{stats.users.total}</p>
                  <p className="text-sm text-blue-600">Team Members</p>
                  <p className="text-xs text-blue-500 mt-2">{stats.users.active} active this week</p>
                </div>

                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-purple-700">{stats.orders.thisMonth}</p>
                  <p className="text-sm text-purple-600">Orders This Month</p>
                  <p className="text-xs text-purple-500 mt-2">{stats.orders.pending} pending</p>
                </div>

                <div className="bg-orange-50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-orange-700">{stats.support.openTickets}</p>
                  <p className="text-sm text-orange-600">Open Tickets</p>
                  <p className="text-xs text-orange-500 mt-2">{stats.support.totalTickets} total</p>
                </div>
              </div>

              {/* Quick Info */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Clinic Details</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subdomain</span>
                      <span className="font-medium">{clinic.subdomain}.eonpro.io</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Billing Plan</span>
                      <span className="font-medium capitalize">{clinic.billingPlan}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className={`font-medium ${clinic.status === 'ACTIVE' ? 'text-emerald-600' : 'text-yellow-600'}`}>
                        {clinic.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Provider Slots</span>
                      <span className="font-medium">{stats.users.providers} / {stats.users.providerLimit}</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Integrations</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-purple-600" />
                        <span className="text-sm">Stripe Connect</span>
                      </div>
                      {clinic.stripeChargesEnabled ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Connected</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Not Connected</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">Lifefile (Pharmacy)</span>
                      </div>
                      {clinic.lifefileEnabled ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Enabled</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Disabled</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clinic Info Tab */}
          {activeTab === 'clinic' && clinic && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Clinic Information</h2>
                <p className="text-gray-600 text-sm">View and update your clinic's contact details.</p>
              </div>

              {/* Read-only fields */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
                  <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">{clinic.name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                  <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">{clinic.subdomain}.eonpro.io</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                  <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">{clinic.adminEmail}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Billing Plan</label>
                  <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 capitalize">{clinic.billingPlan}</div>
                </div>
              </div>

              {/* Editable fields */}
              <div className="pt-6 border-t">
                <h3 className="font-medium text-gray-900 mb-4">Contact Information</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder="support@clinic.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="pt-6 border-t">
                <h3 className="font-medium text-gray-900 mb-4">Business Address</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={address.address1}
                      onChange={(e) => setAddress({ ...address, address1: e.target.value })}
                      placeholder="123 Main Street"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Suite/Unit (optional)</label>
                    <input
                      type="text"
                      value={address.address2}
                      onChange={(e) => setAddress({ ...address, address2: e.target.value })}
                      placeholder="Suite 100"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <select
                        value={address.state}
                        onChange={(e) => setAddress({ ...address, state: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="">Select</option>
                        {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                      <input
                        type="text"
                        value={address.zip}
                        onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={saveClinicInfo}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
                  <p className="text-gray-600 text-sm">Manage team members who have access to your clinic.</p>
                </div>
                <button
                  onClick={() => { resetUserForm(); setShowUserModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" /> Add User
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {loadingUsers ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="font-medium text-gray-900 mb-2">{userSearch ? 'No users found' : 'No users yet'}</h3>
                  <p className="text-gray-600 mb-4">{userSearch ? 'Try a different search term.' : 'Add users to give them access.'}</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                <span className="text-emerald-700 font-medium">{u.firstName?.[0]}{u.lastName?.[0]}</span>
                              </div>
                              <div className="ml-4">
                                <div className="font-medium text-gray-900">{u.firstName} {u.lastName}</div>
                                <div className="text-sm text-gray-500">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                              u.role === 'PROVIDER' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>{u.role}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              u.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>{u.status}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => openEditUser(u)} className="text-emerald-600 hover:text-emerald-900 mr-3">
                              <Pencil className="h-4 w-4" />
                            </button>
                            {u.status === 'ACTIVE' && (
                              <button onClick={() => handleDeactivateUser(u.id)} className="text-red-600 hover:text-red-900">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* General Settings Tab */}
          {activeTab === 'settings' && settings && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">General Settings</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={settingsForm.timezone || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Chicago">America/Chicago (CST)</option>
                    <option value="America/Denver">America/Denver (MST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                  <select
                    value={settingsForm.dateFormat || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, dateFormat: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Format</label>
                  <select
                    value={settingsForm.timeFormat || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, timeFormat: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="12h">12-hour (AM/PM)</option>
                    <option value="24h">24-hour</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                  <select
                    value={settingsForm.language || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, language: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Settings
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && settings && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Security Settings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-600">Require 2FA for all admin accounts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.requireTwoFactor || false}
                      onChange={(e) => setSettingsForm({ ...settingsForm, requireTwoFactor: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Session Timeout</h3>
                    <p className="text-sm text-gray-600">Auto-logout after inactivity</p>
                  </div>
                  <select
                    value={settingsForm.sessionTimeout || 30}
                    onChange={(e) => setSettingsForm({ ...settingsForm, sessionTimeout: parseInt(e.target.value) })}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={240}>4 hours</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Audit Logging</h3>
                    <p className="text-sm text-gray-600">Track all user actions for HIPAA compliance</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.auditLoggingEnabled ?? true}
                      onChange={(e) => setSettingsForm({ ...settingsForm, auditLoggingEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Auto Logout</h3>
                    <p className="text-sm text-gray-600">Automatically log out inactive users</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.autoLogoutEnabled ?? true}
                      onChange={(e) => setSettingsForm({ ...settingsForm, autoLogoutEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Settings
                </button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && settings && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Email Notifications</h3>
                    <p className="text-sm text-gray-600">Receive email alerts for important events</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.emailNotificationsEnabled ?? true}
                      onChange={(e) => setSettingsForm({ ...settingsForm, emailNotificationsEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">SMS Notifications</h3>
                    <p className="text-sm text-gray-600">Receive text alerts for urgent matters</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.smsNotificationsEnabled ?? false}
                      onChange={(e) => setSettingsForm({ ...settingsForm, smsNotificationsEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t">
                <h3 className="font-medium text-gray-900 mb-4">Notification Events</h3>
                <div className="space-y-3">
                  {[
                    { key: 'notifyOnNewPatient', label: 'New Patient Registration' },
                    { key: 'notifyOnNewOrder', label: 'New Order Placed' },
                    { key: 'notifyOnPrescriptionReady', label: 'Prescription Ready' },
                    { key: 'notifyOnRefillRequest', label: 'Refill Request' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm text-gray-700">{label}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(settingsForm as any)[key] ?? true}
                          onChange={(e) => setSettingsForm({ ...settingsForm, [key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Notification Settings
                </button>
              </div>
            </div>
          )}

          {/* Branding Tab */}
          {activeTab === 'branding' && clinic && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
                <p className="text-gray-600 text-sm">Your clinic's brand colors and logo. Contact support for custom changes.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: clinic.primaryColor }} />
                    <span className="font-mono text-sm text-gray-600">{clinic.primaryColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: clinic.secondaryColor }} />
                    <span className="font-mono text-sm text-gray-600">{clinic.secondaryColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: clinic.accentColor }} />
                    <span className="font-mono text-sm text-gray-600">{clinic.accentColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Background Color</label>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: clinic.backgroundColor }} />
                    <span className="font-mono text-sm text-gray-600">{clinic.backgroundColor}</span>
                  </div>
                </div>
              </div>

              {clinic.logoUrl && (
                <div className="pt-6 border-t">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                  <img src={clinic.logoUrl} alt="Clinic logo" className="h-16 object-contain" />
                </div>
              )}
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && clinic && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Billing & Payments</h2>

              {/* Stripe Connect */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-6 w-6 text-white" />
                    <h3 className="text-lg font-semibold text-white">Stripe Connect</h3>
                  </div>
                  <p className="text-purple-100 text-sm mt-1">Accept payments directly to your bank account</p>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {clinic.stripePlatformAccount ? (
                        <>
                          <CheckCircle className="h-6 w-6 text-purple-500" />
                          <div>
                            <p className="font-medium">Platform Account</p>
                            <p className="text-sm text-gray-500">Using main platform Stripe account</p>
                          </div>
                        </>
                      ) : clinic.stripeChargesEnabled ? (
                        <>
                          <CheckCircle className="h-6 w-6 text-emerald-500" />
                          <div>
                            <p className="font-medium">Connected</p>
                            <p className="text-sm text-gray-500">Stripe account active and accepting payments</p>
                          </div>
                        </>
                      ) : clinic.stripeAccountId ? (
                        <>
                          <Clock className="h-6 w-6 text-yellow-500" />
                          <div>
                            <p className="font-medium">Setup Incomplete</p>
                            <p className="text-sm text-gray-500">Complete Stripe onboarding to start accepting payments</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Link2 className="h-6 w-6 text-gray-400" />
                          <div>
                            <p className="font-medium">Not Connected</p>
                            <p className="text-sm text-gray-500">Connect your Stripe account to accept payments</p>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => router.push('/admin/settings/stripe')}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      {clinic.stripeAccountId ? 'Manage' : 'Connect'}
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Plan Info */}
              <div className="border rounded-lg p-6">
                <h3 className="font-medium text-gray-900 mb-4">Current Plan</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 capitalize">{clinic.billingPlan}</p>
                    <p className="text-sm text-gray-500">
                      {clinic.patientLimit} patients • {clinic.providerLimit} providers • {clinic.storageLimit}MB storage
                    </p>
                  </div>
                  <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">
                    Upgrade Plan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && clinic && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Integrations</h2>

              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <CreditCard className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">Stripe</h3>
                        <p className="text-sm text-gray-500">Payment processing</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      clinic.stripeChargesEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {clinic.stripeChargesEnabled ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Globe className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">Lifefile</h3>
                        <p className="text-sm text-gray-500">Pharmacy integration</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      clinic.lifefileEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {clinic.lifefileEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Contact support to enable additional integrations or configure API access.
              </p>
            </div>
          )}

          {/* Audit Logs Tab */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Audit Logs</h2>
                  <p className="text-gray-600 text-sm">Track all actions for HIPAA compliance.</p>
                </div>
                <button onClick={loadAuditLogs} className="p-2 hover:bg-gray-100 rounded-lg">
                  <RefreshCw className={`h-5 w-5 text-gray-500 ${loadingLogs ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingLogs ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="font-medium text-gray-900 mb-2">No audit logs yet</h3>
                  <p className="text-gray-600">Actions will be logged here for compliance.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-4 border-b last:border-b-0 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{log.action.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-gray-500">
                              {log.user ? `${log.user.firstName} ${log.user.lastName} (${log.user.email})` : 'System'}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {log.details && (
                          <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {logPagination.totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        Page {logFilter.page} of {logPagination.totalPages} ({logPagination.total} total)
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLogFilter({ ...logFilter, page: logFilter.page - 1 })}
                          disabled={logFilter.page <= 1}
                          className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setLogFilter({ ...logFilter, page: logFilter.page + 1 })}
                          disabled={logFilter.page >= logPagination.totalPages}
                          className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {userError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {userError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={userForm.firstName}
                    onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={userForm.lastName}
                    onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={userForm.phone}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  required
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                >
                  {roleOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              {userForm.role === 'PROVIDER' && (
                <div className="p-4 bg-blue-50 rounded-lg space-y-4">
                  <h4 className="font-medium text-blue-900">Provider Credentials</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NPI *</label>
                      <input
                        type="text"
                        required
                        value={userForm.npi}
                        onChange={(e) => setUserForm({ ...userForm, npi: e.target.value })}
                        maxLength={10}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License # *</label>
                      <input
                        type="text"
                        required
                        value={userForm.licenseNumber}
                        onChange={(e) => setUserForm({ ...userForm, licenseNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                      <select
                        required
                        value={userForm.licenseState}
                        onChange={(e) => setUserForm({ ...userForm, licenseState: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Select</option>
                        {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                      <input
                        type="text"
                        value={userForm.specialty}
                        onChange={(e) => setUserForm({ ...userForm, specialty: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingUser}
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingUser ? 'Save Changes' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
