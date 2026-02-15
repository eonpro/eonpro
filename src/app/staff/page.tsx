'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StaffLayout from '@/components/layouts/StaffLayout';
import {
  ClipboardList,
  Calendar,
  Package,
  FileText,
  UserPlus,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

export default function StaffDashboard() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const data = JSON.parse(user);
      if (data.role?.toLowerCase() !== 'staff') {
        router.push('/login');
        return;
      }
      setUserData(data);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
      return;
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <StaffLayout userData={userData}>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 p-6 text-white">
          <h1 className="mb-2 text-2xl font-bold">Welcome, {userData?.firstName}!</h1>
          <p className="text-cyan-100">
            Administrative Dashboard -{' '}
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Intakes</p>
                <p className="text-2xl font-bold text-gray-900">12</p>
              </div>
              <ClipboardList className="h-8 w-8 text-cyan-600" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Today's Appointments</p>
                <p className="text-2xl font-bold text-gray-900">18</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Open Orders</p>
                <p className="text-2xl font-bold text-gray-900">7</p>
              </div>
              <Package className="h-8 w-8 text-orange-600" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Documents to File</p>
                <p className="text-2xl font-bold text-gray-900">23</p>
              </div>
              <FileText className="h-8 w-8 text-[var(--brand-primary)]" />
            </div>
          </div>
        </div>

        {/* Task Lists */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Pending Intakes</h2>
            <div className="space-y-3">
              {[
                { patient: 'New Patient - John Doe', status: 'Waiting', time: '10 min ago' },
                { patient: 'Follow-up - Jane Smith', status: 'In Progress', time: '25 min ago' },
                { patient: 'New Patient - Robert Lee', status: 'Waiting', time: '45 min ago' },
                { patient: 'Transfer - Maria Garcia', status: 'Review', time: '1 hour ago' },
              ].map((intake, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                >
                  <div className="flex items-center">
                    <UserPlus className="mr-3 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{intake.patient}</p>
                      <p className="text-xs text-gray-500">{intake.time}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      intake.status === 'Waiting'
                        ? 'bg-yellow-100 text-yellow-700'
                        : intake.status === 'In Progress'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]'
                    }`}
                  >
                    {intake.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Upcoming Appointments</h2>
            <div className="space-y-3">
              {[
                { time: '10:00 AM', patient: 'Alice Johnson', provider: 'Dr. Smith' },
                { time: '10:30 AM', patient: 'Bob Wilson', provider: 'Dr. Jones' },
                { time: '11:00 AM', patient: 'Carol Davis', provider: 'Dr. Smith' },
                { time: '2:00 PM', patient: 'David Miller', provider: 'Dr. Brown' },
              ].map((apt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                >
                  <div className="flex items-center">
                    <Clock className="mr-3 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{apt.patient}</p>
                      <p className="text-xs text-gray-500">{apt.provider}</p>
                    </div>
                  </div>
                  <span className="text-sm text-gray-600">{apt.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Activity</h2>
          <div className="space-y-3">
            {[
              {
                action: 'Patient intake completed',
                user: 'John Doe',
                time: '5 minutes ago',
                icon: CheckCircle,
                color: 'text-green-600',
              },
              {
                action: 'Appointment scheduled',
                user: 'Jane Smith',
                time: '15 minutes ago',
                icon: Calendar,
                color: 'text-blue-600',
              },
              {
                action: 'Order processed',
                user: 'Order #12345',
                time: '30 minutes ago',
                icon: Package,
                color: 'text-orange-600',
              },
              {
                action: 'Document uploaded',
                user: 'Lab Results',
                time: '1 hour ago',
                icon: FileText,
                color: 'text-[var(--brand-primary)]',
              },
            ].map((activity, idx) => {
              const Icon = activity.icon;
              return (
                <div key={idx} className="flex items-center rounded-lg bg-gray-50 p-3">
                  <Icon className={`h-5 w-5 ${activity.color} mr-3`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                    <p className="text-xs text-gray-500">
                      {activity.user} • {activity.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <button className="flex flex-col items-center rounded-lg bg-cyan-50 p-4 text-cyan-700 transition-colors hover:bg-cyan-100">
              <UserPlus className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">New Intake</span>
            </button>
            <button className="flex flex-col items-center rounded-lg bg-blue-50 p-4 text-blue-700 transition-colors hover:bg-blue-100">
              <Calendar className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Schedule</span>
            </button>
            <button className="flex flex-col items-center rounded-lg bg-orange-50 p-4 text-orange-700 transition-colors hover:bg-orange-100">
              <Package className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Process Order</span>
            </button>
            <button className="flex flex-col items-center rounded-lg bg-[var(--brand-primary-light)] p-4 text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-light)]">
              <FileText className="mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Upload Docs</span>
            </button>
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
