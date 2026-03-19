'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmYesNoDetailStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerText?: string;
  headerItalic?: string;
  question: string;
  detailPrompt: string;
  storageKey: string;
  detailStorageKey: string;
}

export default function WmYesNoDetailStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerText,
  headerItalic,
  question,
  detailPrompt,
  storageKey,
  detailStorageKey,
}: WmYesNoDetailStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [answer, setAnswer] = useState<string>(String(responses[storageKey] || ''));
  const [detail, setDetail] = useState<string>(String(responses[detailStorageKey] || ''));

  const handleContinue = () => {
    if (!answer) return;
    setResponse(storageKey, answer);
    if (answer === 'yes' && detail) {
      setResponse(detailStorageKey, detail);
    }
    markStepCompleted(storageKey);
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 mb-8" />

        {(headerText || headerItalic) && (
          <p className="text-base sm:text-lg text-center mb-4" style={{ color: '#101010' }}>
            {headerText}
          </p>
        )}

        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-6" style={{ color: '#101010' }}>
          {question}
          <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
        </h2>

        <div className="grid grid-cols-2 gap-3 w-full mb-4">
          {['yes', 'no'].map((opt) => (
            <button
              key={opt}
              onClick={() => setAnswer(opt)}
              className="flex items-center gap-3 px-5 py-4 rounded-2xl border-2 bg-white transition-all"
              style={{
                borderColor: answer === opt ? 'var(--intake-accent, #7B95A9)' : '#e5e7eb',
              }}
            >
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: answer === opt ? 'var(--intake-accent, #7B95A9)' : '#d1d5db' }}>
                {answer === opt && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#c3b29e' }} />}
              </div>
              <span className="font-medium capitalize">{opt === 'yes' ? 'Yes' : 'No'}</span>
            </button>
          ))}
        </div>

        {answer === 'yes' && (
          <div className="w-full p-4 rounded-2xl mt-2" style={{ backgroundColor: '#eef2f5' }}>
            <label className="block text-sm font-medium mb-2" style={{ color: '#666' }}>
              {detailPrompt}
              <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Enter your answer"
              rows={4}
              className="w-full p-4 rounded-xl border border-gray-200 bg-white resize-y text-base focus:outline-none focus:border-[var(--intake-accent)]"
            />
          </div>
        )}
      </div>

      <div className="px-6 lg:px-8 pb-8 max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!answer || (answer === 'yes' && !detail.trim())}
          className="w-full flex items-center justify-center gap-3 py-4 px-8 text-white font-medium rounded-full transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
