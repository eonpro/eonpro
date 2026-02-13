'use client';

import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';

import { Calendar, Clock, RotateCw, Trash2, CheckCircle, ChevronDown } from 'lucide-react';

interface Reminder {
  id?: number;
  medication: string;
  dayOfWeek: string;
  createdAt: string;
}

interface MedicationReminderProps {
  patientId?: number;
}

export default function MedicationReminder({ patientId }: MedicationReminderProps = {}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [medication, setMedication] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCalendarConfirm, setShowCalendarConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const days = [
    { label: 'Mon', value: '1' },
    { label: 'Tue', value: '2' },
    { label: 'Wed', value: '3' },
    { label: 'Thu', value: '4' },
    { label: 'Fri', value: '5' },
    { label: 'Sat', value: '6' },
    { label: 'Sun', value: '0' },
  ];

  const getDayName = (dayNum: string) => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[parseInt(dayNum)];
  };

  const getNextReminderDate = (dayOfWeek: string) => {
    const now = new Date();
    const targetDay = parseInt(dayOfWeek);
    const daysUntilTarget = (targetDay - now.getDay() + 7) % 7 || 7;

    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilTarget);

    return nextDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  // Load reminders on mount
  useEffect(() => {
    const loadReminders = async () => {
      if (patientId) {
        try {
          const response = await fetch(
            `/api/patient-progress/medication-reminders?patientId=${patientId}`
          );
          if (response.ok) {
            const data = await response.json();
            const formattedReminders = data.map((r: any) => ({
              id: r.id,
              medication: r.medicationName,
              dayOfWeek: r.dayOfWeek.toString(),
              createdAt: r.createdAt,
            }));
            setReminders(formattedReminders);
          }
        } catch (error) {
          logger.error('Failed to load reminders:', error);
        }
      } else {
        // Load from localStorage for guest users
        const stored = localStorage.getItem('medication-reminders');
        if (stored) {
          try {
            setReminders(JSON.parse(stored));
          } catch (e) {
            logger.error('Failed to parse reminders:', e);
          }
        }
      }
    };

    loadReminders();
  }, [patientId]);

  const generateCalendarFile = (medication: string, dayOfWeek: string) => {
    const startDate = new Date();
    const targetDay = parseInt(dayOfWeek);
    const daysUntilTarget = (targetDay - startDate.getDay() + 7) % 7 || 7;
    startDate.setDate(startDate.getDate() + daysUntilTarget);
    startDate.setHours(8, 0, 0, 0);

    let icsContent =
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lifefile//Medication Reminder//EN\r\n';

    // Generate 12 weeks of reminders
    for (let i = 0; i < 12; i++) {
      const eventDate = new Date(startDate);
      eventDate.setDate(startDate.getDate() + i * 7);
      const endDate = new Date(eventDate.getTime() + 30 * 60000);

      const formatDate = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      };

      icsContent += 'BEGIN:VEVENT\r\n';
      icsContent += `UID:lifefile-${medication.toLowerCase()}-${Date.now()}-${i}@reminder.com\r\n`;
      icsContent += `DTSTART:${formatDate(eventDate)}\r\n`;
      icsContent += `DTEND:${formatDate(endDate)}\r\n`;
      icsContent += `SUMMARY:Weekly ${medication} Injection Reminder\r\n`;
      icsContent += 'END:VEVENT\r\n';
    }

    icsContent += 'END:VCALENDAR';

    // Download file
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Lifefile_${medication}_Reminders.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const addReminder = async () => {
    if (!medication || !selectedDay) {
      alert('Please select both medication and day');
      return;
    }

    setIsLoading(true);
    const reminder: Reminder = {
      medication,
      dayOfWeek: selectedDay,
      createdAt: new Date().toISOString(),
    };

    try {
      if (patientId) {
        // Save to API for logged-in patients
        const response = await fetch('/api/patient-progress/medication-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId,
            medicationName: medication,
            dayOfWeek: parseInt(selectedDay),
            timeOfDay: '08:00',
            isActive: true,
          }),
        });

        if (response.ok) {
          const savedReminder = await response.json();
          reminder.id = savedReminder.id;
          setReminders([...reminders, reminder]);
        } else {
          throw new Error('Failed to save reminder');
        }
      } else {
        // Save to localStorage for guest users
        const updatedReminders = [...reminders, reminder];
        setReminders(updatedReminders);
        localStorage.setItem('medication-reminders', JSON.stringify(updatedReminders));
      }

      generateCalendarFile(medication, selectedDay);

      setTimeout(() => {
        setShowCalendarConfirm(true);
      }, 2000);

      setMedication('');
      setSelectedDay(null);
    } catch (error) {
      logger.error('Failed to save reminder:', error);
      alert('Failed to save reminder. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteReminder = async (index: number) => {
    if (!confirm('Delete this reminder?')) {
      return;
    }

    const reminder = reminders[index];

    try {
      if (patientId && reminder.id) {
        // Delete from API for logged-in patients
        const response = await fetch(
          `/api/patient-progress/medication-reminders?id=${reminder.id}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to delete reminder');
        }
      }

      const updatedReminders = reminders.filter((_, i) => i !== index);
      setReminders(updatedReminders);

      if (!patientId) {
        // Update localStorage for guest users
        localStorage.setItem('medication-reminders', JSON.stringify(updatedReminders));
      }
    } catch (error) {
      logger.error('Failed to delete reminder:', error);
      alert('Failed to delete reminder. Please try again.');
    }
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 p-6 text-white shadow-xl">
        <h2 className="mb-2 text-xl font-bold">Medication Schedule</h2>
        <p className="mb-6 text-sm text-teal-100">Set your weekly injection reminders</p>

        <div className="relative mb-6">
          <select
            value={medication}
            onChange={(e) => setMedication(e.target.value)}
            className="h-12 w-full cursor-pointer appearance-none rounded-full border border-white/30 bg-white/20 px-5 pr-10 text-sm text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <option value="" className="text-gray-800">
              Pick Medication
            </option>
            <option value="Semaglutide" className="text-gray-800">
              Semaglutide 0.5mg
            </option>
            <option value="Tirzepatide" className="text-gray-800">
              Tirzepatide 2.5mg
            </option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 transform text-white/70" />
        </div>

        <div className="mb-6 flex justify-between gap-1">
          {days.map((day) => (
            <button
              key={day.value}
              onClick={() => setSelectedDay(day.value)}
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-all duration-300 hover:scale-105 ${
                selectedDay === day.value
                  ? 'bg-white text-teal-600 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>

        <button
          onClick={addReminder}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 font-semibold text-teal-600 shadow-lg transition-all hover:scale-105 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Set Reminder'}
          {!isLoading && <Calendar className="h-4 w-4" />}
        </button>
      </div>

      {reminders.length > 0 && (
        <div className="mt-6 rounded-xl bg-white/10 p-4 backdrop-blur">
          <div className="mb-3 text-sm font-medium text-white/90">Active Reminders</div>
          {reminders.map((reminder, index) => (
            <div key={index} className="mb-3 rounded-lg bg-white/10 p-3 last:mb-0">
              <div className="mb-2 text-base font-semibold text-white">{reminder.medication}</div>

              <div className="mb-2 flex items-center gap-2 text-xs text-white/80">
                <Calendar className="h-3 w-3" />
                <span>{getDayName(reminder.dayOfWeek)} at 8:00 AM</span>
              </div>

              <div className="mb-2 flex items-center gap-2 text-xs text-white/80">
                <Clock className="h-3 w-3" />
                <span>Next: {getNextReminderDate(reminder.dayOfWeek)}</span>
              </div>

              <button
                onClick={() => deleteReminder(index)}
                className="text-xs text-red-300 transition-colors hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {showSuccess && (
        <div className="fixed left-1/2 top-1/2 z-[3000] -translate-x-1/2 -translate-y-1/2 transform rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-10 py-5 text-center text-lg font-medium text-white shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Reminders added to your calendar!
          </div>
        </div>
      )}

      {showCalendarConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-w-[350px] rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Calendar Sync</h3>
            <p className="mb-5 text-sm text-gray-600">
              The calendar file has been downloaded. Please add it to your phone's calendar app.
            </p>
            <button
              onClick={() => {
                setShowCalendarConfirm(false);
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
              }}
              className="transform rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-2.5 text-sm font-medium text-white transition-all hover:scale-105 hover:shadow-lg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
