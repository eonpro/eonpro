"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { logger } from "@/lib/logger";

type LifefileSettings = {
  id: number;
  name: string;
  lifefileEnabled: boolean;
  lifefileBaseUrl: string | null;
  lifefileUsername: string | null;
  lifefilePassword: string | null;
  lifefileVendorId: string | null;
  lifefilePracticeId: string | null;
  lifefileLocationId: string | null;
  lifefileNetworkId: string | null;
  lifefilePracticeName: string | null;
  lifefilePracticeAddress: string | null;
  lifefilePracticePhone: string | null;
  lifefilePracticeFax: string | null;
  lifefileWebhookSecret: string | null;
  lifefileDatapushUsername: string | null;
  lifefileDatapushPassword: string | null;
  hasCredentials: boolean;
};

export default function ClinicLifefileSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<LifefileSettings | null>(null);

  // Form state
  const [form, setForm] = useState({
    lifefileEnabled: false,
    lifefileBaseUrl: "",
    lifefileUsername: "",
    lifefilePassword: "",
    lifefileVendorId: "",
    lifefilePracticeId: "",
    lifefileLocationId: "",
    lifefileNetworkId: "",
    lifefilePracticeName: "",
    lifefilePracticeAddress: "",
    lifefilePracticePhone: "",
    lifefilePracticeFax: "",
    lifefileWebhookSecret: "",
    lifefileDatapushUsername: "",
    lifefileDatapushPassword: "",
  });

  useEffect(() => {
    fetchSettings();
  }, [clinicId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("auth-token") || localStorage.getItem("super_admin-token");

      const res = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error("Failed to fetch Lifefile settings");
      }

      const data = await res.json();
      setSettings(data.settings);

      // Populate form with current settings
      setForm({
        lifefileEnabled: data.settings.lifefileEnabled || false,
        lifefileBaseUrl: data.settings.lifefileBaseUrl || "",
        lifefileUsername: data.settings.lifefileUsername || "",
        lifefilePassword: data.settings.lifefilePassword || "",
        lifefileVendorId: data.settings.lifefileVendorId || "",
        lifefilePracticeId: data.settings.lifefilePracticeId || "",
        lifefileLocationId: data.settings.lifefileLocationId || "",
        lifefileNetworkId: data.settings.lifefileNetworkId || "",
        lifefilePracticeName: data.settings.lifefilePracticeName || "",
        lifefilePracticeAddress: data.settings.lifefilePracticeAddress || "",
        lifefilePracticePhone: data.settings.lifefilePracticePhone || "",
        lifefilePracticeFax: data.settings.lifefilePracticeFax || "",
        lifefileWebhookSecret: data.settings.lifefileWebhookSecret || "",
        lifefileDatapushUsername: data.settings.lifefileDatapushUsername || "",
        lifefileDatapushPassword: data.settings.lifefileDatapushPassword || "",
      });
    } catch (err: any) {
      logger.error("Error fetching Lifefile settings:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem("auth-token") || localStorage.getItem("super_admin-token");

      const res = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          lifefileEnabled: form.lifefileEnabled,
          lifefileBaseUrl: form.lifefileBaseUrl || null,
          lifefileUsername: form.lifefileUsername || null,
          lifefilePassword: form.lifefilePassword || null,
          lifefileVendorId: form.lifefileVendorId || null,
          lifefilePracticeId: form.lifefilePracticeId || null,
          lifefileLocationId: form.lifefileLocationId || null,
          lifefileNetworkId: form.lifefileNetworkId || null,
          lifefilePracticeName: form.lifefilePracticeName || null,
          lifefilePracticeAddress: form.lifefilePracticeAddress || null,
          lifefilePracticePhone: form.lifefilePracticePhone || null,
          lifefilePracticeFax: form.lifefilePracticeFax || null,
          lifefileWebhookSecret: form.lifefileWebhookSecret || null,
          lifefileDatapushUsername: form.lifefileDatapushUsername || null,
          lifefileDatapushPassword: form.lifefileDatapushPassword || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save settings");
      }

      setSuccess("Lifefile settings saved successfully!");
      fetchSettings(); // Refresh settings
    } catch (err: any) {
      logger.error("Error saving Lifefile settings:", err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem("auth-token") || localStorage.getItem("super_admin-token");

      const res = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || "Connection test failed");
      }

      setSuccess("Connection test successful! Lifefile is configured correctly.");
    } catch (err: any) {
      logger.error("Error testing Lifefile connection:", err);
      setError(`Connection test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const updateForm = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>Loading Lifefile settings...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/super-admin" className="hover:text-[#4fa77e]">
              Super Admin
            </Link>
            <span>→</span>
            <Link href="/super-admin/clinics" className="hover:text-[#4fa77e]">
              Clinics
            </Link>
            <span>→</span>
            <span>{settings?.name || `Clinic ${clinicId}`}</span>
            <span>→</span>
            <span className="text-gray-700">Lifefile Settings</span>
          </div>
          <h1 className="text-3xl font-bold">Lifefile / Pharmacy Integration</h1>
          <p className="text-gray-600 mt-1">
            Configure the pharmacy integration for {settings?.name || "this clinic"}
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Enable Toggle */}
      <div className="bg-white rounded-xl shadow border p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Enable Lifefile Integration</h2>
            <p className="text-sm text-gray-500">
              When enabled, prescriptions from this clinic will be sent through Lifefile
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.lifefileEnabled}
              onChange={(e) => updateForm("lifefileEnabled", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4fa77e]"></div>
          </label>
        </div>
      </div>

      {/* API Credentials */}
      <div className="bg-white rounded-xl shadow border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">API Credentials</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Base URL *
            </label>
            <input
              type="url"
              value={form.lifefileBaseUrl}
              onChange={(e) => updateForm("lifefileBaseUrl", e.target.value)}
              placeholder="https://api.lifefile.com/v1"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username *
            </label>
            <input
              type="text"
              value={form.lifefileUsername}
              onChange={(e) => updateForm("lifefileUsername", e.target.value)}
              placeholder="API username"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <input
              type="password"
              value={form.lifefilePassword}
              onChange={(e) => updateForm("lifefilePassword", e.target.value)}
              placeholder="API password"
              className="w-full border rounded-lg px-3 py-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave as •••••••• to keep existing password
            </p>
          </div>
        </div>
      </div>

      {/* Account IDs */}
      <div className="bg-white rounded-xl shadow border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Account Identifiers</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor ID *
            </label>
            <input
              type="text"
              value={form.lifefileVendorId}
              onChange={(e) => updateForm("lifefileVendorId", e.target.value)}
              placeholder="e.g., 11596"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Practice ID *
            </label>
            <input
              type="text"
              value={form.lifefilePracticeId}
              onChange={(e) => updateForm("lifefilePracticeId", e.target.value)}
              placeholder="Your practice ID"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location ID *
            </label>
            <input
              type="text"
              value={form.lifefileLocationId}
              onChange={(e) => updateForm("lifefileLocationId", e.target.value)}
              placeholder="e.g., 110396"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Network ID *
            </label>
            <input
              type="text"
              value={form.lifefileNetworkId}
              onChange={(e) => updateForm("lifefileNetworkId", e.target.value)}
              placeholder="Your network ID"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Practice Information */}
      <div className="bg-white rounded-xl shadow border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Practice Information</h2>
        <p className="text-sm text-gray-500 mb-4">
          This information appears on prescriptions and pharmacy communications
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Practice Name
            </label>
            <input
              type="text"
              value={form.lifefilePracticeName}
              onChange={(e) => updateForm("lifefilePracticeName", e.target.value)}
              placeholder="e.g., ABC Medical Clinic"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Practice Address
            </label>
            <input
              type="text"
              value={form.lifefilePracticeAddress}
              onChange={(e) => updateForm("lifefilePracticeAddress", e.target.value)}
              placeholder="123 Medical Center Dr, Suite 100, City, ST 12345"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Practice Phone
            </label>
            <input
              type="tel"
              value={form.lifefilePracticePhone}
              onChange={(e) => updateForm("lifefilePracticePhone", e.target.value)}
              placeholder="555-555-5555"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Practice Fax
            </label>
            <input
              type="tel"
              value={form.lifefilePracticeFax}
              onChange={(e) => updateForm("lifefilePracticeFax", e.target.value)}
              placeholder="555-555-5556"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Webhook Settings (Optional) */}
      <div className="bg-white rounded-xl shadow border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Webhook Settings (Optional)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure webhooks to receive prescription status updates from Lifefile
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook Secret
            </label>
            <input
              type="password"
              value={form.lifefileWebhookSecret}
              onChange={(e) => updateForm("lifefileWebhookSecret", e.target.value)}
              placeholder="Secret for webhook verification"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Push Username
            </label>
            <input
              type="text"
              value={form.lifefileDatapushUsername}
              onChange={(e) => updateForm("lifefileDatapushUsername", e.target.value)}
              placeholder="Webhook auth username"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Push Password
            </label>
            <input
              type="password"
              value={form.lifefileDatapushPassword}
              onChange={(e) => updateForm("lifefileDatapushPassword", e.target.value)}
              placeholder="Webhook auth password"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleTestConnection}
          disabled={testing || !form.lifefileBaseUrl || !form.lifefileUsername}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>

        <div className="flex items-center gap-3">
          <Link
            href="/super-admin/clinics"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d8c65] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

