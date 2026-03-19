'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Video,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Phone,
  Loader2,
  Search,
  X,
  Settings,
} from 'lucide-react';
import AppointmentModal from '@/components/AppointmentModal';
import BookTelehealthWizard from '@/components/BookTelehealthWizard';
import { apiFetch } from '@/lib/api/fetch';

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string;
  email: string;
}

interface Appointment {
  id: number;
  patientId: number;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  providerId: number;
  providerName: string;
  date: Date;
  duration: number;
  type: string;
  status: string;
  reason?: string;
  notes?: string;
  zoomJoinUrl?: string;
  zoomMeetingId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  checked_in: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-orange-100 text-orange-800',
};

const TYPE_ICONS: Record<string, typeof Video> = {
  telehealth: Video,
  'in-person': User,
  phone: Phone,
};

export default function AdminSchedulingPage() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'book'>('calendar');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [currentDay, setCurrentDay] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [showBookWizard, setShowBookWizard] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Record<string, { startTime: string; endTime: string; available: boolean }[]>>({});

  useEffect(() => {
    fetchProviders();
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [selectedProviderId, currentMonth, calendarView, currentWeekStart, currentDay]);

  // Fetch available slots for week/day views when a provider is selected
  useEffect(() => {
    if (!selectedProviderId || calendarView === 'month') {
      setAvailableSlots({});
      return;
    }
    const fetchSlots = async () => {
      try {
        const dates: Date[] = [];
        if (calendarView === 'week') {
          for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(d.getDate() + i);
            dates.push(d);
          }
        } else {
          dates.push(currentDay);
        }

        const slotMap: Record<string, { startTime: string; endTime: string; available: boolean }[]> = {};
        await Promise.all(
          dates.map(async (d) => {
            const dateStr = d.toISOString().split('T')[0];
            const res = await apiFetch(
              `/api/scheduling/availability?providerId=${selectedProviderId}&date=${dateStr}&duration=30`
            );
            if (res.ok) {
              const data = await res.json();
              slotMap[dateStr] = (data.slots || []).map((s: any) => ({
                startTime: new Date(s.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                endTime: new Date(s.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                available: s.available,
              }));
            }
          })
        );
        setAvailableSlots(slotMap);
      } catch {
        // Slot fetch is best-effort
      }
    };
    fetchSlots();
  }, [selectedProviderId, calendarView, currentWeekStart, currentDay]);

  const fetchProviders = async () => {
    try {
      const res = await apiFetch('/api/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch (err) {
      console.error('Failed to fetch providers', err);
    }
  };

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let startDate: Date;
      let endDate: Date;

      if (calendarView === 'month') {
        startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
      } else if (calendarView === 'week') {
        startDate = new Date(currentWeekStart);
        endDate = new Date(currentWeekStart);
        endDate.setDate(endDate.getDate() + 7);
      } else {
        startDate = new Date(currentDay);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(currentDay);
        endDate.setHours(23, 59, 59, 999);
      }

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      if (selectedProviderId) params.set('providerId', String(selectedProviderId));

      const res = await apiFetch(`/api/scheduling/appointments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch appointments');

      const data = await res.json();
      const mapped: Appointment[] = (data.appointments || []).map((apt: any) => ({
        id: apt.id,
        patientId: apt.patientId,
        patientName: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
        patientEmail: apt.patient?.email || '',
        patientPhone: apt.patient?.phone || '',
        providerId: apt.providerId,
        providerName: apt.provider ? `${apt.provider.firstName} ${apt.provider.lastName}` : 'Unknown',
        date: new Date(apt.startTime),
        duration: apt.duration || 30,
        type: apt.type === 'VIDEO' ? 'telehealth' : apt.type === 'IN_PERSON' ? 'in-person' : 'phone',
        status: apt.status?.toLowerCase() || 'scheduled',
        reason: apt.reason,
        notes: apt.notes,
        zoomJoinUrl: apt.zoomJoinUrl || apt.videoLink,
        zoomMeetingId: apt.zoomMeetingId,
      }));

      setAppointments(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProviderId, currentMonth, calendarView, currentWeekStart, currentDay]);

  const filteredAppointments = appointments.filter((apt) => {
    if (typeFilter !== 'all' && apt.type !== typeFilter) return false;
    return true;
  });

  const handleBookAppointment = (date?: Date) => {
    setSelectedDate(date || null);
    setSelectedAppointment(null);
    setShowModal(true);
  };

  const handleAppointmentClick = (apt: Appointment) => {
    setSelectedAppointment({
      ...apt,
      patientDob: '',
    });
    setShowModal(true);
  };

  const handleSaveAppointment = async () => {
    setShowModal(false);
    setSelectedAppointment(null);
    await fetchAppointments();
  };

  const navigateMonth = (dir: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir, 1));
  };

  const navigateWeek = (dir: number) => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + dir * 7);
    setCurrentWeekStart(newStart);
  };

  const navigateDay = (dir: number) => {
    const newDay = new Date(currentDay);
    newDay.setDate(newDay.getDate() + dir);
    setCurrentDay(newDay);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const getAppointmentsForDate = (date: Date) =>
    filteredAppointments.filter((apt) => apt.date.toDateString() === date.toDateString());

  const todayAppts = filteredAppointments.filter(
    (apt) => apt.date.toDateString() === new Date().toDateString()
  );

  const upcomingVideoAppts = filteredAppointments
    .filter((apt) => apt.type === 'telehealth' && apt.date >= new Date())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);

  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days: (Date | null)[] = [];

    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
    }

    return (
      <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200">
        {dayNames.map((day) => (
          <div key={day} className="bg-gray-50 py-2 text-center text-xs font-medium text-gray-500">
            {day}
          </div>
        ))}
        {days.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="min-h-[100px] bg-white" />;
          const dayAppts = getAppointmentsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <div
              key={date.toISOString()}
              className={`min-h-[100px] cursor-pointer bg-white p-1.5 transition-colors hover:bg-gray-50 ${
                isToday ? 'ring-2 ring-inset ring-[#4fa77e]' : ''
              }`}
              onClick={() => handleBookAppointment(date)}
            >
              <div className={`mb-1 text-xs font-medium ${isToday ? 'text-[#4fa77e]' : 'text-gray-700'}`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map((apt) => {
                  const TypeIcon = TYPE_ICONS[apt.type] || Calendar;
                  return (
                    <div
                      key={apt.id}
                      onClick={(e) => { e.stopPropagation(); handleAppointmentClick(apt); }}
                      className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${
                        apt.type === 'telehealth'
                          ? 'bg-blue-50 text-blue-700'
                          : apt.type === 'phone'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-green-50 text-green-700'
                      }`}
                    >
                      <TypeIcon className="h-2.5 w-2.5 flex-shrink-0" />
                      <span className="truncate">
                        {apt.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {' '}{apt.patientName.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
                {dayAppts.length > 3 && (
                  <div className="text-center text-[10px] text-gray-500">+{dayAppts.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const isHourAvailable = (dateStr: string, hour: number): boolean => {
    const daySlots = availableSlots[dateStr];
    if (!daySlots) return false;
    const hourStr = hour.toString().padStart(2, '0');
    return daySlots.some((s) => {
      const sHour = s.startTime.substring(0, 2);
      return sHour === hourStr && s.available;
    });
  };

  const renderWeekView = () => {
    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }
    const hours = Array.from({ length: 12 }, (_, i) => i + 7);

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        {selectedProviderId && Object.keys(availableSlots).length > 0 && (
          <div className="flex items-center gap-4 border-b bg-gray-50/50 px-3 py-1.5 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#4fa77e]/20 ring-1 ring-[#4fa77e]/30" />
              Available slot
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-100 ring-1 ring-blue-200" />
              Booked telehealth
            </span>
          </div>
        )}
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-gray-50">
            <div className="p-2" />
            {weekDays.map((d) => {
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div key={d.toISOString()} className={`p-2 text-center ${isToday ? 'bg-[#4fa77e]/10' : ''}`}>
                  <div className="text-xs text-gray-500">{dayNames[d.getDay()]}</div>
                  <div className={`text-sm font-semibold ${isToday ? 'text-[#4fa77e]' : 'text-gray-900'}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0">
              <div className="border-r p-1 text-right text-xs text-gray-400">
                {hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'p' : 'a'}
              </div>
              {weekDays.map((d) => {
                const dateStr = d.toISOString().split('T')[0];
                const dayAppts = getAppointmentsForDate(d).filter((a) => a.date.getHours() === hour);
                const slotAvailable = selectedProviderId ? isHourAvailable(dateStr, hour) : false;

                return (
                  <div
                    key={d.toISOString() + hour}
                    className={`min-h-[48px] cursor-pointer border-r p-0.5 last:border-r-0 transition-colors ${
                      slotAvailable && dayAppts.length === 0
                        ? 'bg-[#4fa77e]/5 hover:bg-[#4fa77e]/15'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const dt = new Date(d);
                      dt.setHours(hour, 0, 0, 0);
                      handleBookAppointment(dt);
                    }}
                  >
                    {slotAvailable && dayAppts.length === 0 && (
                      <div className="mb-0.5 rounded border border-dashed border-[#4fa77e]/30 p-0.5 text-center text-[9px] font-medium text-[#4fa77e]/70">
                        Open
                      </div>
                    )}
                    {dayAppts.map((apt) => {
                      const TypeIcon = TYPE_ICONS[apt.type] || Calendar;
                      return (
                        <div
                          key={apt.id}
                          onClick={(e) => { e.stopPropagation(); handleAppointmentClick(apt); }}
                          className={`mb-0.5 rounded p-1 text-[10px] ${
                            apt.type === 'telehealth' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <TypeIcon className="h-2.5 w-2.5" />
                            <span className="truncate font-medium">{apt.patientName}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 14 }, (_, i) => i + 7);
    const dayAppts = getAppointmentsForDate(currentDay);
    const isToday = currentDay.toDateString() === new Date().toDateString();
    const dayDateStr = currentDay.toISOString().split('T')[0];

    return (
      <div className="rounded-lg border border-gray-200">
        <div className={`border-b p-3 text-center ${isToday ? 'bg-[#4fa77e]/10' : 'bg-gray-50'}`}>
          <div className="text-sm text-gray-500">{dayNames[currentDay.getDay()]}</div>
          <div className={`text-lg font-semibold ${isToday ? 'text-[#4fa77e]' : 'text-gray-900'}`}>
            {currentDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="mt-1 text-xs text-gray-500">{dayAppts.length} appointment{dayAppts.length !== 1 ? 's' : ''}</div>
        </div>
        <div>
          {hours.map((hour) => {
            const hourAppts = dayAppts.filter((a) => a.date.getHours() === hour);
            const slotAvailable = selectedProviderId ? isHourAvailable(dayDateStr, hour) : false;
            return (
              <div key={hour} className="flex border-b last:border-b-0">
                <div className="w-16 flex-shrink-0 border-r p-2 text-right text-xs text-gray-400">
                  {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                </div>
                <div
                  className={`min-h-[56px] flex-1 cursor-pointer p-1 transition-colors ${
                    slotAvailable && hourAppts.length === 0
                      ? 'bg-[#4fa77e]/5 hover:bg-[#4fa77e]/15'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    const dt = new Date(currentDay);
                    dt.setHours(hour, 0, 0, 0);
                    handleBookAppointment(dt);
                  }}
                >
                  {hourAppts.map((apt) => {
                    const TypeIcon = TYPE_ICONS[apt.type] || Calendar;
                    return (
                      <div
                        key={apt.id}
                        onClick={(e) => { e.stopPropagation(); handleAppointmentClick(apt); }}
                        className={`mb-1 rounded-lg p-2 ${
                          apt.type === 'telehealth' ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-900">{apt.patientName}</span>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[apt.status] || 'bg-gray-100 text-gray-700'}`}>
                            {apt.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {apt.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {apt.duration}min
                          {apt.providerName && <span className="ml-2">with {apt.providerName}</span>}
                        </div>
                        {apt.reason && <div className="mt-0.5 text-xs text-gray-400">{apt.reason}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Video className="h-6 w-6 text-[#4fa77e]" />
            <h1 className="text-2xl font-bold text-gray-900">Telehealth Scheduling</h1>
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/admin/scheduling/availability"
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
              Manage Availability
            </a>
            <button
              onClick={() => setShowBookWizard(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Video className="h-4 w-4" />
              Book Telehealth
            </button>
            <button
              onClick={() => handleBookAppointment()}
              className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660]"
            >
              <Plus className="h-4 w-4" />
              Book Appointment
            </button>
          </div>
        </div>

        {/* Tabs and filters */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Tab Buttons */}
            <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
              <button
                onClick={() => setActiveTab('calendar')}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Calendar className="mr-1.5 inline h-4 w-4" />
                Calendar
              </button>
              <button
                onClick={() => { setActiveTab('book'); handleBookAppointment(); }}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'book' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Plus className="mr-1.5 inline h-4 w-4" />
                Book
              </button>
            </div>

            {/* View Switcher */}
            {activeTab === 'calendar' && (
              <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
                {(['month', 'week', 'day'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalendarView(v)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      calendarView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={selectedProviderId ?? ''}
              onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}{p.titleLine ? `, ${p.titleLine}` : ''}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="all">All Types</option>
              <option value="telehealth">Telehealth</option>
              <option value="in-person">In-Person</option>
              <option value="phone">Phone</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-6 p-6">
        {/* Sidebar */}
        <div className="hidden w-72 flex-shrink-0 xl:block">
          {/* Today's Summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Today's Appointments</h3>
            <div className="mb-3 flex gap-3">
              <div className="flex-1 rounded-lg bg-blue-50 p-2 text-center">
                <div className="text-lg font-bold text-blue-700">{todayAppts.filter((a) => a.type === 'telehealth').length}</div>
                <div className="text-[10px] text-blue-600">Telehealth</div>
              </div>
              <div className="flex-1 rounded-lg bg-green-50 p-2 text-center">
                <div className="text-lg font-bold text-green-700">{todayAppts.filter((a) => a.type === 'in-person').length}</div>
                <div className="text-[10px] text-green-600">In-Person</div>
              </div>
              <div className="flex-1 rounded-lg bg-purple-50 p-2 text-center">
                <div className="text-lg font-bold text-purple-700">{todayAppts.filter((a) => a.type === 'phone').length}</div>
                <div className="text-[10px] text-purple-600">Phone</div>
              </div>
            </div>

            <div className="space-y-2">
              {todayAppts
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .slice(0, 5)
                .map((apt) => {
                  const TypeIcon = TYPE_ICONS[apt.type] || Calendar;
                  return (
                    <div
                      key={apt.id}
                      onClick={() => handleAppointmentClick(apt)}
                      className="cursor-pointer rounded-lg border border-gray-100 p-2 transition-colors hover:border-[#4fa77e]/50 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-3.5 w-3.5 text-gray-500" />
                        <span className="text-xs font-medium text-gray-900">{apt.patientName}</span>
                      </div>
                      <div className="ml-5 mt-0.5 text-[10px] text-gray-500">
                        {apt.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {apt.duration}min
                        <span className="ml-1 text-gray-400">({apt.providerName})</span>
                      </div>
                    </div>
                  );
                })}
              {todayAppts.length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">No appointments today</p>
              )}
            </div>
          </div>

          {/* Upcoming Telehealth */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Video className="h-4 w-4 text-blue-600" />
              Upcoming Telehealth
            </h3>
            <div className="space-y-2">
              {upcomingVideoAppts.map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => handleAppointmentClick(apt)}
                  className="cursor-pointer rounded-lg border border-blue-100 bg-blue-50/50 p-2 transition-colors hover:bg-blue-50"
                >
                  <div className="text-xs font-medium text-gray-900">{apt.patientName}</div>
                  <div className="mt-0.5 text-[10px] text-gray-500">
                    {apt.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' '}at {apt.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-400">{apt.providerName}</div>
                </div>
              ))}
              {upcomingVideoAppts.length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">No upcoming telehealth</p>
              )}
            </div>
          </div>
        </div>

        {/* Calendar Area */}
        <div className="flex-1">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {activeTab === 'calendar' && (
            <>
              {/* Navigation */}
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={() => calendarView === 'month' ? navigateMonth(-1) : calendarView === 'week' ? navigateWeek(-1) : navigateDay(-1)}
                  className="rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-semibold text-gray-900">
                  {calendarView === 'month' && `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`}
                  {calendarView === 'week' && `Week of ${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {calendarView === 'day' && currentDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <button
                  onClick={() => calendarView === 'month' ? navigateMonth(1) : calendarView === 'week' ? navigateWeek(1) : navigateDay(1)}
                  className="rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Calendar Views */}
              {calendarView === 'month' && renderMonthView()}
              {calendarView === 'week' && renderWeekView()}
              {calendarView === 'day' && renderDayView()}
            </>
          )}
        </div>
      </div>

      {/* Appointment Modal */}
      {showModal && (
        <AppointmentModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setSelectedAppointment(null); }}
          onSave={handleSaveAppointment}
          selectedDate={selectedDate}
          appointment={selectedAppointment}
          providerId={selectedProviderId || undefined}
        />
      )}

      {/* Book Telehealth Wizard */}
      {showBookWizard && (
        <BookTelehealthWizard
          isOpen={showBookWizard}
          onClose={() => setShowBookWizard(false)}
          onBooked={() => {
            setShowBookWizard(false);
            fetchAppointments();
          }}
          providers={providers}
          preSelectedProviderId={selectedProviderId || undefined}
        />
      )}
    </div>
  );
}
