'use client';

import { useState } from 'react';
import { FileText, Download, Calendar, Filter, BarChart3, PieChart, TrendingUp } from 'lucide-react';

export default function PatientReportsPage() {
  const [dateRange, setDateRange] = useState('30d');
  const [reportType, setReportType] = useState('all');

  const reports = [
    { id: 1, name: 'Patient Demographics Report', type: 'demographics', date: '2024-01-15', records: 1234 },
    { id: 2, name: 'New Patients Summary', type: 'new-patients', date: '2024-01-14', records: 89 },
    { id: 3, name: 'Patient Activity Report', type: 'activity', date: '2024-01-13', records: 567 },
    { id: 4, name: 'Appointment History', type: 'appointments', date: '2024-01-12', records: 234 },
    { id: 5, name: 'Treatment Outcomes', type: 'outcomes', date: '2024-01-11', records: 156 },
  ];

  const stats = [
    { label: 'Total Patients', value: '1,234', change: '+12%', icon: BarChart3 },
    { label: 'New This Month', value: '89', change: '+23%', icon: TrendingUp },
    { label: 'Active Patients', value: '987', change: '+5%', icon: PieChart },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Patient Reports</h1>
        <p className="text-gray-600 mt-1">Generate and download patient reports</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  <p className="text-sm text-green-600 mt-1">{stat.change} vs last month</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Reports</option>
              <option value="demographics">Demographics</option>
              <option value="new-patients">New Patients</option>
              <option value="activity">Activity</option>
              <option value="appointments">Appointments</option>
              <option value="outcomes">Outcomes</option>
            </select>
          </div>
          <button className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate New Report
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Reports</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Report Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Generated</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Records</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <FileText className="h-5 w-5 text-gray-400 mr-3" />
                    <span className="text-sm font-medium text-gray-900">{report.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                    {report.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{report.date}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{report.records.toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

