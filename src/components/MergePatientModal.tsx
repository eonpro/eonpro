'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, GitMerge, Loader2, AlertTriangle, Check, ArrowRight, Search, User } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import { normalizedIncludes } from '@/lib/utils/search';

// Types for the merge preview
interface RelationCounts {
  orders: number;
  invoices: number;
  payments: number;
  paymentMethods: number;
  subscriptions: number;
  soapNotes: number;
  documents: number;
  intakeSubmissions: number;
  appointments: number;
  superbills: number;
  carePlans: number;
  tickets: number;
  weightLogs: number;
  medicationReminders: number;
  waterLogs: number;
  exerciseLogs: number;
  sleepLogs: number;
  nutritionLogs: number;
  aiConversations: number;
  chatMessages: number;
  smsLogs: number;
  referralTrackings: number;
  affiliateReferrals: number;
  discountUsages: number;
  shippingUpdates: number;
  auditEntries: number;
}

interface PatientWithCounts {
  id: number;
  patientId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  notes: string | null;
  stripeCustomerId: string | null;
  lifefileId: string | null;
  createdAt: string;
  _counts: RelationCounts;
}

interface MergeConflict {
  type: 'error' | 'warning';
  field: string;
  message: string;
}

interface MergePreview {
  source: PatientWithCounts;
  target: PatientWithCounts;
  mergedProfile: {
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip: string;
    notes: string | null;
  };
  totalRecordsToMove: number;
  conflicts: MergeConflict[];
  canMerge: boolean;
}

interface PatientSummary {
  id: number;
  patientId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  createdAt: string;
}

interface MergePatientModalProps {
  /** Initial source patient (will be merged into target and deleted) */
  sourcePatient: PatientSummary;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when merge is completed successfully */
  onMergeComplete: (mergedPatientId: number) => void;
  /** Optional: Pre-selected target patient */
  targetPatient?: PatientSummary;
}

// Helper to detect encrypted data
const isEncryptedData = (value: string | null | undefined): boolean => {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
};

const formatValue = (value: string | null | undefined): string => {
  if (!value) return '-';
  if (isEncryptedData(value)) return '(encrypted)';
  return value;
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  try {
    // Handle ISO date strings
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try parsing as YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
      }
      return dateStr;
    }
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

type Step = 'select' | 'preview' | 'confirm';

