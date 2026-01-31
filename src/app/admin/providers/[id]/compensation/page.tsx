'use client';

/**
 * Admin Provider Compensation Management Page
 * 
 * Allows clinic admins to set and manage compensation rates for providers.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  DollarSign,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  TrendingUp,
  FileText,
  Percent,
  Info,
  Layers,
} from 'lucide-react';

type CompensationType = 'FLAT_RATE' | 'PERCENTAGE' | 'HYBRID';

interface CompensationPlan {
  id: number;
  compensationType: CompensationType;
  flatRatePerScript: number;
  flatRateFormatted: string;
  percentBps: number;
  percentFormatted: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EarningsSummary {
  totalPrescriptions: number;
  totalEarningsCents: number;
  pendingEarningsCents: number;
  approvedEarningsCents: number;
  paidEarningsCents: number;
  voidedCount: number;
  breakdown: {
    period: string;
    prescriptions: number;
    earningsCents: number;
  }[];
}

export default function AdminProviderCompensationPage() {
  const params = useParams();
  const providerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [compensationEnabled, setCompensationEnabled] = useState(false);
  const [plan, setPlan] = useState<CompensationPlan | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [compensationType, setCompensationType] = useState<CompensationType>('FLAT_RATE');
  const [flatRate, setFlatRate] = useState<string>('5.00');
  const [percentBps, setPercentBps] = useState<string>('5.00'); // Displayed as percent (e.g., 5.00 = 5%)
  const [notes, setNotes] = useState<string>('');

  // Fetch compensation data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/admin/providers/${providerId}/compensation`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch compensation data');
      }

      const data = await response.json();
      setCompensationEnabled(data.compensationEnabled);
      setPlan(data.plan);
      setEarnings(data.currentMonthEarnings);

      if (data.plan) {
        setCompensationType(data.plan.compensationType || 'FLAT_RATE');
        setFlatRate((data.plan.flatRatePerScript / 100).toFixed(2));
        setPercentBps((data.plan.percentBps / 100).toFixed(2)); // Convert bps to percent
        setNotes(data.plan.notes || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save compensation plan
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const rateInCents = Math.round(parseFloat(flatRate) * 100);
      const percentInBps = Math.round(parseFloat(percentBps) * 100); // Convert percent to bps

      // Validate flat rate if needed
      if (compensationType === 'FLAT_RATE' || compensationType === 'HYBRID') {
        if (isNaN(rateInCents) || rateInCents < 0) {
          throw new Error('Please enter a valid flat rate');
        }
      }

      // Validate percentage if needed
      if (compensationType === 'PERCENTAGE' || compensationType === 'HYBRID') {
        if (isNaN(percentInBps) || percentInBps < 0 || percentInBps > 10000) {
          throw new Error('Please enter a valid percentage (0-100%)');
        }
      }

      const response = await fetch(
        `/api/admin/providers/${providerId}/compensation`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            compensationType,
            flatRatePerScript: (compensationType === 'FLAT_RATE' || compensationType === 'HYBRID')
              ? rateInCents
              : 0,
            percentBps: (compensationType === 'PERCENTAGE' || compensationType === 'HYBRID')
              ? percentInBps
              : 0,
            notes: notes || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save compensation plan');
      }

      const data = await response.json();
      setPlan(data.plan);
      // Update form state to match saved plan
      if (data.plan) {
        setCompensationType(data.plan.compensationType);
        setFlatRate((data.plan.flatRatePerScript / 100).toFixed(2));
        setPercentBps((data.plan.percentBps / 100).toFixed(2));
      }
      setSuccess('Compensation plan saved successfully');

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // Calculate preview earnings based on current settings
  const calculatePreview = (orderAmount: number = 100) => {
    const flatRateCents = Math.round(parseFloat(flatRate) * 100) || 0;
    const percentValue = parseFloat(percentBps) || 0;
    const orderCents = orderAmount * 100;

    let flatAmount = 0;
    let percentAmount = 0;

    if (compensationType === 'FLAT_RATE' || compensationType === 'HYBRID') {
      flatAmount = flatRateCents;
    }
    if (compensationType === 'PERCENTAGE' || compensationType === 'HYBRID') {
      percentAmount = Math.round((orderCents * percentValue) / 100);
    }

    return {
      flatAmount: flatAmount / 100,
      percentAmount: percentAmount / 100,
      total: (flatAmount + percentAmount) / 100,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading compensation data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/admin/providers"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-teal-600" />
                  <h1 className="text-2xl font-bold text-gray-900">
                    Provider Compensation
                  </h1>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  Provider ID: {providerId}
                </p>
              </div>
            </div>
            {compensationEnabled && (
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
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {!compensationEnabled ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Compensation Tracking Disabled
            </h2>
            <p className="text-gray-600">
              Provider compensation tracking is not enabled for this clinic.
              Contact your super admin to enable this feature.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Month Stats */}
            {earnings && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {earnings.totalPrescriptions}
                      </p>
                      <p className="text-gray-500 text-sm">Prescriptions</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        ${(earnings.totalEarningsCents / 100).toFixed(2)}
                      </p>
                      <p className="text-gray-500 text-sm">Total Earnings</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-yellow-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        ${(earnings.pendingEarningsCents / 100).toFixed(2)}
                      </p>
                      <p className="text-gray-500 text-sm">Pending</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        ${(earnings.paidEarningsCents / 100).toFixed(2)}
                      </p>
                      <p className="text-gray-500 text-sm">Paid Out</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Compensation Rate Form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-gray-500" />
                Compensation Settings
              </h2>

              <div className="space-y-6">
                {/* Compensation Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Compensation Type
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setCompensationType('FLAT_RATE')}
                      className={`p-4 border-2 rounded-lg text-left transition-all ${
                        compensationType === 'FLAT_RATE'
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign className={`h-4 w-4 ${compensationType === 'FLAT_RATE' ? 'text-teal-600' : 'text-gray-400'}`} />
                        <span className={`font-medium ${compensationType === 'FLAT_RATE' ? 'text-teal-900' : 'text-gray-700'}`}>
                          Flat Rate
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Fixed $ per script</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCompensationType('PERCENTAGE')}
                      className={`p-4 border-2 rounded-lg text-left transition-all ${
                        compensationType === 'PERCENTAGE'
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Percent className={`h-4 w-4 ${compensationType === 'PERCENTAGE' ? 'text-teal-600' : 'text-gray-400'}`} />
                        <span className={`font-medium ${compensationType === 'PERCENTAGE' ? 'text-teal-900' : 'text-gray-700'}`}>
                          Percentage
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">% of order total</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCompensationType('HYBRID')}
                      className={`p-4 border-2 rounded-lg text-left transition-all ${
                        compensationType === 'HYBRID'
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Layers className={`h-4 w-4 ${compensationType === 'HYBRID' ? 'text-teal-600' : 'text-gray-400'}`} />
                        <span className={`font-medium ${compensationType === 'HYBRID' ? 'text-teal-900' : 'text-gray-700'}`}>
                          Both
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Flat rate + percentage</p>
                    </button>
                  </div>
                </div>

                {/* Flat Rate Input - Show for FLAT_RATE and HYBRID */}
                {(compensationType === 'FLAT_RATE' || compensationType === 'HYBRID') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Flat Rate per Prescription
                    </label>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={flatRate}
                        onChange={(e) => setFlatRate(e.target.value)}
                        className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="5.00"
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Fixed amount paid per prescription
                    </p>
                  </div>
                )}

                {/* Percentage Input - Show for PERCENTAGE and HYBRID */}
                {(compensationType === 'PERCENTAGE' || compensationType === 'HYBRID') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Percentage of Order Total
                    </label>
                    <div className="relative max-w-xs">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={percentBps}
                        onChange={(e) => setPercentBps(e.target.value)}
                        className="w-full pl-4 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="5.00"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                        %
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Percentage of the invoice amount
                    </p>
                  </div>
                )}

                {/* Preview Calculation */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        Example Earnings
                      </p>
                      <p className="text-sm text-blue-800">
                        For a $100 order:{' '}
                        {compensationType === 'FLAT_RATE' && (
                          <>Provider earns <strong>${calculatePreview(100).flatAmount.toFixed(2)}</strong> (flat)</>
                        )}
                        {compensationType === 'PERCENTAGE' && (
                          <>Provider earns <strong>${calculatePreview(100).percentAmount.toFixed(2)}</strong> ({percentBps}%)</>
                        )}
                        {compensationType === 'HYBRID' && (
                          <>
                            Provider earns <strong>${calculatePreview(100).flatAmount.toFixed(2)}</strong> (flat) +{' '}
                            <strong>${calculatePreview(100).percentAmount.toFixed(2)}</strong> ({percentBps}%) ={' '}
                            <strong>${calculatePreview(100).total.toFixed(2)}</strong> total
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="Add any notes about this compensation arrangement..."
                  />
                </div>

                {plan && (
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500 mb-1">
                      <strong>Current Plan:</strong>{' '}
                      {plan.compensationType === 'FLAT_RATE' && `${plan.flatRateFormatted} per script`}
                      {plan.compensationType === 'PERCENTAGE' && `${plan.percentFormatted} of order`}
                      {plan.compensationType === 'HYBRID' && `${plan.flatRateFormatted} + ${plan.percentFormatted}`}
                    </p>
                    <p className="text-sm text-gray-500 mb-1">
                      <strong>Effective Since:</strong>{' '}
                      {new Date(plan.effectiveFrom).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      <strong>Status:</strong>{' '}
                      {plan.isActive ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-gray-400">Inactive</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Earnings Breakdown */}
            {earnings && earnings.breakdown.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-gray-500" />
                  This Month&apos;s Activity
                </h2>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                          Date
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                          Prescriptions
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                          Earnings
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.breakdown.map((day) => (
                        <tr
                          key={day.period}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4 text-gray-900">
                            {new Date(day.period).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {day.prescriptions}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-green-600">
                            ${(day.earningsCents / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
