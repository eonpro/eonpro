'use client';

import { useState } from 'react';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';

// Helper to detect encrypted data
const isEncryptedData = (value: string | null | undefined): boolean => {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
};

const formatEmail = (email: string | null | undefined): string => {
  if (!email) return '-';
  if (isEncryptedData(email)) return '(encrypted)';
  return email;
};

interface DeletePatientModalProps {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
  onClose: () => void;
  onDelete: () => Promise<void>;
}

export default function DeletePatientModal({
  patient,
  onClose,
  onDelete,
}: DeletePatientModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const expectedText = 'DELETE';
  const canDelete = confirmText === expectedText;

  const handleDelete = async () => {
    if (!canDelete) return;

    setError('');
    setDeleting(true);

    try {
      await onDelete();
      // Redirect will happen after successful deletion
    } catch (err: any) {
      setError(err.message || 'Failed to delete patient');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Delete Patient</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            disabled={deleting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action cannot be undone. This will permanently delete
              the patient record for:
            </p>
            <div className="mt-3 rounded border border-red-200 bg-white p-3">
              <p className="font-semibold text-gray-900">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="text-sm text-gray-500">{formatEmail(patient.email)}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-gray-600">
              All associated data will be deleted, including:
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
              <li>Medical intake forms and documents</li>
              <li>Prescriptions and orders</li>
              <li>SOAP notes and medical records</li>
              <li>Appointments and communications</li>
              <li>Billing and payment information</li>
            </ul>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Type <span className="font-bold text-red-600">DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="Type DELETE"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500"
              disabled={deleting}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 rounded-b-2xl border-t bg-gray-50 p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete Patient
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
