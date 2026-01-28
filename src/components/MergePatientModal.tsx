'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, GitMerge, Loader2, AlertTriangle, Check, ArrowRight, Search, User } from 'lucide-react';

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
  return parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
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
  const [selectedTarget, setSelectedTarget] = useState<PatientSummary | null>(initialTarget || null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  // Search for patients
  const searchPatients = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10`);
      if (!response.ok) throw new Error('Failed to search patients');
      const data = await response.json();
      // Filter out the source patient from results
      const filtered = (data.data || []).filter((p: PatientSummary) => p.id !== sourcePatient.id);
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [sourcePatient.id]);

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
      const response = await fetch('/api/patients/merge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePatientId: sourcePatient.id,
          targetPatientId: selectedTarget.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to load merge preview');
      }

      const data = await response.json();
      setPreview(data.preview);
      setStep('preview');
    } catch (err: unknown) {
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
      const response = await fetch('/api/patients/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePatientId: sourcePatient.id,
          targetPatientId: selectedTarget.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to merge patients');
      }

      const data = await response.json();
      onMergeComplete(data.mergedPatient.id);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to merge patients';
      setError(errorMessage);
      setMerging(false);
    }
  };

  // Select target step
  const renderSelectStep = () => (
    <div className="p-6 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Merging from:</strong> {sourcePatient.firstName} {sourcePatient.lastName} (ID: {sourcePatient.patientId || sourcePatient.id})
        </p>
        <p className="text-xs text-blue-600 mt-1">
          This patient&apos;s records will be moved to the target patient, and this profile will be deleted.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search for the patient to merge INTO:
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or patient ID..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
            autoFocus
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
          {searchResults.map((patient) => (
            <button
              key={patient.id}
              onClick={() => setSelectedTarget(patient)}
              className={`w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                selectedTarget?.id === patient.id ? 'bg-[#4fa77e]/10 border-l-4 border-[#4fa77e]' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[#4fa77e]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-[#4fa77e]">
                  {patient.firstName[0]}{patient.lastName[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {formatValue(patient.email)} | ID: {patient.patientId || patient.id}
                </p>
              </div>
              {selectedTarget?.id === patient.id && (
                <Check className="w-5 h-5 text-[#4fa77e] flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
        <p className="text-center text-gray-500 py-4">No patients found</p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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
      <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Conflicts/Warnings */}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            {conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                  conflict.type === 'error'
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                }`}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{conflict.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Side by side comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Source (will be deleted) */}
          <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <User className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{source.firstName} {source.lastName}</p>
                <p className="text-xs text-red-600">Will be deleted</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">ID:</span> {source.patientId || source.id}</p>
              <p><span className="text-gray-500">Email:</span> {formatValue(source.email)}</p>
              <p><span className="text-gray-500">Phone:</span> {formatValue(source.phone)}</p>
              <p><span className="text-gray-500">DOB:</span> {formatDate(source.dob)}</p>
              <p><span className="text-gray-500">Created:</span> {formatDate(source.createdAt)}</p>
            </div>
          </div>

          {/* Target (will be kept) */}
          <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <User className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{target.firstName} {target.lastName}</p>
                <p className="text-xs text-green-600">Will be kept</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">ID:</span> {target.patientId || target.id}</p>
              <p><span className="text-gray-500">Email:</span> {formatValue(target.email)}</p>
              <p><span className="text-gray-500">Phone:</span> {formatValue(target.phone)}</p>
              <p><span className="text-gray-500">DOB:</span> {formatDate(target.dob)}</p>
              <p><span className="text-gray-500">Created:</span> {formatDate(target.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Arrow showing merge direction */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
            <span className="text-sm text-gray-600">Merging</span>
            <ArrowRight className="w-4 h-4 text-gray-600" />
          </div>
        </div>

        {/* Merged result preview */}
        <div className="border border-[#4fa77e] rounded-lg p-4 bg-[#4fa77e]/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#4fa77e] flex items-center justify-center">
              <GitMerge className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Merged Result</p>
              <p className="text-xs text-[#4fa77e]">Combined profile data</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p><span className="text-gray-500">Name:</span> {mergedProfile.firstName} {mergedProfile.lastName}</p>
              <p><span className="text-gray-500">Email:</span> {formatValue(mergedProfile.email)}</p>
              <p><span className="text-gray-500">Phone:</span> {formatValue(mergedProfile.phone)}</p>
            </div>
            <div className="space-y-2">
              <p><span className="text-gray-500">DOB:</span> {formatDate(mergedProfile.dob)}</p>
              <p><span className="text-gray-500">Address:</span> {mergedProfile.city}, {mergedProfile.state}</p>
            </div>
          </div>
        </div>

        {/* Records to be moved */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">
            Records to be moved ({totalRecordsToMove} total)
          </h4>
          <div className="grid grid-cols-3 gap-4">
            {relationGroups.map((group) => (
              <div key={group.name}>
                <h5 className="text-sm font-medium text-gray-700 mb-2">{group.name}</h5>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.label} className="text-sm text-gray-600 flex justify-between">
                      <span>{item.label}</span>
                      <span className={item.count > 0 ? 'text-[#4fa77e] font-medium' : 'text-gray-400'}>
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {!canMerge && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <strong>Cannot merge:</strong> Please resolve the errors above before proceeding.
          </div>
        )}
      </div>
    );
  };

  // Confirm step
  const renderConfirmStep = () => (
    <div className="p-6 space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">This action cannot be undone</p>
            <p className="text-sm text-yellow-700 mt-1">
              All records from <strong>{sourcePatient.firstName} {sourcePatient.lastName}</strong> will be 
              permanently moved to <strong>{selectedTarget?.firstName} {selectedTarget?.lastName}</strong>, 
              and the source patient profile will be deleted.
            </p>
          </div>
        </div>
      </div>

      {preview && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600">
            <strong>{preview.totalRecordsToMove}</strong> records will be moved, including orders, 
            invoices, documents, intake data, and more.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#4fa77e]/10 flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-[#4fa77e]" />
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
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={merging}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {step === 'select' && renderSelectStep()}
          {step === 'preview' && (loadingPreview ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 text-[#4fa77e] animate-spin" />
              <span className="ml-3 text-gray-600">Loading merge preview...</span>
            </div>
          ) : renderPreviewStep())}
          {step === 'confirm' && renderConfirmStep()}
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-3 p-6 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <div>
            {step !== 'select' && (
              <button
                type="button"
                onClick={() => setStep(step === 'confirm' ? 'preview' : 'select')}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
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
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              disabled={merging}
            >
              Cancel
            </button>

            {step === 'select' && (
              <button
                type="button"
                onClick={loadPreview}
                disabled={!selectedTarget || loadingPreview}
                className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Preview Merge
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {step === 'preview' && preview?.canMerge && (
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 'confirm' && (
              <button
                type="button"
                onClick={executeMerge}
                disabled={merging}
                className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors disabled:opacity-50"
              >
                {merging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="w-4 h-4" />
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
