'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Activity,
  Clock,
  Wifi,
  WifiOff,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Eye,
  Filter,
  Monitor,
  Smartphone,
  Globe,
  Calendar,
  TrendingUp,
  UserPlus,
} from 'lucide-react';

interface UserActivity {
  id: number;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  clinicId: number | null;
  clinic: { id: number; name: string; subdomain: string | null } | null;
  providerId: number | null;
  provider: { id: number; firstName: string; lastName: string } | null;
  isOnline: boolean;
  currentSession: {
    ipAddress: string;
    userAgent: string;
    startedAt: string;
    lastActivity: string;
    durationMinutes: number | null;
  } | null;
  totalSessions: number;
  totalActions: number;
}

interface ActivityLog {
  id: number;
  userId: number;
  action: string;
  details: any;
  ipAddress: string | null;
  createdAt: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

interface Stats {
  totalUsers: number;
  activeUsers: number;
  onlineUsers: number;
  newUsersThisMonth: number;
}

export default function UserActivityPage() {
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('lastLogin');
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // View mode
  const [viewMode, setViewMode] = useState<'users' | 'activity'>('users');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        filter,
        search,
        sortBy,
        sortOrder,
      });

      const response = await fetch(`/api/super-admin/user-activity?${params}`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.ok) {
        setUsers(data.users);
        setRecentActivity(data.recentActivity);
        setStats(data.stats);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      } else {
        setError(data.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Failed to fetch user activity');
    } finally {
      setLoading(false);
    }
  }, [page, filter, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleForceLogout = async (userId: number) => {
    if (!confirm('Are you sure you want to force logout this user?')) return;

    try {
      const response = await fetch('/api/super-admin/user-activity', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_logout', userId }),
      });

      const data = await response.json();

      if (data.ok) {
        fetchData();
      } else {
        alert(data.error || 'Failed to logout user');
      }
    } catch (err) {
      alert('Failed to logout user');
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return '-';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
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
    return date.toLocaleDateString();
  };

  const getDeviceIcon = (userAgent: string) => {
    if (!userAgent) return <Globe className="h-4 w-4" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      SUPER_ADMIN: 'bg-purple-100 text-purple-800',
      ADMIN: 'bg-blue-100 text-blue-800',
      PROVIDER: 'bg-green-100 text-green-800',
      STAFF: 'bg-gray-100 text-gray-800',
      PATIENT: 'bg-yellow-100 text-yellow-800',
      SUPPORT: 'bg-orange-100 text-orange-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Activity Monitor</h1>
          <p className="text-gray-500">Track user sessions, logins, and activity in real-time</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-blue-100 p-3">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
                <p className="text-sm text-gray-500">Total Users</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-green-100 p-3">
                <Wifi className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.onlineUsers}</p>
                <p className="text-sm text-gray-500">Online Now</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-purple-100 p-3">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.activeUsers}</p>
                <p className="text-sm text-gray-500">Active (30 days)</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-orange-100 p-3">
                <UserPlus className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.newUsersThisMonth}</p>
                <p className="text-sm text-gray-500">New This Month</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Toggle & Filters */}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="flex items-center justify-between gap-4">
          {/* View Toggle */}
          <div className="flex overflow-hidden rounded-lg border">
            <button
              onClick={() => setViewMode('users')}
              className={`px-4 py-2 text-sm font-medium ${
                viewMode === 'users'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Users className="mr-2 inline h-4 w-4" />
              Users
            </button>
            <button
              onClick={() => setViewMode('activity')}
              className={`px-4 py-2 text-sm font-medium ${
                viewMode === 'activity'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Activity className="mr-2 inline h-4 w-4" />
              Activity Log
            </button>
          </div>

          {viewMode === 'users' && (
            <div className="flex flex-1 items-center gap-4">
              {/* Search */}
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border py-2 pl-10 pr-4 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Filter */}
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Users</option>
                <option value="online">Online Now</option>
                <option value="recent">Active (30 days)</option>
                <option value="never">Never Logged In</option>
              </select>

              {/* Sort */}
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [by, order] = e.target.value.split('-');
                  setSortBy(by);
                  setSortOrder(order);
                }}
                className="rounded-lg border px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="lastLogin-desc">Last Login (Recent)</option>
                <option value="lastLogin-asc">Last Login (Oldest)</option>
                <option value="createdAt-desc">Created (Recent)</option>
                <option value="createdAt-asc">Created (Oldest)</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {/* Users Table */}
      {viewMode === 'users' && (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Clinic
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Session
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading && !users.length ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                      <p className="mt-2 text-gray-500">Loading...</p>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className={user.isOnline ? 'bg-green-50' : ''}>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2">
                          {user.isOnline ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <span className="relative flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"></span>
                              </span>
                              Online
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-gray-400">
                              <WifiOff className="h-4 w-4" />
                              Offline
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                          {user.provider && (
                            <div className="text-xs text-emerald-600">
                              Provider: {user.provider.firstName} {user.provider.lastName}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${getRoleBadge(user.role)}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {user.clinic?.name || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm">
                          <div className="text-gray-900">{formatTimeAgo(user.lastLogin)}</div>
                          {user.lastLogin && (
                            <div className="text-xs text-gray-500">
                              {new Date(user.lastLogin).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {user.currentSession ? (
                          <div className="text-sm">
                            <div className="flex items-center gap-2 text-gray-900">
                              {getDeviceIcon(user.currentSession.userAgent)}
                              <span>{formatDuration(user.currentSession.durationMinutes)}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {user.currentSession.ipAddress}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2">
                          {user.isOnline && (
                            <button
                              onClick={() => handleForceLogout(user.id)}
                              className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                              title="Force Logout"
                            >
                              <LogOut className="h-4 w-4" />
                            </button>
                          )}
                          <Link
                            href={`/super-admin/users/${user.id}/clinics`}
                            prefetch={false}
                            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                            title="Manage Clinics"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-4">
              <div className="text-sm text-gray-500">
                Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, total)} of {total} users
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-4 py-2 text-sm">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Log */}
      {viewMode === 'activity' && (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b p-4">
            <h3 className="font-semibold text-gray-900">Recent Activity (Last 100 Actions)</h3>
          </div>
          <div className="max-h-[600px] divide-y divide-gray-100 overflow-y-auto">
            {recentActivity.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No recent activity</div>
            ) : (
              recentActivity.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-lg p-2 ${
                          log.action === 'LOGIN'
                            ? 'bg-green-100 text-green-600'
                            : log.action === 'LOGOUT'
                              ? 'bg-gray-100 text-gray-600'
                              : log.action === 'FORCE_LOGOUT'
                                ? 'bg-red-100 text-red-600'
                                : 'bg-blue-100 text-blue-600'
                        }`}
                      >
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {log.user.firstName} {log.user.lastName}
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-xs ${getRoleBadge(log.user.role)}`}
                          >
                            {log.user.role}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500">{log.user.email}</div>
                        <div className="mt-1 text-sm">
                          <span className="font-medium">{log.action}</span>
                          {log.ipAddress && (
                            <span className="ml-2 text-gray-400">from {log.ipAddress}</span>
                          )}
                        </div>
                        {log.details && typeof log.details === 'object' && (
                          <div className="mt-1 text-xs text-gray-400">
                            {JSON.stringify(log.details)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">{formatTimeAgo(log.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
