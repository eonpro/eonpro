'use client';

import { useState } from 'react';
import { Users, Search, Filter, MoreVertical, Mail, Phone, Calendar, MapPin, Shield } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending';
  joinedDate: string;
  lastActive: string;
  location: string;
  tier: 'basic' | 'premium' | 'vip';
  tickets: number;
  satisfaction: number;
}

const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john.smith@example.com',
    phone: '(555) 123-4567',
    status: 'active',
    joinedDate: '2023-06-15',
    lastActive: '2024-01-28',
    location: 'New York, NY',
    tier: 'premium',
    tickets: 3,
    satisfaction: 95
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    email: 'sarah.j@example.com',
    phone: '(555) 234-5678',
    status: 'active',
    joinedDate: '2023-08-20',
    lastActive: '2024-01-27',
    location: 'Los Angeles, CA',
    tier: 'vip',
    tickets: 1,
    satisfaction: 100
  },
  {
    id: '3',
    name: 'Michael Brown',
    email: 'mbrown@example.com',
    phone: '(555) 345-6789',
    status: 'inactive',
    joinedDate: '2023-04-10',
    lastActive: '2023-12-15',
    location: 'Chicago, IL',
    tier: 'basic',
    tickets: 5,
    satisfaction: 85
  },
  {
    id: '4',
    name: 'Emily Davis',
    email: 'emily.davis@example.com',
    phone: '(555) 456-7890',
    status: 'active',
    joinedDate: '2023-09-05',
    lastActive: '2024-01-28',
    location: 'Houston, TX',
    tier: 'premium',
    tickets: 2,
    satisfaction: 92
  },
  {
    id: '5',
    name: 'Robert Wilson',
    email: 'rwilson@example.com',
    phone: '(555) 567-8901',
    status: 'pending',
    joinedDate: '2024-01-25',
    lastActive: '2024-01-25',
    location: 'Phoenix, AZ',
    tier: 'basic',
    tickets: 0,
    satisfaction: 0
  }
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          customer.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || customer.status === filterStatus;
    const matchesTier = filterTier === 'all' || customer.tier === filterTier;
    return matchesSearch && matchesStatus && matchesTier;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800'
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const getTierBadge = (tier: string) => {
    const styles = {
      basic: 'bg-gray-100 text-gray-800',
      premium: 'bg-blue-100 text-blue-800',
      vip: 'bg-purple-100 text-purple-800'
    };
    return styles[tier as keyof typeof styles] || styles.basic;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Users className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-2xl font-bold">Customer Management</h1>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Add Customer
          </button>
        </div>
        <p className="text-gray-600">
          Manage and support your customer base
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600">{customers.length}</div>
          <div className="text-gray-600">Total Customers</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">
            {customers.filter(c => c.status === 'active').length}
          </div>
          <div className="text-gray-600">Active</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600">
            {customers.filter(c => c.tier === 'vip').length}
          </div>
          <div className="text-gray-600">VIP Customers</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-yellow-600">
            {Math.round(customers.reduce((acc, c) => acc + c.satisfaction, 0) / customers.filter(c => c.satisfaction > 0).length)}%
          </div>
          <div className="text-gray-600">Avg. Satisfaction</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Tiers</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="vip">VIP</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Filter className="w-4 h-4" />
            More Filters
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tier
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Activity
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Satisfaction
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCustomers.map(customer => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-3 h-3" />
                      {customer.location}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Mail className="w-3 h-3" />
                      {customer.email}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(customer.status)}`}>
                    {customer.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${getTierBadge(customer.tier)}`}>
                    {customer.tier.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">
                    <div className="text-gray-900">
                      Joined: {new Date(customer.joinedDate).toLocaleDateString()}
                    </div>
                    <div className="text-gray-500">
                      Last: {new Date(customer.lastActive).toLocaleDateString()}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${customer.satisfaction}%` }}
                        />
                      </div>
                      <span className="text-gray-600">{customer.satisfaction}%</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {customer.tickets} tickets
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVertical className="w-5 h-5" />
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
