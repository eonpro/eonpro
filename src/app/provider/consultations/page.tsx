"use client";

import { useState, useEffect } from "react";
import { Video, Clock, User, Calendar, FileText, MessageSquare, CheckCircle, XCircle, AlertCircle, Plus } from "lucide-react";

interface Consultation {
  id: number;
  patientName: string;
  patientId: number;
  type: "VIDEO" | "IN_PERSON" | "PHONE";
  startTime: string;
  endTime: string;
  duration: number;
  status: "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  reason: string;
  notes?: string;
}

export default function ProviderConsultationsPage() {
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real consultations from API
  useEffect(() => {
    async function fetchConsultations() {
      try {
        setLoading(true);
        const token = localStorage.getItem('token') || 
                      localStorage.getItem('auth-token') || 
                      localStorage.getItem('provider-token');
        
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
        const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString();
        
        const response = await fetch(`/api/scheduling/appointments?startDate=${startDate}&endDate=${endDate}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const mapped = (data.appointments || []).map((apt: any) => ({
            id: apt.id,
            patientName: `${apt.patient?.firstName || ''} ${apt.patient?.lastName || ''}`.trim() || 'Unknown Patient',
            patientId: apt.patientId,
            type: apt.type || 'IN_PERSON',
            startTime: apt.startTime,
            endTime: apt.endTime,
            duration: apt.duration || 30,
            status: apt.status,
            reason: apt.reason || apt.title || 'Consultation',
            notes: apt.notes,
          }));
          setConsultations(mapped);
        } else {
          setConsultations([]);
        }
      } catch (err) {
        console.error('Failed to fetch consultations:', err);
        setConsultations([]);
        setError('Failed to load consultations. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchConsultations();
  }, []);

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "COMPLETED": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "CANCELLED": 
      case "NO_SHOW": return <XCircle className="h-4 w-4 text-red-600" />;
      case "IN_PROGRESS": 
      case "CHECKED_IN": return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default: return <Clock className="h-4 w-4 text-blue-600" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case "VIDEO": return "bg-purple-100 text-purple-800";
      case "PHONE": return "bg-green-100 text-green-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  const filteredConsultations = consultations.filter(c => 
    activeTab === "upcoming" 
      ? ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(c.status)
      : ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(c.status)
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = consultations.filter(c => c.startTime?.startsWith(todayStr)).length;
  const videoCount = consultations.filter(c => c.type === "VIDEO").length;
  const completedCount = consultations.filter(c => c.status === "COMPLETED").length;

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
          <div className="text-2xl font-bold text-indigo-600">{todayCount}</div>
          <div className="text-sm text-gray-600">Today&apos;s Consultations</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">{videoCount}</div>
          <div className="text-sm text-gray-600">Video Calls</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-orange-600">{consultations.length}</div>
          <div className="text-sm text-gray-600">Total Appointments</div>
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
            {loading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                Loading consultations...
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <p className="font-medium mb-1">Error Loading Consultations</p>
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded text-sm font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : filteredConsultations.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No {activeTab === "upcoming" ? "upcoming" : "past"} consultations
                </h3>
                <p className="text-gray-500 mb-4">
                  {activeTab === "upcoming" 
                    ? "Schedule a consultation to get started."
                    : "Completed consultations will appear here."}
                </p>
                {activeTab === "upcoming" && (
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Schedule Consultation
                  </button>
                )}
              </div>
            ) : (
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
                            {new Date(consultation.startTime).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {new Date(consultation.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({consultation.duration} min)
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getTypeColor(consultation.type)}`}>
                            {consultation.type.toLowerCase().replace('_', '-')}
                          </span>
                        </div>
                      </div>
                      {["SCHEDULED", "CONFIRMED"].includes(consultation.status) && (
                        <button className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                          Join
                        </button>
                      )}
                      {consultation.status === "IN_PROGRESS" && (
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
                  </div>
                ))}
              </div>
            )}
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
                    {new Date(selectedConsultation.startTime).toLocaleDateString()} at {new Date(selectedConsultation.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Type</label>
                  <p className="font-medium capitalize">{selectedConsultation.type.toLowerCase().replace('_', ' ')}</p>
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
                  <a 
                    href={`/admin/patients/${selectedConsultation.patientId}`}
                    className="block w-full px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-center"
                  >
                    View Patient Profile
                  </a>
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
