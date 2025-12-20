'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { evaluateConditionalLogic, ConditionalLogic } from '@/lib/intake-forms/conditional-logic';

interface FormQuestion {
  id: number;
  questionText: string;
  questionType: string;
  isRequired: boolean;
  options?: any;
  placeholder?: string;
  helpText?: string;
  section?: string;
  orderIndex: number;
  conditionalLogic?: ConditionalLogic;
}

interface FormData {
  id: string;
  template: {
    id: number;
    name: string;
    description?: string;
    questions: FormQuestion[];
  };
  patientEmail: string;
  patientPhone?: string;
  expiresAt: string;
  isCompleted: boolean;
  completedAt?: string;
}

export default function IntakeFormPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = use(params);
  const router = useRouter();
  const [form, setForm] = useState<FormData | null>(null);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [patientInfo, setPatientInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});

  // Fetch form data
  useEffect(() => {
    fetchForm();
  }, [linkId]);

  const fetchForm = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/intake-forms/public/${linkId}`);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load form');
      }

      const data = await res.json();
      setForm(data.form);

      // Pre-populate patient info if available
      if (data.form.patientEmail) {
        setPatientInfo(prev => ({
          ...prev,
          email: data.form.patientEmail,
          phone: data.form.patientPhone || '',
        }));
      }
    } catch (err: any) {
      logger.error('Failed to fetch form', err);
      setError(err.message || 'Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (questionId: number, value: string) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value,
    }));
    // Clear validation error for this field
    if (validationErrors[questionId]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    }
  };

  // Check if a question is visible based on conditional logic
  const isQuestionVisible = (question: FormQuestion): boolean => {
    return evaluateConditionalLogic(question.conditionalLogic, responses);
  };

  // Get visible questions
  const visibleQuestions = useMemo(() => {
    if (!form) return [];
    return form.template.questions.filter((q: FormQuestion) => isQuestionVisible(q));
  }, [form, responses]);

  const validateForm = (): boolean => {
    if (!form) return false;

    const errors: Record<number, string> = {};
    let isValid = true;

    // Only validate VISIBLE required questions (skip hidden questions due to conditional logic)
    visibleQuestions.forEach((question: FormQuestion) => {
      if (question.isRequired && !responses[question.id]) {
        errors[question.id] = 'This field is required';
        isValid = false;
      }

      // Additional validation based on question type
      if (responses[question.id]) {
        switch (question.questionType) {
          case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responses[question.id])) {
              errors[question.id] = 'Please enter a valid email address';
              isValid = false;
            }
            break;
          case 'phone':
            if (!/^[\d\s\-\(\)\+]+$/.test(responses[question.id])) {
              errors[question.id] = 'Please enter a valid phone number';
              isValid = false;
            }
            break;
          case 'number':
            if (isNaN(Number(responses[question.id]))) {
              errors[question.id] = 'Please enter a valid number';
              isValid = false;
            }
            break;
        }
      }
    });

    // Validate patient info if not pre-populated
    if (!form.patientEmail && !patientInfo.email) {
      errors[-1] = 'Please provide your email address';
      isValid = false;
    }

    setValidationErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form || !validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Only submit responses for visible questions
      const formResponses = visibleQuestions.map((question: FormQuestion) => ({
        questionId: question.id,
        answer: responses[question.id] || '',
      }));

      const res = await fetch(`/api/intake-forms/public/${linkId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: formResponses,
          patientInfo: !form.patientEmail ? patientInfo : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit form');
      }

      setSuccess(true);
    } catch (err: any) {
      logger.error('Failed to submit form', err);
      setError(err.message || 'Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question: FormQuestion) => {
    const value = responses[question.id] || '';
    const hasError = !!validationErrors[question.id];

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
            className={`w-full p-2 border rounded ${hasError ? 'border-red-500' : 'border-gray-300'}`}
            required={question.isRequired}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e: any) => handleResponseChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            rows={4}
            className={`w-full p-2 border rounded ${hasError ? 'border-red-500' : 'border-gray-300'}`}
            required={question.isRequired}
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e: any) => handleResponseChange(question.id, e.target.value)}
            className={`w-full p-2 border rounded ${hasError ? 'border-red-500' : 'border-gray-300'}`}
            required={question.isRequired}
          >
            <option value="">Select an option...</option>
            {question.options && question.options.map((option: string, idx: number) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {question.options && question.options.map((option: string, idx: number) => (
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
            {question.options && question.options.map((option: string, idx: number) => (
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
            className={`w-full p-2 border rounded ${hasError ? 'border-red-500' : 'border-gray-300'}`}
            required={question.isRequired}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold mb-2">Unable to Load Form</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
            <p className="text-gray-600">Your form has been submitted successfully.</p>
            <p className="text-sm text-gray-500 mt-4">You may close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  if (form?.isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <svg className="w-16 h-16 text-blue-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold mb-2">Form Already Completed</h2>
            <p className="text-gray-600">This form was submitted on {new Date(form.completedAt!).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!form) return null;

  // Group VISIBLE questions by section (applying conditional logic)
  const sections: Record<string, FormQuestion[]> = {};
  visibleQuestions.forEach((question: FormQuestion) => {
    const section = question.section || 'General Information';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(question);
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6 rounded-t-lg">
            <h1 className="text-2xl font-bold">{form.template.name}</h1>
            {form.template.description && (
              <p className="mt-2 text-blue-100">{form.template.description}</p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Patient Info (if not pre-populated) */}
            {!form.patientEmail && (
              <div className="border-b pb-6">
                <h2 className="text-lg font-semibold mb-4">Your Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={patientInfo.firstName}
                      onChange={(e: any) => setPatientInfo(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full p-2 border rounded border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={patientInfo.lastName}
                      onChange={(e: any) => setPatientInfo(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full p-2 border rounded border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={patientInfo.email}
                      onChange={(e: any) => setPatientInfo(prev => ({ ...prev, email: e.target.value }))}
                      className={`w-full p-2 border rounded ${validationErrors[-1] ? 'border-red-500' : 'border-gray-300'}`}
                      required
                    />
                    {validationErrors[-1] && (
                      <p className="text-red-500 text-sm mt-1">{validationErrors[-1]}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={patientInfo.phone}
                      onChange={(e: any) => setPatientInfo(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full p-2 border rounded border-gray-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Questions by Section */}
            {Object.entries(sections).map(([sectionName, sectionQuestions], sectionIdx) => (
              <div key={sectionIdx} className={sectionIdx > 0 ? 'border-t pt-6' : ''}>
                <h2 className="text-lg font-semibold mb-4">{sectionName}</h2>
                <div className="space-y-4">
                  {sectionQuestions
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((question: any) => (
                      <div key={question.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {question.questionText}
                          {question.isRequired && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {question.helpText && (
                          <p className="text-sm text-gray-500 mb-2">{question.helpText}</p>
                        )}
                        {renderQuestion(question)}
                        {validationErrors[question.id] && (
                          <p className="text-red-500 text-sm mt-1">{validationErrors[question.id]}</p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end pt-6">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Form'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 mt-6">
          <p>This form expires on {new Date(form.expiresAt).toLocaleDateString()}</p>
          <p className="mt-2">
            Powered by {process.env.NEXT_PUBLIC_CLINIC_NAME || 'EONPro'}
          </p>
        </div>
      </div>
    </div>
  );
}
