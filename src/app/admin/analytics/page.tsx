'use client';

import { BarChart3, Users, Calendar, TrendingUp, Activity, Clock } from 'lucide-react';

export default function AdminAnalyticsPage() {
  const metrics = [
    { label: 'Total Patients', value: '1,234', change: '+12.5%', icon: Users },
    { label: 'Appointments Today', value: '47', change: '+8%', icon: Calendar },
    { label: 'Avg Wait Time', value: '12 min', change: '-15%', icon: Clock },
    { label: 'Patient Satisfaction', value: '4.8/5', change: '+0.2', icon: Activity },
  ];

  const departmentStats = [
    { name: 'General Medicine', patients: 456, appointments: 123, revenue: '$45,600' },
    { name: 'Cardiology', patients: 234, appointments: 89, revenue: '$67,800' },
    { name: 'Dermatology', patients: 189, appointments: 67, revenue: '$34,500' },
    { name: 'Orthopedics', patients: 156, appointments: 45, revenue: '$56,700' },
    { name: 'Pediatrics', patients: 199, appointments: 78, revenue: '$28,900' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">Monitor clinic performance and patient metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Icon className="h-6 w-6 text-indigo-600" />
                </div>
                <span className="text-sm font-medium text-green-600">{metric.change}</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{metric.value}</h3>
              <p className="text-sm text-gray-600 mt-1">{metric.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Performance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Department Performance</h2>
          <div className="space-y-4">
            {departmentStats.map((dept, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h3 className="font-medium text-gray-900">{dept.name}</h3>
                  <p className="text-sm text-gray-600">{dept.patients} patients · {dept.appointments} appts</p>
                </div>
                <span className="text-lg font-semibold text-emerald-600">{dept.revenue}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart Placeholder */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Patient Visits Trend</h2>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Chart visualization</p>
              <p className="text-sm text-gray-400">Coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

