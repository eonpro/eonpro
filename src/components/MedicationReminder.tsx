"use client";

import { useState, useEffect } from "react";
import { logger } from '../lib/logger';

import { Calendar, Clock, RotateCw, Trash2, CheckCircle, ChevronDown } from "lucide-react";

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
  const [medication, setMedication] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCalendarConfirm, setShowCalendarConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const days = [
    { label: "Mon", value: "1" },
    { label: "Tue", value: "2" },
    { label: "Wed", value: "3" },
    { label: "Thu", value: "4" },
    { label: "Fri", value: "5" },
    { label: "Sat", value: "6" },
    { label: "Sun", value: "0" },
  ];

  const getDayName = (dayNum: string) => {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
      day: 'numeric' 
    });
  };

  // Load reminders on mount
  useEffect(() => {
    const loadReminders = async () => {
      if (patientId) {
        try {
          const response = await fetch(`/api/patient-progress/medication-reminders?patientId=${patientId}`);
          if (response.ok) {
            const data = await response.json();
            const formattedReminders = data.map((r: any) => ({
              id: r.id,
              medication: r.medicationName,
              dayOfWeek: r.dayOfWeek.toString(),
              createdAt: r.createdAt
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

    let icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lifefile//Medication Reminder//EN\r\n';
    
    // Generate 12 weeks of reminders
    for (let i = 0; i < 12; i++) {
      const eventDate = new Date(startDate);
      eventDate.setDate(startDate.getDate() + (i * 7));
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
      createdAt: new Date().toISOString()
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
            isActive: true
          })
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
        const response = await fetch(`/api/patient-progress/medication-reminders?id=${reminder.id}`, {
          method: 'DELETE'
        });
        
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
      <div className="bg-gradient-to-br from-teal-600 to-cyan-600 rounded-2xl p-6 text-white shadow-xl">
        <h2 className="text-xl font-bold mb-2">Medication Schedule</h2>
        <p className="text-teal-100 text-sm mb-6">
          Set your weekly injection reminders
        </p>
        
        <div className="mb-6 relative">
          <select
            value={medication}
            onChange={(e) => setMedication(e.target.value)}
            className="w-full h-12 px-5 border border-white/30 rounded-full text-sm bg-white/20 text-white appearance-none pr-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/50 placeholder-white/70"
          >
            <option value="" className="text-gray-800">Pick Medication</option>
            <option value="Semaglutide" className="text-gray-800">Semaglutide 0.5mg</option>
            <option value="Tirzepatide" className="text-gray-800">Tirzepatide 2.5mg</option>
          </select>
          <ChevronDown className="absolute right-5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/70 pointer-events-none" />
        </div>

        <div className="flex justify-between gap-1 mb-6">
          {days.map((day) => (
            <button
              key={day.value}
              onClick={() => setSelectedDay(day.value)}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium cursor-pointer transition-all duration-300 hover:scale-105 ${
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
          className="w-full py-3 bg-white text-teal-600 hover:bg-white/90 rounded-full font-semibold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Set Reminder'}
          {!isLoading && <Calendar className="w-4 h-4" />}
        </button>
      </div>

      {reminders.length > 0 && (
        <div className="mt-6 bg-white/10 backdrop-blur rounded-xl p-4">
          <div className="text-sm text-white/90 font-medium mb-3">Active Reminders</div>
          {reminders.map((reminder, index) => (
            <div key={index} className="bg-white/10 rounded-lg p-3 mb-3 last:mb-0">
              <div className="text-base font-semibold text-white mb-2">
                {reminder.medication}
              </div>
              
              <div className="flex items-center gap-2 mb-2 text-xs text-white/80">
                <Calendar className="w-3 h-3" />
                <span>{getDayName(reminder.dayOfWeek)} at 8:00 AM</span>
              </div>
              
              <div className="flex items-center gap-2 mb-2 text-xs text-white/80">
                <Clock className="w-3 h-3" />
                <span>Next: {getNextReminderDate(reminder.dayOfWeek)}</span>
              </div>
              
              <button
                onClick={() => deleteReminder(index)}
                className="text-xs text-red-300 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {showSuccess && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-10 py-5 rounded-2xl font-medium text-lg text-center shadow-lg z-[3000]">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Reminders added to your calendar!
          </div>
        </div>
      )}

      {showCalendarConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl p-6 text-center max-w-[350px] shadow-2xl">
            <h3 className="text-xl font-semibold mb-3 text-gray-900">Calendar Sync</h3>
            <p className="text-sm text-gray-600 mb-5">
              The calendar file has been downloaded. Please add it to your phone's calendar app.
            </p>
            <button
              onClick={() => {
                setShowCalendarConfirm(false);
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
              }}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-2.5 rounded-full text-sm font-medium hover:shadow-lg transition-all transform hover:scale-105"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
