'use client';

import { useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  BarChart3,
  PieChart,
  TrendingUp,
} from 'lucide-react';

export default function PatientReportsPage() {
  const [dateRange, setDateRange] = useState('30d');
  const [reportType, setReportType] = useState('all');

  const reports = [
    {
      id: 1,
      name: 'Patient Demographics Report',
      type: 'demographics',
      date: '2024-01-15',
      records: 1234,
    },
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
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Patient Reports</h1>
        <p className="mt-1 text-gray-600">Generate and download patient reports</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="mt-1 text-sm text-green-600">{stat.change} vs last month</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Reports</option>
              <option value="demographics">Demographics</option>
              <option value="new-patients">New Patients</option>
              <option value="activity">Activity</option>
              <option value="appointments">Appointments</option>
              <option value="outcomes">Outcomes</option>
            </select>
          </div>
          <button className="ml-auto flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700">
            <FileText className="h-5 w-5" />
            Generate New Report
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Reports</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Report Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Generated
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Records
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center">
                    <FileText className="mr-3 h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{report.name}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                    {report.type}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{report.date}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                  {report.records.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <button className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700">
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
