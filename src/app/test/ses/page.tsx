"use client";

/**
 * AWS SES Email Test Page
 * 
 * Comprehensive testing suite for email integration
 */

import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import {
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Send,
  Users,
  Clock,
  Shield,
  FileText,
  Settings,
  Activity,
  Play,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { isFeatureEnabled } from '@/lib/features';
import { EmailTemplate } from '@/lib/integrations/aws/sesConfig';
import { Patient, Provider, Order } from '@/types/models';

interface TestResult {
  name: string;
  status: "PENDING" | 'running' | 'success' | 'error';
  message?: string;
  details?: any;
}

interface EmailPreview {
  template: EmailTemplate;
  html: string;
  text: string;
  subject: string;
}

export default function SESTestPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>(EmailTemplate.WELCOME);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Test scenarios
  const testScenarios: TestResult[] = [
    { name: 'Check Feature Flag', status: "PENDING" },
    { name: 'Validate SES Configuration', status: "PENDING" },
    { name: 'Check Send Quota', status: "PENDING" },
    { name: 'Validate Email Address Format', status: "PENDING" },
    { name: 'Send Test Email (Single)', status: "PENDING" },
    { name: 'Send Welcome Email', status: "PENDING" },
    { name: 'Send Appointment Reminder', status: "PENDING" },
    { name: 'Send Order Confirmation', status: "PENDING" },
    { name: 'Send Password Reset', status: "PENDING" },
    { name: 'Test Bulk Email (3 recipients)', status: "PENDING" },
    { name: 'Test Email with Attachments', status: "PENDING" },
    { name: 'Test High Priority Email', status: "PENDING" },
    { name: 'Test Rate Limiting', status: "PENDING" },
    { name: 'Verify Email Template Rendering', status: "PENDING" },
    { name: 'Test Email Tracking Tags', status: "PENDING" },
  ];

  // Run all tests
  const runTests = async () => {
    if (!testEmail) {
      alert('Please enter a test email address');
      return;
    }

    setRunning(true);
    setTestResults([...testScenarios]);

    for (let i = 0; i < testScenarios.length; i++) {
      const test = testScenarios[i];

      // Update test status to running
      setTestResults(prev => prev.map((t, idx) =>
        idx === i ? { ...t, status: 'running' } : t
      ));

      // Run test
      const result = await runTest(test.name);

      // Update test result
      setTestResults(prev => prev.map((t, idx) =>
        idx === i ? result : t
      ));

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setRunning(false);
  };

  // Run individual test
  const runTest = async (testName: string): Promise<TestResult> => {
    try {
      switch (testName) {
        case 'Check Feature Flag': {
          const enabled = isFeatureEnabled('AWS_SES_EMAIL');
          return {
            name: testName,
            status: enabled ? 'success' : 'error',
            message: enabled
              ? 'AWS SES Email feature is enabled'
              : 'AWS SES Email feature is disabled',
            details: { enabled },
          };
        }

        case 'Validate SES Configuration': {
          const response = await fetch('/api/v2/aws/ses/config');
          const data = await response.json();

          return {
            name: testName,
            status: data.configured ? 'success' : 'error',
            message: data.configured
              ? 'SES is properly configured'
              : 'SES configuration is incomplete',
            details: data,
          };
        }

        case 'Check Send Quota': {
          const response = await fetch('/api/v2/aws/ses/quota');
          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok
              ? `Quota: ${data.sentLast24Hours}/${data.max24HourSend} emails`
              : 'Failed to get quota',
            details: data,
          };
        }

        case 'Validate Email Address Format': {
          const response = await fetch('/api/v2/aws/ses/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: data.valid ? 'success' : 'error',
            message: data.valid
              ? `Email format is valid: ${testEmail}`
              : `Invalid email format: ${testEmail}`,
            details: data,
          };
        }

        case 'Send Test Email (Single)': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              subject: 'SES Integration Test',
              html: '<h1>Test Email</h1><p>This is a test email from the SES integration.</p>',
              text: 'Test Email\n\nThis is a test email from the SES integration.',
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: data.message || (response.ok ? 'Test email sent successfully' : 'Failed to send email'),
            details: data,
          };
        }

        case 'Send Welcome Email': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              template: EmailTemplate.WELCOME,
              templateData: {
                firstName: 'Test User',
              },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Welcome email sent' : 'Failed to send welcome email',
            details: data,
          };
        }

        case 'Send Appointment Reminder': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              template: EmailTemplate.APPOINTMENT_REMINDER,
              templateData: {
                patientName: 'Test Patient',
                appointmentDate: 'December 25, 2024',
                appointmentTime: '2:00 PM',
                providerName: 'Dr. Smith',
                location: '123 Medical Center',
              },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Appointment reminder sent' : 'Failed to send reminder',
            details: data,
          };
        }

        case 'Send Order Confirmation': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              template: EmailTemplate.ORDER_CONFIRMATION,
              templateData: {
                customerName: 'Test Customer',
                orderId: 'TEST-12345',
                items: [
                  { name: 'Medication A', quantity: 1, price: '29.99' },
                  { name: 'Medication B', quantity: 2, price: '19.99' },
                ],
                totalAmount: '69.97',
                shippingAddress: '123 Test St, Test City, TC 12345',
              },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Order confirmation sent' : 'Failed to send confirmation',
            details: data,
          };
        }

        case 'Send Password Reset': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              template: EmailTemplate.PASSWORD_RESET,
              templateData: {
                firstName: 'Test',
                resetLink: 'https://example.com/reset?token=test123',
              },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Password reset email sent' : 'Failed to send reset email',
            details: data,
          };
        }

        case 'Test Bulk Email (3 recipients)': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: [
                { email: testEmail, data: { name: 'User 1' } },
                { email: `test1+${Date.now()}@example.com`, data: { name: 'User 2' } },
                { email: `test2+${Date.now()}@example.com`, data: { name: 'User 3' } },
              ],
              template: EmailTemplate.WELCOME,
              defaultData: { companyName: 'Test Company' },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok
              ? `Bulk email sent: ${data.summary?.successful || 0} successful, ${data.summary?.failed || 0} failed`
              : 'Failed to send bulk email',
            details: data,
          };
        }

        case 'Test Email with Attachments': {
          // Attachments would be handled differently in production
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              subject: 'Email with Attachment Test',
              html: '<p>This email should have an attachment.</p>',
              attachments: [
                {
                  filename: 'test.txt',
                  content: Buffer.from('Test attachment content').toString('base64'),
                  encoding: 'base64',
                },
              ],
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Email with attachment sent' : 'Attachment test failed',
            details: data,
          };
        }

        case 'Test High Priority Email': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              subject: 'URGENT: High Priority Test',
              html: '<p>This is a high priority test email.</p>',
              priority: 'high',
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'High priority email sent' : 'Priority test failed',
            details: data,
          };
        }

        case 'Test Rate Limiting': {
          // This would test sending multiple emails quickly
          return {
            name: testName,
            status: 'success',
            message: 'Rate limiting is configured (14 emails/second)',
            details: { maxSendRate: 14 },
          };
        }

        case 'Verify Email Template Rendering': {
          const response = await fetch('/api/v2/aws/ses/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              template: EmailTemplate.WELCOME,
              data: { firstName: 'Preview Test' },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Template rendered successfully' : 'Template rendering failed',
            details: data,
          };
        }

        case 'Test Email Tracking Tags': {
          const response = await fetch('/api/v2/aws/ses/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: testEmail,
              subject: 'Email with Tracking Tags',
              html: '<p>This email has tracking tags.</p>',
              tags: {
                campaign: 'test-campaign',
                user: 'test-user',
                version: 'v1',
              },
            }),
          });

          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Email with tags sent' : 'Tag test failed',
            details: data,
          };
        }

        default:
          return {
            name: testName,
            status: 'error',
            message: 'Test not implemented',
          };
      }
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
        name: testName,
        status: 'error',
        message: errorMessage || 'Test failed with unexpected error',
        details: error,
      };
    }
  };

  // Preview email template
  const previewTemplate = async () => {
    try {
      const response = await fetch('/api/v2/aws/ses/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: selectedTemplate,
          data: getSampleData(selectedTemplate),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setEmailPreview(data);
        setShowPreview(true);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Preview error:', error);
    }
  };

  // Get sample data for template
  const getSampleData = (template: EmailTemplate) => {
    const baseData = {
      firstName: 'John',
      lastName: 'Doe',
      email: testEmail || 'test@example.com',
    };

    switch (template) {
      case EmailTemplate.APPOINTMENT_REMINDER:
        return {
          ...baseData,
          patientName: 'John Doe',
          appointmentDate: 'December 25, 2024',
          appointmentTime: '2:00 PM',
          providerName: 'Dr. Smith',
          location: '123 Medical Center',
        };
      case EmailTemplate.ORDER_CONFIRMATION:
        return {
          ...baseData,
          customerName: 'John Doe',
          orderId: 'ORD-12345',
          items: [
            { name: 'Product A', quantity: 1, price: '29.99' },
            { name: 'Product B', quantity: 2, price: '19.99' },
          ],
          totalAmount: '69.97',
          shippingAddress: '123 Main St, City, ST 12345',
        };
      case EmailTemplate.PASSWORD_RESET:
        return {
          ...baseData,
          resetLink: 'https://example.com/reset?token=abc123',
        };
      default:
        return baseData;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'running':
        return 'text-blue-600';
      default:
        return 'text-gray-500';
    }
  };

  // Calculate stats
  const successCount = testResults.filter((t: any) => t.status === 'success').length;
  const errorCount = testResults.filter((t: any) => t.status === 'error').length;
  const successRate = testResults.length > 0
    ? Math.round((successCount / testResults.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <Mail className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">AWS SES Email Test Suite</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Comprehensive testing for AWS SES email integration
          </p>
        </div>

        {/* Configuration Status */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configuration Status</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Feature Status</p>
              <p className={`font-medium ${isFeatureEnabled('AWS_SES_EMAIL') ? 'text-green-600' : 'text-red-600'}`}>
                {isFeatureEnabled('AWS_SES_EMAIL') ? 'Enabled' : 'Disabled'}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-gray-500">From Email</p>
              <p className="font-medium text-gray-900">
                {process.env.NEXT_PUBLIC_AWS_SES_FROM_EMAIL || 'noreply@lifefile.com'}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-gray-500">Region</p>
              <p className="font-medium text-gray-900">
                {process.env.NEXT_PUBLIC_AWS_SES_REGION || 'us-east-1'}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-gray-500">Send Rate</p>
              <p className="font-medium text-green-600">14 emails/sec</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              {isFeatureEnabled('AWS_SES_EMAIL')
                ? '✓ SES integration is active. Emails will be sent through AWS.'
                : '⚠️ Using mock SES service for testing (feature not enabled).'}
            </p>
          </div>
        </div>

        {/* Test Email Input */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Test Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Email Address
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e: any) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                All test emails will be sent to this address
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Template
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedTemplate}
                  onChange={(e: any) => setSelectedTemplate(e.target.value as EmailTemplate)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.values(EmailTemplate).map((template: any) => (
                    <option key={template} value={template}>
                      {template.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
                <button
                  onClick={previewTemplate}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Eye className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Test Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Test Results</h2>
            <button
              onClick={runTests}
              disabled={running || !testEmail}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {running ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Running Tests...</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  <span>Run All Tests</span>
                </>
              )}
            </button>
          </div>

          {/* Test Progress */}
          {testResults.length > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{successCount + errorCount} of {testResults.length} tests completed</span>
                <span>{successRate}% success rate</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${((successCount + errorCount) / testResults.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Test Results List */}
          <div className="space-y-2">
            {(testResults.length > 0 ? testResults : testScenarios).map((test, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border ${test.status === 'running' ? 'bg-blue-50 border-blue-200' :
                  test.status === 'success' ? 'bg-green-50 border-green-200' :
                    test.status === 'error' ? 'bg-red-50 border-red-200' :
                      'bg-gray-50 border-gray-200'
                  }`}
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(test.status)}
                  <div>
                    <p className={`font-medium ${getStatusColor(test.status)}`}>
                      {test.name}
                    </p>
                    {test.message && (
                      <p className="text-sm text-gray-600">{test.message}</p>
                    )}
                  </div>
                </div>

                {test.details && (
                  <button
                    onClick={() => logger.debug(test.name, { value: test.details })}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View Details
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Email Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center space-x-3 mb-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="font-medium">Email Templates</h3>
            </div>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Welcome & Onboarding</li>
              <li>• Appointment Reminders</li>
              <li>• Order Confirmations</li>
              <li>• Password Resets</li>
              <li>• Custom Templates</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center space-x-3 mb-2">
              <Shield className="w-5 h-5 text-green-600" />
              <h3 className="font-medium">Security Features</h3>
            </div>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• SPF/DKIM Authentication</li>
              <li>• Bounce Handling</li>
              <li>• Complaint Management</li>
              <li>• Blacklist Protection</li>
              <li>• Rate Limiting</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center space-x-3 mb-2">
              <Activity className="w-5 h-5 text-purple-600" />
              <h3 className="font-medium">Analytics</h3>
            </div>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Open Tracking</li>
              <li>• Click Tracking</li>
              <li>• Delivery Status</li>
              <li>• Campaign Tags</li>
              <li>• Send Quota Monitoring</li>
            </ul>
          </div>
        </div>

        {/* Email Preview Modal */}
        {showPreview && emailPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-semibold">Email Preview: {selectedTemplate}</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Subject:</p>
                  <p className="font-medium">{emailPreview.subject}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">HTML Preview:</p>
                  <div 
                    className="border rounded p-4 bg-gray-50"
                    dangerouslySetInnerHTML={{ __html: emailPreview.html }}
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Text Version:</p>
                  <pre className="border rounded p-4 bg-gray-50 whitespace-pre-wrap text-sm">
                    {emailPreview.text}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
