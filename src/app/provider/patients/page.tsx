"use client";

import { useState } from "react";
import { Users, Search, Filter, UserPlus, Activity, Calendar, FileText, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  lastVisit: string;
  nextAppointment?: string;
  conditions: string[];
  status: "active" | "inactive" | "critical";
  compliance: "good" | "moderate" | "poor";
}

export default function ProviderPatientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Mock patients
  const patients: Patient[] = [
    {
      id: "1",
      name: "Sarah Johnson",
      age: 45,
      gender: "Female",
      lastVisit: "2024-01-15",
      nextAppointment: "2024-02-01",
      conditions: ["Hypertension", "Type 2 Diabetes"],
      status: "active",
      compliance: "good"
    },
    {
      id: "2",
      name: "Michael Chen",
      age: 62,
      gender: "Male",
      lastVisit: "2024-01-20",
      conditions: ["Heart Disease", "High Cholesterol"],
      status: "critical",
      compliance: "moderate"
    },
    {
      id: "3",
      name: "Emily Davis",
      age: 28,
      gender: "Female",
      lastVisit: "2024-01-18",
      nextAppointment: "2024-02-15",
      conditions: ["Anxiety", "PCOS"],
      status: "active",
      compliance: "good"
    },
    {
      id: "4",
      name: "James Wilson",
      age: 55,
      gender: "Male",
      lastVisit: "2023-12-10",
      conditions: ["Obesity", "Sleep Apnea"],
      status: "inactive",
      compliance: "poor"
    },
    {
      id: "5",
      name: "Lisa Anderson",
      age: 38,
      gender: "Female",
      lastVisit: "2024-01-22",
      nextAppointment: "2024-01-30",
      conditions: ["Hypothyroidism"],
      status: "active",
      compliance: "good"
    }
  ];

  const getStatusColor = (status: string) => {
    switch(status) {
      case "active": return "bg-green-100 text-green-800";
      case "critical": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getComplianceColor = (compliance: string) => {
    switch(compliance) {
      case "good": return "text-green-600";
      case "moderate": return "text-yellow-600";
      default: return "text-red-600";
    }
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || patient.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            My Patients
          </h1>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add Patient
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search patients by name..."
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
            <option value="all">All Patients</option>
            <option value="active">Active</option>
            <option value="critical">Critical</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">{patients.length}</div>
          <div className="text-sm text-gray-600">Total Patients</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {patients.filter(p => p.status === "active").length}
          </div>
          <div className="text-sm text-gray-600">Active</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-red-600">
            {patients.filter(p => p.status === "critical").length}
          </div>
          <div className="text-sm text-gray-600">Critical</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {patients.filter(p => p.nextAppointment).length}
          </div>
          <div className="text-sm text-gray-600">Scheduled</div>
        </div>
      </div>

      {/* Patients List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Patient</th>
                  <th className="text-left py-3 px-4">Age/Gender</th>
                  <th className="text-left py-3 px-4">Conditions</th>
                  <th className="text-left py-3 px-4">Last Visit</th>
                  <th className="text-left py-3 px-4">Next Appointment</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Compliance</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{patient.name}</div>
                      <div className="text-sm text-gray-500">ID: {patient.id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{patient.age} years</div>
                      <div className="text-sm text-gray-500">{patient.gender}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {patient.conditions.map((condition, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                          >
                            {condition}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {new Date(patient.lastVisit).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {patient.nextAppointment ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {new Date(patient.nextAppointment).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not scheduled</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(patient.status)}`}>
                        {patient.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${getComplianceColor(patient.compliance)}`}>
                        {patient.compliance}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                        >
                          View
                        </Link>
                        <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                          Message
                        </button>
                        {patient.status === "critical" && (
                          <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">
                            Alert
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
