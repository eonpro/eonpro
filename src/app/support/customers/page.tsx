'use client';

import { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Shield,
} from 'lucide-react';
import { normalizedIncludes } from '@/lib/utils/search';

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
    satisfaction: 95,
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
    satisfaction: 100,
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
    satisfaction: 85,
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
    satisfaction: 92,
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
    satisfaction: 0,
  },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      normalizedIncludes(customer.name || '', searchQuery) ||
      normalizedIncludes(customer.email || '', searchQuery);
    const matchesStatus = filterStatus === 'all' || customer.status === filterStatus;
    const matchesTier = filterTier === 'all' || customer.tier === filterTier;
    return matchesSearch && matchesStatus && matchesTier;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const getTierBadge = (tier: string) => {
    const styles = {
      basic: 'bg-gray-100 text-gray-800',
      premium: 'bg-blue-100 text-blue-800',
      vip: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
    };
    return styles[tier as keyof typeof styles] || styles.basic;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center">
            <Users className="mr-3 h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold">Customer Management</h1>
          </div>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
            Add Customer
          </button>
        </div>
        <p className="text-gray-600">Manage and support your customer base</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-3xl font-bold text-blue-600">{customers.length}</div>
          <div className="text-gray-600">Total Customers</div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-3xl font-bold text-green-600">
            {customers.filter((c) => c.status === 'active').length}
          </div>
          <div className="text-gray-600">Active</div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-3xl font-bold text-[var(--brand-primary)]">
            {customers.filter((c) => c.tier === 'vip').length}
          </div>
          <div className="text-gray-600">VIP Customers</div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-3xl font-bold text-yellow-600">
            {Math.round(
              customers.reduce((acc, c) => acc + c.satisfaction, 0) /
                customers.filter((c) => c.satisfaction > 0).length
            )}
            %
          </div>
          <div className="text-gray-600">Avg. Satisfaction</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Tiers</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="vip">VIP</option>
          </select>
          <button className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200">
            <Filter className="h-4 w-4" />
            More Filters
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tier
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Activity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Satisfaction
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredCustomers.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="h-3 w-3" />
                      {customer.location}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Mail className="h-3 w-3" />
                      {customer.email}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${getStatusBadge(customer.status)}`}
                  >
                    {customer.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`rounded-full px-2 py-1 text-xs ${getTierBadge(customer.tier)}`}>
                    {customer.tier.toUpperCase()}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm">
                    <div className="text-gray-900">
                      Joined: {new Date(customer.joinedDate).toLocaleDateString()}
                    </div>
                    <div className="text-gray-500">
                      Last: {new Date(customer.lastActive).toLocaleDateString()}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{ width: `${customer.satisfaction}%` }}
                        />
                      </div>
                      <span className="text-gray-600">{customer.satisfaction}%</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{customer.tickets} tickets</div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVertical className="h-5 w-5" />
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
