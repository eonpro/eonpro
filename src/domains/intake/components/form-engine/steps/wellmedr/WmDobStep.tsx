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

const inputStyle: React.CSSProperties = {
  height: '60px',
  padding: '0 20px',
  fontSize: '16px',
  color: '#101010',
  backgroundColor: '#fff',
  border: '1px solid #e8e8e8',
  borderRadius: '24px',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  paddingRight: 44,
  cursor: 'pointer',
};

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

  const onFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.target.style.borderColor = '#c3b29e';
    e.target.style.boxShadow = '0 0 0 3px rgba(195,178,158,0.12)';
  };
  const onBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.target.style.borderColor = '#e8e8e8';
    e.target.style.boxShadow = 'none';
  };
  const chevron = <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></div>;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      {prevStep && (
        <div className="px-6 sm:px-8 pt-3 max-w-[600px] mx-auto w-full">
          <button type="button" onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
            <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div className="max-w-[600px] mx-auto px-6 sm:px-8 pt-6 w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 sm:h-8 block" />
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-[600px] mx-auto px-6 sm:px-8 pb-6 w-full space-y-5">
        <p className="text-[15px] text-center" style={{ color: '#666' }}>
          Medication can be tailored to <em>your unique needs,</em>
        </p>
        <p className="text-lg sm:text-xl font-bold text-center" style={{ color: '#101010' }}>
          so let&rsquo;s get to know you a little better.
        </p>

        <h1 className="text-[1.55rem] sm:text-[1.75rem] font-bold text-center" style={{ color: '#101010' }}>
          What is your date of birth?
        </h1>
        <p className="text-[15px] text-center" style={{ color: '#666' }}>
          This helps us understand your body complexity and hormones so we can assess you better.
        </p>

        <div className="w-full space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[15px] font-semibold mb-2" style={{ color: '#101010' }}>Day <span style={{ color: '#c3b29e' }}>*</span></label>
              <div className="relative">
                <select value={day} onChange={(e) => setDay(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                </select>
                {chevron}
              </div>
            </div>
            <div>
              <label className="block text-[15px] font-semibold mb-2" style={{ color: '#101010' }}>Month <span style={{ color: '#c3b29e' }}>*</span></label>
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
            <label className="block text-[15px] font-semibold mb-2" style={{ color: '#101010' }}>Year <span style={{ color: '#c3b29e' }}>*</span></label>
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

      <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 mt-8 pb-6" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!month || !day || !year}
          className="w-full flex items-center justify-center gap-2.5 py-[18px] text-white font-semibold text-base rounded-full active:scale-[0.98]"
          style={{ backgroundColor: (!month || !day || !year) ? '#b0b8be' : '#0C2631', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', cursor: (!month || !day || !year) ? 'not-allowed' : 'pointer' }}
        >
          Next <span aria-hidden="true">&#10132;</span>
        </button>
      </div>
    </div>
  );
}
