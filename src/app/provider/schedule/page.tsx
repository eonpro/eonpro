"use client";

import { useState } from "react";
import { Calendar, Clock, User, MapPin, Video, Phone, Building } from "lucide-react";

interface Appointment {
  id: string;
  patientName: string;
  time: string;
  duration: string;
  type: "in-person" | "video" | "phone";
  reason: string;
  location?: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
}

export default function ProviderSchedulePage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<"day" | "week" | "month">("day");

  // Mock appointments
  const appointments: Appointment[] = [
    {
      id: "1",
      patientName: "Sarah Johnson",
      time: "9:00 AM",
      duration: "30 min",
      type: "in-person",
      reason: "Follow-up consultation",
      location: "Room 201",
      status: "confirmed"
    },
    {
      id: "2",
      patientName: "Michael Chen",
      time: "9:30 AM",
      duration: "45 min",
      type: "video",
      reason: "Initial consultation",
      status: "scheduled"
    },
    {
      id: "3",
      patientName: "Emily Davis",
      time: "10:30 AM",
      duration: "30 min",
      type: "in-person",
      reason: "Lab review",
      location: "Room 103",
      status: "confirmed"
    },
    {
      id: "4",
      patientName: "James Wilson",
      time: "11:00 AM",
      duration: "30 min",
      type: "phone",
      reason: "Prescription refill",
      status: "scheduled"
    },
    {
      id: "5",
      patientName: "Lisa Anderson",
      time: "2:00 PM",
      duration: "60 min",
      type: "in-person",
      reason: "Annual check-up",
      location: "Room 201",
      status: "confirmed"
    }
  ];

  const getTypeIcon = (type: string) => {
    switch(type) {
      case "video": return <Video className="h-4 w-4" />;
      case "phone": return <Phone className="h-4 w-4" />;
      default: return <Building className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "confirmed": return "bg-green-100 text-green-800";
      case "completed": return "bg-gray-100 text-gray-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Schedule
          </h1>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Block Time
            </button>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Add Appointment
            </button>
          </div>
        </div>

        {/* View Toggle & Date Picker */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {["day", "week", "month"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v as any)}
                className={`px-4 py-2 rounded-lg ${
                  view === v
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">{appointments.length}</div>
          <div className="text-sm text-gray-600">Total Appointments</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {appointments.filter(a => a.status === "confirmed").length}
          </div>
          <div className="text-sm text-gray-600">Confirmed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {appointments.filter(a => a.type === "video").length}
          </div>
          <div className="text-sm text-gray-600">Video Calls</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">
            {appointments.filter(a => a.type === "in-person").length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Schedule Timeline */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">
            {new Date(selectedDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-start gap-4 p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="text-center min-w-[80px]">
                  <div className="font-semibold text-lg">{apt.time}</div>
                  <div className="text-sm text-gray-500">{apt.duration}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">{apt.patientName}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(apt.status)}`}>
                      {apt.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">{apt.reason}</div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      {getTypeIcon(apt.type)}
                      {apt.type}
                    </span>
                    {apt.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {apt.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                    View
                  </button>
                  <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                    Start
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Time Slots */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Available Time Slots</h3>
            <div className="grid grid-cols-6 gap-2">
              {["3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM"].map((time) => (
                <button
                  key={time}
                  className="px-3 py-2 text-sm bg-gray-50 border rounded hover:bg-indigo-50 hover:border-indigo-300"
                >
                  {time}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
