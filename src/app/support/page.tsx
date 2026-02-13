'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SupportLayout from '@/components/layouts/SupportLayout';
import {
  Ticket,
  MessageCircle,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  HelpCircle,
} from 'lucide-react';

export default function SupportDashboard() {
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
      if (data.role?.toLowerCase() !== 'support') {
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
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <SupportLayout userData={userData}>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 p-6 text-white">
          <h1 className="mb-2 text-2xl font-bold">Support Dashboard</h1>
          <p className="text-amber-100">
            Welcome back, {userData?.firstName}! You have 8 open tickets in queue.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Open Tickets</p>
                <p className="text-2xl font-bold text-gray-900">24</p>
                <p className="mt-1 text-xs text-red-600">3 Critical</p>
              </div>
              <Ticket className="h-8 w-8 text-amber-600" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Chats</p>
                <p className="text-2xl font-bold text-gray-900">5</p>
              </div>
              <MessageCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Response Time</p>
                <p className="text-2xl font-bold text-gray-900">8m</p>
                <p className="mt-1 text-xs text-green-600">↓ 2m from yesterday</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">CSAT Score</p>
                <p className="text-2xl font-bold text-gray-900">94%</p>
                <p className="mt-1 text-xs text-green-600">↑ 2% this week</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Ticket Queue and Live Chats */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Ticket Queue */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Ticket Queue</h2>
            <div className="space-y-3">
              {[
                {
                  id: 'TKT-2024-001',
                  subject: 'Cannot access patient records',
                  priority: 'Critical',
                  time: '5 min ago',
                  customer: 'Dr. Smith',
                },
                {
                  id: 'TKT-2024-002',
                  subject: 'Billing question',
                  priority: 'Medium',
                  time: '15 min ago',
                  customer: 'Jane Doe',
                },
                {
                  id: 'TKT-2024-003',
                  subject: 'Login issues',
                  priority: 'High',
                  time: '30 min ago',
                  customer: 'John Patient',
                },
                {
                  id: 'TKT-2024-004',
                  subject: 'Feature request',
                  priority: 'Low',
                  time: '1 hour ago',
                  customer: 'Admin User',
                },
                {
                  id: 'TKT-2024-005',
                  subject: 'Appointment sync problem',
                  priority: 'Medium',
                  time: '2 hours ago',
                  customer: 'Mary Staff',
                },
              ].map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-3 hover:bg-gray-100"
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="mr-2 font-mono text-xs text-gray-500">{ticket.id}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          ticket.priority === 'Critical'
                            ? 'bg-red-100 text-red-700'
                            : ticket.priority === 'High'
                              ? 'bg-orange-100 text-orange-700'
                              : ticket.priority === 'Medium'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-gray-900">{ticket.subject}</p>
                    <p className="text-xs text-gray-500">
                      {ticket.customer} • {ticket.time}
                    </p>
                  </div>
                  {ticket.priority === 'Critical' && (
                    <AlertTriangle className="ml-2 h-4 w-4 text-red-600" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Live Chats */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Active Chats</h2>
            <div className="space-y-3">
              {[
                {
                  customer: 'John Smith',
                  issue: 'Password reset',
                  duration: '3:45',
                  status: 'Active',
                },
                {
                  customer: 'Sarah Johnson',
                  issue: 'Billing inquiry',
                  duration: '8:12',
                  status: 'Active',
                },
                {
                  customer: 'Mike Davis',
                  issue: 'Technical support',
                  duration: '1:23',
                  status: 'Waiting',
                },
                {
                  customer: 'Emily Brown',
                  issue: 'Account setup',
                  duration: '5:30',
                  status: 'Active',
                },
                {
                  customer: 'Tom Wilson',
                  issue: 'General question',
                  duration: '0:45',
                  status: 'New',
                },
              ].map((chat, idx) => (
                <div
                  key={idx}
                  className="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-3 hover:bg-gray-100"
                >
                  <div className="flex items-center">
                    <div
                      className={`mr-3 h-2 w-2 rounded-full ${
                        chat.status === 'Active'
                          ? 'bg-green-500'
                          : chat.status === 'Waiting'
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{chat.customer}</p>
                      <p className="text-xs text-gray-500">{chat.issue}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{chat.duration}</p>
                    <p className="text-xs text-gray-500">{chat.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Knowledge Base and SLA Status */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Trending Issues */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Trending Issues</h2>
            <div className="space-y-2">
              {[
                { issue: 'Login problems', count: 12 },
                { issue: 'Payment processing', count: 8 },
                { issue: 'Document upload', count: 6 },
                { issue: 'Appointment booking', count: 5 },
                { issue: 'Password reset', count: 4 },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{item.issue}</span>
                  <span className="text-sm font-medium text-gray-900">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SLA Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">SLA Status</h2>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-600">First Response</span>
                  <span className="text-sm font-medium text-green-600">98%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-green-600" style={{ width: '98%' }}></div>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Resolution Time</span>
                  <span className="text-sm font-medium text-yellow-600">85%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-yellow-600" style={{ width: '85%' }}></div>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Customer Satisfaction</span>
                  <span className="text-sm font-medium text-green-600">94%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-green-600" style={{ width: '94%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Resources</h2>
            <div className="space-y-2">
              <button className="flex w-full items-center rounded-lg p-2 text-left hover:bg-gray-50">
                <HelpCircle className="mr-2 h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">Knowledge Base</span>
              </button>
              <button className="flex w-full items-center rounded-lg p-2 text-left hover:bg-gray-50">
                <Users className="mr-2 h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">Customer Directory</span>
              </button>
              <button className="flex w-full items-center rounded-lg p-2 text-left hover:bg-gray-50">
                <MessageCircle className="mr-2 h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">Chat Templates</span>
              </button>
              <button className="flex w-full items-center rounded-lg p-2 text-left hover:bg-gray-50">
                <CheckCircle className="mr-2 h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">Resolution Guides</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </SupportLayout>
  );
}
