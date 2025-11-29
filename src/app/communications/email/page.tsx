"use client";

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
  Search,
  Filter,
} from 'lucide-react';
import { Feature } from '@/components/Feature';
import { EmailTemplate } from '@/lib/integrations/aws/sesConfig';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';

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
      status: "FAILED" as any,
      sentAt: new Date('2024-11-22T16:45:00'),
      error: 'Invalid email address',
    },
  ]);

  // Template presets
  const templatePresets: Partial<Record<EmailTemplate, {
    icon: React.ElementType;
    color: string;
    description: string;
    sampleData: Record<string, unknown>;
  }>> = {
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
      color: 'text-purple-600',
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
      const recipientList = recipients.split(',').map((email: any) => email.trim()).filter(Boolean);
      
      const response = await fetch('/api/v2/aws/ses/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientList.length === 1 ? recipientList[0] : recipientList,
          subject: !template ? subject : undefined,
          template: template || undefined,
          templateData: template && templatePresets[template as EmailTemplate]
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
          template: template as EmailTemplate || undefined,
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
      const response = await fetch('/api/v2/aws/ses/preview', {
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Mail className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Email Communications</h1>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-gray-400" />
                <span className="text-gray-600">Auto-save enabled</span>
              </div>
            </div>
            <p className="text-gray-600 mt-2">
              Send transactional emails and manage communication templates
            </p>
            
            {/* Marketing Architecture Notice */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="text-sm">
                  <p className="font-medium text-blue-900">Marketing Campaigns Handled Externally</p>
                  <p className="text-blue-700 mt-1">
                    This system handles transactional emails only (orders, appointments, passwords). 
                    For marketing campaigns, we recommend using SendGrid, Klaviyo, or similar platforms 
                    for better deliverability, analytics, and compliance management.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6" aria-label="Tabs">
                {(['compose', 'templates', 'logs'] as const).map((tab: any) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`
                      py-4 px-1 border-b-2 font-medium text-sm capitalize
                      ${activeTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    {tab === 'compose' && <Send className="inline w-4 h-4 mr-2" />}
                    {tab === 'templates' && <FileText className="inline w-4 h-4 mr-2" />}
                    {tab === 'logs' && <Clock className="inline w-4 h-4 mr-2" />}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Recipients
                    </label>
                    <input
                      type="text"
                      value={recipients}
                      onChange={(e: any) => setRecipients(e.target.value)}
                      placeholder="email@example.com, another@example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Separate multiple emails with commas
                    </p>
                  </div>

                  {/* Template Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Template (Optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={template}
                        onChange={(e: any) => setTemplate(e.target.value as EmailTemplate | '')}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Custom Email</option>
                        {Object.values(EmailTemplate).map((tmpl: any) => (
                          <option key={tmpl} value={tmpl}>
                            {tmpl.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                          </option>
                        ))}
                      </select>
                      {template && (
                        <button
                          onClick={previewTemplate}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    {template && templatePresets[template as EmailTemplate] && (
                      <p className="text-sm text-gray-600 mt-2">
                        {templatePresets[template as EmailTemplate]?.description}
                      </p>
                    )}
                  </div>

                  {/* Subject (for custom emails) */}
                  {!template && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e: any) => setSubject(e.target.value)}
                        placeholder="Enter email subject"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* HTML Content (for custom emails) */}
                  {!template && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        HTML Content
                      </label>
                      <textarea
                        value={customHtml}
                        onChange={(e: any) => setCustomHtml(e.target.value)}
                        placeholder="<h1>Hello</h1><p>Your HTML content here...</p>"
                        rows={6}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      />
                    </div>
                  )}

                  {/* Text Content (for custom emails) */}
                  {!template && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Text Content
                      </label>
                      <textarea
                        value={customText}
                        onChange={(e: any) => setCustomText(e.target.value)}
                        placeholder="Plain text version of your email..."
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Send Button */}
                  <div className="flex justify-between items-center">
                    <div>
                      {sendResult && (
                        <div className={`flex items-center space-x-2 ${
                          sendResult.error ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {sendResult.error ? (
                            <XCircle className="w-5 h-5" />
                          ) : (
                            <CheckCircle className="w-5 h-5" />
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
                      className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(templatePresets).map(([key, preset]) => {
                    const Icon = preset.icon;
                    return (
                      <div
                        key={key}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => {
                          setTemplate(key as EmailTemplate);
                          setActiveTab('compose');
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-6 h-6 ${preset.color}`} />
                          <span className="text-xs text-gray-500">Click to use</span>
                        </div>
                        <h3 className="font-medium text-gray-900 mb-1">
                          {key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {preset.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="p-6">
                <div className="mb-4 flex justify-between items-center">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Search emails..."
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      <Filter className="w-4 h-4" />
                      <span>Filter</span>
                    </button>
                  </div>
                  <span className="text-sm text-gray-500">
                    {emailLogs.length} emails sent
                  </span>
                </div>

                <div className="space-y-3">
                  {emailLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className={`border rounded-lg p-4 ${
                        log.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            {log.status === 'sent' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : log.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-500" />
                            )}
                            <span className="font-medium text-gray-900">
                              {log.subject}
                            </span>
                            {log.template && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                {log.template}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            To: {log.to.join(', ')}
                          </div>
                          {log.error && (
                            <div className="mt-1 text-sm text-red-600">
                              Error: {log.error}
                            </div>
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
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Emails Sent</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {emailLogs.filter((l: any) => l.status === 'sent').length}
                  </p>
                </div>
                <Send className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Failed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {emailLogs.filter((l: any) => l.status === 'failed').length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Templates</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Object.keys(templatePresets).length}
                  </p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Send Rate</p>
                  <p className="text-lg font-bold text-gray-900">14/sec</p>
                </div>
                <Clock className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}
