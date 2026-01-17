'use client';

import { useState, useEffect } from 'react';
import { 
  Users, TrendingUp, DollarSign, ShoppingCart, 
  AlertCircle, Clock, Activity, Calendar,
  FileText, UserPlus, Package, CreditCard,
  ArrowUp, ArrowDown, MoreVertical, ChevronRight
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DashboardStats {
  totalPatients: number;
  patientsChange: number;
  totalRevenue: number;
  revenueChange: number;
  activeProviders: number;
  providersChange: number;
  pendingOrders: number;
  ordersChange: number;
}

interface RecentActivity {
  id: string;
  type: 'patient' | 'order' | 'payment' | 'staff';
  message: string;
  time: string;
  user?: string;
}

interface AdminDashboardProps {
  userName?: string;
}

export default function AdminDashboard({ userName }: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<Array<{ month: string; revenue: number }>>([]);
  const [patientData, setPatientData] = useState<Array<{ day: string; newPatients: number; returningPatients: number }>>([]);
  const [displayName, setDisplayName] = useState(userName || 'Admin');

  // Get user name from localStorage if not provided
  useEffect(() => {
    if (!userName) {
      try {
        const user = localStorage.getItem('user');
        if (user) {
          const userData = JSON.parse(user);
          setDisplayName(userData.firstName || userData.email?.split('@')[0] || 'Admin');
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
      // Load real data from API (token stored as 'auth-token' by login)
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const response = await fetch('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setRecentActivities(data.recentActivities || []);

        // Update chart data if available
        if (data.charts?.monthlyRevenue) {
          setRevenueData(data.charts.monthlyRevenue);
        }
        if (data.charts?.dailyPatients) {
          setPatientData(data.charts.dailyPatients);
        }
      } else {
        // Set default empty state
        setStats({
          totalPatients: 0,
          patientsChange: 0,
          totalRevenue: 0,
          revenueChange: 0,
          activeProviders: 0,
          providersChange: 0,
          pendingOrders: 0,
          ordersChange: 0
        });
        setRecentActivities([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // Set default empty state on error
      setStats({
        totalPatients: 0,
        patientsChange: 0,
        totalRevenue: 0,
        revenueChange: 0,
        activeProviders: 0,
        providersChange: 0,
        pendingOrders: 0,
        ordersChange: 0
      });
      setRecentActivities([]);
      setLoading(false);
    }
  };

  // Chart configurations - using real data from API
  const revenueChartData = {
    labels: revenueData.length > 0 ? revenueData.map(d => d.month) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Revenue',
        data: revenueData.length > 0 ? revenueData.map(d => d.revenue) : [0, 0, 0, 0, 0, 0],
        borderColor: 'rgb(147, 51, 234)',
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  const patientChartData = {
    labels: patientData.length > 0 ? patientData.map(d => d.day) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'New Patients',
        data: patientData.length > 0 ? patientData.map(d => d.newPatients) : [0, 0, 0, 0, 0, 0, 0],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: 'Returning Patients',
        data: patientData.length > 0 ? patientData.map(d => d.returningPatients) : [0, 0, 0, 0, 0, 0, 0],
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
      }
    ]
  };

  // Department data will be added in future when departments feature is implemented

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">Welcome back, {displayName}!</h1>
        <p className="text-purple-100">Here's what's happening in your clinic today</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Patients */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Patients</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.totalPatients.toLocaleString()}</p>
              <div className="flex items-center mt-2">
                {stats?.patientsChange && stats.patientsChange > 0 ? (
                  <>
                    <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+{stats.patientsChange}%</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-600">{stats?.patientsChange}%</span>
                  </>
                )}
                <span className="text-sm text-gray-500 ml-2">vs last month</span>
              </div>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Monthly Revenue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">${stats?.totalRevenue.toLocaleString()}</p>
              <div className="flex items-center mt-2">
                {stats?.revenueChange && stats.revenueChange > 0 ? (
                  <>
                    <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+{stats.revenueChange}%</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-600">{stats?.revenueChange}%</span>
                  </>
                )}
                <span className="text-sm text-gray-500 ml-2">vs last month</span>
              </div>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Active Providers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Providers</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.activeProviders}</p>
              <div className="flex items-center mt-2">
                {stats?.providersChange && stats.providersChange > 0 ? (
                  <>
                    <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+{stats.providersChange}%</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-600">{stats?.providersChange}%</span>
                  </>
                )}
                <span className="text-sm text-gray-500 ml-2">vs last month</span>
              </div>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Pending Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Orders</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.pendingOrders}</p>
              <div className="flex items-center mt-2">
                {stats?.ordersChange && stats.ordersChange > 0 ? (
                  <>
                    <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+{stats.ordersChange}%</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-600">{stats?.ordersChange}%</span>
                  </>
                )}
                <span className="text-sm text-gray-500 ml-2">vs last week</span>
              </div>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Revenue Overview</h2>
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <MoreVertical className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="h-64">
            <Line data={revenueChartData} options={chartOptions} />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Quick Stats</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <span className="text-sm text-gray-600">Total Patients</span>
              <span className="font-semibold text-purple-700">{stats?.totalPatients || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm text-gray-600">Active Providers</span>
              <span className="font-semibold text-green-700">{stats?.activeProviders || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-gray-600">Monthly Revenue</span>
              <span className="font-semibold text-blue-700">${stats?.totalRevenue?.toLocaleString() || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <span className="text-sm text-gray-600">Pending Orders</span>
              <span className="font-semibold text-orange-700">{stats?.pendingOrders || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Activity and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Patient Activity</h2>
            <span className="text-sm text-gray-500">This Week</span>
          </div>
          <div className="h-64">
            <Bar data={patientChartData} options={chartOptions} />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
              View All
            </button>
          </div>
          <div className="space-y-4">
            {recentActivities.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No recent activity</p>
                <p className="text-sm text-gray-400">Activity will appear here as you use the platform</p>
              </div>
            ) : (
              recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start">
                <div className={`p-2 rounded-lg ${
                  activity.type === 'patient' ? 'bg-blue-100' :
                  activity.type === 'order' ? 'bg-green-100' :
                  activity.type === 'payment' ? 'bg-yellow-100' :
                  'bg-purple-100'
                }`}>
                  {activity.type === 'patient' && <UserPlus className="h-4 w-4 text-blue-600" />}
                  {activity.type === 'order' && <Package className="h-4 w-4 text-green-600" />}
                  {activity.type === 'payment' && <CreditCard className="h-4 w-4 text-yellow-600" />}
                  {activity.type === 'staff' && <Users className="h-4 w-4 text-purple-600" />}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                  {activity.user && (
                    <p className="text-sm text-gray-500">{activity.user}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{activity.time}</p>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button className="flex items-center justify-center px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors">
            <UserPlus className="h-5 w-5 mr-2" />
            Add Patient
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
            <ShoppingCart className="h-5 w-5 mr-2" />
            Create Order
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
            <FileText className="h-5 w-5 mr-2" />
            View Reports
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors">
            <Calendar className="h-5 w-5 mr-2" />
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
