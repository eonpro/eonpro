'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  ChevronRight,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface PatientIntake {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  tags: string[];
  createdAt: string;
}

interface RecentPayment {
  id: string;
  amount: number;
  amountFormatted: string;
  customerName: string | null;
  customerEmail: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  paymentMethod: string | null;
}

interface AdminDashboardProps {
  userName?: string;
}

export default function AdminDashboard({ userName }: AdminDashboardProps) {
  const router = useRouter();
  const [recentIntakes, setRecentIntakes] = useState<PatientIntake[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(userName || 'there');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [systemStatus, setSystemStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Get user name from localStorage if not provided
  useEffect(() => {
    if (!userName) {
      try {
        const user = localStorage.getItem('user');
        if (user) {
          const userData = JSON.parse(user);
          setDisplayName(userData.firstName || userData.email?.split('@')[0] || 'there');
        }
      } catch {
        // Keep default name
      }
    }
  }, [userName]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Fetch recent patient intakes (last 24 hours)
      const intakesResponse = await apiFetch('/api/patients?limit=20&recent=24h');

      if (intakesResponse.ok) {
        const intakesData = await intakesResponse.json();
        setRecentIntakes(intakesData.patients || []);
      }

      // Fetch recent Stripe payments
      const paymentsResponse = await apiFetch(
        '/api/stripe/transactions?limit=10&type=charges&status=succeeded'
      );

      if (paymentsResponse.ok) {
        const paymentsData = await paymentsResponse.json();
        setRecentPayments(paymentsData.transactions || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(dateString);
  };

  const filteredIntakes = recentIntakes.filter((patient) => {
    if (!searchQuery) return true;
    return (
      normalizedIncludes(patient.firstName || '', searchQuery) ||
      normalizedIncludes(patient.lastName || '', searchQuery) ||
      normalizedIncludes(patient.email || '', searchQuery) ||
      normalizedIncludes(patient.phone || '', searchQuery) ||
      patient.id?.toString().includes(searchQuery) ||
      patient.tags?.some((tag) => normalizedIncludes(tag, searchQuery)) ||
      normalizedIncludes(patient.address || '', searchQuery)
    );
  });

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          {/* System Status */}
          <div className="mb-2 flex items-center gap-2">
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

          {/* Date and Time - Same font size */}
          <p className="text-sm text-gray-800">
            {currentTime.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p className="text-sm text-gray-600">
            {currentTime
              .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              .toLowerCase()}
          </p>
        </div>

        {/* Search — filters table below; Enter opens full patient search */}
        <div className="relative w-96">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const q = searchQuery.trim();
                const url = q
                  ? `/admin/patients?search=${encodeURIComponent(q)}`
                  : '/admin/patients';
                router.push(url);
              }
            }}
            placeholder="Search patients (Enter for full search)"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-4 transition-all focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            aria-label="Search patients"
          />
        </div>
      </div>

      {/* Welcome Message */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome, <span className="text-gray-900">{displayName}</span>
        </h1>
      </div>

      {/* Patient Intakes Section */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">New Patient Intakes</h2>
          <p className="text-sm text-gray-500">Received in the last 24 hours</p>
        </div>

        {/* Search within intakes */}
        <div className="border-b border-gray-100 px-6 py-3">
          <input
            type="text"
            placeholder="Search patients by name, email, phone, ID, tags, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
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
                  Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Tags
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredIntakes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
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
                  <tr key={patient.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            new Date(patient.createdAt).getTime() > Date.now() - 3600000
                              ? 'bg-[#4fa77e]'
                              : 'bg-amber-400'
                          }`}
                        />
                        <div>
                          <p className="font-medium text-gray-900">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-gray-400">
                            #{formatPatientDisplayId(patient.patientId, patient.id)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{formatDate(patient.dateOfBirth)}</p>
                      <p className="text-xs capitalize text-gray-400">({patient.gender})</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{patient.phone}</p>
                      <p className="max-w-[180px] truncate text-xs text-gray-400">
                        {patient.email}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="max-w-[200px] truncate text-sm text-gray-600">
                        {patient.address || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {patient.tags?.slice(0, 4).map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                          >
                            #{tag}
                          </span>
                        ))}
                        {patient.tags?.length > 4 && (
                          <span className="text-xs text-gray-400">+{patient.tags.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/patients/${patient.id}`}
                        className="flex items-center gap-1 text-sm font-medium text-[#4fa77e] hover:text-[#3d8a66]"
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

        {filteredIntakes.length > 0 && (
          <div className="border-t border-gray-100 px-6 py-3 text-center">
            <Link
              href="/admin/patients"
              className="text-sm font-medium text-gray-500 hover:text-[#4fa77e]"
            >
              Load More
            </Link>
          </div>
        )}
      </div>

      {/* Recent Payments Section */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent Payments</h2>
            <p className="text-sm text-gray-500">Latest transactions from Stripe</p>
          </div>
          <Link
            href="/admin/finance"
            className="flex items-center gap-1 text-sm font-medium text-[#4fa77e] hover:text-[#3d8a66]"
          >
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="divide-y divide-gray-100">
          {recentPayments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="font-medium text-gray-500">No recent payments</p>
              <p className="mt-1 text-sm text-gray-400">
                Payments will appear here as they are processed
              </p>
            </div>
          ) : (
            recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50/50"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4fa77e]/10">
                    <CreditCard className="h-5 w-5 text-[#4fa77e]" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {payment.customerName || payment.customerEmail || 'Unknown Customer'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {payment.description || 'Payment received'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{payment.amountFormatted}</p>
                  <p className="text-xs text-gray-400">{formatRelativeTime(payment.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
