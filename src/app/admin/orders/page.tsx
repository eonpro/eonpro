'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Package, Search, Filter, Eye, CheckCircle, Clock, XCircle, Plus, Truck, ExternalLink, Loader2 } from 'lucide-react';

interface OrderWithTracking {
  id: number;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
  };
  primaryMedName: string | null;
  primaryMedStrength: string | null;
  status: string | null;
  shippingStatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  lifefileOrderId?: string | null;
  // Flag for records that came from PatientShippingUpdate only (no linked Order)
  _isShipmentOnly?: boolean;
  _shipmentId?: number;
}

export default function AdminOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orders, setOrders] = useState<OrderWithTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/orders/list?hasTrackingNumber=true');
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusIcon = (status: string | null) => {
    const s = status?.toLowerCase() || '';
    switch (s) {
      case 'delivered': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing': case 'shipped': case 'in_transit': return <Truck className="h-4 w-4 text-blue-500" />;
      case 'pending': case 'sent': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'cancelled': case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Package className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string | null) => {
    const s = status?.toLowerCase() || '';
    switch (s) {
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'shipped': case 'in_transit': return 'bg-indigo-100 text-indigo-800';
      case 'pending': case 'sent': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredOrders = orders.filter(order => {
    const patientName = `${order.patient.firstName} ${order.patient.lastName}`.toLowerCase();
    const matchesSearch = patientName.includes(searchTerm.toLowerCase()) ||
                         order.id.toString().includes(searchTerm) ||
                         (order.trackingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const orderStatus = order.shippingStatus || order.status || '';
    const matchesStatus = statusFilter === 'all' || orderStatus.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-600 mt-1">Prescriptions with active tracking</p>
        </div>
        <Link
          href="/admin/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="h-5 w-5" />
          New Order
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Loader2 className="h-8 w-8 text-emerald-500 mx-auto mb-4 animate-spin" />
          <p className="text-gray-500">Loading orders...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 mb-6">
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchOrders}
            className="mt-2 text-sm text-red-600 underline hover:text-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {/* Orders Table */}
      {!loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medication</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">No orders found</p>
                    <p className="text-gray-400 text-xs mt-1">Orders with tracking numbers will appear here</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order._isShipmentOnly ? `ship-${order._shipmentId}` : order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600">
                      {order._isShipmentOnly ? (
                        <span className="text-gray-500" title="Shipment from Lifefile (no linked order)">
                          {order.lifefileOrderId ? `LF-${order.lifefileOrderId.slice(-6)}` : `S-${order._shipmentId}`}
                        </span>
                      ) : (
                        `#${order.id}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/patients/${order.patient.id}`}
                        className="text-sm text-gray-900 hover:text-emerald-600"
                      >
                        {order.patient.firstName} {order.patient.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {order.primaryMedName ? (
                        <>
                          {order.primaryMedName}
                          {order.primaryMedStrength && (
                            <span className="text-gray-400 ml-1">{order.primaryMedStrength}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.shippingStatus || order.status)}`}>
                          {getStatusIcon(order.shippingStatus || order.status)}
                          {(order.shippingStatus || order.status || 'Unknown').replace('_', ' ')}
                        </span>
                        {order._isShipmentOnly && (
                          <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded" title="Tracking from Lifefile webhook - order record pending">
                            Lifefile
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {order.trackingNumber && (
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                            {order.trackingNumber}
                          </code>
                          {order.trackingUrl && (
                            <a
                              href={order.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700"
                              title="Track shipment"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/patients/${order.patient.id}`}
                        className="text-emerald-600 hover:text-emerald-700"
                        title="View patient"
                      >
                        <Eye className="h-5 w-5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
