"use client";

import { useState } from "react";
import { Pill, Search, Plus, AlertCircle, CheckCircle, Clock, RefreshCw } from "lucide-react";

interface Prescription {
  id: string;
  patientName: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescribedDate: string;
  status: "active" | "refill-requested" | "expired" | "discontinued";
  refillsRemaining: number;
  lastFilled?: string;
  pharmacy: string;
}

export default function ProviderPrescriptionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Mock prescriptions
  const prescriptions: Prescription[] = [
    {
      id: "RX001",
      patientName: "Sarah Johnson",
      medication: "Lisinopril",
      dosage: "10mg",
      frequency: "Once daily",
      duration: "90 days",
      prescribedDate: "2024-01-01",
      status: "active",
      refillsRemaining: 3,
      lastFilled: "2024-01-05",
      pharmacy: "CVS Pharmacy - Main St"
    },
    {
      id: "RX002",
      patientName: "Michael Chen",
      medication: "Atorvastatin",
      dosage: "40mg",
      frequency: "Once daily at bedtime",
      duration: "30 days",
      prescribedDate: "2023-12-15",
      status: "refill-requested",
      refillsRemaining: 1,
      lastFilled: "2023-12-20",
      pharmacy: "Walgreens - Downtown"
    },
    {
      id: "RX003",
      patientName: "Emily Davis",
      medication: "Sertraline",
      dosage: "50mg",
      frequency: "Once daily",
      duration: "30 days",
      prescribedDate: "2024-01-10",
      status: "active",
      refillsRemaining: 5,
      lastFilled: "2024-01-12",
      pharmacy: "CVS Pharmacy - Main St"
    },
    {
      id: "RX004",
      patientName: "James Wilson",
      medication: "Metformin",
      dosage: "500mg",
      frequency: "Twice daily with meals",
      duration: "90 days",
      prescribedDate: "2023-10-01",
      status: "expired",
      refillsRemaining: 0,
      lastFilled: "2023-10-05",
      pharmacy: "RiteAid - West End"
    },
    {
      id: "RX005",
      patientName: "Lisa Anderson",
      medication: "Levothyroxine",
      dosage: "75mcg",
      frequency: "Once daily on empty stomach",
      duration: "90 days",
      prescribedDate: "2024-01-15",
      status: "active",
      refillsRemaining: 4,
      lastFilled: "2024-01-16",
      pharmacy: "Walgreens - Downtown"
    }
  ];

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
                  <tr key={rx.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{rx.id}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{rx.patientName}</div>
                      <div className="text-sm text-gray-500">{rx.pharmacy}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{rx.medication}</div>
                      <div className="text-sm text-gray-500">Duration: {rx.duration}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{rx.dosage}</div>
                      <div className="text-sm text-gray-500">{rx.frequency}</div>
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
                      {rx.lastFilled ? new Date(rx.lastFilled).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {rx.status === "refill-requested" && (
                          <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                            Approve
                          </button>
                        )}
                        {rx.status === "active" && (
                          <button className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                            Refill
                          </button>
                        )}
                        {rx.status === "expired" && (
                          <button className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                            Renew
                          </button>
                        )}
                        <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pending Actions */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          <span className="font-medium text-yellow-800">
            {prescriptions.filter(p => p.status === "refill-requested").length} refill requests pending approval
          </span>
        </div>
      </div>
    </div>
  );
}
