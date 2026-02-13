'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

// Define the steps for creating an intake form
const FORM_STEPS = [
  { id: 'name', title: 'Form Name', description: 'What should we call this form?' },
  { id: 'description', title: 'Description', description: 'Briefly describe this form' },
  { id: 'type', title: 'Treatment Type', description: 'What type of treatment is this for?' },
  { id: 'questions', title: 'Questions', description: 'Add questions to your form' },
  { id: 'review', title: 'Review', description: 'Review and create your form' },
];

interface FormData {
  name: string;
  description: string;
  treatmentType: string;
  questions: {
    questionText: string;
    questionType: string;
    isRequired: boolean;
    section: string;
    orderIndex: number;
  }[];
}

export default function IntakeFormWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    treatmentType: 'general',
    questions: [],
  });
  const [currentQuestion, setCurrentQuestion] = useState({
    questionText: '',
    questionType: 'text',
    isRequired: false,
    section: 'General Information',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = ((currentStep + 1) / FORM_STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < FORM_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const addQuestion = () => {
    if (currentQuestion.questionText) {
      setFormData((prev) => ({
        ...prev,
        questions: [
          ...prev.questions,
          {
            ...currentQuestion,
            orderIndex: prev.questions.length,
          },
        ],
      }));
      setCurrentQuestion({
        questionText: '',
        questionType: 'text',
        isRequired: false,
        section: 'General Information',
      });
    }
  };

  const removeQuestion = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');

      const res = await fetch('/api/intake-forms/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create template');
      }

      // Success - redirect to intake forms page
      router.push('/intake-forms');
    } catch (err: any) {
      logger.error('Failed to create template', err);
      alert('Failed to create template: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.name.length > 0;
      case 1:
        return true; // Description is optional
      case 2:
        return formData.treatmentType.length > 0;
      case 3:
        return formData.questions.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Progress bar */}
      <div className="h-2 w-full bg-gray-100">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* Header */}
      <div className="px-6 pb-4 pt-6 lg:px-8">
        <div className="flex items-center justify-between">
          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="inline-flex items-center rounded-lg p-2 hover:bg-gray-100"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                ></path>
              </svg>
              <span className="ml-2">Back</span>
            </button>
          )}
          <button
            onClick={() => router.push('/intake-forms')}
            className="ml-auto text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8 lg:px-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{FORM_STEPS[currentStep].title}</h1>
            <p className="mt-2 text-gray-600">{FORM_STEPS[currentStep].description}</p>
          </div>

          {/* Step content */}
          <div className="space-y-4">
            {currentStep === 0 && (
              <input
                type="text"
                placeholder="Enter form name"
                value={formData.name}
                onChange={(e: any) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 p-4 focus:border-green-500 focus:outline-none"
                autoFocus
              />
            )}

            {currentStep === 1 && (
              <textarea
                placeholder="Enter form description (optional)"
                value={formData.description}
                onChange={(e: any) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 p-4 focus:border-green-500 focus:outline-none"
                rows={4}
                autoFocus
              />
            )}

            {currentStep === 2 && (
              <select
                value={formData.treatmentType}
                onChange={(e: any) =>
                  setFormData((prev) => ({ ...prev, treatmentType: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 p-4 focus:border-green-500 focus:outline-none"
              >
                <option value="general">General Medical</option>
                <option value="weight-loss">Weight Loss</option>
                <option value="hormone-therapy">Hormone Therapy</option>
                <option value="aesthetic">Aesthetic</option>
                <option value="other">Other</option>
              </select>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                {/* Add new question */}
                <div className="space-y-3 rounded-lg border-2 border-dashed border-gray-300 p-4">
                  <input
                    type="text"
                    placeholder="Enter question text"
                    value={currentQuestion.questionText}
                    onChange={(e: any) =>
                      setCurrentQuestion((prev) => ({ ...prev, questionText: e.target.value }))
                    }
                    className="w-full rounded border border-gray-300 p-3 focus:border-green-500 focus:outline-none"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={currentQuestion.questionType}
                      onChange={(e: any) =>
                        setCurrentQuestion((prev) => ({ ...prev, questionType: e.target.value }))
                      }
                      className="rounded border border-gray-300 p-3 focus:border-green-500 focus:outline-none"
                    >
                      <option value="text">Short Text</option>
                      <option value="textarea">Long Text</option>
                      <option value="select">Dropdown</option>
                      <option value="radio">Multiple Choice</option>
                      <option value="checkbox">Checkboxes</option>
                      <option value="date">Date</option>
                      <option value="number">Number</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                    </select>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={currentQuestion.isRequired}
                        onChange={(e: any) =>
                          setCurrentQuestion((prev) => ({ ...prev, isRequired: e.target.checked }))
                        }
                        className="rounded"
                      />
                      <span>Required</span>
                    </label>
                  </div>

                  <button
                    onClick={addQuestion}
                    disabled={!currentQuestion.questionText}
                    className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Add Question
                  </button>
                </div>

                {/* List of questions */}
                {formData.questions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Questions ({formData.questions.length})</h3>
                    {formData.questions.map((q, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{q.questionText}</p>
                          <p className="text-sm text-gray-500">
                            {q.questionType} {q.isRequired && '• Required'}
                          </p>
                        </div>
                        <button
                          onClick={() => removeQuestion(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-6">
                  <h2 className="mb-4 text-xl font-semibold">Form Summary</h2>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-gray-500">Name:</dt>
                      <dd className="font-medium">{formData.name}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Description:</dt>
                      <dd className="font-medium">{formData.description || 'No description'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Treatment Type:</dt>
                      <dd className="font-medium">{formData.treatmentType}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Number of Questions:</dt>
                      <dd className="font-medium">{formData.questions.length}</dd>
                    </div>
                  </dl>
                </div>

                {formData.questions.length > 0 && (
                  <div>
                    <h3 className="mb-2 font-semibold">Questions Preview</h3>
                    <ol className="list-inside list-decimal space-y-1">
                      {formData.questions.map((q, index) => (
                        <li key={index} className="text-sm">
                          {q.questionText}
                          <span className="ml-2 text-gray-500">
                            ({q.questionType}
                            {q.isRequired && ', required'})
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer with navigation buttons */}
      <div className="mx-auto w-full max-w-2xl px-6 pb-8 lg:px-8">
        {currentStep < FORM_STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className={`flex w-full items-center justify-center space-x-3 rounded-full px-8 py-4 transition-all ${
              canProceed()
                ? 'bg-black text-white hover:bg-gray-800'
                : 'cursor-not-allowed bg-gray-300 text-gray-500'
            }`}
          >
            <span>Continue</span>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              ></path>
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !canProceed()}
            className={`flex w-full items-center justify-center space-x-3 rounded-full px-8 py-4 transition-all ${
              canProceed() && !isSubmitting
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'cursor-not-allowed bg-gray-300 text-gray-500'
            }`}
          >
            <span>{isSubmitting ? 'Creating...' : 'Create Form'}</span>
            {!isSubmitting && (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
