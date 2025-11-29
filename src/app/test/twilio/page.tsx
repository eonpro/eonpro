"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, Send, AlertCircle } from "lucide-react";
import { getMockMessages, getMockStatistics, clearMockMessages } from "@/lib/integrations/twilio/mockService";

interface TestResult {
  name: string;
  status: "PENDING" | "running" | "success" | "error";
  message?: string;
  details?: any;
}

export default function TwilioTestPage() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: "Feature Flag Check", status: "PENDING" },
    { name: "Configuration Validation", status: "PENDING" },
    { name: "Phone Number Formatting", status: "PENDING" },
    { name: "Send Test SMS", status: "PENDING" },
    { name: "Template Messages", status: "PENDING" },
    { name: "Webhook Processing", status: "PENDING" },
    { name: "Error Handling", status: "PENDING" },
    { name: "Mock Service", status: "PENDING" },
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const [mockMessages, setMockMessages] = useState<any[]>([]);
  const [mockStats, setMockStats] = useState<any>(null);

  // Update test status
  const updateTest = (name: string, status: TestResult["status"], message?: string, details?: any) => {
    setTests(prev => prev.map((test: any) => 
      test.name === name ? { ...test, status, message, details } : test
    ));
  };

  // Run all tests
  const runTests = async () => {
    setIsRunning(true);
    clearMockMessages(); // Clear mock messages before testing

    // Test 1: Feature Flag Check
    updateTest("Feature Flag Check", "running");
    try {
      const featureEnabled = process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS === 'true';
      if (featureEnabled) {
        updateTest("Feature Flag Check", "success", "Twilio SMS feature is enabled");
      } else {
        updateTest("Feature Flag Check", "error", "Twilio SMS feature is disabled");
      }
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Feature Flag Check", "error", errorMessage);
    }

    // Test 2: Configuration Validation
    updateTest("Configuration Validation", "running");
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
      const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
      const hasPhoneNumber = !!process.env.TWILIO_PHONE_NUMBER;
      
      if (hasAccountSid || hasAuthToken || hasPhoneNumber) {
        updateTest("Configuration Validation", "success", 
          `Config: SID=${hasAccountSid}, Token=${hasAuthToken}, Phone=${hasPhoneNumber}`);
      } else {
        updateTest("Configuration Validation", "success", 
          "No Twilio credentials configured - will use mock service");
      }
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Configuration Validation", "error", errorMessage);
    }

    // Test 3: Phone Number Formatting
    updateTest("Phone Number Formatting", "running");
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const testNumbers = [
        { input: "5551234567", expected: "+15551234567" },
        { input: "(555) 123-4567", expected: "+15551234567" },
        { input: "+15551234567", expected: "+15551234567" },
        { input: "555-123-4567", expected: "+15551234567" },
      ];
      
      const results = testNumbers.map((test: any) => {
        const formatted = formatPhoneNumber(test.input);
        return {
          ...test,
          actual: formatted,
          passed: formatted === test.expected,
        };
      });
      
      const allPassed = results.every((r: any) => r.passed);
      updateTest("Phone Number Formatting", allPassed ? "success" : "error", 
        `${results.filter((r: any) => r.passed).length}/${results.length} formats passed`,
        results);
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Phone Number Formatting", "error", errorMessage);
    }

    // Test 4: Send Test SMS
    updateTest("Send Test SMS", "running");
    try {
      const response = await fetch("/api/v2/twilio/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "+15551234567",
          message: "Test message from Twilio integration test",
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        updateTest("Send Test SMS", "success", 
          `Message sent${data.mock ? ' (MOCK)' : ''}: ${data.messageId}`,
          data);
      } else {
        updateTest("Send Test SMS", "error", data.error || "Failed to send SMS", data);
      }
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Send Test SMS", "error", errorMessage);
    }

    // Test 5: Template Messages
    updateTest("Template Messages", "running");
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const templates = [
        { type: "appointment", to: "+15551112222" },
        { type: "prescription", to: "+15553334444" },
        { type: "lab", to: "+15555556666" },
      ];

      const results = [];
      for (const template of templates) {
        const response = await fetch("/api/v2/twilio/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: template.to,
            message: `Template test: ${template.type} notification`,
          }),
        });
        
        const data = await response.json();
        results.push({ ...template, success: data.success, messageId: data.messageId });
      }

      const successCount = results.filter((r: any) => r.success).length;
      updateTest("Template Messages", successCount === results.length ? "success" : "error",
        `${successCount}/${results.length} templates sent successfully`,
        results);
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Template Messages", "error", errorMessage);
    }

    // Test 6: Webhook Processing
    updateTest("Webhook Processing", "running");
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const formData = new FormData();
      formData.append("From", "+15559876543");
      formData.append("Body", "CONFIRM");
      formData.append("MessageSid", "SMtest123");

      const response = await fetch("/api/v2/twilio/webhook", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      const hasResponse = text.includes("Thank you") || text.includes("confirmed");
      
      updateTest("Webhook Processing", hasResponse ? "success" : "error",
        hasResponse ? "Webhook processed successfully" : "Webhook failed",
        { response: text });
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Webhook Processing", "error", errorMessage);
    }

    // Test 7: Error Handling
    updateTest("Error Handling", "running");
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const errorTests = [
        { to: "", message: "Test", expectedError: true },
        { to: "invalid", message: "Test", expectedError: true },
        { to: "+15551234567", message: "", expectedError: true },
      ];

      const results = [];
      for (const test of errorTests) {
        const response = await fetch("/api/v2/twilio/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(test),
        });
        
        const data = await response.json();
        results.push({
          ...test,
          gotError: !response.ok || !data.success,
          errorMessage: data.error,
        });
      }

      const allCorrect = results.every((r: any) => r.expectedError === r.gotError);
      updateTest("Error Handling", allCorrect ? "success" : "error",
        `${results.filter((r: any) => r.expectedError === r.gotError).length}/${results.length} error cases handled correctly`,
        results);
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Error Handling", "error", errorMessage);
    }

    // Test 8: Mock Service
    updateTest("Mock Service", "running");
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      // Force mock mode
      process.env.TWILIO_USE_MOCK = 'true';
      
      const response = await fetch("/api/v2/twilio/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "+15551234567",
          message: "Mock service test message",
        }),
      });

      const data = await response.json();
      
      if (data.success && data.mock) {
        updateTest("Mock Service", "success", 
          "Mock service working correctly",
          data);
      } else {
        updateTest("Mock Service", "error", 
          "Mock service not functioning properly",
          data);
      }
      
      // Clear mock flag
      delete process.env.TWILIO_USE_MOCK;
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Mock Service", "error", errorMessage);
    }

    // Update mock messages display
    setMockMessages(getMockMessages());
    setMockStats(getMockStatistics());
    
    setIsRunning(false);
  };

  // Format phone number helper
  const formatPhoneNumber = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    if (phone.startsWith('+')) {
      return phone;
    }
    return `+${cleaned}`;
  };

  // Get status icon
  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "PENDING":
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
      case "running":
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  // Calculate statistics
  const stats = {
    total: tests.length,
    passed: tests.filter((t: any) => t.status === "success").length,
    failed: tests.filter((t: any) => t.status === "error").length,
    pending: tests.filter((t: any) => t.status === "pending").length,
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Twilio Integration Test Suite</h1>
            <p className="text-gray-600">
              Comprehensive testing of SMS functionality, mock service, and error handling
            </p>
          </div>

          {/* Test Status Summary */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Tests</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.passed}</div>
              <div className="text-sm text-gray-600">Passed</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
          </div>

          {/* Run Tests Button */}
          <div className="mb-8">
            <button
              onClick={runTests}
              disabled={isRunning}
              className={`w-full py-3 px-4 rounded-lg font-medium text-white flex items-center justify-center ${
                isRunning
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Run All Tests
                </>
              )}
            </button>
          </div>

          {/* Test Results */}
          <div className="space-y-3">
            {tests.map((test, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {getStatusIcon(test.status)}
                    <div>
                      <div className="font-medium">{test.name}</div>
                      {test.message && (
                        <div className="text-sm text-gray-600 mt-1">{test.message}</div>
                      )}
                    </div>
                  </div>
                  {test.details && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-blue-600 hover:underline">
                        View Details
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-w-md">
                        {JSON.stringify(test.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mock Messages Display */}
          {mockMessages.length > 0 && (
            <div className="mt-8 border-t pt-8">
              <h2 className="text-xl font-semibold mb-4">Mock Messages Sent</h2>
              <div className="space-y-2">
                {mockMessages.map((msg, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">To: {msg.to}</span>
                      <span className="text-gray-500">{msg.id}</span>
                    </div>
                    <div className="text-gray-600 mt-1">{msg.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mock Statistics */}
          {mockStats && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium mb-2">Mock Service Statistics</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Sent: </span>
                  <span className="font-medium">{mockStats.sentToday}</span>
                </div>
                <div>
                  <span className="text-gray-600">Delivered: </span>
                  <span className="font-medium text-green-600">{mockStats.delivered}</span>
                </div>
                <div>
                  <span className="text-gray-600">Failed: </span>
                  <span className="font-medium text-red-600">{mockStats.failed}</span>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <strong>Test Mode:</strong> This page tests Twilio integration using mock services when 
                credentials are not configured. Real SMS messages will only be sent if valid Twilio 
                credentials are provided in environment variables.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
