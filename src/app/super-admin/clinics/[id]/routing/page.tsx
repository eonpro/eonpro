'use client';

/**
 * Clinic Provider Routing Configuration Page
 * 
 * Enterprise feature for configuring provider routing, SOAP approval modes,
 * and per-script compensation tracking for a clinic.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Settings,
  Users,
  DollarSign,
  FileText,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  Shuffle,
  Target,
  UserCheck,
  ListChecks,
} from 'lucide-react';

// Types
interface RoutingConfig {
  routingEnabled: boolean;
  compensationEnabled: boolean;
  routingStrategy: 'STATE_LICENSE_MATCH' | 'ROUND_ROBIN' | 'MANUAL_ASSIGNMENT' | 'PROVIDER_CHOICE';
  soapApprovalMode: 'REQUIRED' | 'ADVISORY' | 'DISABLED';
  autoAssignOnPayment: boolean;
  lastAssignedIndex?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface CompensationPlan {
  id: number;
  providerId: number;
  providerName: string;
  providerNpi: string;
  flatRatePerScript: number;
  flatRateFormatted: string;
  isActive: boolean;
  effectiveFrom: string;
}

interface ClinicInfo {
  id: number;
  name: string;
  subdomain: string;
}

const ROUTING_STRATEGIES = [
  {
    value: 'PROVIDER_CHOICE',
    label: 'Provider Self-Select',
    description: 'Providers claim prescriptions from a shared queue',
    icon: UserCheck,
  },
  {
    value: 'STATE_LICENSE_MATCH',
    label: 'State License Match',
    description: 'Auto-assign to providers licensed in patient\'s state',
    icon: Target,
  },
  {
    value: 'ROUND_ROBIN',
    label: 'Round Robin',
    description: 'Distribute prescriptions evenly among providers',
    icon: Shuffle,
  },
  {
    value: 'MANUAL_ASSIGNMENT',
    label: 'Manual Assignment',
    description: 'Admin manually assigns each prescription',
    icon: ListChecks,
  },
];

const SOAP_APPROVAL_MODES = [
  {
    value: 'DISABLED',
    label: 'Disabled',
    description: 'No SOAP note check before prescribing',
  },
  {
    value: 'ADVISORY',
    label: 'Advisory',
    description: 'Warning shown but provider can proceed without approved SOAP',
  },
  {
    value: 'REQUIRED',
    label: 'Required',
    description: 'SOAP note must be approved before provider can prescribe',
  },
];

export default function ClinicRoutingPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [config, setConfig] = useState<RoutingConfig>({
    routingEnabled: false,
    compensationEnabled: false,
    routingStrategy: 'PROVIDER_CHOICE',
    soapApprovalMode: 'ADVISORY',
    autoAssignOnPayment: false,
  });
  const [compensationPlans, setCompensationPlans] = useState<CompensationPlan[]>([]);

  // Fetch configuration
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/super-admin/clinics/${clinicId}/routing-config`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch configuration');
      }

      const data = await response.json();
      setClinic(data.clinic);
      setConfig(data.config);
      setCompensationPlans(data.compensationPlans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Save configuration
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(
        `/api/super-admin/clinics/${clinicId}/routing-config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routingEnabled: config.routingEnabled,
            compensationEnabled: config.compensationEnabled,
            routingStrategy: config.routingStrategy,
            soapApprovalMode: config.soapApprovalMode,
            autoAssignOnPayment: config.autoAssignOnPayment,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save configuration');
      }

      const data = await response.json();
      setConfig(data.config);
      setSuccess('Configuration saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/super-admin/clinics/${clinicId}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-teal-600" />
                  <h1 className="text-2xl font-bold text-gray-900">
                    Provider Routing & Compensation
                  </h1>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  {clinic?.name || 'Loading...'}
                </p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-green-700">{success}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Feature Enable Toggles */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-500" />
              Feature Settings
            </h2>

            <div className="space-y-4">
              {/* Provider Routing Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">Provider Routing</p>
                    <p className="text-sm text-gray-500">
                      Enable prescription routing and assignment to providers
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.routingEnabled}
                    onChange={(e) =>
                      setConfig({ ...config, routingEnabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>

              {/* Compensation Tracking Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-gray-900">
                      Compensation Tracking
                    </p>
                    <p className="text-sm text-gray-500">
                      Track per-script earnings for providers
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.compensationEnabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        compensationEnabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Routing Strategy */}
          {config.routingEnabled && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Shuffle className="h-5 w-5 text-gray-500" />
                Routing Strategy
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROUTING_STRATEGIES.map((strategy) => {
                  const Icon = strategy.icon;
                  return (
                    <button
                      key={strategy.value}
                      onClick={() =>
                        setConfig({
                          ...config,
                          routingStrategy: strategy.value as RoutingConfig['routingStrategy'],
                        })
                      }
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        config.routingStrategy === strategy.value
                          ? 'border-teal-600 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-5 w-5 ${
                            config.routingStrategy === strategy.value
                              ? 'text-teal-600'
                              : 'text-gray-400'
                          }`}
                        />
                        <div>
                          <p
                            className={`font-medium ${
                              config.routingStrategy === strategy.value
                                ? 'text-teal-900'
                                : 'text-gray-900'
                            }`}
                          >
                            {strategy.label}
                          </p>
                          <p
                            className={`text-sm ${
                              config.routingStrategy === strategy.value
                                ? 'text-teal-700'
                                : 'text-gray-500'
                            }`}
                          >
                            {strategy.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Auto-assign on payment */}
              {['STATE_LICENSE_MATCH', 'ROUND_ROBIN'].includes(
                config.routingStrategy
              ) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        Auto-assign on Payment
                      </p>
                      <p className="text-sm text-gray-500">
                        Automatically assign prescriptions when invoice is paid
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.autoAssignOnPayment}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            autoAssignOnPayment: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SOAP Note Approval Mode */}
          {config.routingEnabled && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-500" />
                SOAP Note Approval Mode
              </h2>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <p className="text-sm text-blue-700">
                  This setting controls whether providers must have an approved
                  SOAP note before they can write a prescription.
                </p>
              </div>

              <div className="space-y-3">
                {SOAP_APPROVAL_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() =>
                      setConfig({
                        ...config,
                        soapApprovalMode: mode.value as RoutingConfig['soapApprovalMode'],
                      })
                    }
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                      config.soapApprovalMode === mode.value
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p
                      className={`font-medium ${
                        config.soapApprovalMode === mode.value
                          ? 'text-teal-900'
                          : 'text-gray-900'
                      }`}
                    >
                      {mode.label}
                    </p>
                    <p
                      className={`text-sm ${
                        config.soapApprovalMode === mode.value
                          ? 'text-teal-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {mode.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Compensation Plans */}
          {config.compensationEnabled && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-gray-500" />
                Provider Compensation Plans
              </h2>

              {compensationPlans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <DollarSign className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>No compensation plans configured yet.</p>
                  <p className="text-sm mt-1">
                    Set compensation rates for individual providers in the Admin
                    panel.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                          Provider
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                          NPI
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                          Rate per Script
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                          Effective From
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {compensationPlans.map((plan) => (
                        <tr
                          key={plan.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {plan.providerName}
                          </td>
                          <td className="py-3 px-4 font-mono text-sm text-gray-500">
                            {plan.providerNpi}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-green-600">
                            {plan.flatRateFormatted}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {plan.isActive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            {new Date(plan.effectiveFrom).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
