'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, Calendar, Clock, FileText, TestTube, 
  Pill, MessageSquare
} from 'lucide-react';

export default function ProviderDashboard() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
  }, [router]);

  if (loading) {
    return null; // Layout handles the loading state
  }

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-[#4fa77e] to-[#3d9268] rounded-2xl p-6 text-white mb-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">
          Welcome back, Dr. {userData?.lastName || userData?.name?.split(' ').pop() || userData?.email?.split('@')[0]}!
        </h1>
        <p className="text-green-100">You have 8 patients scheduled for today</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Today's Patients</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">8</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#4fa77e] flex items-center justify-center">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending SOAP Notes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">3</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
              <FileText className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Lab Results</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">5 New</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center">
              <TestTube className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Messages</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">12</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Today's Schedule & Recent Lab Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
          </div>
          <div className="p-4 space-y-3">
            {[
              { time: '9:00 AM', patient: 'John Smith', type: 'Follow-up' },
              { time: '9:30 AM', patient: 'Jane Doe', type: 'Consultation' },
              { time: '10:00 AM', patient: 'Robert Johnson', type: 'Lab Review' },
              { time: '11:00 AM', patient: 'Mary Williams', type: 'New Patient' },
              { time: '2:00 PM', patient: 'James Brown', type: 'Follow-up' },
            ].map((appointment, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50/80 rounded-xl">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{appointment.patient}</p>
                    <p className="text-xs text-gray-500">{appointment.type}</p>
                  </div>
                </div>
                <span className="text-sm text-gray-600 font-medium">{appointment.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Recent Lab Results</h2>
          </div>
          <div className="p-4 space-y-3">
            {[
              { patient: 'Alice Johnson', test: 'CBC', status: 'Critical', time: '30 min ago' },
              { patient: 'Bob Wilson', test: 'Lipid Panel', status: 'Normal', time: '1 hour ago' },
              { patient: 'Carol Davis', test: 'HbA1c', status: 'Abnormal', time: '2 hours ago' },
              { patient: 'David Miller', test: 'TSH', status: 'Normal', time: '3 hours ago' },
            ].map((result, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50/80 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">{result.patient}</p>
                  <p className="text-xs text-gray-500">{result.test}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    result.status === 'Critical' ? 'bg-red-100 text-red-700' :
                    result.status === 'Abnormal' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-[#4fa77e]/10 text-[#4fa77e]'
                  }`}>
                    {result.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{result.time}</p>
                </div>
              </div>
            ))}
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
              onClick={() => router.push('/provider/soap-notes/new')}
              className="p-4 bg-[#4fa77e]/10 text-[#4fa77e] rounded-xl hover:bg-[#4fa77e]/20 transition-colors flex flex-col items-center"
            >
              <FileText className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">Create SOAP Note</span>
            </button>
            <button 
              onClick={() => router.push('/provider/prescriptions/new')}
              className="p-4 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors flex flex-col items-center"
            >
              <Pill className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">E-Prescribe</span>
            </button>
            <button 
              onClick={() => router.push('/provider/labs')}
              className="p-4 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors flex flex-col items-center"
            >
              <TestTube className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">Order Labs</span>
            </button>
            <button 
              onClick={() => router.push('/provider/calendar')}
              className="p-4 bg-cyan-50 text-cyan-700 rounded-xl hover:bg-cyan-100 transition-colors flex flex-col items-center"
            >
              <Calendar className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">View Calendar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
