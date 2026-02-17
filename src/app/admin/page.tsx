'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import { normalizedIncludes } from '@/lib/utils/search';
import {
  Search,
  Clock,
  UserPlus,
  CreditCard,
  RefreshCw,
  FileText,
  Building2,
  TrendingUp,
  Users,
  Pill,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { AdminDashboardSkeleton } from '@/components/dashboards/AdminDashboardSkeleton';
import { USMapChart } from '@/components/dashboards/USMapChart';

// Helper to detect if data looks like encrypted PHI (base64:base64:base64 format)
const isEncryptedData = (value: string | null | undefined): boolean => {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
};

// Safely display contact info - hide encrypted data
const displayContact = (value: string | null | undefined): string => {
  if (!value) return '-';
  if (isEncryptedData(value)) return '(encrypted)';
  return value;
};

interface PatientIntake {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  createdAt: string;
}

interface DashboardStats {
  totalIntakes: number;
  totalPatients: number;
  totalPrescriptions: number;
  conversionRate: number;
  totalRevenue: number;
  recurringRevenue: number;
  recentIntakes: number;
  recentPrescriptions: number;
  recentRevenue: number;
}

interface ClinicInfo {
  id: number;
  name: string;
  subdomain?: string;
  logoUrl?: string | null;
}

export default function AdminPage() {
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);
  const [activeClinic, setActiveClinic] = useState<ClinicInfo | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [systemStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentIntakes, setRecentIntakes] = useState<PatientIntake[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geoData, setGeoData] = useState<{
    stateData: Record<string, { total: number; clinics: Array<{ clinicId: number; clinicName: string; color: string; count: number }> }>;
    clinics: Array<{ id: number; name: string; color: string; totalPatients: number }>;
  } | null>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  // Hydration-safe: set currentTime only on client
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsed = JSON.parse(user) as Record<string, unknown>;
        // Super admin has no clinic — redirect to their dedicated dashboard
        if (typeof parsed.role === 'string' && parsed.role.toLowerCase() === 'super_admin') {
          window.location.href = '/super-admin';
          return;
        }
        setUserData(parsed);
      } catch {
        // ignore
      }
    }
    const clinicsStr = localStorage.getItem('clinics');
    const activeClinicIdStr = localStorage.getItem('activeClinicId');
    if (clinicsStr && activeClinicIdStr) {
      try {
        const clinics = JSON.parse(clinicsStr) as ClinicInfo[];
        const activeClinicId = parseInt(activeClinicIdStr, 10);
        const clinic = clinics.find((c) => c.id === activeClinicId);
        if (clinic) setActiveClinic(clinic);
      } catch {
        // ignore
      }
    }
  }, []);

  // Single API call for dashboard
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/admin/dashboard');
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError((err.error as string) || 'Failed to load dashboard');
          setStats(defaultStats());
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setStats(data.stats ?? defaultStats());
        setRecentIntakes(data.recentIntakes ?? []);
      } catch (e: unknown) {
        if (cancelled) return;
        if ((e as { isAuthError?: boolean }).isAuthError) return;
        setError('Failed to connect');
        setStats(defaultStats());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch geographic data for the map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/admin/dashboard/geo');
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setGeoData(data);
        }
      } catch {
        // Non-critical - map just won't show data
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function defaultStats(): DashboardStats {
    return {
      totalIntakes: 0,
      totalPatients: 0,
      totalPrescriptions: 0,
      conversionRate: 0,
      totalRevenue: 0,
      recurringRevenue: 0,
      recentIntakes: 0,
      recentPrescriptions: 0,
      recentRevenue: 0,
    };
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const formatGender = (gender: string) => {
    if (!gender) return '';
    const g = gender.toLowerCase().trim();
    if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
    if (g === 'm' || g === 'male' || g === 'man') return 'Male';
    return gender;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const displayStats = stats ?? defaultStats();
  const filteredIntakes = recentIntakes
    .filter((patient) => {
      if (!searchQuery) return true;
      return (
        normalizedIncludes(patient.firstName || '', searchQuery) ||
        normalizedIncludes(patient.lastName || '', searchQuery) ||
        normalizedIncludes(patient.email || '', searchQuery) ||
        normalizedIncludes(patient.phone || '', searchQuery) ||
        normalizedIncludes(patient.id?.toString() || '', searchQuery)
      );
    })
    .slice(0, 8);

  const displayName =
    (userData?.firstName as string) ||
    (userData?.email as string)?.split('@')[0] ||
    'there';

  // Immediate shell: show skeleton until data arrives (no blocking)
  if (!stats) {
    return <AdminDashboardSkeleton />;
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          {/* Clinic Badge */}
          {activeClinic && (
            <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5">
              <Building2 className="h-4 w-4 text-[#4fa77e]" />
              <span className="text-sm font-medium text-gray-700">{activeClinic.name}</span>
            </div>
          )}
          <div className="mb-1 flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                systemStatus === 'healthy'
                  ? 'bg-[#4fa77e]'
                  : systemStatus === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              SYSTEM: {systemStatus.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-800" suppressHydrationWarning>
            {currentTime?.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }) ?? ''}
          </p>
          <p className="text-sm text-gray-600" suppressHydrationWarning>
            {currentTime
              ?.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
              .toLowerCase() ?? ''}
          </p>
        </div>

        <div className="relative w-96">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patients"
            className="w-full rounded-full border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm transition-all focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>
      </div>

      {/* Welcome */}
      <h1 className="mb-6 text-3xl font-semibold text-gray-900">
        Welcome, <span className="text-gray-900">{displayName}</span>
      </h1>

      {/* Stats Cards - Row 1: Counts */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
            <UserPlus className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{displayStats.totalIntakes}</p>
            <p className="text-sm text-gray-500">Total Intakes</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4fa77e]/10">
            <Users className="h-6 w-6 text-[#4fa77e]" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{displayStats.totalPatients}</p>
            <p className="text-sm text-gray-500">Converted Patients</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-primary-light)]">
            <Pill className="h-6 w-6 text-[var(--brand-primary)]" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{displayStats.totalPrescriptions}</p>
            <p className="text-sm text-gray-500">Total Prescriptions</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <TrendingUp className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{displayStats.conversionRate}%</p>
            <p className="text-sm text-gray-500">Conversion Rate</p>
          </div>
        </div>
      </div>

      {/* Stats Cards - Row 2: Revenue */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
            <CreditCard className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(displayStats.totalRevenue)}</p>
            <p className="text-sm text-gray-500">Total Revenue</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <RefreshCw className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(displayStats.recurringRevenue)}
            </p>
            <p className="text-sm text-gray-500">Monthly Recurring</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10">
            <FileText className="h-6 w-6 text-rose-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-green-600">
              {formatCurrency(displayStats.recentRevenue)}
            </p>
            <p className="text-sm text-gray-500">Revenue (24h)</p>
          </div>
        </div>
      </div>

      {/* US Map - Client Distribution */}
      <div className="mb-8">
        <USMapChart
          stateData={geoData?.stateData ?? {}}
          clinics={geoData?.clinics ?? []}
          isLoading={geoLoading}
        />
      </div>

      {/* Patient Intakes Card */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Recent Patient Intakes</h2>
          <Link
            href="/admin/intakes"
            className="text-sm font-medium text-gray-500 hover:text-[#4fa77e]"
          >
            View All Intakes
          </Link>
        </div>

        <div className="px-6 pb-4">
          <input
            type="text"
            placeholder="Search patients by name, email, phone, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
              <thead>
                <tr className="border-t border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    DOB
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIntakes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <Clock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                      <p className="font-medium text-gray-500">
                        No patient intakes in the last 24 hours
                      </p>
                      <p className="mt-1 text-sm text-gray-400">
                        New intakes will appear here automatically
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredIntakes.map((patient) => (
                    <tr
                      key={patient.id}
                      className="cursor-pointer transition-colors hover:bg-gray-50/50"
                      onClick={() => (window.location.href = `/patients/${patient.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-2 w-2 flex-shrink-0 rounded-full ${
                              new Date(patient.createdAt).getTime() > Date.now() - 3600000
                                ? 'bg-[#4fa77e]'
                                : 'bg-amber-400'
                            }`}
                          />
                          <div>
                            <Link
                              href={`/patients/${patient.id}`}
                              className="font-medium text-gray-900 hover:text-[#4fa77e]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {patient.firstName} {patient.lastName}
                            </Link>
                            <p className="text-xs text-gray-400">
                              #{formatPatientDisplayId(patient.patientId, patient.id)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">
                          {isEncryptedData(patient.dateOfBirth)
                            ? '-'
                            : formatDate(patient.dateOfBirth)}
                        </p>
                        <p className="text-xs text-gray-400">({formatGender(patient.gender)})</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">{displayContact(patient.phone)}</p>
                        <p className="max-w-[180px] truncate text-xs text-gray-400">
                          {displayContact(patient.email)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="text-sm font-medium text-[#4fa77e] hover:text-[#3d8a66]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View profile
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
