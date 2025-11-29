"use client";

import { useState } from "react";
import { Video, Clock, User, Calendar, FileText, MessageSquare, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface Consultation {
  id: string;
  patientName: string;
  type: "video" | "in-person" | "phone";
  date: string;
  time: string;
  duration: string;
  status: "upcoming" | "in-progress" | "completed" | "cancelled";
  reason: string;
  notes?: string;
  followUpRequired: boolean;
}

export default function ProviderConsultationsPage() {
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  // Mock consultations
  const consultations: Consultation[] = [
    {
      id: "1",
      patientName: "Sarah Johnson",
      type: "video",
      date: "2024-01-30",
      time: "10:00 AM",
      duration: "30 min",
      status: "upcoming",
      reason: "Follow-up - Hypertension management",
      followUpRequired: false
    },
    {
      id: "2",
      patientName: "Michael Chen",
      type: "in-person",
      date: "2024-01-30",
      time: "11:00 AM",
      duration: "45 min",
      status: "upcoming",
      reason: "Cardiac evaluation",
      followUpRequired: true
    },
    {
      id: "3",
      patientName: "Emily Davis",
      type: "video",
      date: "2024-01-29",
      time: "2:00 PM",
      duration: "30 min",
      status: "completed",
      reason: "Anxiety management",
      notes: "Patient showing improvement. Continue current medication.",
      followUpRequired: true
    },
    {
      id: "4",
      patientName: "James Wilson",
      type: "phone",
      date: "2024-01-28",
      time: "3:30 PM",
      duration: "15 min",
      status: "completed",
      reason: "Lab results review",
      notes: "Cholesterol levels improved. Continue statin therapy.",
      followUpRequired: false
    },
    {
      id: "5",
      patientName: "Lisa Anderson",
      type: "video",
      date: "2024-01-30",
      time: "9:30 AM",
      duration: "30 min",
      status: "in-progress",
      reason: "Thyroid check-up",
      followUpRequired: false
    }
  ];

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "completed": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "cancelled": return <XCircle className="h-4 w-4 text-red-600" />;
      case "in-progress": return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default: return <Clock className="h-4 w-4 text-blue-600" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case "video": return "bg-purple-100 text-purple-800";
      case "phone": return "bg-green-100 text-green-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  const filteredConsultations = consultations.filter(c => 
    activeTab === "upcoming" 
      ? ["upcoming", "in-progress"].includes(c.status)
      : ["completed", "cancelled"].includes(c.status)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Video className="h-6 w-6" />
          Consultations
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">
            {consultations.filter(c => c.date === "2024-01-30").length}
          </div>
          <div className="text-sm text-gray-600">Today's Consultations</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">
            {consultations.filter(c => c.type === "video").length}
          </div>
          <div className="text-sm text-gray-600">Video Calls</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {consultations.filter(c => c.status === "completed").length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-orange-600">
            {consultations.filter(c => c.followUpRequired).length}
          </div>
          <div className="text-sm text-gray-600">Follow-up Required</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Consultations List */}
        <div className="col-span-2 bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab("upcoming")}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === "upcoming"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === "history"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                History
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {filteredConsultations.map((consultation) => (
                <div
                  key={consultation.id}
                  onClick={() => setSelectedConsultation(consultation)}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{consultation.patientName}</span>
                        {getStatusIcon(consultation.status)}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">{consultation.reason}</div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(consultation.date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {consultation.time} ({consultation.duration})
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs ${getTypeColor(consultation.type)}`}>
                          {consultation.type}
                        </span>
                      </div>
                    </div>
                    {consultation.status === "upcoming" && (
                      <button className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                        Join
                      </button>
                    )}
                    {consultation.status === "in-progress" && (
                      <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                        Continue
                      </button>
                    )}
                  </div>
                  {consultation.notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-600">
                      <strong>Notes:</strong> {consultation.notes}
                    </div>
                  )}
                  {consultation.followUpRequired && (
                    <div className="mt-2 text-sm text-orange-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Follow-up required
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Schedule Consultation
              </button>
              <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                Start Video Call
              </button>
              <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                View Templates
              </button>
            </div>
          </div>

          {/* Selected Consultation Details */}
          {selectedConsultation && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4">Consultation Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-500">Patient</label>
                  <p className="font-medium">{selectedConsultation.patientName}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Date & Time</label>
                  <p className="font-medium">
                    {new Date(selectedConsultation.date).toLocaleDateString()} at {selectedConsultation.time}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Type</label>
                  <p className="font-medium capitalize">{selectedConsultation.type}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Reason</label>
                  <p className="font-medium">{selectedConsultation.reason}</p>
                </div>
                {selectedConsultation.notes && (
                  <div>
                    <label className="text-sm text-gray-500">Notes</label>
                    <p className="text-sm">{selectedConsultation.notes}</p>
                  </div>
                )}
                <div className="pt-3 space-y-2">
                  <button className="w-full px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                    View Patient Profile
                  </button>
                  <button className="w-full px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200">
                    Create SOAP Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
