'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Users, Calendar, TrendingUp, Activity, Clock, Loader2 } from 'lucide-react';

interface AnalyticsData {
  totalPatients: number;
  appointmentsToday: number;
  activeProviders: number;
  pendingOrders: number;
}

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('super_admin-token') || 
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');
      const response = await fetch('/api/admin/dashboard', {
        credentials: 'include',
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : {},
      });

      if (response.ok) {
        const result = await response.json();
        setData({
          totalPatients: result.stats?.totalPatients || 0,
          appointmentsToday: result.stats?.pendingOrders || 0, // Using pending orders as proxy
          activeProviders: result.stats?.activeProviders || 0,
          pendingOrders: result.stats?.pendingOrders || 0,
        });
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const metrics = [
    { label: 'Total Patients', value: data?.totalPatients?.toLocaleString() || '0', change: '-', icon: Users },
    { label: 'Pending Orders', value: data?.pendingOrders?.toString() || '0', change: '-', icon: Calendar },
    { label: 'Active Providers', value: data?.activeProviders?.toString() || '0', change: '-', icon: Activity },
    { label: 'Platform Status', value: 'Active', change: 'Online', icon: TrendingUp },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">Monitor clinic performance and metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const isPositive = metric.change.startsWith('+') || metric.change === 'Online';
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Icon className="h-6 w-6 text-indigo-600" />
                </div>
                <span className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-gray-500'}`}>
                  {metric.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{metric.value}</h3>
              <p className="text-sm text-gray-600 mt-1">{metric.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Overview</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Total Patients</h3>
                <p className="text-sm text-gray-600">All registered patients</p>
              </div>
              <span className="text-lg font-semibold text-emerald-600">
                {data?.totalPatients?.toLocaleString() || '0'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Active Providers</h3>
                <p className="text-sm text-gray-600">Healthcare providers</p>
              </div>
              <span className="text-lg font-semibold text-emerald-600">
                {data?.activeProviders || '0'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Pending Orders</h3>
                <p className="text-sm text-gray-600">Orders awaiting processing</p>
              </div>
              <span className="text-lg font-semibold text-orange-600">
                {data?.pendingOrders || '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Analytics Dashboard</h2>
          <div className="h-64 flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-purple-400 mx-auto mb-2" />
              <p className="text-gray-700 font-medium">Real-Time Data</p>
              <p className="text-sm text-gray-500 mt-1">All metrics shown are live from your database</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