export default function MergePatientModal({
  sourcePatient,
  onClose,
  onMergeComplete,
  targetPatient: initialTarget,
}: MergePatientModalProps) {
  const [step, setStep] = useState<Step>(initialTarget ? 'preview' : 'select');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<PatientSummary | null>(
    initialTarget || null
  );
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  // Search for patients - Note: Name fields are encrypted, so search by patientId works best
  const searchPatients = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || trimmed.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await apiFetch(
          `/api/patients?search=${encodeURIComponent(trimmed)}&limit=20&includeContact=true`
        );
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to search patients');
        }
        const data = await response.json();
        // Filter out the source patient from results (API returns 'patients' not 'data')
        let filtered = (data.patients || []).filter(
          (p: PatientSummary) => p.id !== sourcePatient.id
        );

        // If no results, try matching decrypted names client-side from recent patients
        if (filtered.length === 0) {
          const recentResponse = await apiFetch(
            '/api/patients?limit=50&includeContact=true&recent=7d'
          );
          if (recentResponse.ok) {
            const recentData = await recentResponse.json();
            filtered = (recentData.patients || []).filter((p: PatientSummary) => {
              if (p.id === sourcePatient.id) return false;
              const fullName = `${p.firstName} ${p.lastName}`;
              const patientIdMatch = normalizedIncludes(p.patientId || '', query);
              const nameMatch =
                normalizedIncludes(fullName, query) ||
                normalizedIncludes(p.firstName || '', query) ||
                normalizedIncludes(p.lastName || '', query);
              return patientIdMatch || nameMatch;
            });
          }
        }

        setSearchResults(filtered);
      } catch (err: unknown) {
        // Don't show error for auth issues - they're handled globally
        if (!(err as { isAuthError?: boolean })?.isAuthError) {
          console.error('Search error:', err);
        }
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [sourcePatient.id]
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchPatients(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchPatients]);

  // Load preview when target is selected
  const loadPreview = useCallback(async () => {
    if (!selectedTarget) return;

    setLoadingPreview(true);
    setError('');

    try {
      const response = await apiFetch('/api/patients/merge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePatientId: sourcePatient.id,
          targetPatientId: selectedTarget.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || 'Failed to load merge preview');
      }

      const data = await response.json();
      setPreview(data.preview);
      setStep('preview');
    } catch (err: unknown) {
      // Don't show error for auth issues - they're handled globally
      if ((err as { isAuthError?: boolean })?.isAuthError) {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to load merge preview';
      setError(errorMessage);
    } finally {
      setLoadingPreview(false);
    }
  }, [sourcePatient.id, selectedTarget]);

  // Load preview when initial target is provided
  useEffect(() => {
    if (initialTarget && !preview) {
      loadPreview();
    }
  }, [initialTarget, preview, loadPreview]);

  // Execute the merge
  const executeMerge = async () => {
    if (!selectedTarget || !preview) return;

    setMerging(true);
    setError('');

    try {
      const response = await apiFetch('/api/patients/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePatientId: sourcePatient.id,
          targetPatientId: selectedTarget.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || 'Failed to merge patients');
      }

      const data = await response.json();
      onMergeComplete(data.mergedPatient.id);
    } catch (err: unknown) {
      // Don't show error for auth issues - they're handled globally
      if ((err as { isAuthError?: boolean })?.isAuthError) {
        setMerging(false);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to merge patients';
      setError(errorMessage);
      setMerging(false);
    }
  };

  // Select target step
  const renderSelectStep = () => (
    <div className="space-y-4 p-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>Merging from:</strong> {sourcePatient.firstName} {sourcePatient.lastName} (ID:{' '}
          {sourcePatient.patientId || sourcePatient.id})
        </p>
        <p className="mt-1 text-xs text-blue-600">
          This patient&apos;s records will be moved to the target patient, and this profile will be
          deleted.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Search for the patient to merge INTO:
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient ID (e.g., WEL-78887488) or name..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
            autoFocus
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="max-h-64 divide-y overflow-y-auto rounded-lg border border-gray-200">
          {searchResults.map((patient) => (
            <button
              key={patient.id}
              onClick={() => setSelectedTarget(patient)}
              className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50 ${
                selectedTarget?.id === patient.id
                  ? 'border-l-4 border-[#4fa77e] bg-[#4fa77e]/10'
                  : ''
              }`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#4fa77e]/20">
                <span className="text-sm font-medium text-[#4fa77e]">
                  {patient.firstName[0]}
                  {patient.lastName[0]}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="truncate text-sm text-gray-500">
                  {formatValue(patient.email)} | ID: {formatPatientDisplayId(patient.patientId, patient.id)}
                </p>
              </div>
              {selectedTarget?.id === patient.id && (
                <Check className="h-5 w-5 flex-shrink-0 text-[#4fa77e]" />
              )}
            </button>
          ))}
        </div>
      )}

      {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
        <p className="py-4 text-center text-gray-500">No patients found</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );

  // Preview step
  const renderPreviewStep = () => {
    if (!preview) return null;

    const { source, target, mergedProfile, totalRecordsToMove, conflicts, canMerge } = preview;

    // Group relation counts for display
    const relationGroups = [
      {
        name: 'Clinical',
        items: [
          { label: 'SOAP Notes', count: source._counts.soapNotes },
          { label: 'Documents', count: source._counts.documents },
          { label: 'Intake Submissions', count: source._counts.intakeSubmissions },
          { label: 'Appointments', count: source._counts.appointments },
          { label: 'Care Plans', count: source._counts.carePlans },
        ],
      },
      {
        name: 'Financial',
        items: [
          { label: 'Orders', count: source._counts.orders },
          { label: 'Invoices', count: source._counts.invoices },
          { label: 'Payments', count: source._counts.payments },
          { label: 'Subscriptions', count: source._counts.subscriptions },
        ],
      },
      {
        name: 'Progress Tracking',
        items: [
          { label: 'Weight Logs', count: source._counts.weightLogs },
          { label: 'Medication Reminders', count: source._counts.medicationReminders },
          { label: 'Exercise Logs', count: source._counts.exerciseLogs },
          { label: 'Sleep Logs', count: source._counts.sleepLogs },
        ],
      },
    ];

    return (
      <div className="max-h-[60vh] space-y-6 overflow-y-auto p-6">
        {/* Conflicts/Warnings */}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            {conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                  conflict.type === 'error'
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : 'border border-yellow-200 bg-yellow-50 text-yellow-800'
                }`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{conflict.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Side by side comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Source (will be deleted) */}
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <User className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {source.firstName} {source.lastName}
                </p>
                <p className="text-xs text-red-600">Will be deleted</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">ID:</span> {source.patientId || source.id}
              </p>
              <p>
                <span className="text-gray-500">Email:</span> {formatValue(source.email)}
              </p>
              <p>
                <span className="text-gray-500">Phone:</span> {formatValue(source.phone)}
              </p>
              <p>
                <span className="text-gray-500">DOB:</span> {formatDate(source.dob)}
              </p>
              <p>
                <span className="text-gray-500">Created:</span> {formatDate(source.createdAt)}
              </p>
            </div>
          </div>

          {/* Target (will be kept) */}
          <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <User className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {target.firstName} {target.lastName}
                </p>
                <p className="text-xs text-green-600">Will be kept</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">ID:</span> {target.patientId || target.id}
              </p>
              <p>
                <span className="text-gray-500">Email:</span> {formatValue(target.email)}
              </p>
              <p>
                <span className="text-gray-500">Phone:</span> {formatValue(target.phone)}
              </p>
              <p>
                <span className="text-gray-500">DOB:</span> {formatDate(target.dob)}
              </p>
              <p>
                <span className="text-gray-500">Created:</span> {formatDate(target.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Arrow showing merge direction */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
            <span className="text-sm text-gray-600">Merging</span>
            <ArrowRight className="h-4 w-4 text-gray-600" />
          </div>
        </div>

        {/* Merged result preview */}
        <div className="rounded-lg border border-[#4fa77e] bg-[#4fa77e]/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4fa77e]">
              <GitMerge className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Merged Result</p>
              <p className="text-xs text-[#4fa77e]">Combined profile data</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p>
                <span className="text-gray-500">Name:</span> {mergedProfile.firstName}{' '}
                {mergedProfile.lastName}
              </p>
              <p>
                <span className="text-gray-500">Email:</span> {formatValue(mergedProfile.email)}
              </p>
              <p>
                <span className="text-gray-500">Phone:</span> {formatValue(mergedProfile.phone)}
              </p>
            </div>
            <div className="space-y-2">
              <p>
                <span className="text-gray-500">DOB:</span> {formatDate(mergedProfile.dob)}
              </p>
              <p>
                <span className="text-gray-500">Address:</span> {mergedProfile.city},{' '}
                {mergedProfile.state}
              </p>
            </div>
          </div>
        </div>

        {/* Records to be moved */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h4 className="mb-3 font-medium text-gray-900">
            Records to be moved ({totalRecordsToMove} total)
          </h4>
          <div className="grid grid-cols-3 gap-4">
            {relationGroups.map((group) => (
              <div key={group.name}>
                <h5 className="mb-2 text-sm font-medium text-gray-700">{group.name}</h5>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.label} className="flex justify-between text-sm text-gray-600">
                      <span>{item.label}</span>
                      <span
                        className={item.count > 0 ? 'font-medium text-[#4fa77e]' : 'text-gray-400'}
                      >
                        {item.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!canMerge && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <strong>Cannot merge:</strong> Please resolve the errors above before proceeding.
          </div>
        )}
      </div>
    );
  };

  // Confirm step
  const renderConfirmStep = () => (
    <div className="space-y-4 p-6">
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <p className="font-medium text-yellow-800">This action cannot be undone</p>
            <p className="mt-1 text-sm text-yellow-700">
              All records from{' '}
              <strong>
                {sourcePatient.firstName} {sourcePatient.lastName}
              </strong>{' '}
              will be permanently moved to{' '}
              <strong>
                {selectedTarget?.firstName} {selectedTarget?.lastName}
              </strong>
              , and the source patient profile will be deleted.
            </p>
          </div>
        </div>
      </div>

      {preview && (
        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            <strong>{preview.totalRecordsToMove}</strong> records will be moved, including orders,
            invoices, documents, intake data, and more.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4fa77e]/10">
              <GitMerge className="h-5 w-5 text-[#4fa77e]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Merge Patient Profiles</h2>
              <p className="text-sm text-gray-500">
                {step === 'select' && 'Select the patient to merge into'}
                {step === 'preview' && 'Review merge preview'}
                {step === 'confirm' && 'Confirm merge'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            disabled={merging}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {step === 'select' && renderSelectStep()}
          {step === 'preview' &&
            (loadingPreview ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#4fa77e]" />
                <span className="ml-3 text-gray-600">Loading merge preview...</span>
              </div>
            ) : (
              renderPreviewStep()
            ))}
          {step === 'confirm' && renderConfirmStep()}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 justify-between gap-3 rounded-b-2xl border-t bg-gray-50 p-6">
          <div>
            {step !== 'select' && (
              <button
                type="button"
                onClick={() => setStep(step === 'confirm' ? 'preview' : 'select')}
                className="px-4 py-2 text-gray-700 transition-colors hover:text-gray-900"
                disabled={merging}
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100"
              disabled={merging}
            >
              Cancel
            </button>

            {step === 'select' && (
              <button
                type="button"
                onClick={loadPreview}
                disabled={!selectedTarget || loadingPreview}
                className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingPreview ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Preview Merge
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}

            {step === 'preview' && preview?.canMerge && (
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {step === 'confirm' && (
              <button
                type="button"
                onClick={executeMerge}
                disabled={merging}
                className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:opacity-50"
              >
                {merging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="h-4 w-4" />
                    Merge Patients
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
