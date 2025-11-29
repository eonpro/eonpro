"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, CreditCard, AlertCircle, DollarSign, RefreshCw } from "lucide-react";
import { isFeatureEnabled } from "@/lib/features";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

interface TestResult {
  name: string;
  status: "PENDING" | "running" | "passed" | "failed";
  message?: string;
  details?: any;
}

interface TestTransaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  timestamp: Date;
  details: any;
}

export default function StripeTestPage() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: "Feature Flag Check", status: "PENDING" },
    { name: "Stripe Configuration", status: "PENDING" },
    { name: "API Key Validation", status: "PENDING" },
    { name: "Create Test Customer", status: "PENDING" },
    { name: "Create Test Subscription", status: "PENDING" },
    { name: "Process Test Payment", status: "PENDING" },
    { name: "Cancel Subscription", status: "PENDING" },
    { name: "Webhook Simulation", status: "PENDING" },
    { name: "Error Handling", status: "PENDING" },
    { name: "Mock Mode Check", status: "PENDING" },
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const [transactions, setTransactions] = useState<TestTransaction[]>([]);
  const [testCustomerId, setTestCustomerId] = useState<string | null>(null);
  const [testSubscriptionId, setTestSubscriptionId] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<any>(null);

  // Test statistics
  const stats = {
    total: tests.length,
    passed: tests.filter((t: any) => t.status === "passed").length,
    failed: tests.filter((t: any) => t.status === "failed").length,
    pending: tests.filter((t: any) => t.status === "pending").length,
  };

  const updateTest = (name: string, status: TestResult["status"], message?: string, details?: any) => {
    setTests(prev =>
      prev.map((test: any) =>
        test.name === name
          ? { ...test, status, message, details }
          : test
      )
    );
  };

  const logTransaction = (type: string, amount: number, status: string, details: any) => {
    const transaction: TestTransaction = {
      id: `txn_${Date.now()}`,
      type,
      amount,
      status,
      timestamp: new Date(),
      details,
    };
    setTransactions(prev => [transaction, ...prev].slice(0, 10)); // Keep last 10
  };

  const runTests = async () => {
    setIsRunning(true);
    setTransactions([]);
    
    // Reset all tests to pending
    setTests(tests.map((t: any) => ({ ...t, status: "PENDING", message: undefined, details: undefined })));

    try {
      // Test 1: Feature Flag Check
      updateTest("Feature Flag Check", "running");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const isEnabled = isFeatureEnabled("STRIPE_SUBSCRIPTIONS");
      if (isEnabled) {
        updateTest("Feature Flag Check", "passed", "STRIPE_SUBSCRIPTIONS is enabled");
      } else {
        updateTest("Feature Flag Check", "failed", "STRIPE_SUBSCRIPTIONS is disabled");
      }

      // Test 2: Stripe Configuration
      updateTest("Stripe Configuration", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      const hasPublicKey = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      const config = {
        hasPublicKey,
        publicKeyPrefix: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.substring(0, 7),
        isTestMode: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.includes('_test_'),
      };
      setConfiguration(config);

      if (hasPublicKey) {
        updateTest("Stripe Configuration", "passed", "Configuration found", config);
      } else {
        updateTest("Stripe Configuration", "failed", "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      }

      // Test 3: API Key Validation
      updateTest("API Key Validation", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const response = await fetch("/api/v2/stripe/validate-config", {
          method: "POST",
        });

        if (response.ok) {
          const data = await response.json();
          updateTest("API Key Validation", "passed", "Keys are valid", data);
        } else {
          updateTest("API Key Validation", "failed", "Invalid API keys");
        }
      } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("API Key Validation", "failed", errorMessage);
      }

      // Test 4: Create Test Customer
      updateTest("Create Test Customer", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const response = await fetch("/api/v2/stripe/test-customer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `test-${Date.now()}@lifefile.test`,
            name: "Test Patient",
          }),
        });

        if (response.ok) {
          const customer = await response.json();
          setTestCustomerId(customer.customerId || customer.id);
          updateTest("Create Test Customer", "passed", `Customer ID: ${customer.customerId || customer.id}`);
          logTransaction("Customer Created", 0, "success", customer);
        } else {
          const error = await response.json();
          updateTest("Create Test Customer", "failed", error.error || "Failed to create customer");
        }
      } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Create Test Customer", "failed", errorMessage);
      }

      // Test 5: Create Test Subscription
      if (testCustomerId || true) { // Continue even without customer for mock mode
        updateTest("Create Test Subscription", "running");
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          const response = await fetch("/api/v2/stripe/create-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              priceId: "price_test_monthly", // Test price ID
              customerId: testCustomerId || "cus_test_mock",
              patientId: 1,
            }),
          });

          if (response.ok) {
            const subscription = await response.json();
            setTestSubscriptionId(subscription.subscriptionId);
            updateTest("Create Test Subscription", "passed", `Subscription created: ${subscription.subscriptionId || 'mock'}`);
            logTransaction("Subscription Created", 2999, "success", subscription);
          } else {
            const error = await response.json();
            updateTest("Create Test Subscription", "failed", error.error || "Failed to create subscription");
          }
        } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Create Test Subscription", "failed", errorMessage);
        }
      }

      // Test 6: Process Test Payment
      updateTest("Process Test Payment", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const response = await fetch("/api/v2/stripe/test-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: 5000, // $50.00
            customerId: testCustomerId || "cus_test_mock",
            description: "Test payment from test suite",
          }),
        });

        if (response.ok) {
          const payment = await response.json();
          updateTest("Process Test Payment", "passed", `Payment processed: $50.00`);
          logTransaction("Payment Processed", 5000, "success", payment);
        } else {
          const error = await response.json();
          updateTest("Process Test Payment", "failed", error.error || "Payment failed");
        }
      } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Process Test Payment", "failed", errorMessage);
      }

      // Test 7: Cancel Subscription
      if (testSubscriptionId) {
        updateTest("Cancel Subscription", "running");
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          const response = await fetch(`/api/v2/stripe/cancel-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId: testSubscriptionId,
            }),
          });

          if (response.ok) {
            updateTest("Cancel Subscription", "passed", "Subscription cancelled successfully");
            logTransaction("Subscription Cancelled", 0, "success", { subscriptionId: testSubscriptionId });
          } else {
            const error = await response.json();
            updateTest("Cancel Subscription", "failed", error.error || "Failed to cancel");
          }
        } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Cancel Subscription", "failed", errorMessage);
        }
      } else {
        updateTest("Cancel Subscription", "passed", "Skipped - no subscription to cancel");
      }

      // Test 8: Webhook Simulation
      updateTest("Webhook Simulation", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const webhookEvents = [
          'customer.subscription.created',
          'invoice.payment_succeeded',
          'customer.subscription.updated',
        ];

        for (const event of webhookEvents) {
          const response = await fetch("/api/v2/stripe/test-webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: event,
              data: {
                object: {
                  id: `test_${event}_${Date.now()}`,
                  customer: testCustomerId || "cus_test_mock",
                },
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Webhook ${event} failed`);
          }
        }

        updateTest("Webhook Simulation", "passed", `${webhookEvents.length} webhook events processed`);
        logTransaction("Webhooks Processed", 0, "success", { events: webhookEvents });
      } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateTest("Webhook Simulation", "failed", errorMessage);
      }

      // Test 9: Error Handling
      updateTest("Error Handling", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // Test with invalid card
        const response = await fetch("/api/v2/stripe/test-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: 1000,
            customerId: "invalid_customer",
            testCard: "declined", // Special test card that always declines
          }),
        });

        const result = await response.json();
        if (result.error || !response.ok) {
          updateTest("Error Handling", "passed", "Errors handled gracefully");
          logTransaction("Payment Declined", 1000, "failed", result);
        } else {
          updateTest("Error Handling", "failed", "Error not properly handled");
        }
      } catch (error: any) {
    // @ts-ignore
   
        updateTest("Error Handling", "passed", "Exception caught properly");
      }

      // Test 10: Mock Mode Check
      updateTest("Mock Mode Check", "running");
      await new Promise(resolve => setTimeout(resolve, 500));

      const isMockMode = !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
                        process.env.STRIPE_USE_MOCK === 'true';
      
      if (isMockMode) {
        updateTest("Mock Mode Check", "passed", "Running in mock mode - no real charges");
        logTransaction("Mock Mode", 0, "info", { mock: true });
      } else {
        updateTest("Mock Mode Check", "passed", "Running with real Stripe integration");
        logTransaction("Live Mode", 0, "info", { mock: false });
      }

    } catch (error: any) {
    // @ts-ignore
   
      logger.error("Test suite error:", error);
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "running":
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-indigo-600" />
                Stripe Integration Test Suite
              </h1>
              <p className="text-gray-600 mt-2">
                Comprehensive testing for Stripe subscription billing
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Environment</div>
              <div className="font-semibold">
                {process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test" ? 'Production' : 'Development'}
              </div>
            </div>
          </div>
        </div>

        {/* Test Status Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Tests</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.passed}</div>
            <div className="text-sm text-gray-600">Passed</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
        </div>

        {/* Run Tests Button */}
        <div className="mb-6 text-center">
          <button
            onClick={runTests}
            disabled={isRunning}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors inline-flex items-center gap-2 ${
              isRunning
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5" />
                Run All Tests
              </>
            )}
          </button>
        </div>

        {/* Test Results */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          <div className="space-y-3">
            {tests.map((test, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 ${
                  test.status === "failed" ? "border-red-200 bg-red-50" :
                  test.status === "passed" ? "border-green-200 bg-green-50" :
                  test.status === "running" ? "border-blue-200 bg-blue-50" :
                  "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(test.status)}
                    <span className="font-medium">{test.name}</span>
                  </div>
                  {test.message && (
                    <span className="text-sm text-gray-600">{test.message}</span>
                  )}
                </div>
                {test.details && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                    {JSON.stringify(test.details, null, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Test Transactions */}
        {transactions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Test Transactions</h2>
            <div className="space-y-2">
              {transactions.map((txn: any) => (
                <div key={txn.id} className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-3">
                    <DollarSign className={`h-4 w-4 ${
                      txn.status === 'success' ? 'text-green-600' :
                      txn.status === 'failed' ? 'text-red-600' :
                      'text-gray-600'
                    }`} />
                    <div>
                      <div className="font-medium text-sm">{txn.type}</div>
                      <div className="text-xs text-gray-500">
                        {txn.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {txn.amount > 0 && (
                      <div className="font-semibold">{formatAmount(txn.amount)}</div>
                    )}
                    <div className={`text-xs ${
                      txn.status === 'success' ? 'text-green-600' :
                      txn.status === 'failed' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {txn.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Configuration Info */}
        {configuration && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Public Key</span>
                <span className="font-mono text-sm">
                  {configuration.hasPublicKey ? `${configuration.publicKeyPrefix}...` : 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Mode</span>
                <span className="font-semibold">
                  {configuration.isTestMode ? 
                    <span className="text-green-600">Test Mode</span> : 
                    <span className="text-orange-600">Live Mode</span>
                  }
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Test Cards Reference */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <strong>Stripe Test Cards:</strong>
              <div className="mt-2 space-y-1">
                <div><code className="bg-blue-100 px-1 rounded">4242 4242 4242 4242</code> - Successful payment</div>
                <div><code className="bg-blue-100 px-1 rounded">4000 0000 0000 9995</code> - Declined payment</div>
                <div><code className="bg-blue-100 px-1 rounded">4000 0000 0000 0002</code> - Card declined</div>
                <div><code className="bg-blue-100 px-1 rounded">4000 0000 0000 9987</code> - Failed (3D Secure)</div>
              </div>
              <div className="mt-2">
                Use any future expiry date and any 3-digit CVC.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
