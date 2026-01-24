"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pill, Search, Plus, AlertCircle, CheckCircle, Clock, RefreshCw, Loader2 } from "lucide-react";
import Link from "next/link";

interface Order {
  id: number;
  referenceId: string;
  status: string;
  primaryMedName: string;
  primaryMedStrength: string;
  primaryMedForm: string;
  shippingMethod: string;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  rxs?: Array<{
    id: number;
    medName: string;
    strength: string;
    form: string;
    quantity: number;
    refills: number;
    sig: string;
  }>;
}

interface Prescription {
  id: string;
  orderId: number;
  patientId: number;
  patientName: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescribedDate: string;
  status: "active" | "refill-requested" | "expired" | "discontinued";
  refillsRemaining: number;
  lastFilled?: string;
}

export default function ProviderPrescriptionsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const fetchPrescriptions = async () => {
    try {
      const token = localStorage.getItem("auth-token") || localStorage.getItem("provider-token");
      const response = await fetch("/api/orders?limit=100", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Transform orders into prescription format
        const rxList: Prescription[] = (data.orders || []).flatMap((order: Order) => {
          // If order has rxs, create a prescription entry for each
          if (order.rxs && order.rxs.length > 0) {
            return order.rxs.map((rx) => ({
              id: `RX${String(rx.id).padStart(5, "0")}`,
              orderId: order.id,
              patientId: order.patient?.id || 0,
              patientName: order.patient
                ? `${order.patient.firstName} ${order.patient.lastName}`
                : "Unknown Patient",
              medication: rx.medName,
              dosage: rx.strength,
              frequency: rx.sig,
              duration: "30 days",
              prescribedDate: order.createdAt,
              status: mapOrderStatus(order.status),
              refillsRemaining: rx.refills,
              lastFilled: order.updatedAt,
            }));
          }
          // Fallback to primary medication if no rxs
          return [{
            id: `RX${String(order.id).padStart(5, "0")}`,
            orderId: order.id,
            patientId: order.patient?.id || 0,
            patientName: order.patient
              ? `${order.patient.firstName} ${order.patient.lastName}`
              : "Unknown Patient",
            medication: order.primaryMedName,
            dosage: order.primaryMedStrength,
            frequency: "-",
            duration: "30 days",
            prescribedDate: order.createdAt,
            status: mapOrderStatus(order.status),
            refillsRemaining: 0,
            lastFilled: order.updatedAt,
          }];
        });
        setPrescriptions(rxList);
      }
    } catch (err) {
      console.error("Error fetching prescriptions:", err);
    } finally {
      setLoading(false);
    }
  };

  const mapOrderStatus = (status: string): "active" | "refill-requested" | "expired" | "discontinued" => {
    const s = status?.toLowerCase();
    if (s === "completed" || s === "sent" || s === "pending" || s === "processing") return "active";
    if (s === "refill_requested" || s === "refill-requested") return "refill-requested";
    if (s === "expired" || s === "cancelled" || s === "error") return "expired";
    if (s === "discontinued") return "discontinued";
    return "active";
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "active": return "bg-green-100 text-green-800";
      case "refill-requested": return "bg-yellow-100 text-yellow-800";
      case "expired": return "bg-red-100 text-red-800";
      case "discontinued": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "active": return <CheckCircle className="h-4 w-4" />;
      case "refill-requested": return <RefreshCw className="h-4 w-4" />;
      case "expired": return <AlertCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filteredPrescriptions = prescriptions.filter(rx => {
    const matchesSearch = 
      rx.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rx.medication.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || rx.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Pill className="h-6 w-6" />
            Prescriptions
          </h1>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Prescription
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient or medication..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Prescriptions</option>
            <option value="active">Active</option>
            <option value="refill-requested">Refill Requested</option>
            <option value="expired">Expired</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">{prescriptions.length}</div>
          <div className="text-sm text-gray-600">Total Prescriptions</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {prescriptions.filter(p => p.status === "active").length}
          </div>
          <div className="text-sm text-gray-600">Active</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {prescriptions.filter(p => p.status === "refill-requested").length}
          </div>
          <div className="text-sm text-gray-600">Refill Requests</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-red-600">
            {prescriptions.filter(p => p.status === "expired").length}
          </div>
          <div className="text-sm text-gray-600">Expired</div>
        </div>
      </div>

      {/* Prescriptions List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          {filteredPrescriptions.length === 0 ? (
            <div className="text-center py-12">
              <Pill className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm ? "No prescriptions match your search" : "No prescriptions yet"}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Prescriptions will appear here when you create orders for patients.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Rx #</th>
                    <th className="text-left py-3 px-4">Patient</th>
                    <th className="text-left py-3 px-4">Medication</th>
                    <th className="text-left py-3 px-4">Dosage & Frequency</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Refills</th>
                    <th className="text-left py-3 px-4">Last Filled</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrescriptions.map((rx) => (
                    <tr key={`${rx.id}-${rx.orderId}`} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{rx.id}</td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/patients/${rx.patientId}`}
                          className="font-medium text-green-700 hover:underline"
                        >
                          {rx.patientName}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{rx.medication}</div>
                        <div className="text-sm text-gray-500">Duration: {rx.duration}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div>{rx.dosage}</div>
                        <div className="text-sm text-gray-500 max-w-[200px] truncate" title={rx.frequency}>
                          {rx.frequency}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStatusColor(rx.status)}`}>
                          {getStatusIcon(rx.status)}
                          {rx.status.replace("-", " ")}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{rx.refillsRemaining}</div>
                        <div className="text-sm text-gray-500">remaining</div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {rx.lastFilled ? new Date(rx.lastFilled).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Link
                            href={`/patients/${rx.patientId}?tab=prescriptions`}
                            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Pending Actions */}
      {prescriptions.filter(p => p.status === "refill-requested").length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <span className="font-medium text-yellow-800">
              {prescriptions.filter(p => p.status === "refill-requested").length} refill requests pending approval
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
