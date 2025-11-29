"use client";

import { useState, useEffect, Suspense } from "react";
import { logger } from '../../../lib/logger';

import { useSearchParams } from "next/navigation";
import ProviderCalendar from "@/components/ProviderCalendar";
import CalendarSync from "@/components/CalendarSync";
import AppointmentModal from "@/components/AppointmentModal";
import { Calendar, Clock, Video, Users, Bell, Settings, Plus } from "lucide-react";

function ProviderCalendarContent() {
  const searchParams = useSearchParams();
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [preSelectedPatient, setPreSelectedPatient] = useState<any>(null);

  // Check for query parameters and pre-selected patient on mount
  useEffect(() => {
    // Check if we should open appointment modal
    if (searchParams.get('newAppointment') === 'true') {
      // Check for pre-selected patient from sessionStorage
      const storedPatient = sessionStorage.getItem('appointmentPatient');
      if (storedPatient) {
        try {
          const patient = JSON.parse(storedPatient);
          setPreSelectedPatient(patient);
          sessionStorage.removeItem('appointmentPatient'); // Clean up
        } catch (e) {
          logger.error('Failed to parse stored patient', e);
        }
      }
      setShowAppointmentModal(true);
    }
  }, [searchParams]);

  // Mock appointments for demonstration
  const [appointments, setAppointments] = useState([
    {
      id: 1,
      patientName: "Rebecca Pignano",
      patientEmail: "rebecca@eonmeds.com",
      patientPhone: "3857856102",
      date: new Date(2024, 10, 29, 10, 0),
      duration: 30,
      type: "telehealth",
      zoomLink: "https://zoom.us/j/123456789",
      status: "confirmed",
      reminders: ["1 day before", "1 hour before"]
    },
    {
      id: 2,
      patientName: "John Smith",
      patientEmail: "john@example.com",
      patientPhone: "555-1234",
      date: new Date(2024, 10, 29, 14, 30),
      duration: 30,
      type: "telehealth",
      zoomLink: "https://zoom.us/j/987654321",
      status: "confirmed",
      reminders: ["1 day before", "1 hour before"]
    }
  ]);

  const handleCreateAppointment = (date?: Date) => {
    setSelectedDate(date || null);
    setSelectedAppointment(null);
    setShowAppointmentModal(true);
  };

  const handleEditAppointment = (appointment: any) => {
    setSelectedAppointment(appointment);
    setShowAppointmentModal(true);
  };

  const handleSaveAppointment = (appointmentData: any) => {
    if (selectedAppointment) {
      // Update existing appointment
      setAppointments(prev => 
        prev.map(apt => apt.id === selectedAppointment.id ? { ...apt, ...appointmentData } : apt)
      );
    } else {
      // Create new appointment
      const newAppointment = {
        id: Date.now(),
        ...appointmentData,
        zoomLink: `https://zoom.us/j/${Math.floor(Math.random() * 999999999)}`,
        status: "confirmed",
        reminders: ["1 day before", "1 hour before"]
      };
      setAppointments(prev => [...prev, newAppointment]);
    }
    setShowAppointmentModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-[#4fa77e]" />
            <h1 className="text-2xl font-bold text-gray-900">Provider Calendar</h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Quick Stats */}
            <div className="flex items-center gap-6 mr-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {appointments.filter(apt => 
                    apt.date.toDateString() === new Date().toDateString()
                  ).length}
                </p>
                <p className="text-xs text-gray-600">Today</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {appointments.filter(apt => 
                    apt.date >= new Date() && 
                    apt.date <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                  ).length}
                </p>
                <p className="text-xs text-gray-600">This Week</p>
              </div>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => setShowSyncSettings(!showSyncSettings)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Calendar Sync</span>
            </button>
            
            <button
              onClick={() => handleCreateAppointment()}
              className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">New Appointment</span>
            </button>
          </div>
        </div>

        {/* Calendar Sync Settings */}
        {showSyncSettings && (
          <div className="mt-4 pt-4 border-t">
            <CalendarSync onClose={() => setShowSyncSettings(false)} />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex gap-6 p-6">
        {/* Sidebar - Today's Schedule */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Today's Schedule</h3>
            
            <div className="space-y-3">
              {appointments
                .filter(apt => apt.date.toDateString() === new Date().toDateString())
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map(apt => (
                  <div
                    key={apt.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:border-[#4fa77e] transition-colors"
                    onClick={() => handleEditAppointment(apt)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span className="text-sm font-medium">
                            {apt.date.toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({apt.duration} min)
                          </span>
                        </div>
                        <p className="font-medium text-gray-900">{apt.patientName}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Video className="w-3 h-3 text-blue-500" />
                          <span className="text-xs text-blue-600">Telehealth</span>
                        </div>
                      </div>
                      {apt.status === 'confirmed' && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          Confirmed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              
              {appointments.filter(apt => 
                apt.date.toDateString() === new Date().toDateString()
              ).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No appointments scheduled for today
                </p>
              )}
            </div>

            {/* Upcoming Appointments */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="font-medium text-gray-700 mb-3">Upcoming</h4>
              <div className="space-y-2">
                {appointments
                  .filter(apt => apt.date > new Date())
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 3)
                  .map(apt => (
                    <div 
                      key={apt.id} 
                      className="text-sm cursor-pointer hover:bg-gray-50 p-2 rounded"
                      onClick={() => handleEditAppointment(apt)}
                    >
                      <p className="font-medium">{apt.patientName}</p>
                      <p className="text-xs text-gray-500">
                        {apt.date.toLocaleDateString()} at{' '}
                        {apt.date.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 pt-4 border-t space-y-2">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <span>Manage Patients</span>
              </button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-500" />
                <span>Notification Settings</span>
              </button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg flex items-center gap-2">
                <Video className="w-4 h-4 text-gray-500" />
                <span>Zoom Settings</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Calendar */}
        <div className="flex-1">
          <ProviderCalendar
            appointments={appointments}
            onDateClick={handleCreateAppointment}
            onAppointmentClick={handleEditAppointment}
          />
        </div>
      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <AppointmentModal
          isOpen={showAppointmentModal}
          onClose={() => {
            setShowAppointmentModal(false);
            setPreSelectedPatient(null);
          }}
          onSave={handleSaveAppointment}
          selectedDate={selectedDate}
          appointment={selectedAppointment}
          preSelectedPatient={preSelectedPatient}
        />
      )}
    </div>
  );
}

export default function ProviderCalendarPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="flex space-x-6">
            <div className="w-80 h-96 bg-gray-200 rounded"></div>
            <div className="flex-1 h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    }>
      <ProviderCalendarContent />
    </Suspense>
  );
}
