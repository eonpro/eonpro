'use client';

/**
 * Email Communications Center
 *
 * Manage email templates and send notifications
 */

import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import {
  Mail,
  Send,
  Users,
  Clock,
  FileText,
  User,
  Calendar,
  Package,
  CreditCard,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Edit,
  Plus,
  Filter,
} from 'lucide-react';
import { Feature } from '@/components/Feature';
import { EmailTemplate } from '@/lib/integrations/aws/sesConfig';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';
import { apiFetch } from '@/lib/api/fetch';

interface EmailLog {
  id: string;
  to: string[];
  subject: string;
  template?: EmailTemplate;
  status: 'sent' | 'failed' | 'pending';
  sentAt: Date;
  messageId?: string;
  error?: string;
}

export default function EmailCommunicationsPage() {
  const [activeTab, setActiveTab] = useState<'compose' | 'templates' | 'logs'>('compose');
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState('');
  const [template, setTemplate] = useState<EmailTemplate | ''>('');
  const [customHtml, setCustomHtml] = useState('');
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([
    // Mock data for demonstration
    {
      id: '1',
      to: ['patient1@example.com'],
      subject: 'Appointment Reminder - Tomorrow at 2:00 PM',
      template: EmailTemplate.APPOINTMENT_REMINDER,
      status: 'sent',
      sentAt: new Date('2024-11-23T10:30:00'),
      messageId: 'msg-123',
    },
    {
      id: '2',
      to: ['patient2@example.com'],
      subject: 'Welcome to Lifefile Health!',
      template: EmailTemplate.WELCOME,
      status: 'sent',
      sentAt: new Date('2024-11-23T09:15:00'),
      messageId: 'msg-124',
    },
    {
      id: '3',
      to: ['patient3@example.com'],
      subject: 'Order Confirmed - #ORD-12345',
      template: EmailTemplate.ORDER_CONFIRMATION,
      status: 'FAILED' as any,
      sentAt: new Date('2024-11-22T16:45:00'),
      error: 'Invalid email address',
    },
  ]);

  // Template presets
  const templatePresets: Partial<
    Record<
      EmailTemplate,
      {
        icon: React.ElementType;
        color: string;
        description: string;
        sampleData: Record<string, unknown>;
      }
    >
  > = {
    [EmailTemplate.WELCOME]: {
      icon: User,
      color: 'text-blue-600',
      description: 'Send welcome email to new patients',
      sampleData: { firstName: 'John' },
    },
    [EmailTemplate.APPOINTMENT_REMINDER]: {
      icon: Calendar,
      color: 'text-green-600',
      description: 'Remind patients about upcoming appointments',
      sampleData: {
        patientName: 'John Doe',
        appointmentDate: 'December 25, 2024',
        appointmentTime: '2:00 PM',
        providerName: 'Dr. Smith',
        location: '123 Medical Center',
      },
    },
    [EmailTemplate.ORDER_CONFIRMATION]: {
      icon: Package,
      color: 'text-[var(--brand-primary)]',
      description: 'Confirm prescription orders',
      sampleData: {
        customerName: 'John Doe',
        orderId: 'ORD-12345',
        totalAmount: '99.99',
        shippingAddress: '123 Main St',
      },
    },
    [EmailTemplate.PASSWORD_RESET]: {
      icon: AlertCircle,
      color: 'text-red-600',
      description: 'Send password reset instructions',
      sampleData: {
        firstName: 'John',
        resetLink: 'https://example.com/reset',
      },
    },
    [EmailTemplate.PAYMENT_RECEIVED]: {
      icon: CreditCard,
      color: 'text-emerald-600',
      description: 'Confirm payment received',
      sampleData: {
        amount: '99.99',
        invoiceNumber: 'INV-12345',
      },
    },
    // Add other templates as needed
  } as const;

  // Send email
  const sendEmail = async () => {
    if (!recipients || (!template && !subject)) {
      alert('Please provide recipients and either select a template or provide a subject');
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const recipientList = recipients
        .split(',')
        .map((email: any) => email.trim())
        .filter(Boolean);

      const response = await apiFetch('/api/v2/aws/ses/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientList.length === 1 ? recipientList[0] : recipientList,
          subject: !template ? subject : undefined,
          template: template || undefined,
          templateData:
            template && templatePresets[template as EmailTemplate]
              ? templatePresets[template as EmailTemplate]?.sampleData
              : undefined,
          html: !template ? customHtml : undefined,
          text: !template ? customText : undefined,
        }),
      });

      const result = await response.json();
      setSendResult(result);

      if (response.ok) {
        // Add to logs
        const newLog: EmailLog = {
          id: Date.now().toString(),
          to: recipientList,
          subject: subject || `${template} Email`,
          template: (template as EmailTemplate) || undefined,
          status: 'sent',
          sentAt: new Date(),
          messageId: result.messageId,
        };
        setEmailLogs([newLog, ...emailLogs]);

        // Clear form
        setRecipients('');
        setSubject('');
        setTemplate('');
        setCustomHtml('');
        setCustomText('');
      }
    } catch (error: any) {
      // @ts-ignore

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSendResult({ error: errorMessage });
    } finally {
      setSending(false);
    }
  };

  // Preview template
  const previewTemplate = async () => {
    if (!template) return;

    try {
      const response = await apiFetch('/api/v2/aws/ses/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          data: templatePresets[template as EmailTemplate]?.sampleData || {},
        }),
      });

      if (response.ok) {
        const preview = await response.json();
        setCustomHtml(preview.html);
        setCustomText(preview.text);
        setSubject(preview.subject);
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Preview error:', error);
    }
  };

  return (
    <Feature feature="AWS_SES_EMAIL">
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Mail className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Email Communications</h1>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-gray-400" />
                <span className="text-gray-600">Auto-save enabled</span>
              </div>
            </div>
            <p className="mt-2 text-gray-600">
              Send transactional emails and manage communication templates
            </p>

            {/* Marketing Architecture Notice */}
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 text-blue-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-sm">
                  <p className="font-medium text-blue-900">
                    Marketing Campaigns Handled Externally
                  </p>
                  <p className="mt-1 text-blue-700">
                    This system handles transactional emails only (orders, appointments, passwords).
                    For marketing campaigns, we recommend using SendGrid, Klaviyo, or similar
                    platforms for better deliverability, analytics, and compliance management.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6" aria-label="Tabs">
                {(['compose', 'templates', 'logs'] as const).map((tab: any) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`border-b-2 px-1 py-4 text-sm font-medium capitalize ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    } `}
                  >
                    {tab === 'compose' && <Send className="mr-2 inline h-4 w-4" />}
                    {tab === 'templates' && <FileText className="mr-2 inline h-4 w-4" />}
                    {tab === 'logs' && <Clock className="mr-2 inline h-4 w-4" />}
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            {/* Compose Tab */}
            {activeTab === 'compose' && (
              <div className="p-6">
                <div className="space-y-6">
                  {/* Recipients */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Recipients
                    </label>
                    <input
                      type="text"
                      value={recipients}
                      onChange={(e: any) => setRecipients(e.target.value)}
                      placeholder="email@example.com, another@example.com"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Separate multiple emails with commas
                    </p>
                  </div>

                  {/* Template Selection */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Email Template (Optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={template}
                        onChange={(e: any) => setTemplate(e.target.value as EmailTemplate | '')}
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Custom Email</option>
                        {Object.values(EmailTemplate).map((tmpl: any) => (
                          <option key={tmpl} value={tmpl}>
                            {tmpl
                              .replace(/_/g, ' ')
                              .toLowerCase()
                              .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </option>
                        ))}
                      </select>
                      {template && (
                        <button
                          onClick={previewTemplate}
                          className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    {template && templatePresets[template as EmailTemplate] && (
                      <p className="mt-2 text-sm text-gray-600">
                        {templatePresets[template as EmailTemplate]?.description}
                      </p>
                    )}
                  </div>

                  {/* Subject (for custom emails) */}
                  {!template && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e: any) => setSubject(e.target.value)}
                        placeholder="Enter email subject"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* HTML Content (for custom emails) */}
                  {!template && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        HTML Content
                      </label>
                      <textarea
                        value={customHtml}
                        onChange={(e: any) => setCustomHtml(e.target.value)}
                        placeholder="<h1>Hello</h1><p>Your HTML content here...</p>"
                        rows={6}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Text Content (for custom emails) */}
                  {!template && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Text Content
                      </label>
                      <textarea
                        value={customText}
                        onChange={(e: any) => setCustomText(e.target.value)}
                        placeholder="Plain text version of your email..."
                        rows={4}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Send Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      {sendResult && (
                        <div
                          className={`flex items-center space-x-2 ${
                            sendResult.error ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {sendResult.error ? (
                            <XCircle className="h-5 w-5" />
                          ) : (
                            <CheckCircle className="h-5 w-5" />
                          )}
                          <span className="text-sm">
                            {sendResult.error || sendResult.message || 'Email sent successfully!'}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={sendEmail}
                      disabled={sending || !recipients}
                      className="flex items-center space-x-2 rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          <span>Send Email</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Object.entries(templatePresets).map(([key, preset]) => {
                    const Icon = preset.icon;
                    return (
                      <div
                        key={key}
                        className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-lg"
                        onClick={() => {
                          setTemplate(key as EmailTemplate);
                          setActiveTab('compose');
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <Icon className={`h-6 w-6 ${preset.color}`} />
                          <span className="text-xs text-gray-500">Click to use</span>
                        </div>
                        <h3 className="mb-1 font-medium text-gray-900">
                          {key
                            .replace(/_/g, ' ')
                            .toLowerCase()
                            .replace(/\b\w/g, (l) => l.toUpperCase())}
                        </h3>
                        <p className="text-sm text-gray-600">{preset.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search emails..."
                        className="rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button className="flex items-center space-x-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50">
                      <Filter className="h-4 w-4" />
                      <span>Filter</span>
                    </button>
                  </div>
                  <span className="text-sm text-gray-500">{emailLogs.length} emails sent</span>
                </div>

                <div className="space-y-3">
                  {emailLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className={`rounded-lg border p-4 ${
                        log.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            {log.status === 'sent' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : log.status === 'failed' ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-yellow-500" />
                            )}
                            <span className="font-medium text-gray-900">{log.subject}</span>
                            {log.template && (
                              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                {log.template}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">To: {log.to.join(', ')}</div>
                          {log.error && (
                            <div className="mt-1 text-sm text-red-600">Error: {log.error}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {new Date(log.sentAt).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(log.sentAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Emails Sent</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {emailLogs.filter((l: any) => l.status === 'sent').length}
                  </p>
                </div>
                <Send className="h-8 w-8 text-green-500" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Failed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {emailLogs.filter((l: any) => l.status === 'failed').length}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Templates</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Object.keys(templatePresets).length}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Send Rate</p>
                  <p className="text-lg font-bold text-gray-900">14/sec</p>
                </div>
                <Clock className="h-8 w-8 text-[var(--brand-primary)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}
