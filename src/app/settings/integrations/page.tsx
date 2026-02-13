'use client';

import React, { useState } from 'react';

// SVG Icon Components
const LifefileIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
    />
  </svg>
);

const StripeIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>
);

const AIIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const PhoneIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

const EmailIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactElement;
  status: 'connected' | 'not_configured' | 'error';
  configFields?: Array<{
    key: string;
    label: string;
    type: string;
    value?: string;
  }>;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'lifefile',
      name: 'Lifefile Pharmacy',
      description: 'Connect to Lifefile pharmacy for prescription fulfillment',
      icon: <LifefileIcon />,
      status: 'connected',
      configFields: [
        {
          key: 'base_url',
          label: 'API Base URL',
          type: 'text',
          value: 'https://portal.lifefilehealth.com',
        },
        { key: 'username', label: 'Username', type: 'text', value: '••••••••' },
        { key: 'password', label: 'Password', type: 'password', value: '••••••••' },
      ],
    },
    {
      id: 'stripe',
      name: 'Stripe Payments',
      description: 'Process payments and manage subscriptions',
      icon: <StripeIcon />,
      status: 'not_configured',
      configFields: [
        { key: 'publishable_key', label: 'Publishable Key', type: 'text' },
        { key: 'secret_key', label: 'Secret Key', type: 'password' },
        { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'AI-powered features and SOAP note generation',
      icon: <AIIcon />,
      status: 'connected',
      configFields: [
        { key: 'api_key', label: 'API Key', type: 'password', value: '••••••••' },
        { key: 'model', label: 'Model', type: 'select', value: 'gpt-4' },
      ],
    },
    {
      id: 'twilio',
      name: 'Twilio Communications',
      description: 'SMS notifications and voice calls',
      icon: <PhoneIcon />,
      status: 'not_configured',
      configFields: [
        { key: 'account_sid', label: 'Account SID', type: 'text' },
        { key: 'auth_token', label: 'Auth Token', type: 'password' },
        { key: 'phone_number', label: 'Phone Number', type: 'text' },
      ],
    },
    {
      id: 'sendgrid',
      name: 'SendGrid Email',
      description: 'Transactional email delivery',
      icon: <EmailIcon />,
      status: 'not_configured',
      configFields: [
        { key: 'api_key', label: 'API Key', type: 'password' },
        { key: 'from_email', label: 'From Email', type: 'email' },
      ],
    },
  ]);

  const [editingIntegration, setEditingIntegration] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <svg className="mr-1 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'error':
        return (
          <svg className="mr-1 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg className="mr-1 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  const handleTest = async (integrationId: string) => {
    // In production, this would test the integration
    alert(`Testing ${integrationId} integration...`);
  };

  const handleSave = async (integrationId: string) => {
    // In production, this would save the configuration
    setIntegrations(
      integrations.map((int: any) =>
        int.id === integrationId ? { ...int, status: 'connected' as const } : int
      )
    );
    setEditingIntegration(null);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-2 text-gray-600">Connect and configure external services</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {integrations.map((integration: any) => (
          <div key={integration.id} className="rounded-lg bg-white shadow">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <div className="mr-4 text-gray-700">{integration.icon}</div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{integration.name}</h3>
                    <p className="mt-1 text-gray-600">{integration.description}</p>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(integration.status)}`}
                      >
                        {getStatusIcon(integration.status)}
                        {integration.status === 'connected'
                          ? 'Connected'
                          : integration.status === 'error'
                            ? 'Error'
                            : 'Not Configured'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {integration.status === 'connected' && (
                    <button
                      onClick={() => handleTest(integration.id)}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
                    >
                      Test Connection
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setEditingIntegration(
                        editingIntegration === integration.id ? null : integration.id
                      )
                    }
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700"
                  >
                    {editingIntegration === integration.id ? 'Cancel' : 'Configure'}
                  </button>
                </div>
              </div>

              {/* Configuration Form */}
              {editingIntegration === integration.id && (
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {integration.configFields?.map((field: any) => (
                      <div key={field.key}>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          {field.label}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                            defaultValue={field.value}
                          >
                            <option value="gpt-4">GPT-4</option>
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                            placeholder={
                              field.value ? '••••••••' : `Enter ${field.label.toLowerCase()}`
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => setEditingIntegration(null)}
                      className="rounded-lg bg-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSave(integration.id)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
