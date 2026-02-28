'use client';

/**
 * Patient Portal - New Support Request
 */

import { useState } from 'react';
import { ArrowLeft, Send, Loader2, AlertTriangle } from 'lucide-react';
import { portalFetch } from '@/lib/api/patient-portal-client';

const CATEGORIES = [
  { value: 'GENERAL', label: 'General Question' },
  { value: 'BILLING', label: 'Billing & Payments' },
  { value: 'PRESCRIPTION', label: 'Prescriptions & Medications' },
  { value: 'APPOINTMENT', label: 'Appointments' },
  { value: 'PORTAL_ACCESS', label: 'Portal Access Issues' },
  { value: 'OTHER', label: 'Other' },
];

export default function NewSupportRequestPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please fill in both the subject and description');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await portalFetch('/api/patient-portal/tickets', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), description: description.trim(), category }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit request');
      }

      const data = await res.json();
      window.location.href = `/patient-portal/support/${data.ticket.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <a href="/patient-portal/support" className="rounded-lg p-1 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </a>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Support Request</h1>
          <p className="text-sm text-gray-500">Describe your issue and we will get back to you</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">Subject</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setError(null); }}
            placeholder="Brief summary of your issue"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setError(null); }}
            placeholder="Please describe your issue in detail. Include any relevant information such as order numbers, medication names, or error messages."
            required
            rows={6}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end gap-3">
          <a
            href="/patient-portal/support"
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Request
          </button>
        </div>
      </form>
    </div>
  );
}
