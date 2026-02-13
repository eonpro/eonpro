'use client';

import { useState } from 'react';
import SMSComposer from '@/components/twilio/SMSComposer';
import { Feature } from '@/components/Feature';
import { MessageSquare, Users, Clock, CheckCircle2 } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function SMSPage() {
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  // Sample patients for demonstration
  const samplePatients = [
    { id: 1, name: 'John Doe', phone: '(555) 123-4567' },
    { id: 2, name: 'Jane Smith', phone: '(555) 987-6543' },
    { id: 3, name: 'Robert Johnson', phone: '(555) 456-7890' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">SMS Communications Center</h1>
            <p className="mt-2 text-lg text-gray-600">
              Send appointment reminders, notifications, and communicate with patients via SMS
            </p>
          </div>

          <Feature
            feature="TWILIO_SMS"
            fallback={
              <div className="rounded-lg bg-white p-8 shadow-sm">
                <div className="mx-auto max-w-3xl text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                    <MessageSquare className="h-6 w-6 text-yellow-600" />
                  </div>
                  <h2 className="mb-4 text-2xl font-bold text-gray-900">
                    SMS Notifications Coming Soon!
                  </h2>
                  <p className="mb-6 text-gray-600">
                    We're setting up SMS capabilities to help you communicate better with your
                    patients.
                  </p>

                  <div className="mt-8 grid gap-6 text-left md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold">Automated Reminders</h3>
                      <p className="text-sm text-gray-600">
                        Send automatic appointment reminders to reduce no-shows and improve patient
                        compliance.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold">Two-Way Messaging</h3>
                      <p className="text-sm text-gray-600">
                        Patients can confirm or cancel appointments by replying to SMS messages.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold">Bulk Notifications</h3>
                      <p className="text-sm text-gray-600">
                        Send important updates to multiple patients at once with our bulk SMS
                        feature.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold">HIPAA Compliant</h3>
                      <p className="text-sm text-gray-600">
                        All messages are sent securely and in compliance with healthcare
                        regulations.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 rounded-lg bg-blue-50 p-4">
                    <p className="text-sm text-blue-800">
                      To enable SMS notifications, add your Twilio credentials to the environment
                      variables and set{' '}
                      <code className="rounded bg-white px-2 py-1">
                        NEXT_PUBLIC_ENABLE_TWILIO_SMS=true
                      </code>
                    </p>
                  </div>
                </div>
              </div>
            }
          >
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Patient List */}
              <div className="lg:col-span-1">
                <div className="rounded-lg bg-white p-6 shadow-sm">
                  <h2 className="mb-4 flex items-center text-lg font-semibold">
                    <Users className="mr-2 h-5 w-5 text-gray-600" />
                    Select Patient
                  </h2>
                  <div className="space-y-2">
                    {samplePatients.map((patient: any) => (
                      <button
                        key={patient.id}
                        onClick={() => setSelectedPatient(patient)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          selectedPatient?.id === patient.id
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium">{patient.name}</div>
                        <div className="text-sm text-gray-500">{patient.phone}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold">SMS Statistics</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sent Today</span>
                      <span className="font-semibold">24</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivered</span>
                      <span className="font-semibold text-green-600">22</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Responses</span>
                      <span className="font-semibold">18</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Failed</span>
                      <span className="font-semibold text-red-600">2</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SMS Composer */}
              <div className="lg:col-span-2">
                <SMSComposer
                  patientPhone={selectedPatient?.phone || ''}
                  patientName={selectedPatient?.name || ''}
                  patientId={selectedPatient?.id}
                  onSuccess={(messageId: any) => {
                    logger.debug('Message sent:', { value: messageId });
                  }}
                  onError={(error: any) => {
                    logger.error('Failed to send:', error);
                  }}
                />

                {/* Recent Messages */}
                <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center text-lg font-semibold">
                    <Clock className="mr-2 h-5 w-5 text-gray-600" />
                    Recent Messages
                  </h3>
                  <div className="space-y-3">
                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-start justify-between">
                        <span className="text-sm font-medium">John Doe</span>
                        <span className="text-xs text-gray-500">2 hours ago</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Appointment reminder sent for tomorrow at 2:00 PM
                      </p>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Delivered
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-start justify-between">
                        <span className="text-sm font-medium">Jane Smith</span>
                        <span className="text-xs text-gray-500">3 hours ago</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Prescription ready for pickup notification
                      </p>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Delivered & Read
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-start justify-between">
                        <span className="text-sm font-medium">Robert Johnson</span>
                        <span className="text-xs text-gray-500">5 hours ago</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Lab results available in patient portal
                      </p>
                      <div className="mt-2 flex items-center text-xs text-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Delivered
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Feature>
        </div>
      </div>
    </div>
  );
}
