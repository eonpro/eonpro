"use client";

import { useState, useEffect, useCallback } from "react";
import { logger } from '../lib/logger';

import { X, User, Mail, Phone, Calendar, Clock, Video, Send, Bell, Plus, Search, Check, Copy, Link2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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
    if (query.length < 2) {
      setPatients([]);
      return;
    }
    
    setPatientsLoading(true);
    try {
      const response = await fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10&includeContact=true`);
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
        time: appointment.date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
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
        dob: preSelectedPatient.dob
      };
      setSelectedPatient(patient);
      setFormData(prev => ({
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
          const response = await fetch('/api/patients', {
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
        'telehealth': 'VIDEO',
        'in-person': 'IN_PERSON',
        'phone': 'PHONE',
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

      const response = await fetch('/api/scheduling/appointments', {
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
        setFormData(prev => ({
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
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-white rounded-lg shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {appointment ? 'Edit Appointment' : 'New Appointment'}
              </h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Minimal Step Indicator */}
            <div className="flex items-center gap-8 px-6 py-3 border-b">
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
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                      isActive ? 'border-[#4fa77e] bg-[#4fa77e] text-white' : 
                      isPast ? 'border-[#4fa77e] bg-[#4fa77e] text-white' : 'border-gray-300'
                    }`}>
                      {isPast ? '✓' : index + 1}
                    </div>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {showConfirmation ? (
                <div className="flex flex-col items-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-[#4fa77e] mb-3" />
                  <h3 className="text-base font-semibold mb-1">Appointment Scheduled</h3>
                  <p className="text-sm text-gray-600 text-center mb-4">
                    {formData.patientFirstName} {formData.patientLastName} has been notified
                  </p>
                  
                  {formData.type === 'telehealth' && formData.zoomLink && (
                    <div className="bg-green-50 border border-green-200 rounded p-2 w-full max-w-sm">
                      <div className="flex items-center gap-2">
                        <Video className="w-3.5 h-3.5 text-[#4fa77e]" />
                        <input
                          type="text"
                          value={formData.zoomLink}
                          readOnly
                          className="flex-1 px-2 py-1 bg-white border border-green-300 rounded text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(formData.zoomLink);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          className="px-2 py-1 bg-[#4fa77e] text-white text-xs rounded hover:bg-[#3f8660]"
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
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={formData.date.toISOString().split('T')[0]}
                            onChange={(e) => setFormData({...formData, date: new Date(e.target.value)})}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Time
                          </label>
                          <input
                            type="time"
                            value={formData.time}
                            onChange={(e) => setFormData({...formData, time: e.target.value})}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Duration
                          </label>
                          <select
                            value={formData.duration}
                            onChange={(e) => setFormData({...formData, duration: e.target.value})}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                          >
                            <option value="15">15 minutes</option>
                            <option value="30">30 minutes</option>
                            <option value="45">45 minutes</option>
                            <option value="60">1 hour</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Type
                          </label>
                          <select
                            value={formData.type}
                            onChange={(e) => setFormData({...formData, type: e.target.value})}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                          >
                            <option value="telehealth">Telehealth</option>
                            <option value="in-person">In-Person</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Reason for Visit
                        </label>
                        <input
                          type="text"
                          value={formData.reason}
                          onChange={(e) => setFormData({...formData, reason: e.target.value})}
                          placeholder="e.g., Follow-up"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Notes (optional)
                        </label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({...formData, notes: e.target.value})}
                          rows={2}
                          placeholder="Additional notes"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded resize-none"
                        />
                      </div>

                      {formData.type === 'telehealth' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <Video className="w-4 h-4 inline mr-2" />
                            A Zoom meeting link will be automatically generated and sent to the patient
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-800 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
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
                          className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                            patientMode === 'existing' 
                              ? 'bg-[#4fa77e] text-white' 
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          Existing Patient
                        </button>
                        <button
                          onClick={() => setPatientMode('new')}
                          className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
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
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded pr-8"
                            />
                            {patientsLoading && (
                              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                            )}
                          </div>

                          {/* Patient List */}
                          <div className="border rounded max-h-32 overflow-y-auto">
                            {patientsLoading ? (
                              <div className="px-2 py-4 text-center text-sm text-gray-500">
                                Searching patients...
                              </div>
                            ) : filteredPatients.length > 0 ? (
                              filteredPatients.map(patient => (
                                <button
                                  key={patient.id}
                                  onClick={() => handlePatientSelect(patient)}
                                  className={`w-full text-left px-2 py-1.5 hover:bg-gray-50 transition-colors border-b last:border-b-0 ${
                                    selectedPatient?.id === patient.id ? 'bg-green-50' : ''
                                  }`}
                                >
                                  <div className="text-sm font-medium">{patient.firstName} {patient.lastName}</div>
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
                            <div className="px-2 py-1.5 bg-green-50 border border-green-200 rounded text-xs">
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
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                First Name *
                              </label>
                              <input
                                type="text"
                                value={formData.patientFirstName}
                                onChange={(e) => setFormData({...formData, patientFirstName: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Last Name *
                              </label>
                              <input
                                type="text"
                                value={formData.patientLastName}
                                onChange={(e) => setFormData({...formData, patientLastName: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              <Mail className="w-4 h-4 inline mr-1" />
                              Email *
                            </label>
                            <input
                              type="email"
                              value={formData.patientEmail}
                              onChange={(e) => setFormData({...formData, patientEmail: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Phone className="w-4 h-4 inline mr-1" />
                                Phone Number *
                              </label>
                              <input
                                type="tel"
                                value={formData.patientPhone}
                                onChange={(e) => setFormData({...formData, patientPhone: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date of Birth *
                              </label>
                              <input
                                type="date"
                                value={formData.patientDob}
                                onChange={(e) => setFormData({...formData, patientDob: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                        <h3 className="text-sm font-medium text-gray-700">Send notifications via:</h3>
                        
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.sendEmail}
                            onChange={(e) => setFormData({...formData, sendEmail: e.target.checked})}
                            className="w-3.5 h-3.5 text-[#4fa77e] accent-[#4fa77e] rounded"
                          />
                          <span className="text-sm">Email ({formData.patientEmail})</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.sendSMS}
                            onChange={(e) => setFormData({...formData, sendSMS: e.target.checked})}
                            className="w-3.5 h-3.5 text-[#4fa77e] accent-[#4fa77e] rounded"
                          />
                          <span className="text-sm">SMS ({formData.patientPhone})</span>
                        </label>
                      </div>

                      {/* Reminders */}
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-700">Appointment Reminders</h3>

                        {formData.sendEmail && (
                          <div className="space-y-1">
                            {['1 day before', '1 hour before'].map(time => (
                              <label key={time} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.emailReminders.includes(time)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({...formData, emailReminders: [...formData.emailReminders, time]});
                                    } else {
                                      setFormData({...formData, emailReminders: formData.emailReminders.filter(t => t !== time)});
                                    }
                                  }}
                                  className="w-3.5 h-3.5 text-[#4fa77e] accent-[#4fa77e] rounded"
                                />
                                <span className="text-xs">Email: {time}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {formData.sendSMS && (
                          <div className="space-y-1">
                            {['1 day before', '1 hour before'].map(time => (
                              <label key={time} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.smsReminders.includes(time)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({...formData, smsReminders: [...formData.smsReminders, time]});
                                    } else {
                                      setFormData({...formData, smsReminders: formData.smsReminders.filter(t => t !== time)});
                                    }
                                  }}
                                  className="w-3.5 h-3.5 text-[#4fa77e] accent-[#4fa77e] rounded"
                                />
                                <span className="text-xs">SMS: {time}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Zoom Link Display */}
                      {formData.type === 'telehealth' && formData.zoomLink && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded">
                          <div className="flex items-center gap-2">
                            <Video className="w-3.5 h-3.5 text-green-600" />
                            <input
                              type="text"
                              value={formData.zoomLink}
                              readOnly
                              className="flex-1 px-2 py-1 text-xs bg-white border border-green-300 rounded font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(formData.zoomLink);
                                setCopiedLink(true);
                                setTimeout(() => setCopiedLink(false), 2000);
                              }}
                              className="px-2 py-1 text-xs bg-[#4fa77e] text-white rounded hover:bg-[#3f8660]"
                            >
                              {copiedLink ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Note about Zoom meeting creation */}
                      {formData.type === 'telehealth' && !formData.zoomLink && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                          <p className="text-xs text-blue-700">
                            A Zoom meeting will be created when you schedule this appointment.
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-800 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
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
              <div className="flex items-center justify-between px-4 py-3 border-t">
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
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  
                  {step !== 'notifications' ? (
                    <button
                      onClick={() => {
                        if (step === 'details') setStep('patient');
                        else if (step === 'patient') setStep('notifications');
                      }}
                      className="px-3 py-1.5 text-sm bg-[#4fa77e] text-white rounded hover:bg-[#3f8660]"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-sm bg-[#4fa77e] text-white rounded hover:bg-[#3f8660] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
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
