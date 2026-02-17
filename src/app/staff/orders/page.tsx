'use client';

import { useState } from 'react';
import { Package, Search, Truck, CheckCircle, Clock, AlertCircle, DollarSign } from 'lucide-react';
import { normalizedIncludes } from '@/lib/utils/search';

interface Order {
  id: string;
  patientName: string;
  orderDate: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  type: 'prescription' | 'medical-supplies' | 'equipment';
  items: number;
  totalAmount: number;
  pharmacy?: string;
  trackingNumber?: string;
  priority: 'normal' | 'rush';
}

export default function StaffOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Mock orders
  const orders: Order[] = [
    {
      id: 'ORD-001',
      patientName: 'Sarah Johnson',
      orderDate: '2024-01-30T09:00:00',
      status: 'processing',
      type: 'prescription',
      items: 3,
      totalAmount: 125.5,
      pharmacy: 'CVS Pharmacy',
      priority: 'normal',
    },
    {
      id: 'ORD-002',
      patientName: 'Michael Chen',
      orderDate: '2024-01-29T14:30:00',
      status: 'shipped',
      type: 'medical-supplies',
      items: 5,
      totalAmount: 89.99,
      trackingNumber: '1Z999AA10123456784',
      priority: 'rush',
    },
    {
      id: 'ORD-003',
      patientName: 'Emily Davis',
      orderDate: '2024-01-28T11:00:00',
      status: 'delivered',
      type: 'prescription',
      items: 2,
      totalAmount: 45.0,
      pharmacy: 'Walgreens',
      trackingNumber: '1Z999AA10123456785',
      priority: 'normal',
    },
    {
      id: 'ORD-004',
      patientName: 'James Wilson',
      orderDate: '2024-01-30T10:15:00',
      status: 'pending',
      type: 'equipment',
      items: 1,
      totalAmount: 450.0,
      priority: 'normal',
    },
    {
      id: 'ORD-005',
      patientName: 'Lisa Anderson',
      orderDate: '2024-01-30T08:30:00',
      status: 'processing',
      type: 'prescription',
      items: 4,
      totalAmount: 78.5,
      pharmacy: 'RiteAid',
      priority: 'rush',
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'shipped':
        return <Truck className="h-4 w-4 text-blue-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'prescription':
        return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]';
      case 'medical-supplies':
        return 'bg-cyan-100 text-cyan-800';
      case 'equipment':
        return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      normalizedIncludes(order.patientName || '', searchTerm) ||
      normalizedIncludes(order.id || '', searchTerm);
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    const matchesType = filterType === 'all' || order.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6" />
            Order Management
          </h1>
          <button className="rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700">
            Create Order
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient or order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border py-2 pl-10 pr-4 focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Types</option>
            <option value="prescription">Prescriptions</option>
            <option value="medical-supplies">Medical Supplies</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-cyan-600">{filteredOrders.length}</div>
          <div className="text-sm text-gray-600">Total Orders</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-yellow-600">
            {filteredOrders.filter((o) => o.status === 'pending').length}
          </div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {filteredOrders.filter((o) => o.status === 'shipped').length}
          </div>
          <div className="text-sm text-gray-600">In Transit</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-red-600">
            {filteredOrders.filter((o) => o.priority === 'rush').length}
          </div>
          <div className="text-sm text-gray-600">Rush Orders</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(2)}</div>
          <div className="text-sm text-gray-600">Total Value</div>
        </div>
      </div>

      {/* Orders List */}
      <div className="rounded-lg bg-white shadow">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left">Order ID</th>
                  <th className="px-4 py-3 text-left">Patient</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Pharmacy/Vendor</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{order.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{order.patientName}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(order.orderDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${getTypeColor(order.type)}`}
                      >
                        {order.type.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">{order.items}</td>
                    <td className="px-4 py-3 font-medium">${order.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${getStatusColor(order.status)}`}
                      >
                        {getStatusIcon(order.status)}
                        {order.status}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          order.priority === 'rush'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {order.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {order.pharmacy || '-'}
                      {order.trackingNumber && (
                        <div className="mt-1 text-xs text-gray-500">
                          Track: {order.trackingNumber}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button className="rounded bg-cyan-100 px-3 py-1 text-sm text-cyan-700 hover:bg-cyan-200">
                          View
                        </button>
                        {order.status === 'pending' && (
                          <button className="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200">
                            Process
                          </button>
                        )}
                        {order.trackingNumber && (
                          <button className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200">
                            Track
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
