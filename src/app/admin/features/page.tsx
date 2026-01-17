"use client";

import { useState } from "react";
import { FEATURES, FeatureFlags } from "@/lib/features";
import { CheckCircle, XCircle, Settings, AlertTriangle, Copy, Save } from "lucide-react";
import { AppError, ApiResponse } from '@/types/common';

export default function FeatureFlagsPage() {
  const [features, setFeatures] = useState(FEATURES);
  const [copied, setCopied] = useState(false);

  // Feature descriptions
  const featureInfo: Record<keyof FeatureFlags, { description: string; category: string }> = {
    STRIPE_SUBSCRIPTIONS: {
      description: "Enable recurring billing and subscription management with Stripe",
      category: "Payment",
    },
    STRIPE_CONNECT: {
      description: "Allow providers to receive payments directly via Stripe Connect",
      category: "Payment",
    },
    SQUARE_PAYMENTS: {
      description: "Accept payments through Square payment gateway",
      category: "Payment",
    },
    TWILIO_SMS: {
      description: "Send SMS notifications and appointment reminders to patients",
      category: "Communication",
    },
    TWILIO_CHAT: {
      description: "Enable real-time chat between patients and providers",
      category: "Communication",
    },
    ZOOM_TELEHEALTH: {
      description: "Conduct virtual consultations using Zoom integration",
      category: "Telehealth",
    },
    ZOOM_WAITING_ROOM: {
      description: "Manage virtual waiting rooms for telehealth appointments",
      category: "Telehealth",
    },
    AWS_S3_STORAGE: {
      description: "Store documents and files in AWS S3 cloud storage",
      category: "Infrastructure",
    },
    AWS_SES_EMAIL: {
      description: "Send transactional emails via AWS Simple Email Service",
      category: "Infrastructure",
    },
    AWS_EVENTBRIDGE: {
      description: "Enable event-driven automation with AWS EventBridge",
      category: "Infrastructure",
    },
    DYNAMIC_FORMS: {
      description: "Create and manage dynamic patient intake forms",
      category: "Advanced",
    },
    MULTI_LANGUAGE: {
      description: "Support multiple languages for international patients",
      category: "Advanced",
    },
    ADVANCED_REPORTING: {
      description: "Access detailed analytics and reporting dashboards",
      category: "Advanced",
    },
    DOSSPOT_EPRESCRIBING: {
      description: "Enable electronic prescribing through DoseSpot integration",
      category: "Advanced",
    },
  };

  // Group features by category
  const groupedFeatures = Object.entries(features).reduce((acc, [key, enabled]) => {
    const category = featureInfo[key as keyof FeatureFlags]?.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push({ key: key as keyof FeatureFlags, enabled });
    return acc;
  }, {} as Record<string, Array<{ key: keyof FeatureFlags; enabled: boolean }>>);

  // Generate environment variables config
  const generateEnvConfig = () => {
    const envLines = Object.entries(features).map(
      ([key, enabled]) => `NEXT_PUBLIC_ENABLE_${key}=${enabled}`
    );
    return envLines.join("\n");
  };

  // Copy to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateEnvConfig());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Toggle feature
  const toggleFeature = (key: keyof FeatureFlags) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Category icons (using text abbreviations for clean design)
  const categoryIcons: Record<string, string> = {
    Payment: "Pay",
    Communication: "Com",
    Telehealth: "Tel",
    Infrastructure: "Inf",
    Advanced: "Adv",
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Settings className="h-8 w-8 text-gray-700" />
                Feature Flags Management
              </h1>
              <p className="text-gray-600 mt-2">
                Control which features are enabled in your platform. Changes require server restart.
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(features).filter((f: any) => f).length}
              </div>
              <div className="text-sm text-gray-600">Features Enabled</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-600">
                {Object.values(features).filter((f: any) => !f).length}
              </div>
              <div className="text-sm text-gray-600">Features Disabled</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {Object.keys(features).length}
              </div>
              <div className="text-sm text-gray-600">Total Features</div>
            </div>
          </div>
        </div>

        {/* Feature Categories */}
        <div className="space-y-6">
          {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
            <div key={category} className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-2xl">{categoryIcons[category]}</span>
                {category} Features
                <span className="text-sm text-gray-500 ml-2">
                  ({categoryFeatures.filter((f: any) => f.enabled).length}/{categoryFeatures.length} enabled)
                </span>
              </h2>

              <div className="space-y-3">
                {categoryFeatures.map(({ key, enabled }) => (
                  <div
                    key={key}
                    className={`border rounded-lg p-4 transition-all ${
                      enabled ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleFeature(key)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              enabled ? "bg-green-600" : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                enabled ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                          <h3 className="font-medium text-gray-900">
                            {key.replace(/_/g, " ")}
                          </h3>
                          {enabled ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-2 ml-14">
                          {featureInfo[key]?.description}
                        </p>
                        <div className="text-xs text-gray-500 mt-2 ml-14 font-mono">
                          NEXT_PUBLIC_ENABLE_{key}={enabled.toString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Environment Variables Export */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Environment Variables</h2>
            <button
              onClick={copyToClipboard}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                copied
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </>
              )}
            </button>
          </div>
          
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <pre>{generateEnvConfig()}</pre>
          </div>

          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <strong>Important:</strong> After updating environment variables:
                <ol className="mt-2 ml-4 list-decimal space-y-1">
                  <li>Copy these variables to your <code className="bg-yellow-100 px-1 rounded">.env.local</code> file</li>
                  <li>Restart your development server with <code className="bg-yellow-100 px-1 rounded">npm run dev</code></li>
                  <li>For production, update your AWS environment variables</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-8">
          <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/billing/subscriptions"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              Subscription Billing
            </a>
            <a
              href="/communications/sms"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              SMS Communications
            </a>
            <a
              href="/test/twilio"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              Test Twilio
            </a>
            <a
              href="/admin"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              Admin Console
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
