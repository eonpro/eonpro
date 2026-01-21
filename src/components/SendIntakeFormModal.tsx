'use client';

import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface FormTemplate {
  id: number;
  name: string;
  description?: string;
  treatmentType: string;
}

interface SendIntakeFormModalProps {
  patient: Patient;
  onClose?: () => void;
}

export default function SendIntakeFormModal({ patient, onClose }: SendIntakeFormModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [sendMethod, setSendMethod] = useState<'email' | 'sms' | 'both'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/intake-forms/templates', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Failed to fetch templates', error);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate) {
      setMessage('Please select a form template');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/intake-forms/send-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          templateId: selectedTemplate,
          patientEmail: patient.email,
          patientPhone: patient.phone,
          sendMethod: sendMethod === 'both' ? 'email_and_sms' : sendMethod,
          patientId: patient.id
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessage('SUCCESS: Form sent successfully!');
        setTimeout(() => {
          closeModal();
        }, 2000);
      } else {
        const error = await res.json();
        setMessage(`ERROR: ${error.error || 'Failed to send form'}`);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Failed to send form', error);
      setMessage('ERROR: Failed to send form');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => setIsOpen(true);
  const closeModal = () => {
    setIsOpen(false);
    setMessage('');
    setSelectedTemplate(null);
  };

  // Make modal accessible from outside
  useEffect(() => {
    const handleOpenModal = () => openModal();
    const modal = document.getElementById('send-intake-modal');
    if (modal) {
      modal.addEventListener('click', handleOpenModal);
    }
    return () => {
      if (modal) {
        modal.removeEventListener('click', handleOpenModal);
      }
    };
  }, []);

  if (!isOpen) {
    return <div id="send-intake-modal" className="hidden" />;
  }

  return (
    <>
      <div id="send-intake-modal" className="hidden" />
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Send Intake Form to Patient</h2>
            <button
              onClick={closeModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Patient Info */}
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-600">Sending to:</p>
              <p className="font-semibold">{patient.firstName} {patient.lastName}</p>
              <p className="text-sm text-gray-600">{patient.email}</p>
              {patient.phone && <p className="text-sm text-gray-600">{patient.phone}</p>}
            </div>

            {/* Select Template */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Form Template *
              </label>
              <select
                value={selectedTemplate || ''}
                onChange={(e: any) => setSelectedTemplate(Number(e.target.value))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a template...</option>
                {templates.map((template: any) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Send Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Send Via
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="email"
                    checked={sendMethod === 'email'}
                    onChange={(e: any) => setSendMethod(e.target.value as 'email')}
                    className="mr-2"
                  />
                  Email Only
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="sms"
                    checked={sendMethod === 'sms'}
                    onChange={(e: any) => setSendMethod(e.target.value as 'sms')}
                    className="mr-2"
                    disabled={!patient.phone}
                  />
                  SMS Only {!patient.phone && <span className="text-gray-400 ml-2">(No phone number)</span>}
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="both"
                    checked={sendMethod === 'both'}
                    onChange={(e: any) => setSendMethod(e.target.value as 'both')}
                    className="mr-2"
                    disabled={!patient.phone}
                  />
                  Email & SMS
                </label>
              </div>
            </div>

            {/* Message */}
            {message && (
              <div className={`p-3 rounded flex items-center gap-2 ${message.includes('SUCCESS') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {message.includes('SUCCESS') ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {message.replace('SUCCESS: ', '').replace('ERROR: ', '')}
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={loading || !selectedTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Form'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
