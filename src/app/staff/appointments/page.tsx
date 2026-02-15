'use client';

import { useState } from 'react';
import { Calendar, Clock, User, MapPin, Phone, Video, CheckCircle, XCircle } from 'lucide-react';

interface Appointment {
  id: string;
  patientName: string;
  providerName: string;
  date: string;
  time: string;
  duration: string;
  type: 'in-person' | 'video' | 'phone';
  status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  reason: string;
  location?: string;
}

export default function StaffAppointmentsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Mock appointments
  const appointments: Appointment[] = [
    {
      id: 'APT-001',
      patientName: 'Sarah Johnson',
      providerName: 'Dr. Smith',
      date: '2024-01-30',
      time: '9:00 AM',
      duration: '30 min',
      type: 'in-person',
      status: 'confirmed',
      reason: 'Follow-up consultation',
      location: 'Room 201',
    },
    {
      id: 'APT-002',
      patientName: 'Michael Chen',
      providerName: 'Dr. Jones',
      date: '2024-01-30',
      time: '9:30 AM',
      duration: '45 min',
      type: 'video',
      status: 'scheduled',
      reason: 'Initial consultation',
    },
    {
      id: 'APT-003',
      patientName: 'Emily Davis',
      providerName: 'Dr. Smith',
      date: '2024-01-30',
      time: '10:30 AM',
      duration: '30 min',
      type: 'in-person',
      status: 'in-progress',
      reason: 'Lab review',
      location: 'Room 103',
    },
    {
      id: 'APT-004',
      patientName: 'James Wilson',
      providerName: 'Dr. Brown',
      date: '2024-01-30',
      time: '11:00 AM',
      duration: '30 min',
      type: 'phone',
      status: 'scheduled',
      reason: 'Prescription refill',
    },
    {
      id: 'APT-005',
      patientName: 'Lisa Anderson',
      providerName: 'Dr. Smith',
      date: '2024-01-30',
      time: '2:00 PM',
      duration: '60 min',
      type: 'in-person',
      status: 'confirmed',
      reason: 'Annual check-up',
      location: 'Room 201',
    },
  ];

  const providers = [...new Set(appointments.map((apt) => apt.providerName))];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'phone':
        return <Phone className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no-show':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const filteredAppointments = appointments.filter((apt) => {
    const matchesDate = apt.date === selectedDate;
    const matchesProvider = filterProvider === 'all' || apt.providerName === filterProvider;
    const matchesStatus = filterStatus === 'all' || apt.status === filterStatus;
    return matchesDate && matchesProvider && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Calendar className="h-6 w-6" />
            Appointment Management
          </h1>
          <button className="rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700">
            Schedule Appointment
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          />
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Providers</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No Show</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-cyan-600">{filteredAppointments.length}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {filteredAppointments.filter((a) => a.status === 'confirmed').length}
          </div>
          <div className="text-sm text-gray-600">Confirmed</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {filteredAppointments.filter((a) => a.status === 'in-progress').length}
          </div>
          <div className="text-sm text-gray-600">In Progress</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-[var(--brand-primary)]">
            {filteredAppointments.filter((a) => a.type === 'video').length}
          </div>
          <div className="text-sm text-gray-600">Video Calls</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-600">
            {filteredAppointments.filter((a) => a.type === 'in-person').length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Appointments Timeline */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold">
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
        </div>
        <div className="p-6">
          {filteredAppointments.length > 0 ? (
            <div className="space-y-4">
              {filteredAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-start gap-4 rounded-lg border p-4 transition-shadow hover:shadow-md"
                >
                  <div className="min-w-[80px] text-center">
                    <div className="text-lg font-semibold">{apt.time}</div>
                    <div className="text-sm text-gray-500">{apt.duration}</div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{apt.patientName}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${getStatusColor(apt.status)}`}
                      >
                        {apt.status}
                      </span>
                    </div>
                    <div className="mb-1 text-sm text-gray-600">{apt.reason}</div>
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
                      <span>Provider: {apt.providerName}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {apt.status === 'scheduled' && (
                      <>
                        <button className="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200">
                          Confirm
                        </button>
                        <button className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200">
                          Cancel
                        </button>
                      </>
                    )}
                    {apt.status === 'confirmed' && (
                      <button className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200">
                        Check In
                      </button>
                    )}
                    <button className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">
              No appointments found for the selected criteria
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
