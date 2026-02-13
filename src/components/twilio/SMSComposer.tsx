'use client';

import { useState } from 'react';
import { isFeatureEnabled } from '@/lib/features';
import { Send, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';
import { Patient, Provider, Order } from '@/types/models';

interface SMSComposerProps {
  patientPhone?: string;
  patientName?: string;
  patientId?: number;
  onSuccess?: (messageId: string) => void;
  onError?: (error: string) => void;
}

// Predefined message templates
const MESSAGE_TEMPLATES = [
  {
    id: 'appointment',
    label: 'Appointment Reminder',
    template:
      'Hi {name}, this is a reminder of your appointment tomorrow at {time}. Reply CONFIRM to confirm.',
  },
  {
    id: 'prescription',
    label: 'Prescription Ready',
    template: 'Hi {name}, your prescription is ready for pickup at our pharmacy.',
  },
  {
    id: 'lab',
    label: 'Lab Results',
    template: 'Hi {name}, your lab results are now available in your patient portal.',
  },
  {
    id: 'payment',
    label: 'Payment Reminder',
    template:
      'Hi {name}, this is a reminder about your outstanding balance. Please contact us for payment options.',
  },
  {
    id: 'custom',
    label: 'Custom Message',
    template: '',
  },
];

export default function SMSComposer({
  patientPhone = '',
  patientName = 'Patient',
  patientId,
  onSuccess,
  onError,
}: SMSComposerProps) {
  const [phoneNumber, setPhoneNumber] = useState(patientPhone);
  const [message, setMessage] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('custom');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // Check if feature is enabled
  if (!isFeatureEnabled('TWILIO_SMS')) {
    return (
      <div className="rounded-lg bg-gray-100 p-6">
        <div className="flex items-center space-x-2 text-gray-600">
          <MessageSquare className="h-5 w-5" />
          <p>SMS notifications will be available soon!</p>
        </div>
      </div>
    );
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = MESSAGE_TEMPLATES.find((t: any) => t.id === templateId);

    if (template && template.template) {
      // Replace placeholders
      let msg = template.template;
      msg = msg.replace('{name}', patientName);
      msg = msg.replace('{time}', '2:00 PM'); // Default time
      setMessage(msg);
    } else if (templateId === 'custom') {
      setMessage('');
    }
  };

  const formatPhone = (value: string) => {
    // Remove all non-numeric characters
    const cleaned = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhoneNumber(formatted);
  };

  const handleSendSMS = async () => {
    if (!phoneNumber || !message) {
      setStatus('error');
      setStatusMessage('Please enter both phone number and message');
      return;
    }

    setSending(true);
    setStatus('idle');
    setStatusMessage('');

    try {
      const response = await fetch('/api/v2/twilio/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phoneNumber,
          message: message,
          patientId: patientId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      setStatus('success');
      setStatusMessage('Message sent successfully!');
      setMessage('');
      setSelectedTemplate('custom');

      if (onSuccess) {
        onSuccess(data.messageId);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
      }, 3000);
    } catch (error: any) {
      // @ts-ignore

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus('error');
      setStatusMessage(errorMessage || 'Failed to send message');

      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setSending(false);
    }
  };

  const remainingChars = 160 - message.length;

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="mb-2 flex items-center text-lg font-semibold">
          <MessageSquare className="mr-2 h-5 w-5 text-blue-600" />
          Send SMS Notification
        </h3>
        <p className="text-sm text-gray-600">
          Send appointment reminders, prescription notifications, and other messages to patients
        </p>
      </div>

      <div className="space-y-4">
        {/* Phone Number Input */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            placeholder="(555) 123-4567"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={14}
          />
        </div>

        {/* Template Selection */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Message Template</label>
          <select
            value={selectedTemplate}
            onChange={(e: any) => handleTemplateChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MESSAGE_TEMPLATES.map((template: any) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </div>

        {/* Message Input */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
          <textarea
            value={message}
            onChange={(e: any) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            rows={4}
            maxLength={160}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>Standard SMS rates may apply</span>
            <span className={remainingChars < 20 ? 'text-orange-500' : ''}>
              {remainingChars} characters remaining
            </span>
          </div>
        </div>

        {/* Status Message */}
        {status !== 'idle' && (
          <div
            className={`flex items-center rounded-lg p-3 ${
              status === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {status === 'success' ? (
              <CheckCircle className="mr-2 h-5 w-5" />
            ) : (
              <AlertCircle className="mr-2 h-5 w-5" />
            )}
            <span className="text-sm">{statusMessage}</span>
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSendSMS}
          disabled={sending || !phoneNumber || !message}
          className={`flex w-full items-center justify-center rounded-lg px-4 py-3 font-medium text-white transition-colors ${
            sending || !phoneNumber || !message
              ? 'cursor-not-allowed bg-gray-400'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {sending ? (
            <>
              <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" />
              Send SMS
            </>
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="mt-6 rounded-lg bg-blue-50 p-4">
        <h4 className="mb-2 text-sm font-medium text-blue-900">SMS Notification Features</h4>
        <ul className="space-y-1 text-xs text-blue-800">
          <li>• Automatic appointment reminders</li>
          <li>• Two-way messaging with keyword responses</li>
          <li>• Prescription and lab result notifications</li>
          <li>• HIPAA-compliant message delivery</li>
        </ul>
      </div>
    </div>
  );
}
