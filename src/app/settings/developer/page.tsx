'use client';

import React, { useState } from 'react';

interface ApiKey {
  id: number;
  name: string;
  key: string;
  permissions: string[];
  createdAt: string;
  lastUsed: string;
  usageCount: number;
}

interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive';
  lastTriggered: string;
}

export default function DeveloperToolsPage() {
  const [activeTab, setActiveTab] = useState<'api-keys' | 'webhooks'>('api-keys');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [apiKeys] = useState<ApiKey[]>([
    {
      id: 1,
      name: 'Production API Key',
      key: 'sk_live_••••••••••••••••',
      permissions: ['patient:read', 'order:create'],
      createdAt: '2024-01-01',
      lastUsed: '2024-11-26',
      usageCount: 15234,
    },
    {
      id: 2,
      name: 'Development API Key',
      key: 'sk_test_••••••••••••••••',
      permissions: ['*'],
      createdAt: '2024-06-01',
      lastUsed: '2024-11-25',
      usageCount: 542,
    },
  ]);

  const [webhooks] = useState<Webhook[]>([
    {
      id: 1,
      name: 'Order Updates',
      url: 'https://api.example.com/webhooks/orders',
      events: ['order.created', 'order.updated', 'order.shipped'],
      status: 'active',
      lastTriggered: '2024-11-25',
    },
    {
      id: 2,
      name: 'Patient Notifications',
      url: 'https://api.example.com/webhooks/patients',
      events: ['patient.created', 'patient.updated'],
      status: 'active',
      lastTriggered: '2024-11-24',
    },
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Developer Tools</h1>
        <p className="text-gray-600 mt-2">Manage API keys and webhooks</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'api-keys'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'webhooks'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Webhooks
          </button>
        </nav>
      </div>

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">API Keys</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate New Key
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    API Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Permissions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {apiKeys.map((key: any) => (
                  <tr key={key.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{key.name}</div>
                      <div className="text-sm text-gray-500">Created {key.createdAt}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">{key.key}</code>
                      <button className="ml-2 text-gray-400 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {key.permissions.map((perm, idx) => (
                          <span key={idx} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {key.usageCount.toLocaleString()} calls
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {key.lastUsed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-indigo-600 hover:text-indigo-900 mr-3">
                        Regenerate
                      </button>
                      <button className="text-red-600 hover:text-red-900">
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Webhook Endpoints</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Endpoint
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {webhooks.map((webhook: any) => (
              <div key={webhook.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{webhook.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{webhook.url}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {webhook.events.map((event, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {event}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-gray-500 mt-3">
                      Last triggered: {webhook.lastTriggered}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full inline-flex items-center ${
                      webhook.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {webhook.status === 'active' ? (
                        <>
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Active
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                          </svg>
                          Inactive
                        </>
                      )}
                    </span>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Modal (placeholder) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                {activeTab === 'api-keys' ? 'Generate New API Key' : 'Add Webhook Endpoint'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure your new {activeTab === 'api-keys' ? 'API key' : 'webhook endpoint'}.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
