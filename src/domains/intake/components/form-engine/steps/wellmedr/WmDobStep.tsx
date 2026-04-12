'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmDobStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface DropdownProps {
  label: string;
  placeholder: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}

function Dropdown({ label, placeholder, value, displayValue, options, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="flex-1 flex flex-col gap-2" ref={ref}>
      <label className="text-base sm:text-[1.125rem] font-medium" style={{ color: '#101010', letterSpacing: '-0.01em' }}>
        {label} <span style={{ color: '#c3b29e' }}>*</span>
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="wm-dropdown-btn"
          style={{ color: value ? '#101010' : 'rgba(16,16,16,0.3)' }}
        >
          {value ? displayValue : placeholder}
          <svg className="w-5 h-5 shrink-0" style={{ color: '#9ca3af', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-2xl shadow-lg border overflow-hidden" style={{ borderColor: 'rgba(53,28,12,0.12)', maxHeight: 240 }}>
            <div className="overflow-y-auto" style={{ maxHeight: 240, WebkitOverflowScrolling: 'touch' }}>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onSelect(opt.value); setOpen(false); }}
                  className="w-full text-left px-5 py-3 text-base transition-colors"
                  style={{
                    backgroundColor: value === opt.value ? '#f5f0e8' : 'transparent',
                    fontWeight: value === opt.value ? 600 : 400,
                    color: '#101010',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

  const handleContinue = useCallback(() => {
    if (!month || !day || !year) return;
    const dob = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    setResponse('dob', dob);
    markStepCompleted('dob');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  }, [month, day, year, setResponse, markStepCompleted, setCurrentStep, nextStep, router, basePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleContinue]);

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const dayOptions = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  const monthOptions = monthNames.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-dropdown-btn {
          width: 100%;
          height: 64px;
          padding: 0 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 1rem;
          font-weight: 500;
          background-color: #fff;
          border: 1px solid rgba(53, 28, 12, 0.12);
          border-radius: 20px;
          cursor: pointer;
          transition: border-color 0.2s;
          text-align: left;
        }
        .wm-dropdown-btn:active { border-color: #7b95a9; }
        @media (min-width: 640px) {
          .wm-dropdown-btn { height: 72px; font-size: 1.25rem; }
        }
      `}</style>

      {/* Progress bar */}
      <div className="w-full h-[3px]" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      {/* Back + Logo row */}
      <div className="w-full max-w-[48rem] mx-auto px-6 pt-4 grid grid-cols-3 items-center">
        <div>
          {prevStep && (
            <button type="button" onClick={handleBack} className="p-2.5 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
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
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(6px)', transition: 'all 0.3s ease-out' }}>

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
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Dropdown label="Day" placeholder="Day" value={day} displayValue={day} options={dayOptions} onSelect={setDay} />
            <Dropdown label="Month" placeholder="Month" value={month} displayValue={month ? monthNames[Number(month) - 1] : ''} options={monthOptions} onSelect={setMonth} />
          </div>
          <Dropdown label="Year" placeholder="Year" value={year} displayValue={year} options={yearOptions} onSelect={setYear} />
        </div>

        {/* Button */}
        <div className="w-full mt-8 sm:mt-[3.25rem] sm:max-w-[31rem] sm:mx-auto">
          <button
            type="button"
            onClick={handleContinue}
            className="wm-next-btn w-full flex items-center justify-center gap-4 text-white text-base sm:text-[1.125rem] font-normal rounded-full active:scale-[0.98]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
          >
            Next <span aria-hidden="true">&#10132;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
