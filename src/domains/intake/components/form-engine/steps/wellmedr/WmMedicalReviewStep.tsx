'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmMedicalReviewStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmMedicalReviewStep({
  basePath,
  nextStep,
  progressPercent,
}: WmMedicalReviewStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, setResponses, markStepCompleted, setCurrentStep } = useIntakeActions();

  const weight = Number(responses.current_weight) || 0;
  const goalWeight = Number(responses.ideal_weight) || 0;
  const lbsToLose = weight - goalWeight;
  const heightFt = Number(responses.height_feet) || 5;
  const heightIn = Number(responses.height_inches) || 4;
  const totalInches = heightFt * 12 + heightIn;
  const bmi = totalInches > 0 ? ((weight / (totalInches * totalInches)) * 703).toFixed(1) : '0';
  const weeksToGoal = Math.max(1, Math.ceil(lbsToLose / 4));

  const [firstName, setFirstName] = useState(String(responses.firstName || ''));
  const [lastName, setLastName] = useState(String(responses.lastName || ''));
  const [state, setState] = useState(String(responses.state || ''));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = 'Required';
    if (!lastName.trim()) e.lastName = 'Required';
    if (!state) e.state = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) return;
    setResponses({ firstName, lastName, state });
    markStepCompleted('medical-review');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
    'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
    'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        <h2 className="text-[1.5rem] sm:text-[1.75rem] font-bold text-center mb-4" style={{ color: '#101010' }}>Your medical review</h2>

        <div className="w-full text-left space-y-1 mb-4">
          <p className="font-bold">BMI: <span style={{ color: '#7B95A9' }}>{bmi}</span></p>
          <p className="font-bold">Current Weight: <span style={{ color: '#7B95A9' }}>{weight} lbs</span></p>
          <p className="font-bold">Goal Weight: <span style={{ color: '#7B95A9' }}>{goalWeight} lbs</span> within <span style={{ color: '#7B95A9' }}>{weeksToGoal}</span> weeks</p>
        </div>

        <p className="text-base mb-6 text-left w-full" style={{ color: '#101010' }}>
          You are a <strong>strong candidate</strong> for medical weight loss with a <strong>94% chance</strong> of successful treatment if qualified.
        </p>

        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-6" style={{ color: '#101010' }}>
          Let&apos;s proceed to check your eligibility
        </h2>

        <div className="w-full space-y-4 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#7B95A9' }}>First Name <span className="text-red-400">*</span></label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full h-14 px-4 rounded-2xl border bg-white text-base" style={{ borderColor: errors.firstName ? '#ef4444' : '#e5e7eb' }} />
              {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#7B95A9' }}>Last Name <span className="text-red-400">*</span></label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full h-14 px-4 rounded-2xl border bg-white text-base" style={{ borderColor: errors.lastName ? '#ef4444' : '#e5e7eb' }} />
              {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">What state will your medication be shipped to? <span className="text-red-400">*</span></label>
            <select value={state} onChange={(e) => setState(e.target.value)} className="w-full h-14 px-4 rounded-2xl border bg-white text-base appearance-none" style={{ borderColor: errors.state ? '#ef4444' : '#e5e7eb' }}>
              <option value="">Select state</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {errors.state && <p className="text-xs text-red-500 mt-1">{errors.state}</p>}
          </div>
        </div>

        <p className="text-sm text-center" style={{ color: '#666' }}>Your information is never shared and is protected by HIPAA.</p>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-3 py-4 text-white font-medium text-base rounded-full active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
