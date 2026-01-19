'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import {
  Search, Clock, UserPlus, CreditCard, RefreshCw, FileText
} from 'lucide-react';

interface PatientIntake {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  createdAt: string;
}

interface DashboardStats {
  newIntakes: number;
  newRevenue: number;
  recurringRevenue: number;
  newPrescriptions: number;
}

export default function AdminPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [systemStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentIntakes, setRecentIntakes] = useState<PatientIntake[]>([]);
  const [intakesLoading, setIntakesLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    newIntakes: 0,
    newRevenue: 0,
    recurringRevenue: 0,
    newPrescriptions: 0,
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsedUser = JSON.parse(user);
        setUserData(parsedUser);
      } catch {
        // ignore
      }
    }
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('auth-token') ||
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');

      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

      const intakesResponse = await fetch('/api/patients?limit=20&recent=24h', {
        credentials: 'include',
        headers,
      });

      if (intakesResponse.ok) {
        const intakesData = await intakesResponse.json();
        const patients = intakesData.patients || [];
        setRecentIntakes(patients);
        setStats(prev => ({ ...prev, newIntakes: patients.length }));
      }

      // Fetch revenue stats
      try {
        const revenueResponse = await fetch('/api/stripe/transactions?limit=100&type=charges&status=succeeded', {
          credentials: 'include',
          headers,
        });
        if (revenueResponse.ok) {
          const revenueData = await revenueResponse.json();
          const transactions = revenueData.transactions || [];
          const newRevenue = transactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0) / 100;
          setStats(prev => ({ ...prev, newRevenue }));
        }
      } catch (e) { /* ignore */ }

      // Fetch subscription/recurring revenue
      try {
        const subsResponse = await fetch('/api/stripe/subscriptions?status=active', {
          credentials: 'include',
          headers,
        });
        if (subsResponse.ok) {
          const subsData = await subsResponse.json();
          const subs = subsData.subscriptions || [];
          const recurringRevenue = subs.reduce((sum: number, s: any) => sum + (s.plan?.amount || 0), 0) / 100;
          setStats(prev => ({ ...prev, recurringRevenue }));
        }
      } catch (e) { /* ignore */ }

      // Fetch prescriptions count
      try {
        const ordersResponse = await fetch('/api/orders?limit=100&recent=24h', {
          credentials: 'include',
          headers,
        });
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          const orders = ordersData.orders || [];
          setStats(prev => ({ ...prev, newPrescriptions: orders.length }));
        }
      } catch (e) { /* ignore */ }

      setIntakesLoading(false);
      setPageLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setIntakesLoading(false);
      setPageLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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

  const filteredIntakes = recentIntakes.filter(patient => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      patient.firstName?.toLowerCase().includes(query) ||
      patient.lastName?.toLowerCase().includes(query) ||
      patient.email?.toLowerCase().includes(query) ||
      patient.phone?.includes(query) ||
      patient.id?.toString().includes(query)
    );
  }).slice(0, 8);

  const displayName = userData?.firstName || userData?.email?.split('@')[0] || 'there';

  // Full-page loader
  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#efece7] flex flex-col items-center justify-center">
        <div className="w-24 h-24 mb-4">
          <DotLottieReact
            src="https://lottie.host/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie"
            loop
            autoplay
          />
        </div>
        <p className="text-gray-500 text-sm animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${
              systemStatus === 'healthy' ? 'bg-[#4fa77e]' :
              systemStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              SYSTEM: {systemStatus.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-800">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-600">
            {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
          </p>
        </div>

        <div className="relative w-96">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patients"
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e] transition-all text-sm"
          />
        </div>
      </div>

      {/* Welcome */}
      <h1 className="text-3xl font-semibold text-gray-900 mb-6">
        Welcome, <span className="text-gray-900">{displayName}</span>
      </h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#4fa77e]/10 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-[#4fa77e]" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{stats.newIntakes}</p>
            <p className="text-sm text-gray-500">New Intakes</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#4fa77e]/10 flex items-center justify-center">
            <CreditCard className="h-6 w-6 text-[#4fa77e]" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.newRevenue)}</p>
            <p className="text-sm text-gray-500">New Revenue</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <RefreshCw className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.recurringRevenue)}</p>
            <p className="text-sm text-gray-500">Recurring</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center">
            <FileText className="h-6 w-6 text-rose-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{stats.newPrescriptions}</p>
            <p className="text-sm text-gray-500">New Scripts</p>
          </div>
        </div>
      </div>

      {/* Patient Intakes Card */}
      <div className="bg-white rounded-2xl border border-gray-200">
        <div className="px-6 py-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Patient Intakes</h2>
          <Link
            href="/admin/patients"
            className="text-sm text-gray-500 hover:text-[#4fa77e] font-medium"
          >
            Load More
          </Link>
        </div>

        <div className="px-6 pb-4">
          <input
            type="text"
            placeholder="Search patients by name, email, phone, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
          />
        </div>

        <div className="overflow-x-auto">
          {intakesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#4fa77e] border-t-transparent"></div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-t border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIntakes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No patient intakes in the last 24 hours</p>
                      <p className="text-sm text-gray-400 mt-1">New intakes will appear here automatically</p>
                    </td>
                  </tr>
                ) : (
                  filteredIntakes.map((patient) => (
                    <tr
                      key={patient.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/patients/${patient.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            new Date(patient.createdAt).getTime() > Date.now() - 3600000
                              ? 'bg-[#4fa77e]'
                              : 'bg-amber-400'
                          }`} />
                          <div>
                            <Link
                              href={`/patients/${patient.id}`}
                              className="font-medium text-gray-900 hover:text-[#4fa77e]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {patient.firstName} {patient.lastName}
                            </Link>
                            <p className="text-xs text-gray-400">#{String(patient.id).padStart(6, '0')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">{formatDate(patient.dateOfBirth)}</p>
                        <p className="text-xs text-gray-400">({formatGender(patient.gender)})</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">{patient.phone}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[180px]">{patient.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="text-sm text-[#4fa77e] hover:text-[#3d8a66] font-medium"
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
          )}
        </div>
      </div>
    </div>
  );
}
