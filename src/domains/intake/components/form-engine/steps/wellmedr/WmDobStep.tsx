'use client';

import { useState } from 'react';
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
    width: '100%', height: '56px', padding: '0 2.5rem 0 1.25rem',
    fontSize: '1rem', fontWeight: 500, color: '#101010',
    backgroundColor: '#fff', border: '1px solid rgba(53,28,12,0.1)',
    borderRadius: '16px', outline: 'none', appearance: 'none', cursor: 'pointer',
  };
  const onFocus = (e: React.FocusEvent<HTMLSelectElement>) => { e.target.style.borderColor = '#c3b29e'; e.target.style.boxShadow = '0 0 0 3px rgba(195,178,158,0.2)'; };
  const onBlur = (e: React.FocusEvent<HTMLSelectElement>) => { e.target.style.borderColor = 'rgba(53,28,12,0.1)'; e.target.style.boxShadow = 'none'; };
  const chevron = <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></div>;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      {prevStep && (
        <div className="px-5 sm:px-8 pt-4 max-w-xl sm:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5 active:scale-95 transition-all">
            <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-5 sm:px-8 pt-4 sm:pt-6 pb-4 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        <h1 className="text-xl sm:text-[1.75rem] font-bold text-center leading-snug mb-1" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>
          Medication can be tailored to <em>your unique needs,</em>
        </h1>
        <p className="text-lg sm:text-xl font-bold text-center mb-4" style={{ color: '#101010' }}>
          so let&rsquo;s get to know you a little better.
        </p>

        <h2 className="text-lg sm:text-[1.4rem] font-bold text-center mb-1" style={{ color: '#101010' }}>
          What is your date of birth?
        </h2>
        <p className="text-[13px] sm:text-sm text-center mb-5" style={{ color: '#666' }}>
          This helps us understand your body complexity and hormones so we can assess you better.
        </p>

        <div className="w-full space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>Day <span style={{ color: '#c3b29e' }}>*</span></label>
              <div className="relative">
                <select value={day} onChange={(e) => setDay(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                </select>
                {chevron}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>Month <span style={{ color: '#c3b29e' }}>*</span></label>
              <div className="relative">
                <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Month</option>
                  {months.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                </select>
                {chevron}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>Year <span style={{ color: '#c3b29e' }}>*</span></label>
            <div className="relative">
              <select value={year} onChange={(e) => setYear(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="" disabled>Year</option>
                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              {chevron}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          onClick={handleContinue}
          disabled={!month || !day || !year}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full transition-all duration-200 disabled:opacity-30 active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
