'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Calendar,
  Clock,
  FileText,
  TestTube,
  Pill,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { ProviderDashboardSkeleton } from '@/components/dashboards/ProviderDashboardSkeleton';
import { apiFetch } from '@/lib/api/fetch';

interface DashboardStats {
  totalIntakes: number;
  todayAppointments: number;
  pendingSOAPNotes: number;
  recentPrescriptions: number;
}

interface Appointment {
  id: number;
  patientName: string;
  type: string;
  scheduledAt: string;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export default function ProviderDashboard() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalIntakes: 0,
    todayAppointments: 0,
    pendingSOAPNotes: 0,
    recentPrescriptions: 0,
  });
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const data = JSON.parse(user);
      if (data.role?.toLowerCase() !== 'provider') {
        router.push('/login');
        return;
      }
      setUserData(data);
      fetchDashboardData();
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
      return;
    }
  }, [router]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch intakes (records become patients only when they have prescriptions)
      const patientsRes = await apiFetch('/api/patients?limit=5', { headers });
      if (patientsRes.ok) {
        const patientsData = await patientsRes.json();
        setRecentPatients(patientsData.patients || []);
        setStats((prev) => ({
          ...prev,
          totalIntakes: patientsData.meta?.total || patientsData.patients?.length || 0,
        }));
      }

      // Fetch orders/prescriptions count
      const ordersRes = await apiFetch('/api/orders?limit=100', { headers });
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setStats((prev) => ({
          ...prev,
          recentPrescriptions: ordersData.count || ordersData.orders?.length || 0,
        }));
      }

      // Fetch appointments for today
      const today = new Date().toISOString().split('T')[0];
      try {
        const appointmentsRes = await apiFetch(`/api/scheduling/appointments?date=${today}`, {
          headers,
        });
        if (appointmentsRes.ok) {
          const appointmentsData = await appointmentsRes.json();
          const todayAppts = appointmentsData.appointments || [];
          setAppointments(todayAppts);
          setStats((prev) => ({
            ...prev,
            todayAppointments: todayAppts.length,
          }));
        }
      } catch {
        // Appointments endpoint may not be available
      }
    } catch {
      // Handled by SessionExpirationHandler for auth errors
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ProviderDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Welcome Section */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-[#4fa77e] to-[#3d9268] p-6 text-white shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">
          Welcome back, Dr.{' '}
          {userData?.lastName || userData?.name?.split(' ').pop() || userData?.email?.split('@')[0]}
          !
        </h1>
        <p className="text-green-100">
          {stats.totalIntakes > 0
            ? `You have ${stats.totalIntakes} intake${stats.totalIntakes !== 1 ? 's' : ''} in your practice`
            : 'Get started by adding your first intake'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-4">
        <Link
          href="/provider/patients"
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-green-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Intakes</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.totalIntakes}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4fa77e]">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>

        <Link
          href="/provider/soap-notes"
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-blue-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">SOAP Notes</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.pendingSOAPNotes}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500">
              <FileText className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>

        <Link
          href="/provider/prescriptions"
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-[var(--brand-primary-medium)]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Prescriptions</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.recentPrescriptions}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-primary)]">
              <Pill className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>

        <Link
          href="/provider/calendar"
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Today's Appointments</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats.todayAppointments}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500">
              <Calendar className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>
      </div>

      {/* Today's Schedule & Recent Patients */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
            <Link href="/provider/calendar" className="text-sm text-[#4fa77e] hover:underline">
              View all
            </Link>
          </div>
          <div className="p-4">
            {appointments.length === 0 ? (
              <div className="py-8 text-center">
                <Calendar className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No appointments scheduled for today</p>
                <Link
                  href="/provider/calendar"
                  className="mt-3 inline-block text-sm text-[#4fa77e] hover:underline"
                >
                  Schedule an appointment
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments.slice(0, 5).map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50/80 p-3"
                  >
                    <div className="flex items-center">
                      <Clock className="mr-3 h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {appointment.patientName}
                        </p>
                        <p className="text-xs text-gray-500">{appointment.type}</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      {new Date(appointment.scheduledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">Recent Intakes</h2>
            <Link href="/provider/patients" className="text-sm text-[#4fa77e] hover:underline">
              View all
            </Link>
          </div>
          <div className="p-4">
            {recentPatients.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No intakes yet</p>
                <Link
                  href="/provider/patients"
                  className="mt-3 inline-block text-sm text-[#4fa77e] hover:underline"
                >
                  Add your first intake
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPatients.map((patient) => (
                  <Link
                    key={patient.id}
                    href={`/provider/patients/${patient.id}`}
                    className="flex items-center justify-between rounded-xl bg-gray-50/80 p-3 transition-colors hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#4fa77e]/10">
                        <span className="text-sm font-medium text-[#4fa77e]">
                          {patient.firstName?.[0]}
                          {patient.lastName?.[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-xs text-gray-500">
                          Added {new Date(patient.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <button
              onClick={() => router.push('/provider/patients')}
              className="flex flex-col items-center rounded-xl bg-[#4fa77e]/10 p-4 text-[#4fa77e] transition-colors hover:bg-[#4fa77e]/20"
            >
              <Users className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">View Intakes</span>
            </button>
            <button
              onClick={() => router.push('/provider/soap-notes')}
              className="flex flex-col items-center rounded-xl bg-blue-50 p-4 text-blue-700 transition-colors hover:bg-blue-100"
            >
              <FileText className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">SOAP Notes</span>
            </button>
            <button
              onClick={() => router.push('/provider/prescriptions')}
              className="flex flex-col items-center rounded-xl bg-[var(--brand-primary-light)] p-4 text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-light)]"
            >
              <Pill className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Prescriptions</span>
            </button>
            <button
              onClick={() => router.push('/provider/calendar')}
              className="flex flex-col items-center rounded-xl bg-cyan-50 p-4 text-cyan-700 transition-colors hover:bg-cyan-100"
            >
              <Calendar className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Calendar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
