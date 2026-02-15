'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '../lib/logger';

import {
  X,
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  Video,
  Send,
  Bell,
  Plus,
  Search,
  Check,
  Copy,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
}

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: any) => void;
  selectedDate?: Date | null;
  appointment?: any;
  preSelectedPatient?: any;
  providerId?: number;
  clinicId?: number;
}

export default function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
  appointment,
  preSelectedPatient,
  providerId,
  clinicId,
}: AppointmentModalProps) {
  const [step, setStep] = useState<'details' | 'patient' | 'notifications'>('details');
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: selectedDate || new Date(),
    time: '10:00',
    duration: '30',
    type: 'telehealth',
    reason: '',
    notes: '',
    patientFirstName: '',
    patientLastName: '',
    patientEmail: '',
    patientPhone: '',
    patientDob: '',
    sendEmail: true,
    sendSMS: true,
    emailReminders: ['1 day before', '1 hour before'],
    smsReminders: ['1 day before', '1 hour before'],
    zoomLink: '',
  });

  // Fetch patients from database
  const fetchPatients = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPatients([]);
      return;
    }

    setPatientsLoading(true);
    try {
      const response = await apiFetch(
        `/api/patients?search=${encodeURIComponent(trimmed)}&limit=10&includeContact=true`
      );
      if (response.ok) {
        const data = await response.json();
        // Map API response to Patient interface
        const mappedPatients = (data.patients || []).map((p: any) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email || '',
          phone: p.phone || '',
          dob: p.dateOfBirth || p.dob || '',
        }));
        setPatients(mappedPatients);
      } else {
        logger.error('Failed to fetch patients');
        setPatients([]);
      }
    } catch (err) {
      logger.error('Error fetching patients:', err);
      setPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  // Debounced patient search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        fetchPatients(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchPatients]);

  const filteredPatients = patients;

  useEffect(() => {
    if (appointment) {
      // Load existing appointment data
      setFormData({
        ...formData,
        date: appointment.date,
        time: appointment.date.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        }),
        duration: appointment.duration?.toString() || '30',
        type: appointment.type || 'telehealth',
        patientFirstName: appointment.patientName?.split(' ')[0] || '',
        patientLastName: appointment.patientName?.split(' ')[1] || '',
        patientEmail: appointment.patientEmail || '',
        patientPhone: appointment.patientPhone || '',
      });
    }
  }, [appointment]);

  useEffect(() => {
    // Handle pre-selected patient when opening from patient profile
    if (preSelectedPatient && isOpen) {
      const patient: Patient = {
        id: preSelectedPatient.id,
        firstName: preSelectedPatient.firstName,
        lastName: preSelectedPatient.lastName,
        email: preSelectedPatient.email,
        phone: preSelectedPatient.phone,
        dob: preSelectedPatient.dob,
      };
      setSelectedPatient(patient);
      setFormData((prev) => ({
        ...prev,
        patientFirstName: patient.firstName,
        patientLastName: patient.lastName,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        patientDob: patient.dob,
      }));
      setPatientMode('existing');
      setSearchQuery(`${patient.firstName} ${patient.lastName}`);
    }
  }, [preSelectedPatient, isOpen]);

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setFormData({
      ...formData,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      patientEmail: patient.email,
      patientPhone: patient.phone,
      patientDob: patient.dob,
    });
  };

  // Note: Zoom link will be created by the backend when appointment is saved
  // No local generation needed - the API creates real Zoom meetings

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);

    try {
      const appointmentDate = new Date(formData.date);
      const [hours, minutes] = formData.time.split(':').map(Number);
      appointmentDate.setHours(hours, minutes, 0, 0);

      // Calculate end time based on duration
      const endTime = new Date(appointmentDate.getTime() + parseInt(formData.duration) * 60 * 1000);

      // If it's a new patient, create their profile first
      let patientId = selectedPatient?.id;
      if (patientMode === 'new' && !selectedPatient) {
        try {
          const response = await apiFetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              firstName: formData.patientFirstName,
              lastName: formData.patientLastName,
              email: formData.patientEmail,
              phone: formData.patientPhone,
              dob: formData.patientDob,
              gender: 'f',
              address1: 'To be provided',
              city: 'To be provided',
              state: 'FL',
              zip: '00000',
            }),
          });

          if (response.ok) {
            const newPatient = await response.json();
            patientId = newPatient.id;
            logger.info('New patient profile created', { patientId });
          } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create patient profile');
          }
        } catch (err) {
          logger.error('Error creating patient:', err);
          setError(err instanceof Error ? err.message : 'Failed to create patient');
          setIsSaving(false);
          return;
        }
      }

      if (!patientId) {
        setError('Please select a patient or create a new one');
        setIsSaving(false);
        return;
      }

      // Map appointment type to backend enum
      const typeMap: Record<string, string> = {
        telehealth: 'VIDEO',
        'in-person': 'IN_PERSON',
        phone: 'PHONE',
      };

      // Create appointment via API - this will also create the Zoom meeting
      const appointmentPayload = {
        clinicId: clinicId,
        patientId: patientId,
        providerId: providerId || 1, // Fallback for testing
        startTime: appointmentDate.toISOString(),
        endTime: endTime.toISOString(),
        duration: parseInt(formData.duration),
        type: typeMap[formData.type] || 'VIDEO',
        reason: formData.reason || undefined,
        notes: formData.notes || undefined,
        title: `Appointment with ${formData.patientFirstName} ${formData.patientLastName}`,
      };

      const response = await apiFetch('/api/scheduling/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointmentPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create appointment');
      }

      const result = await response.json();
      const createdAppointment = result.appointment;

      // Update form with the real Zoom link from the backend
      if (createdAppointment.zoomJoinUrl) {
        setFormData((prev) => ({
          ...prev,
          zoomLink: createdAppointment.zoomJoinUrl,
        }));
      }

      // Show confirmation message
      setShowConfirmation(true);

      // Pass the created appointment back to parent
      const appointmentData = {
        id: createdAppointment.id,
        date: appointmentDate,
        duration: parseInt(formData.duration),
        type: formData.type,
        reason: formData.reason,
        notes: formData.notes,
        patientId: patientId,
        patientName: `${formData.patientFirstName} ${formData.patientLastName}`,
        patientEmail: formData.patientEmail,
        patientPhone: formData.patientPhone,
        patientDob: formData.patientDob,
        zoomLink: createdAppointment.zoomJoinUrl || createdAppointment.videoLink,
        zoomMeetingId: createdAppointment.zoomMeetingId,
        status: createdAppointment.status,
        emailReminders: formData.emailReminders,
        smsReminders: formData.smsReminders,
      };

      // Wait briefly to show confirmation, then close
      setTimeout(() => {
        onSave(appointmentData);
        setShowConfirmation(false);
        onClose();
      }, 2000);
    } catch (err) {
      logger.error('Error saving appointment:', err);
      setError(err instanceof Error ? err.message : 'Failed to save appointment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-lg rounded-lg bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">
                {appointment ? 'Edit Appointment' : 'New Appointment'}
              </h2>
              <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Minimal Step Indicator */}
            <div className="flex items-center gap-8 border-b px-6 py-3">
              {['Details', 'Patient', 'Notifications'].map((label, index) => {
                const stepId = label.toLowerCase();
                const isActive = step === stepId;
                const isPast = ['details', 'patient', 'notifications'].indexOf(step) > index;

                return (
                  <button
                    key={stepId}
                    onClick={() => setStep(stepId as any)}
                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                      isActive ? 'text-[#4fa77e]' : isPast ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${
                        isActive
                          ? 'border-[#4fa77e] bg-[#4fa77e] text-white'
                          : isPast
                            ? 'border-[#4fa77e] bg-[#4fa77e] text-white'
                            : 'border-gray-300'
                      }`}
                    >
                      {isPast ? '✓' : index + 1}
                    </div>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {showConfirmation ? (
                <div className="flex flex-col items-center py-8">
                  <CheckCircle2 className="mb-3 h-12 w-12 text-[#4fa77e]" />
                  <h3 className="mb-1 text-base font-semibold">Appointment Scheduled</h3>
                  <p className="mb-4 text-center text-sm text-gray-600">
                    {formData.patientFirstName} {formData.patientLastName} has been notified
                  </p>

                  {formData.type === 'telehealth' && formData.zoomLink && (
                    <div className="w-full max-w-sm rounded border border-green-200 bg-green-50 p-2">
                      <div className="flex items-center gap-2">
                        <Video className="h-3.5 w-3.5 text-[#4fa77e]" />
                        <input
                          type="text"
                          value={formData.zoomLink}
                          readOnly
                          className="flex-1 rounded border border-green-300 bg-white px-2 py-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(formData.zoomLink);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          className="rounded bg-[#4fa77e] px-2 py-1 text-xs text-white hover:bg-[#3f8660]"
                        >
                          {copiedLink ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Step 1: Appointment Details */}
                  {step === 'details' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Date
                          </label>
                          <input
                            type="date"
                            value={formData.date.toISOString().split('T')[0]}
                            onChange={(e) =>
                              setFormData({ ...formData, date: new Date(e.target.value) })
                            }
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Time
                          </label>
                          <input
                            type="time"
                            value={formData.time}
                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Duration
                          </label>
                          <select
                            value={formData.duration}
                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            <option value="15">15 minutes</option>
                            <option value="30">30 minutes</option>
                            <option value="45">45 minutes</option>
                            <option value="60">1 hour</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Type
                          </label>
                          <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            <option value="telehealth">Telehealth</option>
                            <option value="in-person">In-Person</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Reason for Visit
                        </label>
                        <input
                          type="text"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                          placeholder="e.g., Follow-up"
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Notes (optional)
                        </label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          rows={2}
                          placeholder="Additional notes"
                          className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>

                      {formData.type === 'telehealth' && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="text-sm text-blue-800">
                            <Video className="mr-2 inline h-4 w-4" />A Zoom meeting link will be
                            automatically generated and sent to the patient
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="flex items-center gap-2 text-sm text-red-800">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2: Patient Selection */}
                  {step === 'patient' && (
                    <div className="space-y-3">
                      {/* Patient Mode Selector */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPatientMode('existing')}
                          className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
                            patientMode === 'existing'
                              ? 'bg-[#4fa77e] text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          Existing Patient
                        </button>
                        <button
                          onClick={() => setPatientMode('new')}
                          className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
                            patientMode === 'new'
                              ? 'bg-[#4fa77e] text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          New Patient
                        </button>
                      </div>

                      {patientMode === 'existing' ? (
                        <>
                          {/* Search */}
                          <div className="relative">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search patients (min 2 characters)..."
                              className="w-full rounded border border-gray-300 px-2 py-1.5 pr-8 text-sm"
                            />
                            {patientsLoading && (
                              <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                            )}
                          </div>

                          {/* Patient List */}
                          <div className="max-h-32 overflow-y-auto rounded border">
                            {patientsLoading ? (
                              <div className="px-2 py-4 text-center text-sm text-gray-500">
                                Searching patients...
                              </div>
                            ) : filteredPatients.length > 0 ? (
                              filteredPatients.map((patient) => (
                                <button
                                  key={patient.id}
                                  onClick={() => handlePatientSelect(patient)}
                                  className={`w-full border-b px-2 py-1.5 text-left transition-colors last:border-b-0 hover:bg-gray-50 ${
                                    selectedPatient?.id === patient.id ? 'bg-green-50' : ''
                                  }`}
                                >
                                  <div className="text-sm font-medium">
                                    {patient.firstName} {patient.lastName}
                                  </div>
                                  <div className="text-xs text-gray-600">{patient.email}</div>
                                </button>
                              ))
                            ) : searchQuery.length >= 2 ? (
                              <div className="px-2 py-4 text-center text-sm text-gray-500">
                                No patients found. Try a different search or add a new patient.
                              </div>
                            ) : (
                              <div className="px-2 py-4 text-center text-sm text-gray-500">
                                Type at least 2 characters to search
                              </div>
                            )}
                          </div>

                          {selectedPatient && (
                            <div className="rounded border border-green-200 bg-green-50 px-2 py-1.5 text-xs">
                              <p className="text-sm text-green-800">
                                Selected: {selectedPatient.firstName} {selectedPatient.lastName}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* New Patient Form */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                First Name *
                              </label>
                              <input
                                type="text"
                                value={formData.patientFirstName}
                                onChange={(e) =>
                                  setFormData({ ...formData, patientFirstName: e.target.value })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                Last Name *
                              </label>
                              <input
                                type="text"
                                value={formData.patientLastName}
                                onChange={(e) =>
                                  setFormData({ ...formData, patientLastName: e.target.value })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              <Mail className="mr-1 inline h-4 w-4" />
                              Email *
                            </label>
                            <input
                              type="email"
                              value={formData.patientEmail}
                              onChange={(e) =>
                                setFormData({ ...formData, patientEmail: e.target.value })
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                <Phone className="mr-1 inline h-4 w-4" />
                                Phone Number *
                              </label>
                              <input
                                type="tel"
                                value={formData.patientPhone}
                                onChange={(e) =>
                                  setFormData({ ...formData, patientPhone: e.target.value })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                Date of Birth *
                              </label>
                              <input
                                type="date"
                                value={formData.patientDob}
                                onChange={(e) =>
                                  setFormData({ ...formData, patientDob: e.target.value })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Step 3: Notifications */}
                  {step === 'notifications' && (
                    <div className="space-y-4">
                      {/* Send Methods */}
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-700">
                          Send notifications via:
                        </h3>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.sendEmail}
                            onChange={(e) =>
                              setFormData({ ...formData, sendEmail: e.target.checked })
                            }
                            className="h-3.5 w-3.5 rounded text-[#4fa77e] accent-[#4fa77e]"
                          />
                          <span className="text-sm">Email ({formData.patientEmail})</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.sendSMS}
                            onChange={(e) =>
                              setFormData({ ...formData, sendSMS: e.target.checked })
                            }
                            className="h-3.5 w-3.5 rounded text-[#4fa77e] accent-[#4fa77e]"
                          />
                          <span className="text-sm">SMS ({formData.patientPhone})</span>
                        </label>
                      </div>

                      {/* Reminders */}
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-700">Appointment Reminders</h3>

                        {formData.sendEmail && (
                          <div className="space-y-1">
                            {['1 day before', '1 hour before'].map((time) => (
                              <label key={time} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.emailReminders.includes(time)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        emailReminders: [...formData.emailReminders, time],
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        emailReminders: formData.emailReminders.filter(
                                          (t) => t !== time
                                        ),
                                      });
                                    }
                                  }}
                                  className="h-3.5 w-3.5 rounded text-[#4fa77e] accent-[#4fa77e]"
                                />
                                <span className="text-xs">Email: {time}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {formData.sendSMS && (
                          <div className="space-y-1">
                            {['1 day before', '1 hour before'].map((time) => (
                              <label key={time} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.smsReminders.includes(time)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        smsReminders: [...formData.smsReminders, time],
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        smsReminders: formData.smsReminders.filter(
                                          (t) => t !== time
                                        ),
                                      });
                                    }
                                  }}
                                  className="h-3.5 w-3.5 rounded text-[#4fa77e] accent-[#4fa77e]"
                                />
                                <span className="text-xs">SMS: {time}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Zoom Link Display */}
                      {formData.type === 'telehealth' && formData.zoomLink && (
                        <div className="rounded border border-green-200 bg-green-50 p-2">
                          <div className="flex items-center gap-2">
                            <Video className="h-3.5 w-3.5 text-green-600" />
                            <input
                              type="text"
                              value={formData.zoomLink}
                              readOnly
                              className="flex-1 rounded border border-green-300 bg-white px-2 py-1 font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(formData.zoomLink);
                                setCopiedLink(true);
                                setTimeout(() => setCopiedLink(false), 2000);
                              }}
                              className="rounded bg-[#4fa77e] px-2 py-1 text-xs text-white hover:bg-[#3f8660]"
                            >
                              {copiedLink ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Note about Zoom meeting creation */}
                      {formData.type === 'telehealth' && !formData.zoomLink && (
                        <div className="rounded border border-blue-200 bg-blue-50 p-2">
                          <p className="text-xs text-blue-700">
                            A Zoom meeting will be created when you schedule this appointment.
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="flex items-center gap-2 text-sm text-red-800">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!showConfirmation && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <button
                  onClick={() => {
                    if (step === 'patient') setStep('details');
                    else if (step === 'notifications') setStep('patient');
                  }}
                  disabled={step === 'details'}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  Back
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>

                  {step !== 'notifications' ? (
                    <button
                      onClick={() => {
                        if (step === 'details') setStep('patient');
                        else if (step === 'patient') setStep('notifications');
                      }}
                      className="rounded bg-[#4fa77e] px-3 py-1.5 text-sm text-white hover:bg-[#3f8660]"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-2 rounded bg-[#4fa77e] px-3 py-1.5 text-sm text-white hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Scheduling...
                        </>
                      ) : (
                        'Schedule'
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
