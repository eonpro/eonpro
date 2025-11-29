"use client";

import { useState } from "react";
import { ClipboardList, Search, Filter, Eye, CheckCircle, Clock, AlertCircle, UserPlus } from "lucide-react";
import Link from "next/link";

interface IntakeForm {
  id: string;
  patientName: string;
  submittedAt: string;
  status: "pending" | "reviewing" | "completed" | "needs-info";
  type: "new-patient" | "follow-up" | "consultation";
  priority: "normal" | "urgent";
  assignedTo?: string;
}

export default function StaffIntakePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  // Mock intake forms
  const intakeForms: IntakeForm[] = [
    {
      id: "INT-001",
      patientName: "John Smith",
      submittedAt: "2024-01-30T09:30:00",
      status: "pending",
      type: "new-patient",
      priority: "normal"
    },
    {
      id: "INT-002",
      patientName: "Maria Garcia",
      submittedAt: "2024-01-30T10:15:00",
      status: "reviewing",
      type: "follow-up",
      priority: "urgent",
      assignedTo: "Jane Doe"
    },
    {
      id: "INT-003",
      patientName: "Robert Johnson",
      submittedAt: "2024-01-30T11:00:00",
      status: "needs-info",
      type: "consultation",
      priority: "normal"
    },
    {
      id: "INT-004",
      patientName: "Linda Williams",
      submittedAt: "2024-01-29T14:30:00",
      status: "completed",
      type: "new-patient",
      priority: "normal",
      assignedTo: "John Staff"
    },
    {
      id: "INT-005",
      patientName: "David Chen",
      submittedAt: "2024-01-30T08:45:00",
      status: "pending",
      type: "follow-up",
      priority: "urgent"
    }
  ];

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "completed": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "reviewing": return <Eye className="h-4 w-4 text-blue-600" />;
      case "needs-info": return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "completed": return "bg-green-100 text-green-800";
      case "reviewing": return "bg-blue-100 text-blue-800";
      case "needs-info": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    return priority === "urgent" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";
  };

  const filteredForms = intakeForms.filter(form => {
    const matchesSearch = form.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || form.status === filterStatus;
    const matchesPriority = filterPriority === "all" || form.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Intake Forms
          </h1>
          <button className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            New Intake
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient name..."
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
            <option value="reviewing">Reviewing</option>
            <option value="needs-info">Needs Info</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Priorities</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-cyan-600">{intakeForms.length}</div>
          <div className="text-sm text-gray-600">Total Forms</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-600">
            {intakeForms.filter(f => f.status === "pending").length}
          </div>
          <div className="text-sm text-gray-600">Pending Review</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-red-600">
            {intakeForms.filter(f => f.priority === "urgent").length}
          </div>
          <div className="text-sm text-gray-600">Urgent</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {intakeForms.filter(f => f.status === "completed").length}
          </div>
          <div className="text-sm text-gray-600">Completed Today</div>
        </div>
      </div>

      {/* Forms List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Form ID</th>
                  <th className="text-left py-3 px-4">Patient</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Submitted</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Priority</th>
                  <th className="text-left py-3 px-4">Assigned To</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredForms.map((form) => (
                  <tr key={form.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{form.id}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{form.patientName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize">{form.type.replace("-", " ")}</span>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {new Date(form.submittedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStatusColor(form.status)}`}>
                        {getStatusIcon(form.status)}
                        {form.status.replace("-", " ")}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(form.priority)}`}>
                        {form.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {form.assignedTo || "-"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/intake/preview/${form.id}`}
                          className="px-3 py-1 text-sm bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200"
                        >
                          Review
                        </Link>
                        {form.status === "pending" && (
                          <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                            Process
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
