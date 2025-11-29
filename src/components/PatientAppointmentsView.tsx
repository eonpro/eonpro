"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, Video, MapPin, User, Phone, Mail, Plus, Filter, Download, X } from "lucide-react";

interface Appointment {
  id: number;
  date: Date;
  time: string;
  duration: number;
  type: "telehealth" | "in-person";
  status: "scheduled" | "completed" | "cancelled" | "no-show";
  provider: {
    name: string;
    specialty?: string;
  };
  reason?: string;
  notes?: string;
  zoomLink?: string;
  location?: string;
}

interface PatientAppointmentsViewProps {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dob: string | null;
  };
}

export default function PatientAppointmentsView({ patient }: PatientAppointmentsViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    date: "",
    time: "",
    duration: "30",
    type: "telehealth" as "telehealth" | "in-person",
    provider: "",
    reason: "",
    notes: "",
    location: ""
  });

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showNewAppointmentModal) {
        setShowNewAppointmentModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showNewAppointmentModal]);

  // Mock data for demonstration
  useEffect(() => {
    const mockAppointments: Appointment[] = [
      {
        id: 1,
        date: new Date(2024, 11, 5, 10, 0),
        time: "10:00 AM",
        duration: 30,
        type: "telehealth",
        status: "scheduled",
        provider: {
          name: "Dr. Sarah Johnson",
          specialty: "Primary Care"
        },
        reason: "Follow-up consultation",
        notes: "Review lab results",
        zoomLink: "https://zoom.us/j/123456789"
      },
      {
        id: 2,
        date: new Date(2024, 11, 12, 14, 30),
        time: "2:30 PM",
        duration: 45,
        type: "in-person",
        status: "scheduled",
        provider: {
          name: "Dr. Michael Chen",
          specialty: "Endocrinology"
        },
        reason: "Hormone therapy consultation",
        location: "Main Clinic - Room 203"
      },
      {
        id: 3,
        date: new Date(2024, 10, 15, 11, 0),
        time: "11:00 AM",
        duration: 30,
        type: "telehealth",
        status: "completed",
        provider: {
          name: "Dr. Sarah Johnson",
          specialty: "Primary Care"
        },
        reason: "Initial consultation",
        notes: "Prescribed medication, follow-up in 2 weeks",
        zoomLink: "https://zoom.us/j/987654321"
      },
      {
        id: 4,
        date: new Date(2024, 10, 1, 9, 0),
        time: "9:00 AM",
        duration: 30,
        type: "in-person",
        status: "completed",
        provider: {
          name: "Dr. Emily Roberts",
          specialty: "Cardiology"
        },
        reason: "Annual checkup",
        location: "Main Clinic - Room 105"
      }
    ];

    setAppointments(mockAppointments);
  }, []);

  const filteredAppointments = appointments.filter(apt => {
    const now = new Date();
    if (filter === "upcoming") {
      return apt.date >= now;
    } else if (filter === "past") {
      return apt.date < now;
    }
    return true;
  }).sort((a, b) => b.date.getTime() - a.date.getTime());

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-700";
      case "completed":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      case "no-show":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getTypeIcon = (type: string) => {
    if (type === "telehealth") {
      return <Video className="w-4 h-4" />;
    }
    return <MapPin className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Appointment History</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage and view all appointments for {patient.firstName} {patient.lastName}
            </p>
          </div>
          <button
            onClick={() => setShowNewAppointmentModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Schedule Appointment
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
          {(["upcoming", "past", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded transition-colors capitalize ${
                filter === f
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {f === "all" ? "All" : f === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
      </div>

      {/* Appointments List */}
      <div className="space-y-4">
        {filteredAppointments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No {filter === "all" ? "" : filter} appointments found</p>
            {filter === "upcoming" && (
              <button
                onClick={() => setShowNewAppointmentModal(true)}
                className="mt-4 text-[#4fa77e] hover:text-[#3f8660] font-medium"
              >
                Schedule an appointment →
              </button>
            )}
          </div>
        ) : (
          filteredAppointments.map(appointment => (
            <div
              key={appointment.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  {/* Date Box */}
                  <div className="text-center min-w-[80px]">
                    <div className="bg-gray-100 rounded-lg p-3">
                      <div className="text-xs text-gray-600 uppercase">
                        {appointment.date.toLocaleDateString("en-US", { month: "short" })}
                      </div>
                      <div className="text-2xl font-bold">
                        {appointment.date.getDate()}
                      </div>
                      <div className="text-xs text-gray-600">
                        {appointment.date.toLocaleDateString("en-US", { weekday: "short" })}
                      </div>
                    </div>
                  </div>

                  {/* Appointment Details */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-4">
                      <h3 className="font-semibold text-lg">{appointment.reason || "Medical Appointment"}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(appointment.status)}`}>
                        {appointment.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{appointment.time} • {appointment.duration} minutes</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <User className="w-4 h-4" />
                        <span>{appointment.provider.name}</span>
                        {appointment.provider.specialty && (
                          <span className="text-xs text-gray-500">({appointment.provider.specialty})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        {getTypeIcon(appointment.type)}
                        <span className="capitalize">{appointment.type.replace("-", " ")}</span>
                      </div>
                      {appointment.type === "telehealth" && appointment.zoomLink && (
                        <div className="flex items-center gap-2">
                          <a
                            href={appointment.zoomLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
                          >
                            <Video className="w-4 h-4" />
                            Join Zoom Meeting
                          </a>
                        </div>
                      )}
                      {appointment.type === "in-person" && appointment.location && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{appointment.location}</span>
                        </div>
                      )}
                    </div>

                    {appointment.notes && (
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                        <span className="font-medium">Notes: </span>
                        {appointment.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {appointment.status === "scheduled" && appointment.date >= new Date() && (
                    <>
                      <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                  {appointment.status === "completed" && (
                    <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.status === "completed").length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.status === "scheduled" && a.date >= new Date()).length}
          </div>
          <div className="text-sm text-gray-600">Upcoming</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.type === "telehealth").length}
          </div>
          <div className="text-sm text-gray-600">Telehealth</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {appointments.filter(a => a.type === "in-person").length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="font-semibold mb-3 text-blue-900">Patient Contact Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-blue-800">
            <Mail className="w-4 h-4" />
            <span>{patient.email || "No email on file"}</span>
          </div>
          <div className="flex items-center gap-2 text-blue-800">
            <Phone className="w-4 h-4" />
            <span>{patient.phone || "No phone on file"}</span>
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-3">
          Appointment reminders will be sent to the contact information above.
        </p>
      </div>

      {/* New Appointment Modal */}
      {showNewAppointmentModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close modal if clicking outside
            if (e.target === e.currentTarget) {
              setShowNewAppointmentModal(false);
            }
          }}
        >
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Schedule New Appointment</h2>
                <button
                  onClick={() => setShowNewAppointmentModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Scheduling appointment for {patient.firstName} {patient.lastName}
              </p>
            </div>

            <form className="p-6 space-y-6" onSubmit={(e) => {
              e.preventDefault();
              
              // Create new appointment
              const newAppointment: Appointment = {
                id: Date.now(),
                date: new Date(appointmentForm.date + 'T' + appointmentForm.time),
                time: appointmentForm.time,
                duration: parseInt(appointmentForm.duration),
                type: appointmentForm.type,
                status: "scheduled",
                provider: {
                  name: appointmentForm.provider,
                  specialty: "Primary Care"
                },
                reason: appointmentForm.reason,
                notes: appointmentForm.notes,
                location: appointmentForm.type === "in-person" ? appointmentForm.location : undefined,
                zoomLink: appointmentForm.type === "telehealth" ? "https://zoom.us/j/" + Math.random().toString(36).substr(2, 9) : undefined
              };

              // Add to appointments list
              setAppointments(prev => [...prev, newAppointment]);
              
              // Reset form and close modal
              setAppointmentForm({
                date: "",
                time: "",
                duration: "30",
                type: "telehealth",
                provider: "",
                reason: "",
                notes: "",
                location: ""
              });
              setShowNewAppointmentModal(false);
            }}>
              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={appointmentForm.date}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time
                  </label>
                  <input
                    type="time"
                    required
                    value={appointmentForm.time}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Duration and Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration
                  </label>
                  <select
                    value={appointmentForm.duration}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, duration: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={appointmentForm.type}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, type: e.target.value as "telehealth" | "in-person" }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  >
                    <option value="telehealth">Telehealth</option>
                    <option value="in-person">In-Person</option>
                  </select>
                </div>
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider
                </label>
                <select
                  required
                  value={appointmentForm.provider}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, provider: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                >
                  <option value="">Select a provider</option>
                  <option value="Dr. Sarah Johnson">Dr. Sarah Johnson - Primary Care</option>
                  <option value="Dr. Michael Chen">Dr. Michael Chen - Endocrinology</option>
                  <option value="Dr. Emily Roberts">Dr. Emily Roberts - Cardiology</option>
                  <option value="Dr. James Wilson">Dr. James Wilson - Psychiatry</option>
                </select>
              </div>

              {/* Location (for in-person) */}
              {appointmentForm.type === "in-person" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    required
                    value={appointmentForm.location}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g., Main Clinic - Room 201"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                  />
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Visit
                </label>
                <input
                  type="text"
                  required
                  value={appointmentForm.reason}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., Follow-up consultation, Annual checkup"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes or special instructions"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewAppointmentModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors"
                >
                  Schedule Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
