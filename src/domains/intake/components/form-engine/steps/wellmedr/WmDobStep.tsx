'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmDobStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function WmDobStep({ basePath, nextStep, prevStep, progressPercent }: WmDobStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const existing = String(responses.dob || '');
  const parts = existing.includes('/') ? existing.split('/') : [];
  const [month, setMonth] = useState(parts[0] || '');
  const [day, setDay] = useState(parts[1] || '');
  const [year, setYear] = useState(parts[2] || '');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);

  const handleContinue = () => {
    if (!month || !day || !year) return;
    const dob = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    setResponse('dob', dob);
    markStepCompleted('dob');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    height: 64,
    padding: '0.75rem 2.5rem 0.75rem 1rem',
    fontSize: '1rem',
    fontWeight: 500,
    color: '#101010',
    backgroundColor: '#fff',
    border: '1px solid rgba(53, 28, 12, 0.12)',
    borderRadius: 20,
    outline: 'none',
    appearance: 'none',
    cursor: 'pointer',
    letterSpacing: '-0.01em',
    lineHeight: '1.5rem',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const onFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.target.style.borderColor = '#7b95a9';
    e.target.style.boxShadow = '0 0 0 2px #7b95a9';
  };
  const onBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.target.style.borderColor = 'rgba(53, 28, 12, 0.12)';
    e.target.style.boxShadow = 'none';
  };

  const chevron = (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
      <svg className="w-5 h-5" style={{ color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-select { width: 100%; }
        .wm-select option[value=""][disabled] { color: rgba(16, 16, 16, 0.3); }
        @media (min-width: 640px) {
          .wm-select { height: 72px !important; font-size: 1.25rem !important; }
        }
      `}</style>

      {/* Progress bar */}
      <div className="w-full" style={{ padding: '1.5rem 1.5rem 0' }}>
        <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'rgba(53, 28, 12, 0.06)', maxWidth: '48rem', marginInline: 'auto' }}>
          <div className="h-full rounded-full" style={{
            width: `${progressPercent}%`,
            background: 'linear-gradient(90deg, #41362a, #6a5b4b, #8f7e6a, #c3b29e)',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {/* Back + Logo row */}
      <div className="w-full max-w-[48rem] mx-auto px-6 pt-4 grid grid-cols-3 items-center">
        <div>
          {prevStep && (
            <button type="button" onClick={handleBack} className="p-1 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
              <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center max-w-[716px] mx-auto px-6 sm:px-8 pb-6 w-full"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)' }}>

        <p className="text-base sm:text-[1.25rem] text-center mb-1" style={{ color: '#101010', opacity: 0.5, letterSpacing: '-0.01em' }}>
          Medication can be tailored to <em style={{ fontStyle: 'italic', color: '#7b95a9', opacity: 1 }}>your unique needs,</em>
        </p>
        <p className="text-[1.25rem] sm:text-[2rem] font-medium text-center mb-6 sm:mb-8" style={{ color: '#101010', letterSpacing: '-0.02em', lineHeight: '30px' }}>
          so let&rsquo;s get to know you a little better.
        </p>

        <h1 className="text-[1.25rem] sm:text-[2rem] font-medium text-center mb-2" style={{ color: '#101010', letterSpacing: '-0.02em', lineHeight: '30px' }}>
          What is your date of birth?
        </h1>
        <p className="text-base sm:text-[1.25rem] text-center mb-8 sm:mb-10" style={{ color: '#101010', opacity: 0.5, letterSpacing: '-0.01em' }}>
          This helps us understand your body complexity and hormones so we can assess you better.
        </p>

        <div className="w-full max-w-[716px] mx-auto">
          {/* Day + Month side by side */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-base sm:text-[1.125rem] font-medium" style={{ color: '#101010', letterSpacing: '-0.01em' }}>
                Day <span style={{ color: '#c3b29e' }}>*</span>
              </label>
              <div className="relative">
                <select className="wm-select" value={day} onChange={(e) => setDay(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                </select>
                {chevron}
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-base sm:text-[1.125rem] font-medium" style={{ color: '#101010', letterSpacing: '-0.01em' }}>
                Month <span style={{ color: '#c3b29e' }}>*</span>
              </label>
              <div className="relative">
                <select className="wm-select" value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Month</option>
                  {months.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                </select>
                {chevron}
              </div>
            </div>
          </div>

          {/* Year full-width */}
          <div className="flex flex-col gap-2">
            <label className="text-base sm:text-[1.125rem] font-medium" style={{ color: '#101010', letterSpacing: '-0.01em' }}>
              Year <span style={{ color: '#c3b29e' }}>*</span>
            </label>
            <div className="relative">
              <select className="wm-select" value={year} onChange={(e) => setYear(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="" disabled>Year</option>
                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              {chevron}
            </div>
          </div>
        </div>

        {/* Button */}
        <div className="w-full mt-8 sm:mt-[3.25rem] sm:max-w-[31rem] sm:mx-auto">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full flex items-center justify-center gap-4 text-white text-base sm:text-[1.125rem] font-normal rounded-full active:scale-[0.98]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
          >
            Next <span aria-hidden="true">&#10132;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
