'use client';

import { useState, useEffect } from 'react';
import {
  Search, Clock, CheckCircle, AlertCircle,
  User, Mail, Phone, MapPin, Calendar, CreditCard,
  ChevronRight, Eye
} from 'lucide-react';
import Link from 'next/link';

interface PatientIntake {
  id: number;
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
      const token = localStorage.getItem('auth-token') ||
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');

      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Fetch recent patient intakes (last 24 hours)
      const intakesResponse = await fetch('/api/patients?limit=20&recent=24h', {
        credentials: 'include',
        headers,
      });

      if (intakesResponse.ok) {
        const intakesData = await intakesResponse.json();
        setRecentIntakes(intakesData.patients || []);
      }

      // Fetch recent Stripe payments
      const paymentsResponse = await fetch('/api/stripe/transactions?limit=10&type=charges&status=succeeded', {
        credentials: 'include',
        headers,
      });

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

  const filteredIntakes = recentIntakes.filter(patient => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      patient.firstName?.toLowerCase().includes(query) ||
      patient.lastName?.toLowerCase().includes(query) ||
      patient.email?.toLowerCase().includes(query) ||
      patient.phone?.includes(query) ||
      patient.id?.toString().includes(query) ||
      patient.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      patient.address?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#4fa77e] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          {/* System Status */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${
              systemStatus === 'healthy' ? 'bg-[#4fa77e]' :
              systemStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              SYSTEM: {systemStatus.toUpperCase()}
            </span>
          </div>

          {/* Date and Time - Same font size */}
          <p className="text-sm text-gray-800">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-600">
            {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patients"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e] transition-all"
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
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New Patient Intakes</h2>
          <p className="text-sm text-gray-500">Received in the last 24 hours</p>
        </div>

        {/* Search within intakes */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search patients by name, email, phone, ID, tags, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredIntakes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No patient intakes in the last 24 hours</p>
                    <p className="text-sm text-gray-400 mt-1">New intakes will appear here automatically</p>
                  </td>
                </tr>
              ) : (
                filteredIntakes.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          new Date(patient.createdAt).getTime() > Date.now() - 3600000
                            ? 'bg-[#4fa77e]'
                            : 'bg-amber-400'
                        }`} />
                        <div>
                          <p className="font-medium text-gray-900">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-gray-400">#{String(patient.id).padStart(6, '0')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{formatDate(patient.dateOfBirth)}</p>
                      <p className="text-xs text-gray-400 capitalize">({patient.gender})</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{patient.phone}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">{patient.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 truncate max-w-[200px]">{patient.address || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {patient.tags?.slice(0, 4).map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full"
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
                        className="text-sm text-[#4fa77e] hover:text-[#3d8a66] font-medium flex items-center gap-1"
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
          <div className="px-6 py-3 border-t border-gray-100 text-center">
            <Link
              href="/admin/patients"
              className="text-sm text-gray-500 hover:text-[#4fa77e] font-medium"
            >
              Load More
            </Link>
          </div>
        )}
      </div>

      {/* Recent Payments Section */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent Payments</h2>
            <p className="text-sm text-gray-500">Latest transactions from Stripe</p>
          </div>
          <Link
            href="/admin/finance"
            className="text-sm text-[#4fa77e] hover:text-[#3d8a66] font-medium flex items-center gap-1"
          >
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="divide-y divide-gray-100">
          {recentPayments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <CreditCard className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No recent payments</p>
              <p className="text-sm text-gray-400 mt-1">Payments will appear here as they are processed</p>
            </div>
          ) : (
            recentPayments.map((payment) => (
              <div key={payment.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#4fa77e]/10 flex items-center justify-center">
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
