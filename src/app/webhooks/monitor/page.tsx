"use client";

import { useState, useEffect } from "react";
import { WebhookStatus } from "@prisma/client";
import { logger } from '@/lib/logger';

interface WebhookStats {
  total: number;
  successful: number;
  failed: number;
  invalidAuth: number;
  invalidPayload: number;
  successRate: number;
  avgProcessingTimeMs: number;
  recentLogs: Array<{
    id: number;
    endpoint: string;
    status: WebhookStatus;
    statusCode: number;
    errorMessage?: string;
    createdAt: string;
    processingTimeMs?: number;
  }>;
}

export default function WebhookMonitorPage() {
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [testPayload, setTestPayload] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState("heyflow-intake-v2");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");

  const samplePayload = {
    responseId: "test-" + Date.now(),
    submissionId: "test-submission-" + Date.now(),
    flowId: "test-flow",
    data: {
      firstName: "Test",
      lastName: "Patient",
      email: "test@example.com",
      phone: "555-1234",
      dateOfBirth: "1990-01-01",
      gender: "male",
      address: "123 Test St",
      city: "Test City",
      state: "FL",
      zipCode: "12345",
      chiefComplaint: "Testing webhook integration",
      medicalHistory: "No significant medical history",
      medications: "None",
      allergies: "NKDA",
      insurance: "Test Insurance",
      emergencyContact: "Jane Doe - 555-5678"
    },
    answers: [
      { label: "First Name", value: "Test", question: "What is your first name?" },
      { label: "Last Name", value: "Patient", question: "What is your last name?" },
      { label: "Email", value: "test@example.com", question: "What is your email?" },
      { label: "Phone", value: "555-1234", question: "What is your phone number?" },
      { label: "Date of Birth", value: "1990-01-01", question: "What is your date of birth?" }
    ],
    timestamp: new Date().toISOString()
  };

  useEffect(() => {
    setTestPayload(JSON.stringify(samplePayload, null, 2));
    // Set the webhook URL after mount to avoid hydration issues
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/heyflow-intake-v2`);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    if (autoRefresh) {
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [selectedEndpoint, autoRefresh]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/webhooks/${selectedEndpoint}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error("Failed to fetch webhook stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const testWebhook = async () => {
    setTestLoading(true);
    setTestResult(null);

    try {
      const payload = JSON.parse(testPayload);
      
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      
      // Add webhook secret if provided
      if (webhookSecret && webhookSecret.trim()) {
        headers["x-heyflow-secret"] = webhookSecret.trim();
        headers["x-medlink-secret"] = webhookSecret.trim();
        logger.debug("Adding webhook secret to headers");
      }

      const res = await fetch(`/api/webhooks/${selectedEndpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      setTestResult({
        status: res.status,
        statusText: res.statusText,
        data,
        headers: Object.fromEntries(res.headers.entries()),
      });
    } catch (error: any) {
    // @ts-ignore
   
      setTestResult({
        error: String(error),
        message: "Failed to send test webhook",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const getStatusColor = (status: WebhookStatus) => {
    switch (status) {
      case WebhookStatus.SUCCESS:
        return "text-green-600";
      case WebhookStatus.INVALID_AUTH:
        return "text-yellow-600";
      case WebhookStatus.INVALID_PAYLOAD:
        return "text-orange-600";
      case WebhookStatus.ERROR:
      case WebhookStatus.PROCESSING_ERROR:
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusBadgeColor = (status: WebhookStatus) => {
    switch (status) {
      case WebhookStatus.SUCCESS:
        return "bg-green-100 text-green-800";
      case WebhookStatus.INVALID_AUTH:
        return "bg-yellow-100 text-yellow-800";
      case WebhookStatus.INVALID_PAYLOAD:
        return "bg-orange-100 text-orange-800";
      case WebhookStatus.ERROR:
      case WebhookStatus.PROCESSING_ERROR:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Webhook Monitor</h1>
          <div className="flex items-center gap-4">
            <select
              value={selectedEndpoint}
              onChange={(e: any) => setSelectedEndpoint(e.target.value)}
              className="border rounded px-3 py-1"
            >
              <option value="heyflow-intake-v2">Heyflow Intake V2</option>
              <option value="heyflow-intake">Heyflow Intake (Legacy)</option>
              <option value="medlink-intake">MedLink Intake</option>
              <option value="heyflow-test">Heyflow Test</option>
              <option value="heyflow-debug">Heyflow Debug</option>
            </select>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e: any) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchStats}
              className="btn-secondary"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading stats...</p>
        ) : stats ? (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-semibold">{stats.total}</p>
              </div>
              <div className="bg-green-50 p-4 rounded">
                <p className="text-sm text-gray-600">Successful</p>
                <p className="text-2xl font-semibold text-green-600">{stats.successful}</p>
              </div>
              <div className="bg-red-50 p-4 rounded">
                <p className="text-sm text-gray-600">Failed</p>
                <p className="text-2xl font-semibold text-red-600">{stats.failed}</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded">
                <p className="text-sm text-gray-600">Auth Errors</p>
                <p className="text-2xl font-semibold text-yellow-600">{stats.invalidAuth}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded">
                <p className="text-sm text-gray-600">Payload Errors</p>
                <p className="text-2xl font-semibold text-orange-600">{stats.invalidPayload}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded">
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-semibold text-blue-600">{stats.successRate.toFixed(1)}%</p>
              </div>
              <div className="bg-purple-50 p-4 rounded">
                <p className="text-sm text-gray-600">Avg Time</p>
                <p className="text-2xl font-semibold text-purple-600">{stats.avgProcessingTimeMs.toFixed(0)}ms</p>
              </div>
            </div>

            {/* Recent Logs */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent Webhook Attempts</h2>
              <div className="overflow-x-auto">
                <table className="w-full border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-4 py-2 text-left">Time</th>
                      <th className="border px-4 py-2 text-left">Endpoint</th>
                      <th className="border px-4 py-2 text-left">Status</th>
                      <th className="border px-4 py-2 text-left">Code</th>
                      <th className="border px-4 py-2 text-left">Processing Time</th>
                      <th className="border px-4 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="border px-4 py-2 text-sm">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="border px-4 py-2 text-sm font-mono">
                          {log.endpoint}
                        </td>
                        <td className="border px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="border px-4 py-2 text-sm">
                          {log.statusCode}
                        </td>
                        <td className="border px-4 py-2 text-sm">
                          {log.processingTimeMs ? `${log.processingTimeMs}ms` : "—"}
                        </td>
                        <td className="border px-4 py-2 text-sm text-red-600">
                          {log.errorMessage || "—"}
                        </td>
                      </tr>
                    ))}
                    {stats.recentLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="border px-4 py-8 text-center text-gray-500">
                          No webhook attempts in the last 7 days
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <p>No stats available</p>
        )}
      </div>

      {/* Test Webhook Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Test Webhook</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Webhook Secret (optional)
            </label>
            <input
              type="text"
              value={webhookSecret}
              onChange={(e: any) => setWebhookSecret(e.target.value)}
              placeholder="Enter webhook secret if configured"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Payload (JSON)
            </label>
            <textarea
              value={testPayload}
              onChange={(e: any) => setTestPayload(e.target.value)}
              className="w-full h-64 font-mono text-sm border rounded px-3 py-2"
              placeholder="Enter JSON payload"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={testWebhook}
              disabled={testLoading}
              className="btn-primary"
            >
              {testLoading ? "Sending..." : "Send Test Webhook"}
            </button>
            <button
              onClick={() => setTestPayload(JSON.stringify(samplePayload, null, 2))}
              className="btn-secondary"
            >
              Reset to Sample
            </button>
          </div>

          {testResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <h3 className="font-medium mb-2">Test Result:</h3>
              <pre className="text-sm overflow-auto">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3 text-blue-900">Heyflow Webhook Configuration</h2>
        <div className="space-y-2 text-sm text-blue-800">
          <p><strong>Webhook URL:</strong> <code className="bg-white px-2 py-1 rounded">{webhookUrl || 'Loading...'}</code></p>
          <p><strong>Method:</strong> POST</p>
          <p><strong>Content-Type:</strong> application/json</p>
          <p><strong>Authentication Header:</strong> x-heyflow-secret (if configured)</p>
          <div className="mt-4">
            <p className="font-semibold">Troubleshooting:</p>
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
              <li>Check that the webhook secret matches between Heyflow and your environment variables</li>
              <li>Ensure your server is publicly accessible (use ngrok for local testing)</li>
              <li>Verify the payload structure matches the expected format</li>
              <li>Check the Recent Webhook Attempts table above for error details</li>
              <li>Use the test tool above to simulate Heyflow submissions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
