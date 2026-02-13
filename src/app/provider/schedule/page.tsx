'use client';

import { useState } from 'react';
import { Calendar, Clock, User, MapPin, Video, Phone, Building } from 'lucide-react';

interface Appointment {
  id: string;
  patientName: string;
  time: string;
  duration: string;
  type: 'in-person' | 'video' | 'phone';
  reason: string;
  location?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}

export default function ProviderSchedulePage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');

  // Mock appointments
  const appointments: Appointment[] = [
    {
      id: '1',
      patientName: 'Sarah Johnson',
      time: '9:00 AM',
      duration: '30 min',
      type: 'in-person',
      reason: 'Follow-up consultation',
      location: 'Room 201',
      status: 'confirmed',
    },
    {
      id: '2',
      patientName: 'Michael Chen',
      time: '9:30 AM',
      duration: '45 min',
      type: 'video',
      reason: 'Initial consultation',
      status: 'scheduled',
    },
    {
      id: '3',
      patientName: 'Emily Davis',
      time: '10:30 AM',
      duration: '30 min',
      type: 'in-person',
      reason: 'Lab review',
      location: 'Room 103',
      status: 'confirmed',
    },
    {
      id: '4',
      patientName: 'James Wilson',
      time: '11:00 AM',
      duration: '30 min',
      type: 'phone',
      reason: 'Prescription refill',
      status: 'scheduled',
    },
    {
      id: '5',
      patientName: 'Lisa Anderson',
      time: '2:00 PM',
      duration: '60 min',
      type: 'in-person',
      reason: 'Annual check-up',
      location: 'Room 201',
      status: 'confirmed',
    },
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'phone':
        return <Phone className="h-4 w-4" />;
      default:
        return <Building className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Calendar className="h-6 w-6" />
            Schedule
          </h1>
          <div className="flex gap-2">
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
              Block Time
            </button>
            <button className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">
              Add Appointment
            </button>
          </div>
        </div>

        {/* View Toggle & Date Picker */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {['day', 'week', 'month'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v as any)}
                className={`rounded-lg px-4 py-2 ${
                  view === v
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            className="rounded-lg border px-4 py-2"
          />
        </div>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-indigo-600">{appointments.length}</div>
          <div className="text-sm text-gray-600">Total Appointments</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {appointments.filter((a) => a.status === 'confirmed').length}
          </div>
          <div className="text-sm text-gray-600">Confirmed</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {appointments.filter((a) => a.type === 'video').length}
          </div>
          <div className="text-sm text-gray-600">Video Calls</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-purple-600">
            {appointments.filter((a) => a.type === 'in-person').length}
          </div>
          <div className="text-sm text-gray-600">In-Person</div>
        </div>
      </div>

      {/* Schedule Timeline */}
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
          <div className="space-y-4">
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-shadow hover:shadow-md"
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
                  <div className="mb-2 text-sm text-gray-600">{apt.reason}</div>
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
                  <button className="rounded bg-indigo-100 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-200">
                    View
                  </button>
                  <button className="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200">
                    Start
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Time Slots */}
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-3 text-sm font-medium text-gray-700">Available Time Slots</h3>
            <div className="grid grid-cols-6 gap-2">
              {['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM'].map((time) => (
                <button
                  key={time}
                  className="rounded border bg-gray-50 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-indigo-50"
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
