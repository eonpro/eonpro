'use client';

/**
 * New Ticket Page
 * ===============
 *
 * Create a new support ticket with all required fields.
 *
 * @module app/(dashboard)/tickets/new
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft as ArrowLeftIcon, AlertTriangle as ExclamationTriangleIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import TemplateSelector from '@/components/tickets/TemplateSelector';

// Types
interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  patientId?: string;
}

// Constants
const CATEGORIES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'PATIENT_ISSUE', label: 'Patient Issue' },
  { value: 'PATIENT_COMPLAINT', label: 'Patient Complaint' },
  { value: 'ORDER_ISSUE', label: 'Order Issue' },
  { value: 'SHIPPING_ISSUE', label: 'Shipping Issue' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'BILLING_ISSUE', label: 'Billing Issue' },
  { value: 'REFUND_REQUEST', label: 'Refund Request' },
  { value: 'PRESCRIPTION', label: 'Prescription' },
  { value: 'PRESCRIPTION_ISSUE', label: 'Prescription Issue' },
  { value: 'MEDICATION_QUESTION', label: 'Medication Question' },
  { value: 'SIDE_EFFECTS', label: 'Side Effects' },
  { value: 'DOSAGE', label: 'Dosage' },
  { value: 'REFILL', label: 'Refill' },
  { value: 'PROVIDER_INQUIRY', label: 'Provider Inquiry' },
  { value: 'CLINICAL_QUESTION', label: 'Clinical Question' },
  { value: 'APPOINTMENT', label: 'Appointment' },
  { value: 'SCHEDULING_ISSUE', label: 'Scheduling Issue' },
  { value: 'TECHNICAL_ISSUE', label: 'Technical Issue' },
  { value: 'SYSTEM_BUG', label: 'System Bug' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'ACCESS_ISSUE', label: 'Access Issue' },
  { value: 'PORTAL_ACCESS', label: 'Portal Access' },
  { value: 'COMPLIANCE_ISSUE', label: 'Compliance Issue' },
  { value: 'DATA_CORRECTION', label: 'Data Correction' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'FEEDBACK', label: 'Feedback' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITIES = [
  { value: 'P0_CRITICAL', label: 'Critical - System down, emergency', color: 'bg-red-600' },
  { value: 'P1_URGENT', label: 'Urgent - Blocking issue', color: 'bg-red-500' },
  { value: 'P2_HIGH', label: 'High - Major impact', color: 'bg-orange-500' },
  { value: 'P3_MEDIUM', label: 'Medium - Moderate impact', color: 'bg-yellow-500' },
  { value: 'P4_LOW', label: 'Low - Minor issue', color: 'bg-blue-500' },
  { value: 'P5_PLANNING', label: 'Planning - Enhancement request', color: 'bg-gray-500' },
];

const SOURCES = [
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'PHONE', label: 'Phone Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PATIENT_PORTAL', label: 'Patient Portal' },
  { value: 'CHAT', label: 'Live Chat' },
  { value: 'FORM', label: 'Web Form' },
];

export default function NewTicketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from query params
  const prefilledPatientId = searchParams.get('patientId');
  const prefilledOrderId = searchParams.get('orderId');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'GENERAL',
    priority: 'P3_MEDIUM',
    source: 'INTERNAL',
    assignedToId: '',
    patientId: prefilledPatientId || '',
    orderId: prefilledOrderId || '',
    dueDate: '',
    tags: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');

  // Fetch users for assignment dropdown (clinic-scoped so assignees are from current clinic only)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const activeClinicId = typeof window !== 'undefined' ? localStorage.getItem('activeClinicId') : null;
        const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        let clinicId = activeClinicId;
        if (!clinicId && userJson) {
          try {
            const u = JSON.parse(userJson);
            if (u.clinicId != null) clinicId = String(u.clinicId);
          } catch {
            // ignore
          }
        }
        const params = new URLSearchParams({ limit: '100' });
        if (clinicId) params.set('clinicId', clinicId);
        ['staff', 'admin', 'provider', 'support'].forEach((r) => params.append('role', r));
        const response = await apiFetch(`/api/users?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

  // Search patients
  useEffect(() => {
    if (!patientSearch || patientSearch.length < 2) {
      setPatients([]);
      return;
    }

    const searchPatients = async () => {
      try {
        const response = await apiFetch(
          `/api/patients?search=${encodeURIComponent(patientSearch)}&limit=10`
        );
        if (response.ok) {
          const data = await response.json();
          setPatients(data.patients || []);
        }
      } catch (err) {
        console.error('Failed to search patients:', err);
      }
    };

    const debounce = setTimeout(searchPatients, 300);
    return () => clearTimeout(debounce);
  }, [patientSearch]);

  // Handle form change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        source: formData.source,
        assignedToId: formData.assignedToId ? parseInt(formData.assignedToId, 10) : undefined,
        patientId: formData.patientId ? parseInt(formData.patientId, 10) : undefined,
        orderId: formData.orderId ? parseInt(formData.orderId, 10) : undefined,
        dueDate: formData.dueDate || undefined,
        tags: formData.tags
          ? formData.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      };

      const response = await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create ticket');
      }

      const data = await response.json();
      window.location.href = `/tickets/${data.ticket.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
          <button
            onClick={() => { window.location.href = '/tickets'; }}
            className="rounded-lg p-1 hover:bg-gray-100"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
          </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Ticket</h1>
          <p className="text-sm text-gray-500">Create a new support ticket</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-800">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Template Selector */}
      <TemplateSelector
        onSelect={(template) => {
          setFormData((prev) => ({
            ...prev,
            title: template.title,
            description: template.description,
            category: template.category,
            priority: template.priority,
            tags: template.tags.join(', '),
            assignedToId: template.assignedToId ? String(template.assignedToId) : '',
          }));
        }}
      />

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="Brief description of the issue"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              rows={5}
              placeholder="Detailed description of the issue, steps to reproduce, expected behavior, etc."
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Category & Priority */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">
                Category
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="priority" className="mb-1 block text-sm font-medium text-gray-700">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Source & Assignee */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="source" className="mb-1 block text-sm font-medium text-gray-700">
                Source
              </label>
              <select
                id="source"
                name="source"
                value={formData.source}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="assignedToId"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Assign To
              </label>
              <select
                id="assignedToId"
                name="assignedToId"
                value={formData.assignedToId}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Patient */}
          <div>
            <label htmlFor="patientSearch" className="mb-1 block text-sm font-medium text-gray-700">
              Related Patient
            </label>
            <div className="relative">
              <input
                type="text"
                id="patientSearch"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search by patient name..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {patients.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, patientId: String(patient.id) }));
                        setPatientSearch(`${patient.firstName} ${patient.lastName}`);
                        setPatients([]);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {patient.firstName} {patient.lastName}
                      <span className="text-gray-400"> ({formatPatientDisplayId(patient.patientId, patient.id)})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {formData.patientId && (
              <p className="mt-1 text-sm text-green-600">
                Patient selected (ID: {formData.patientId})
              </p>
            )}
          </div>

          {/* Due Date & Tags */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="dueDate" className="mb-1 block text-sm font-medium text-gray-700">
                Due Date
              </label>
              <input
                type="datetime-local"
                id="dueDate"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="tags" className="mb-1 block text-sm font-medium text-gray-700">
                Tags
              </label>
              <input
                type="text"
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                placeholder="urgent, billing, follow-up (comma separated)"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { window.location.href = '/tickets'; }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}
