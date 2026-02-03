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
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Prescriptions
            </h1>
            <button className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              New Prescription
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by patient or medication..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-indigo-500">
            <div className="text-xl font-bold text-indigo-600">{prescriptions.length}</div>
            <div className="text-xs text-gray-500">Total Prescriptions</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-500">
            <div className="text-xl font-bold text-green-600">
              {prescriptions.filter(p => p.status === "active").length}
            </div>
            <div className="text-xs text-gray-500">Active</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-yellow-500">
            <div className="text-xl font-bold text-yellow-600">
              {prescriptions.filter(p => p.status === "refill-requested").length}
            </div>
            <div className="text-xs text-gray-500">Refill Requests</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-red-500">
            <div className="text-xl font-bold text-red-600">
              {prescriptions.filter(p => p.status === "expired").length}
            </div>
            <div className="text-xs text-gray-500">Expired</div>
          </div>
        </div>

        {/* Prescriptions List */}
        <div className="bg-white rounded-lg shadow-sm">
          {filteredPrescriptions.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Pill className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {searchTerm ? "No prescriptions match your search" : "No prescriptions yet"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Prescriptions will appear here when you create orders for patients.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="border-b">
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Rx #</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Patient</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Medication</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Dosage & Frequency</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Refills</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Last Filled</th>
                    <th className="text-left py-2.5 px-3 font-medium text-gray-600 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPrescriptions.map((rx) => (
                    <tr key={`${rx.id}-${rx.orderId}`} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-medium text-gray-900">{rx.id}</td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/patients/${rx.patientId}`}
                          className="font-medium text-green-700 hover:underline"
                        >
                          {rx.patientName}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-gray-900 max-w-[180px] truncate" title={rx.medication}>{rx.medication}</div>
                        <div className="text-xs text-gray-500">Duration: {rx.duration}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-gray-900">{rx.dosage}</div>
                        <div className="text-xs text-gray-500 max-w-[150px] truncate" title={rx.frequency}>
                          {rx.frequency}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(rx.status)}`}>
                          {getStatusIcon(rx.status)}
                          {rx.status.replace("-", " ")}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-gray-900">{rx.refillsRemaining}</div>
                        <div className="text-xs text-gray-500">remaining</div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {rx.lastFilled ? new Date(rx.lastFilled).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/patients/${rx.patientId}?tab=prescriptions`}
                          className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending Actions */}
        {prescriptions.filter(p => p.status === "refill-requested").length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800">
                {prescriptions.filter(p => p.status === "refill-requested").length} refill requests pending approval
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
