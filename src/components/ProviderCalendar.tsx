"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Video, Clock } from "lucide-react";

interface Appointment {
  id: number;
  patientName: string;
  date: Date;
  duration: number;
  type: string;
  status: string;
}

interface ProviderCalendarProps {
  appointments: Appointment[];
  onDateClick: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

export default function ProviderCalendar({ 
  appointments, 
  onDateClick, 
  onAppointmentClick 
}: ProviderCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt => 
      apt.date.toDateString() === date.toDateString()
    );
  };

  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="h-28 bg-gray-50 border border-gray-200"></div>
      );
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayAppointments = getAppointmentsForDate(date);
      const isToday = date.toDateString() === new Date().toDateString();

      days.push(
        <div
          key={day}
          className={`h-28 border border-gray-200 p-2 cursor-pointer hover:bg-gray-50 transition-colors ${
            isToday ? 'bg-blue-50' : 'bg-white'
          }`}
          onClick={() => onDateClick(date)}
        >
          <div className="flex justify-between items-start mb-1">
            <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
              {day}
            </span>
            {dayAppointments.length > 0 && (
              <span className="px-1.5 py-0.5 bg-[#4fa77e] text-white text-xs rounded-full">
                {dayAppointments.length}
              </span>
            )}
          </div>
          
          <div className="space-y-1 overflow-y-auto max-h-16">
            {dayAppointments.slice(0, 2).map(apt => (
              <div
                key={apt.id}
                className="text-xs p-1 bg-white border border-gray-200 rounded cursor-pointer hover:border-[#4fa77e] truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  onAppointmentClick(apt);
                }}
              >
                <div className="flex items-center gap-1">
                  {apt.type === 'telehealth' && <Video className="w-3 h-3 text-blue-500" />}
                  <span className="font-medium truncate">
                    {apt.date.toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                <p className="truncate text-gray-600">{apt.patientName}</p>
              </div>
            ))}
            {dayAppointments.length > 2 && (
              <p className="text-xs text-gray-500 text-center">
                +{dayAppointments.length - 2} more
              </p>
            )}
          </div>
        </div>
      );
    }

    return days;
  };

  const renderWeekView = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    
    const weekDays = [];
    const timeSlots = [];
    
    // Generate week days
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      weekDays.push(date);
    }

    // Generate time slots (8 AM to 6 PM)
    for (let hour = 8; hour <= 18; hour++) {
      timeSlots.push(
        <div key={hour} className="flex border-b border-gray-200">
          <div className="w-20 p-2 text-xs text-gray-500 text-right border-r border-gray-200">
            {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
          </div>
          {weekDays.map((date, index) => {
            const hourAppointments = appointments.filter(apt => {
              return apt.date.toDateString() === date.toDateString() && 
                     apt.date.getHours() === hour;
            });

            return (
              <div 
                key={index} 
                className="flex-1 p-2 border-r border-gray-200 cursor-pointer hover:bg-gray-50 min-h-[60px]"
                onClick={() => {
                  const clickedDate = new Date(date);
                  clickedDate.setHours(hour, 0, 0, 0);
                  onDateClick(clickedDate);
                }}
              >
                {hourAppointments.map(apt => (
                  <div
                    key={apt.id}
                    className="text-xs p-1 bg-blue-100 border border-blue-300 rounded mb-1 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(apt);
                    }}
                  >
                    <p className="font-medium">{apt.patientName}</p>
                    <p className="text-gray-600">
                      {apt.date.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg overflow-hidden">
        {/* Week header */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <div className="w-20 p-2 border-r border-gray-200"></div>
          {weekDays.map((date, index) => (
            <div key={index} className="flex-1 p-2 text-center border-r border-gray-200">
              <p className="text-xs text-gray-500">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </p>
              <p className={`text-sm font-medium ${
                date.toDateString() === new Date().toDateString() ? 'text-blue-600' : ''
              }`}>
                {date.getDate()}
              </p>
            </div>
          ))}
        </div>
        {/* Time slots */}
        <div className="overflow-y-auto max-h-[600px]">
          {timeSlots}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2 py-1 text-sm hover:bg-gray-100 rounded transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigateMonth(1)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['month', 'week', 'day'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                view === v 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      {view === 'month' && (
        <>
          <div className="grid grid-cols-7 gap-0 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-700 p-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0">
            {renderMonthView()}
          </div>
        </>
      )}

      {view === 'week' && renderWeekView()}

      {view === 'day' && (
        <div className="text-center py-20 text-gray-500">
          Day view coming soon...
        </div>
      )}
    </div>
  );
}
