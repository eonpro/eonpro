'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SupportLayout from '@/components/layouts/SupportLayout';
import { 
  Ticket, MessageCircle, Clock, AlertTriangle,
  CheckCircle, TrendingUp, Users, HelpCircle 
} from 'lucide-react';

export default function SupportDashboard() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }
    
    const data = JSON.parse(user);
    if (data.role?.toLowerCase() !== 'support') {
      router.push('/login');
      return;
    }
    
    setUserData(data);
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <SupportLayout userData={userData}>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-2">Support Dashboard</h1>
          <p className="text-amber-100">Welcome back, {userData?.firstName}! You have 8 open tickets in queue.</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Open Tickets</p>
                <p className="text-2xl font-bold text-gray-900">24</p>
                <p className="text-xs text-red-600 mt-1">3 Critical</p>
              </div>
              <Ticket className="h-8 w-8 text-amber-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Chats</p>
                <p className="text-2xl font-bold text-gray-900">5</p>
              </div>
              <MessageCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Response Time</p>
                <p className="text-2xl font-bold text-gray-900">8m</p>
                <p className="text-xs text-green-600 mt-1">↓ 2m from yesterday</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">CSAT Score</p>
                <p className="text-2xl font-bold text-gray-900">94%</p>
                <p className="text-xs text-green-600 mt-1">↑ 2% this week</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Ticket Queue and Live Chats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ticket Queue */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ticket Queue</h2>
            <div className="space-y-3">
              {[
                { id: 'TKT-2024-001', subject: 'Cannot access patient records', priority: 'Critical', time: '5 min ago', customer: 'Dr. Smith' },
                { id: 'TKT-2024-002', subject: 'Billing question', priority: 'Medium', time: '15 min ago', customer: 'Jane Doe' },
                { id: 'TKT-2024-003', subject: 'Login issues', priority: 'High', time: '30 min ago', customer: 'John Patient' },
                { id: 'TKT-2024-004', subject: 'Feature request', priority: 'Low', time: '1 hour ago', customer: 'Admin User' },
                { id: 'TKT-2024-005', subject: 'Appointment sync problem', priority: 'Medium', time: '2 hours ago', customer: 'Mary Staff' },
              ].map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="text-xs font-mono text-gray-500 mr-2">{ticket.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ticket.priority === 'Critical' ? 'bg-red-100 text-red-700' :
                        ticket.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                        ticket.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-1">{ticket.subject}</p>
                    <p className="text-xs text-gray-500">{ticket.customer} • {ticket.time}</p>
                  </div>
                  {ticket.priority === 'Critical' && (
                    <AlertTriangle className="h-4 w-4 text-red-600 ml-2" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Live Chats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Chats</h2>
            <div className="space-y-3">
              {[
                { customer: 'John Smith', issue: 'Password reset', duration: '3:45', status: 'Active' },
                { customer: 'Sarah Johnson', issue: 'Billing inquiry', duration: '8:12', status: 'Active' },
                { customer: 'Mike Davis', issue: 'Technical support', duration: '1:23', status: 'Waiting' },
                { customer: 'Emily Brown', issue: 'Account setup', duration: '5:30', status: 'Active' },
                { customer: 'Tom Wilson', issue: 'General question', duration: '0:45', status: 'New' },
              ].map((chat, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-3 ${
                      chat.status === 'Active' ? 'bg-green-500' :
                      chat.status === 'Waiting' ? 'bg-yellow-500' :
                      'bg-gray-400'
                    }`} />
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trending Issues */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Trending Issues</h2>
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">SLA Status</h2>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">First Response</span>
                  <span className="text-sm font-medium text-green-600">98%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: '98%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Resolution Time</span>
                  <span className="text-sm font-medium text-yellow-600">85%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-600 h-2 rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Customer Satisfaction</span>
                  <span className="text-sm font-medium text-green-600">94%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: '94%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resources</h2>
            <div className="space-y-2">
              <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg flex items-center">
                <HelpCircle className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm text-gray-700">Knowledge Base</span>
              </button>
              <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg flex items-center">
                <Users className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm text-gray-700">Customer Directory</span>
              </button>
              <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg flex items-center">
                <MessageCircle className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm text-gray-700">Chat Templates</span>
              </button>
              <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg flex items-center">
                <CheckCircle className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm text-gray-700">Resolution Guides</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </SupportLayout>
  );
}
