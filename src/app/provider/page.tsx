'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users, Calendar, Clock, FileText, TestTube,
  Pill, MessageSquare, Loader2, AlertCircle
} from 'lucide-react';

interface DashboardStats {
  totalPatients: number;
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
    totalPatients: 0,
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

    const data = JSON.parse(user);
    if (data.role?.toLowerCase() !== 'provider') {
      router.push('/login');
      return;
    }

    setUserData(data);
    fetchDashboardData();
  }, [router]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch patients
      const patientsRes = await fetch('/api/patients?limit=5', { headers });
      if (patientsRes.ok) {
        const patientsData = await patientsRes.json();
        setRecentPatients(patientsData.patients || []);
        setStats(prev => ({
          ...prev,
          totalPatients: patientsData.meta?.total || patientsData.patients?.length || 0
        }));
      }

      // Fetch orders/prescriptions count
      const ordersRes = await fetch('/api/orders?limit=100', { headers });
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setStats(prev => ({
          ...prev,
          recentPrescriptions: ordersData.count || ordersData.orders?.length || 0
        }));
      }

      // Fetch appointments for today
      const today = new Date().toISOString().split('T')[0];
      const appointmentsRes = await fetch(`/api/appointments?date=${today}`, { headers });
      if (appointmentsRes.ok) {
        const appointmentsData = await appointmentsRes.json();
        const todayAppts = appointmentsData.appointments || [];
        setAppointments(todayAppts);
        setStats(prev => ({
          ...prev,
          todayAppointments: todayAppts.length
        }));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-[#4fa77e] to-[#3d9268] rounded-2xl p-6 text-white mb-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">
          Welcome back, Dr. {userData?.lastName || userData?.name?.split(' ').pop() || userData?.email?.split('@')[0]}!
        </h1>
        <p className="text-green-100">
          {stats.totalPatients > 0
            ? `You have ${stats.totalPatients} patient${stats.totalPatients !== 1 ? 's' : ''} in your practice`
            : 'Get started by adding your first patient'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <Link href="/provider/patients" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-green-200 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Patients</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalPatients}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#4fa77e] flex items-center justify-center">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>

        <Link href="/provider/soap-notes" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">SOAP Notes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.pendingSOAPNotes}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
              <FileText className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>

        <Link href="/provider/prescriptions" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-purple-200 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Prescriptions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.recentPrescriptions}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center">
              <Pill className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>

        <Link href="/provider/calendar" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-cyan-200 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Today's Appointments</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.todayAppointments}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center">
              <Calendar className="h-6 w-6 text-white" />
            </div>
          </div>
        </Link>
      </div>

      {/* Today's Schedule & Recent Patients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
            <Link href="/provider/calendar" className="text-sm text-[#4fa77e] hover:underline">
              View all
            </Link>
          </div>
          <div className="p-4">
            {appointments.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No appointments scheduled for today</p>
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
                  <div key={appointment.id} className="flex items-center justify-between p-3 bg-gray-50/80 rounded-xl">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{appointment.patientName}</p>
                        <p className="text-xs text-gray-500">{appointment.type}</p>
                      </div>
                    </div>
                    <span className="text-sm text-gray-600 font-medium">
                      {new Date(appointment.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Patients</h2>
            <Link href="/provider/patients" className="text-sm text-[#4fa77e] hover:underline">
              View all
            </Link>
          </div>
          <div className="p-4">
            {recentPatients.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No patients yet</p>
                <Link
                  href="/provider/patients"
                  className="mt-3 inline-block text-sm text-[#4fa77e] hover:underline"
                >
                  Add your first patient
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPatients.map((patient) => (
                  <Link
                    key={patient.id}
                    href={`/patients/${patient.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50/80 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-[#4fa77e]/10 flex items-center justify-center mr-3">
                        <span className="text-sm font-medium text-[#4fa77e]">
                          {patient.firstName?.[0]}{patient.lastName?.[0]}
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/provider/patients')}
              className="p-4 bg-[#4fa77e]/10 text-[#4fa77e] rounded-xl hover:bg-[#4fa77e]/20 transition-colors flex flex-col items-center"
            >
              <Users className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">Add Patient</span>
            </button>
            <button
              onClick={() => router.push('/provider/soap-notes')}
              className="p-4 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors flex flex-col items-center"
            >
              <FileText className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">SOAP Notes</span>
            </button>
            <button
              onClick={() => router.push('/provider/prescriptions')}
              className="p-4 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors flex flex-col items-center"
            >
              <Pill className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">Prescriptions</span>
            </button>
            <button
              onClick={() => router.push('/provider/calendar')}
              className="p-4 bg-cyan-50 text-cyan-700 rounded-xl hover:bg-cyan-100 transition-colors flex flex-col items-center"
            >
              <Calendar className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">Calendar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
