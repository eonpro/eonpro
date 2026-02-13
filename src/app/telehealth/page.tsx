'use client';

import { useState, useEffect } from 'react';
import { Feature } from '@/components/Feature';
import MeetingRoom from '@/components/zoom/MeetingRoom';
import { logger } from '@/lib/logger';
import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  Settings,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  Phone,
  Link2,
  Copy,
  Edit,
  Trash,
} from 'lucide-react';
import { CONSULTATION_DURATIONS } from '@/lib/integrations/zoom/config';

interface Meeting {
  id: string;
  topic: string;
  patientName: string;
  providerId: string;
  scheduledAt: Date;
  duration: number;
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  joinUrl?: string;
  meetingId?: string;
  password?: string;
}

export default function TelehealthPage() {
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [showNewMeetingForm, setShowNewMeetingForm] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [meetingTopic, setMeetingTopic] = useState<string>('');
  const [meetingDate, setMeetingDate] = useState<string>('');
  const [meetingTime, setMeetingTime] = useState<string>('');
  const [meetingDuration, setMeetingDuration] = useState<number>(30);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sample patients for demo
  const samplePatients = [
    { id: '1', name: 'John Doe' },
    { id: '2', name: 'Jane Smith' },
    { id: '3', name: 'Robert Johnson' },
    { id: '4', name: 'Emily Davis' },
  ];

  // Load sample meetings
  useEffect(() => {
    // Use a stable date for SSR compatibility
    const now = new Date();
    const sampleMeetings: Meeting[] = [
      {
        id: 'meet-1',
        topic: 'Follow-up Consultation',
        patientName: 'John Doe',
        providerId: 'dr-1',
        scheduledAt: new Date(now.getTime() + 1000 * 60 * 30), // 30 min from now
        duration: 30,
        status: 'scheduled',
        meetingId: '123456789',
        password: 'ABC123',
        joinUrl: 'https://zoom.us/j/123456789?pwd=ABC123',
      },
      {
        id: 'meet-2',
        topic: 'Initial Assessment',
        patientName: 'Jane Smith',
        providerId: 'dr-1',
        scheduledAt: new Date(now.getTime() + 1000 * 60 * 60 * 2), // 2 hours from now
        duration: 45,
        status: 'scheduled',
        meetingId: '987654321',
        password: 'XYZ789',
        joinUrl: 'https://zoom.us/j/987654321?pwd=XYZ789',
      },
      {
        id: 'meet-3',
        topic: 'Prescription Review',
        patientName: 'Robert Johnson',
        providerId: 'dr-1',
        scheduledAt: new Date(now.getTime() - 1000 * 60 * 60 * 24), // Yesterday
        duration: 15,
        status: 'completed',
        meetingId: '555555555',
      },
    ];
    setMeetings(sampleMeetings);
  }, []);

  const createMeeting = async () => {
    if (!selectedPatient || !meetingTopic || !meetingDate || !meetingTime) {
      alert('Please fill in all required fields');
      return;
    }

    setIsCreating(true);

    try {
      // Combine date and time
      const scheduledAt = new Date(`${meetingDate}T${meetingTime}`);

      // Call API to create meeting
      const response = await fetch('/api/v2/zoom/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: meetingTopic,
          patientId: selectedPatient,
          duration: meetingDuration,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });

      if (response.ok) {
        const meeting = await response.json();

        const newMeeting: Meeting = {
          id: `meet-${Date.now()}`,
          topic: meetingTopic,
          patientName: samplePatients.find((p: any) => p.id === selectedPatient)?.name || '',
          providerId: 'dr-1',
          scheduledAt,
          duration: meetingDuration,
          status: 'scheduled',
          meetingId: meeting.meetingId || `mock-${Date.now()}`,
          password: meeting.password || 'DEMO123',
          joinUrl: meeting.joinUrl || `https://zoom.us/j/mock-${Date.now()}`,
        };

        setMeetings((prev) => [...prev, newMeeting]);
        setShowNewMeetingForm(false);
        resetForm();
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Failed to create meeting:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setMeetingTopic('');
    setSelectedPatient('');
    setMeetingDate('');
    setMeetingTime('');
    setMeetingDuration(30);
  };

  const joinMeeting = (meeting: Meeting) => {
    setActiveMeeting(meeting);
  };

  const copyMeetingLink = (meeting: Meeting) => {
    const link =
      meeting.joinUrl || `Meeting ID: ${meeting.meetingId}, Password: ${meeting.password}`;
    navigator.clipboard.writeText(link);
    setCopiedId(meeting.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cancelMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) return;

    setMeetings((prev) =>
      prev.map((m: any) => (m.id === meetingId ? { ...m, status: 'cancelled' as const } : m))
    );
  };

  const formatDateTime = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getStatusBadge = (status: Meeting['status']) => {
    const badges = {
      scheduled: { icon: Clock, color: 'text-blue-600 bg-blue-100' },
      waiting: { icon: Users, color: 'text-yellow-600 bg-yellow-100' },
      in_progress: { icon: Video, color: 'text-green-600 bg-green-100' },
      completed: { icon: CheckCircle, color: 'text-gray-600 bg-gray-100' },
      cancelled: { icon: XCircle, color: 'text-red-600 bg-red-100' },
    };

    const badge = badges[status];
    const Icon = badge.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${badge.color}`}
      >
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  // If in a meeting, show meeting room
  if (activeMeeting) {
    return (
      <MeetingRoom
        meetingId={activeMeeting.meetingId || ''}
        meetingPassword={activeMeeting.password}
        userName="Dr. Smith"
        userEmail="dr.smith@lifefile.com"
        role="host"
        onMeetingEnd={() => setActiveMeeting(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Video className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Telehealth Center</h1>
                  <p className="mt-1 text-gray-600">
                    Manage virtual consultations and video appointments
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewMeetingForm(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
                Schedule Consultation
              </button>
            </div>
          </div>

          <Feature
            feature="ZOOM_TELEHEALTH"
            fallback={
              <div className="rounded-lg bg-white p-12 text-center shadow-sm">
                <Video className="mx-auto mb-4 h-16 w-16 text-gray-400" />
                <h2 className="mb-2 text-2xl font-semibold">Telehealth Coming Soon</h2>
                <p className="mx-auto mb-8 max-w-md text-gray-600">
                  Virtual consultations with Zoom integration will be available soon.
                </p>

                <div className="mx-auto mt-8 grid max-w-3xl gap-6 text-left md:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">📹 HD Video Calls</h3>
                    <p className="text-sm text-gray-600">
                      High-quality video consultations with screen sharing
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">⏰ Smart Scheduling</h3>
                    <p className="text-sm text-gray-600">
                      Automated reminders and calendar integration
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">HIPAA Compliant</h3>
                    <p className="text-sm text-gray-600">
                      Secure, encrypted video calls with recording options
                    </p>
                  </div>
                </div>
              </div>
            }
          >
            {/* New Meeting Form */}
            {showNewMeetingForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="w-full max-w-md rounded-lg bg-white p-6">
                  <h2 className="mb-4 text-xl font-semibold">Schedule Telehealth Consultation</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Patient
                      </label>
                      <select
                        value={selectedPatient}
                        onChange={(e: any) => setSelectedPatient(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a patient</option>
                        {samplePatients.map((patient: any) => (
                          <option key={patient.id} value={patient.id}>
                            {patient.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Consultation Topic
                      </label>
                      <input
                        type="text"
                        value={meetingTopic}
                        onChange={(e: any) => setMeetingTopic(e.target.value)}
                        placeholder="e.g., Follow-up Consultation"
                        className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                        <input
                          type="date"
                          value={meetingDate}
                          onChange={(e: any) => setMeetingDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Time</label>
                        <input
                          type="time"
                          value={meetingTime}
                          onChange={(e: any) => setMeetingTime(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Duration
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {Object.entries(CONSULTATION_DURATIONS).map(([key, duration]) => (
                          <button
                            key={key}
                            onClick={() => setMeetingDuration(duration)}
                            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                              meetingDuration === duration
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                          >
                            {duration} min
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => setShowNewMeetingForm(false)}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                      disabled={isCreating}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createMeeting}
                      disabled={isCreating}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {isCreating ? 'Creating...' : 'Schedule Meeting'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Meetings List */}
            <div className="rounded-lg bg-white shadow-sm">
              <div className="border-b p-6">
                <h2 className="text-xl font-semibold">Scheduled Consultations</h2>
              </div>

              <div className="divide-y">
                {meetings.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No consultations scheduled yet
                  </div>
                ) : (
                  meetings.map((meeting: any) => (
                    <div key={meeting.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-3">
                            <h3 className="text-lg font-semibold">{meeting.topic}</h3>
                            {getStatusBadge(meeting.status)}
                          </div>

                          <div className="mb-3 flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {meeting.patientName}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDateTime(meeting.scheduledAt)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {meeting.duration} minutes
                            </div>
                          </div>

                          {meeting.meetingId && (
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500">
                                Meeting ID: <span className="font-mono">{meeting.meetingId}</span>
                              </span>
                              {meeting.password && (
                                <span className="text-gray-500">
                                  Password: <span className="font-mono">{meeting.password}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {meeting.status === 'scheduled' && (
                            <>
                              <button
                                onClick={() => copyMeetingLink(meeting)}
                                className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
                                title="Copy meeting link"
                              >
                                {copiedId === meeting.id ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : (
                                  <Copy className="h-5 w-5" />
                                )}
                              </button>

                              <button
                                onClick={() => joinMeeting(meeting)}
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                              >
                                <Video className="h-4 w-4" />
                                Start Meeting
                              </button>

                              <button
                                onClick={() => cancelMeeting(meeting.id)}
                                className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                                title="Cancel meeting"
                              >
                                <XCircle className="h-5 w-5" />
                              </button>
                            </>
                          )}

                          {meeting.status === 'completed' && (
                            <button className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-600">
                              <ChevronRight className="h-4 w-4" />
                              View Recording
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Statistics */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-blue-600">
                  {meetings.filter((m: any) => m.status === 'scheduled').length}
                </div>
                <div className="text-sm text-gray-600">Upcoming</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-green-600">
                  {meetings.filter((m: any) => m.status === 'completed').length}
                </div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-yellow-600">
                  {meetings.reduce((sum, m) => sum + m.duration, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Minutes</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-purple-600">98%</div>
                <div className="text-sm text-gray-600">Satisfaction</div>
              </div>
            </div>
          </Feature>
        </div>
      </div>
    </div>
  );
}
