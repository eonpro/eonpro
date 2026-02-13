'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Video, Clock } from 'lucide-react';

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
  onAppointmentClick,
}: ProviderCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
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
    return appointments.filter((apt) => apt.date.toDateString() === date.toDateString());
  };

  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days: React.ReactNode[] = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-28 border border-gray-200 bg-gray-50"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayAppointments = getAppointmentsForDate(date);
      const isToday = date.toDateString() === new Date().toDateString();

      days.push(
        <div
          key={day}
          className={`h-28 cursor-pointer border border-gray-200 p-2 transition-colors hover:bg-gray-50 ${
            isToday ? 'bg-blue-50' : 'bg-white'
          }`}
          onClick={() => onDateClick(date)}
        >
          <div className="mb-1 flex items-start justify-between">
            <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
              {day}
            </span>
            {dayAppointments.length > 0 && (
              <span className="rounded-full bg-[#4fa77e] px-1.5 py-0.5 text-xs text-white">
                {dayAppointments.length}
              </span>
            )}
          </div>

          <div className="max-h-16 space-y-1 overflow-y-auto">
            {dayAppointments.slice(0, 2).map((apt) => (
              <div
                key={apt.id}
                className="cursor-pointer truncate rounded border border-gray-200 bg-white p-1 text-xs hover:border-[#4fa77e]"
                onClick={(e) => {
                  e.stopPropagation();
                  onAppointmentClick(apt);
                }}
              >
                <div className="flex items-center gap-1">
                  {apt.type === 'telehealth' && <Video className="h-3 w-3 text-blue-500" />}
                  <span className="truncate font-medium">
                    {apt.date.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="truncate text-gray-600">{apt.patientName}</p>
              </div>
            ))}
            {dayAppointments.length > 2 && (
              <p className="text-center text-xs text-gray-500">
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

    const weekDays: Date[] = [];
    const timeSlots: React.ReactNode[] = [];

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
          <div className="w-20 border-r border-gray-200 p-2 text-right text-xs text-gray-500">
            {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
          </div>
          {weekDays.map((date, index) => {
            const hourAppointments = appointments.filter((apt) => {
              return (
                apt.date.toDateString() === date.toDateString() && apt.date.getHours() === hour
              );
            });

            return (
              <div
                key={index}
                className="min-h-[60px] flex-1 cursor-pointer border-r border-gray-200 p-2 hover:bg-gray-50"
                onClick={() => {
                  const clickedDate = new Date(date);
                  clickedDate.setHours(hour, 0, 0, 0);
                  onDateClick(clickedDate);
                }}
              >
                {hourAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="mb-1 cursor-pointer rounded border border-blue-300 bg-blue-100 p-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(apt);
                    }}
                  >
                    <p className="font-medium">{apt.patientName}</p>
                    <p className="text-gray-600">
                      {apt.date.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
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
      <div className="overflow-hidden rounded-lg bg-white">
        {/* Week header */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <div className="w-20 border-r border-gray-200 p-2"></div>
          {weekDays.map((date, index) => (
            <div key={index} className="flex-1 border-r border-gray-200 p-2 text-center">
              <p className="text-xs text-gray-500">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </p>
              <p
                className={`text-sm font-medium ${
                  date.toDateString() === new Date().toDateString() ? 'text-blue-600' : ''
                }`}
              >
                {date.getDate()}
              </p>
            </div>
          ))}
        </div>
        {/* Time slots */}
        <div className="max-h-[600px] overflow-y-auto">{timeSlots}</div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Calendar Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="rounded p-1 transition-colors hover:bg-gray-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="rounded px-2 py-1 text-sm transition-colors hover:bg-gray-100"
            >
              Today
            </button>
            <button
              onClick={() => navigateMonth(1)}
              className="rounded p-1 transition-colors hover:bg-gray-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
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
          <div className="mb-2 grid grid-cols-7 gap-0">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-700">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0">{renderMonthView()}</div>
        </>
      )}

      {view === 'week' && renderWeekView()}

      {view === 'day' && (
        <div className="py-20 text-center text-gray-500">Day view coming soon...</div>
      )}
    </div>
  );
}
