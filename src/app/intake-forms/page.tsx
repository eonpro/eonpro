'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

// Icons
const CheckIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const LoadingSpinner = () => (
  <div className="inline-flex items-center">
    <svg
      className="h-5 w-5 animate-spin text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  </div>
);

interface FormTemplate {
  id: number;
  name: string;
  description?: string;
  treatmentType: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    submissions: number;
  };
  questions: any[];
}

interface Notification {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export default function IntakeFormsPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'create' | 'send' | null>(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // New template form state
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    treatmentType: 'general',
    questions: [
      {
        questionText: '',
        questionType: 'text',
        isRequired: false,
        orderIndex: 0,
        section: 'General Information',
      },
    ],
  });

  // Send link form state
  const [sendLinkForm, setSendLinkForm] = useState({
    templateId: 0,
    patientEmail: '',
    patientPhone: '',
    sendMethod: 'email',
  });

  // Notification system
  const showNotification = (
    type: 'success' | 'error' | 'warning' | 'info',
    message: string,
    duration = 5000
  ) => {
    const id = Date.now();
    const notification: Notification = { id, type, message, duration };
    setNotifications((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n: any) => n.id !== id));
      }, duration);
    }
  };

  const removeNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n: any) => n.id !== id));
  };

  // Authentication check
  useEffect(() => {
    const checkAuthAndFetch = async () => {
      // Check multiple possible token locations
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token');

      if (token) {
        await fetchTemplates();
      } else {
        setError('Please log in to view intake forms');
        setLoading(false);
      }
    };

    checkAuthAndFetch();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check multiple possible token locations
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token');

      if (!token) {
        setError('Please log in to view intake forms');
        setTemplates([]);
        return;
      }

      const res = await apiFetch('/api/intake-forms/templates', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 401) {
        // Token expired, try to refresh
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setError('Your session has expired. Please log in again.');
        setTemplates([]);
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch templates`);
      }

      const data = await res.json();
      setTemplates(data.templates || []);
      setError(null);
    } catch (err: any) {
      logger.error('Failed to fetch templates', err);
      showNotification('error', err.message || 'Failed to load intake forms');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    setNewTemplate((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          questionText: '',
          questionType: 'text',
          isRequired: false,
          orderIndex: prev.questions.length,
          section: 'General Information',
        },
      ],
    }));
  };

  const removeQuestion = (index: number) => {
    setNewTemplate((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    setNewTemplate((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    }));
  };

  const validateForm = () => {
    if (!newTemplate.name.trim()) {
      showNotification('error', 'Please enter a form name');
      return false;
    }

    if (!newTemplate.treatmentType) {
      showNotification('error', 'Please select a treatment type');
      return false;
    }

    const validQuestions = newTemplate.questions.filter((q: any) => q.questionText.trim());
    if (validQuestions.length === 0) {
      showNotification('error', 'Please add at least one question');
      return false;
    }

    return true;
  };

  const handleCreateForm = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setCreatingForm(true);
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token');

      if (!token) {
        showNotification('error', 'Please log in to create forms');
        return;
      }

      // Filter out empty questions
      const validQuestions = newTemplate.questions.filter((q: any) => q.questionText.trim());

      const res = await apiFetch('/api/intake-forms/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newTemplate,
          questions: validQuestions.map((q, idx) => ({
            ...q,
            orderIndex: idx,
          })),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create form');
      }

      const data = await res.json();
      showNotification('success', 'Form created successfully!');

      // Reset form
      setNewTemplate({
        name: '',
        description: '',
        treatmentType: 'general',
        questions: [
          {
            questionText: '',
            questionType: 'text',
            isRequired: false,
            orderIndex: 0,
            section: 'General Information',
          },
        ],
      });

      // Close modal and refresh
      setActiveModal(null);
      await fetchTemplates();
    } catch (err: any) {
      logger.error('Failed to create form', err);
      showNotification('error', err.message || 'Failed to create form');
    } finally {
      setCreatingForm(false);
    }
  };

  const handleSendLink = async () => {
    if (!sendLinkForm.patientEmail || !sendLinkForm.templateId) {
      showNotification('error', 'Please provide patient email and select a form');
      return;
    }

    try {
      setSendingLink(true);
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token');

      const res = await apiFetch('/api/intake-forms/send-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendLinkForm),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send link');
      }

      const data = await res.json();
      showNotification('success', `Form link sent to ${sendLinkForm.patientEmail}`);

      // Copy link to clipboard if available
      if (data.link) {
        navigator.clipboard.writeText(data.link);
        showNotification('info', 'Link copied to clipboard');
      }

      // Reset and close
      setSendLinkForm({
        templateId: 0,
        patientEmail: '',
        patientPhone: '',
        sendMethod: 'email',
      });
      setActiveModal(null);
    } catch (err: any) {
      logger.error('Failed to send link', err);
      showNotification('error', err.message || 'Failed to send link');
    } finally {
      setSendingLink(false);
    }
  };

  // Filtered templates based on search and filter
  const filteredTemplates = templates.filter((template: any) => {
    const matchesSearch =
      normalizedIncludes(template.name || '', searchQuery) ||
      normalizedIncludes(template.description || '', searchQuery);

    const matchesFilter = filterType === 'all' || template.treatmentType === filterType;

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading intake forms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      {/* Notifications */}
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {notifications.map((notification: any) => (
          <div
            key={notification.id}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${notification.type === 'success' ? 'bg-green-100 text-green-800' : ''} ${notification.type === 'error' ? 'bg-red-100 text-red-800' : ''} ${notification.type === 'warning' ? 'bg-yellow-100 text-yellow-800' : ''} ${notification.type === 'info' ? 'bg-blue-100 text-blue-800' : ''} animate-slide-in-right`}
          >
            {notification.type === 'success' && <CheckIcon />}
            {notification.type === 'error' && <XIcon />}
            <span className="flex-1">{notification.message}</span>
            <button
              onClick={() => removeNotification(notification.id)}
              className="hover:opacity-70"
            >
              <XIcon />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Intake Forms</h1>
          <p className="mt-1 text-gray-600">Create and manage patient intake forms</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/intake-forms/wizard')}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Form Wizard
          </button>
          <button
            onClick={() => setActiveModal('create')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Quick Create
          </button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex gap-4 rounded-lg bg-white p-4 shadow">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search forms..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <svg
            className="absolute left-3 top-3 h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <select
          value={filterType}
          onChange={(e: any) => setFilterType(e.target.value)}
          className="rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">All Types</option>
          <option value="general">General</option>
          <option value="weight-loss">Weight Loss</option>
          <option value="hormone">Hormone Therapy</option>
          <option value="aesthetic">Aesthetic</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="font-medium text-red-900">Error loading forms</h3>
              <p className="mt-1 text-red-700">{error}</p>
              <button
                onClick={fetchTemplates}
                className="mt-3 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forms Grid */}
      {!error && (
        <div className="grid gap-4">
          {filteredTemplates.length === 0 ? (
            <div className="rounded-lg bg-gray-50 py-12 text-center">
              <svg
                className="mx-auto mb-4 h-16 w-16 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900">No intake forms found</h3>
              <p className="mt-2 text-gray-600">
                {searchQuery || filterType !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Create your first form to start collecting patient information'}
              </p>
              {!searchQuery && filterType === 'all' && (
                <button
                  onClick={() => setActiveModal('create')}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Create Your First Form
                </button>
              )}
            </div>
          ) : (
            filteredTemplates.map((template: any) => (
              <div
                key={template.id}
                className="rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{template.name}</h3>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          template.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {template.description && (
                      <p className="mt-1 text-gray-600">{template.description}</p>
                    )}
                    <div className="mt-3 flex gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                          />
                        </svg>
                        {template.treatmentType}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        {template.questions.length} questions
                      </span>
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        {template._count.submissions} submissions
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => {
                        setSendLinkForm((prev) => ({ ...prev, templateId: template.id }));
                        setActiveModal('send');
                      }}
                      className="rounded bg-green-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-green-700"
                    >
                      Send to Patient
                    </button>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/intake/preview/${template.id}`;
                        window.open(url, '_blank');
                      }}
                      className="rounded bg-gray-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-700"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => {
                        window.location.href = `/intake-forms/${template.id}/edit`;
                      }}
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Form Modal */}
      {activeModal === 'create' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50">
          <div className="m-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-xl font-bold">Create Intake Form</h2>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XIcon />
              </button>
            </div>
            <div className="space-y-4 p-6">
              {/* Form Name */}
              <div>
                <label className="mb-1 block text-sm font-medium">Form Name *</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e: any) =>
                    setNewTemplate((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Weight Loss Intake Form"
                  className="w-full rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <textarea
                  value={newTemplate.description}
                  onChange={(e: any) =>
                    setNewTemplate((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Brief description of the form"
                  rows={2}
                  className="w-full rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Treatment Type */}
              <div>
                <label className="mb-1 block text-sm font-medium">Treatment Type *</label>
                <select
                  value={newTemplate.treatmentType}
                  onChange={(e: any) =>
                    setNewTemplate((prev) => ({ ...prev, treatmentType: e.target.value }))
                  }
                  className="w-full rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="general">General</option>
                  <option value="weight-loss">Weight Loss</option>
                  <option value="hormone">Hormone Therapy</option>
                  <option value="aesthetic">Aesthetic</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Questions */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm font-medium">Questions</label>
                  <button
                    onClick={addQuestion}
                    className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                  >
                    Add Question
                  </button>
                </div>
                <div className="space-y-3">
                  {newTemplate.questions.map((question, index) => (
                    <div key={index} className="space-y-3 rounded-lg bg-gray-50 p-4">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={question.questionText}
                            onChange={(e: any) =>
                              updateQuestion(index, 'questionText', e.target.value)
                            }
                            placeholder="Enter your question"
                            className="w-full rounded border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        {newTemplate.questions.length > 1 && (
                          <button
                            onClick={() => removeQuestion(index)}
                            className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            <XIcon />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={question.questionType}
                          onChange={(e: any) =>
                            updateQuestion(index, 'questionType', e.target.value)
                          }
                          className="rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="text">Short Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="select">Dropdown</option>
                          <option value="radio">Radio Buttons</option>
                          <option value="checkbox">Checkboxes</option>
                          <option value="date">Date</option>
                          <option value="number">Number</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                        </select>
                        <input
                          type="text"
                          value={question.section}
                          onChange={(e: any) => updateQuestion(index, 'section', e.target.value)}
                          placeholder="Section"
                          className="rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={question.isRequired}
                            onChange={(e: any) =>
                              updateQuestion(index, 'isRequired', e.target.checked)
                            }
                            className="rounded focus:ring-green-500"
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-6 py-4">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateForm}
                disabled={creatingForm}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {creatingForm ? (
                  <>
                    <LoadingSpinner />
                    Creating...
                  </>
                ) : (
                  'Create Form'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Link Modal */}
      {activeModal === 'send' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50">
          <div className="m-4 w-full max-w-md rounded-lg bg-white">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-xl font-bold">Send Intake Form</h2>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XIcon />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium">Patient Email *</label>
                <input
                  type="email"
                  value={sendLinkForm.patientEmail}
                  onChange={(e: any) =>
                    setSendLinkForm((prev) => ({ ...prev, patientEmail: e.target.value }))
                  }
                  placeholder="patient@example.com"
                  className="w-full rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Patient Phone (Optional)</label>
                <input
                  type="tel"
                  value={sendLinkForm.patientPhone}
                  onChange={(e: any) =>
                    setSendLinkForm((prev) => ({ ...prev, patientPhone: e.target.value }))
                  }
                  placeholder="555-1234"
                  className="w-full rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Send Via</label>
                <select
                  value={sendLinkForm.sendMethod}
                  onChange={(e: any) =>
                    setSendLinkForm((prev) => ({ ...prev, sendMethod: e.target.value }))
                  }
                  className="w-full rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="email">Email Only</option>
                  <option value="sms">SMS Only</option>
                  <option value="both">Email & SMS</option>
                  <option value="none">Don't Send (Copy Link Only)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSendLink}
                disabled={sendingLink}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {sendingLink ? (
                  <>
                    <LoadingSpinner />
                    Sending...
                  </>
                ) : (
                  'Send Link'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add animation styles
const styles = `
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.3s ease-out;
}
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
