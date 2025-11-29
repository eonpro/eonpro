"use client";

import { useState } from "react";
import { Package, Search, Truck, CheckCircle, Clock, AlertCircle, DollarSign } from "lucide-react";

interface Order {
  id: string;
  patientName: string;
  orderDate: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  type: "prescription" | "medical-supplies" | "equipment";
  items: number;
  totalAmount: number;
  pharmacy?: string;
  trackingNumber?: string;
  priority: "normal" | "rush";
}

export default function StaffOrdersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Mock orders
  const orders: Order[] = [
    {
      id: "ORD-001",
      patientName: "Sarah Johnson",
      orderDate: "2024-01-30T09:00:00",
      status: "processing",
      type: "prescription",
      items: 3,
      totalAmount: 125.50,
      pharmacy: "CVS Pharmacy",
      priority: "normal"
    },
    {
      id: "ORD-002",
      patientName: "Michael Chen",
      orderDate: "2024-01-29T14:30:00",
      status: "shipped",
      type: "medical-supplies",
      items: 5,
      totalAmount: 89.99,
      trackingNumber: "1Z999AA10123456784",
      priority: "rush"
    },
    {
      id: "ORD-003",
      patientName: "Emily Davis",
      orderDate: "2024-01-28T11:00:00",
      status: "delivered",
      type: "prescription",
      items: 2,
      totalAmount: 45.00,
      pharmacy: "Walgreens",
      trackingNumber: "1Z999AA10123456785",
      priority: "normal"
    },
    {
      id: "ORD-004",
      patientName: "James Wilson",
      orderDate: "2024-01-30T10:15:00",
      status: "pending",
      type: "equipment",
      items: 1,
      totalAmount: 450.00,
      priority: "normal"
    },
    {
      id: "ORD-005",
      patientName: "Lisa Anderson",
      orderDate: "2024-01-30T08:30:00",
      status: "processing",
      type: "prescription",
      items: 4,
      totalAmount: 78.50,
      pharmacy: "RiteAid",
      priority: "rush"
    }
  ];

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "delivered": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "shipped": return <Truck className="h-4 w-4 text-blue-600" />;
      case "processing": return <Clock className="h-4 w-4 text-yellow-600" />;
      case "cancelled": return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "delivered": return "bg-green-100 text-green-800";
      case "shipped": return "bg-blue-100 text-blue-800";
      case "processing": return "bg-yellow-100 text-yellow-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case "prescription": return "bg-purple-100 text-purple-800";
      case "medical-supplies": return "bg-cyan-100 text-cyan-800";
      case "equipment": return "bg-indigo-100 text-indigo-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || order.status === filterStatus;
    const matchesType = filterType === "all" || order.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Order Management
          </h1>
          <button className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">
            Create Order
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient or order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500"
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
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500"
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
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-cyan-600">{filteredOrders.length}</div>
          <div className="text-sm text-gray-600">Total Orders</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {filteredOrders.filter(o => o.status === "pending").length}
          </div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {filteredOrders.filter(o => o.status === "shipped").length}
          </div>
          <div className="text-sm text-gray-600">In Transit</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-red-600">
            {filteredOrders.filter(o => o.priority === "rush").length}
          </div>
          <div className="text-sm text-gray-600">Rush Orders</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            ${totalRevenue.toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">Total Value</div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Order ID</th>
                  <th className="text-left py-3 px-4">Patient</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Items</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Priority</th>
                  <th className="text-left py-3 px-4">Pharmacy/Vendor</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{order.id}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{order.patientName}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(order.orderDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getTypeColor(order.type)}`}>
                        {order.type.replace("-", " ")}
                      </span>
                    </td>
                    <td className="py-3 px-4">{order.items}</td>
                    <td className="py-3 px-4 font-medium">${order.totalAmount.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        {order.status}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        order.priority === "rush" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {order.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {order.pharmacy || "-"}
                      {order.trackingNumber && (
                        <div className="text-xs text-gray-500 mt-1">
                          Track: {order.trackingNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button className="px-3 py-1 text-sm bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200">
                          View
                        </button>
                        {order.status === "pending" && (
                          <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                            Process
                          </button>
                        )}
                        {order.trackingNumber && (
                          <button className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
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
