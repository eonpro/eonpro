'use client';

import { useState, useEffect, use } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

interface FormQuestion {
  id: number;
  questionText: string;
  questionType: string;
  options?: any;
  isRequired: boolean;
  placeholder?: string;
  helpText?: string;
  section?: string;
  orderIndex: number;
}

interface FormTemplate {
  id: number;
  name: string;
  description?: string;
  treatmentType: string;
  questions: FormQuestion[];
}

export default function PreviewIntakeFormPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const templateId = Number(resolvedParams.id);
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (templateId && !isNaN(templateId)) {
      fetchTemplate(templateId);
    }
  }, [templateId]);

  const fetchTemplate = async (id: number) => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/intake-forms/templates/${id}`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          throw new Error('Your session has expired. Please log in again.');
        } else if (res.status === 403) {
          throw new Error('You do not have permission to view this form.');
        } else if (res.status === 404) {
          throw new Error('Form template not found.');
        } else {
          throw new Error(errorData.error || 'Failed to fetch template');
        }
      }

      const data = await res.json();
      setTemplate(data.template);
    } catch (err: any) {
      logger.error('Failed to fetch template', err);
      setError(err.message || 'Failed to load form template');
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (questionId: number, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const renderQuestion = (question: FormQuestion) => {
    const value = responses[question.id] || '';

    switch (question.questionType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'date':
        return (
          <input
            type={question.questionType === 'text' ? 'text' : question.questionType}
            value={value}
            onChange={(e: any) => handleResponseChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="w-full rounded border border-gray-300 p-2"
            required={question.isRequired}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) =>
              handleResponseChange(question.id, (e.target as HTMLTextAreaElement).value)
            }
            placeholder={question.placeholder}
            rows={4}
            className="w-full rounded border border-gray-300 p-2"
            required={question.isRequired}
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e: any) => handleResponseChange(question.id, e.target.value)}
            className="w-full rounded border border-gray-300 p-2"
            required={question.isRequired}
          >
            <option value="">Select an option...</option>
            {question.options &&
              question.options.map((option: string, idx: number) => (
                <option key={idx} value={option}>
                  {option}
                </option>
              ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {question.options &&
              question.options.map((option: string, idx: number) => (
                <label key={idx} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option}
                    checked={value === option}
                    onChange={(e: any) => handleResponseChange(question.id, e.target.value)}
                    required={question.isRequired}
                  />
                  <span>{option}</span>
                </label>
              ))}
          </div>
        );

      case 'checkbox':
        const selectedValues = value ? value.split(',') : [];
        return (
          <div className="space-y-2">
            {question.options &&
              question.options.map((option: string, idx: number) => (
                <label key={idx} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    value={option}
                    checked={selectedValues.includes(option)}
                    onChange={(e: any) => {
                      const newValues = e.target.checked
                        ? [...selectedValues, option]
                        : selectedValues.filter((v: any) => v !== option);
                      handleResponseChange(question.id, newValues.join(','));
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e: any) => handleResponseChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="w-full rounded border border-gray-300 p-2"
            required={question.isRequired}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading form preview...</p>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
          <div className="text-center">
            <svg
              className="mx-auto mb-4 h-16 w-16 text-red-500"
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
            <h2 className="mb-2 text-xl font-semibold">Unable to Load Form</h2>
            <p className="mb-4 text-gray-600">{error || 'Form template not found'}</p>

            <div className="space-y-2">
              {error?.includes('log in') && (
                <button
                  onClick={() => {
                    // Trigger the dev auth button
                    const devAuthBtn = document.querySelector(
                      '[data-dev-auth-provider]'
                    ) as HTMLButtonElement;
                    if (devAuthBtn) {
                      devAuthBtn.click();
                      // Retry after a short delay
                      setTimeout(() => {
                        fetchTemplate(templateId);
                      }, 500);
                    }
                  }}
                  className="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  Quick Login as Provider
                </button>
              )}
              <button
                onClick={() => router.push('/intake-forms')}
                className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Back to Forms
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Group questions by section
  const sections: Record<string, FormQuestion[]> = {};
  template.questions.forEach((question: any) => {
    const section = question.section || 'General Information';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(question);
  });

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        {/* Preview Banner */}
        <div className="mb-6 border-l-4 border-yellow-500 bg-yellow-100 p-4 text-yellow-700">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">Preview Mode</p>
              <p className="text-xs">This is how your form will appear to patients</p>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => router.push('/intake-forms')}
                className="text-yellow-700 hover:text-yellow-600"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white shadow-lg">
          {/* Header */}
          <div className="rounded-t-lg bg-blue-600 p-6 text-white">
            <h1 className="text-2xl font-bold">{template.name}</h1>
            {template.description && <p className="mt-2 text-blue-100">{template.description}</p>}
          </div>

          {/* Form */}
          <form onSubmit={(e: any) => e.preventDefault()} className="space-y-6 p-6">
            {/* Questions by Section */}
            {Object.entries(sections).map(([sectionName, sectionQuestions], sectionIdx) => (
              <div key={sectionIdx} className={sectionIdx > 0 ? 'border-t pt-6' : ''}>
                <h2 className="mb-4 text-lg font-semibold">{sectionName}</h2>
                <div className="space-y-4">
                  {sectionQuestions
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((question: any) => (
                      <div key={question.id}>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          {question.questionText}
                          {question.isRequired && <span className="ml-1 text-red-500">*</span>}
                        </label>
                        {question.helpText && (
                          <p className="mb-2 text-sm text-gray-500">{question.helpText}</p>
                        )}
                        {renderQuestion(question)}
                      </div>
                    ))}
                </div>
              </div>
            ))}

            {/* Preview Notice */}
            <div className="border-t pt-6">
              <div className="rounded-lg bg-gray-100 p-4 text-center">
                <p className="text-sm text-gray-600">
                  This is a preview. The submit button is disabled.
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-3 cursor-not-allowed rounded-lg bg-gray-400 px-6 py-3 text-white opacity-50"
                >
                  Submit Form (Preview Only)
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>This is a preview of your intake form</p>
          <p className="mt-2">Powered by {process.env.NEXT_PUBLIC_CLINIC_NAME || 'EONPro'}</p>
        </div>
      </div>
    </div>
  );
}
