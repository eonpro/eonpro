'use client';

import { useState } from 'react';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';

// Helper to detect encrypted data
const isEncryptedData = (value: string | null | undefined): boolean => {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
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

export default function DeletePatientModal({ patient, onClose, onDelete }: DeletePatientModalProps) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Delete Patient</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={deleting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action cannot be undone. This will permanently delete the patient record for:
            </p>
            <div className="mt-3 p-3 bg-white rounded border border-red-200">
              <p className="font-semibold text-gray-900">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="text-sm text-gray-500">{formatEmail(patient.email)}</p>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-2">
              All associated data will be deleted, including:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>Medical intake forms and documents</li>
              <li>Prescriptions and orders</li>
              <li>SOAP notes and medical records</li>
              <li>Appointments and communications</li>
              <li>Billing and payment information</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type <span className="font-bold text-red-600">DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              disabled={deleting}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete Patient
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
