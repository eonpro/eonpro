'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmDobStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getMaxDay(monthNum: number, yearNum: number | null): number {
  const thirtyDayMonths = [4, 6, 9, 11];
  if (monthNum === 2) {
    if (yearNum && ((yearNum % 4 === 0 && yearNum % 100 !== 0) || yearNum % 400 === 0)) {
      return 29;
    }
    return 29; // allow 29 when year not yet selected (leap year possible)
  }
  if (thirtyDayMonths.includes(monthNum)) return 30;
  return 31;
}

interface DropdownProps {
  label: string;
  placeholder: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  error?: string;
}

function Dropdown({
  label,
  placeholder,
  value,
  displayValue,
  options,
  onSelect,
  error,
}: DropdownProps) {
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
    <div className="flex flex-1 flex-col gap-2" ref={ref}>
      <label
        className="text-base font-medium sm:text-[1.125rem]"
        style={{ color: '#101010', letterSpacing: '-0.01em' }}
      >
        {label} <span style={{ color: '#ef4444' }}>*</span>
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="wm-dropdown-btn"
          style={{
            color: value ? '#101010' : 'rgba(16,16,16,0.3)',
            borderColor: error ? '#ef4444' : undefined,
          }}
        >
          {value ? displayValue : placeholder}
          <svg
            className="h-5 w-5 shrink-0"
            style={{
              color: '#9ca3af',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border bg-white shadow-lg"
            style={{ borderColor: 'rgba(53,28,12,0.12)', maxHeight: 240 }}
          >
            <div
              className="overflow-y-auto"
              style={{ maxHeight: 240, WebkitOverflowScrolling: 'touch' }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onSelect(opt.value);
                    setOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-base transition-colors"
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
      {error && (
        <span className="text-xs font-medium" style={{ color: '#ef4444' }}>
          {error}
        </span>
      )}
    </div>
  );
}

export default function WmDobStep({ basePath, nextStep, progressPercent }: WmDobStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const existing = String(responses.dob || '');
  const parts = existing.includes('/') ? existing.split('/') : [];
  const [month, setMonth] = useState(parts[0] || '');
  const [day, setDay] = useState(parts[1] || '');
  const [year, setYear] = useState(parts[2] || '');

  const currentYear = new Date().getFullYear();
  const minAge = 18;
  const maxAge = 85;
  const years = Array.from({ length: maxAge - minAge + 1 }, (_, i) => currentYear - minAge - i);

  const maxDay = useMemo(() => {
    const m = Number(month);
    const y = year ? Number(year) : null;
    if (!m) return 31;
    return getMaxDay(m, y);
  }, [month, year]);

  // Auto-correct day when month/year changes and current day exceeds max
  useEffect(() => {
    if (day && Number(day) > maxDay) {
      setDay(String(maxDay));
    }
  }, [maxDay, day]);

  const dayOptions = useMemo(
    () =>
      Array.from({ length: maxDay }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1),
      })),
    [maxDay]
  );

  const monthOptions = monthNames.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }));

  const handleMonthSelect = useCallback((val: string) => {
    setMonth(val);
    setError('');
  }, []);

  const handleDaySelect = useCallback((val: string) => {
    setDay(val);
    setError('');
  }, []);

  const handleYearSelect = useCallback((val: string) => {
    setYear(val);
    setError('');
  }, []);

  const handleContinue = useCallback(() => {
    if (!month || !day || !year) {
      setError('Please select day, month, and year.');
      return;
    }

    const m = Number(month);
    const d = Number(day);
    const y = Number(year);

    const actualMax = getMaxDay(m, y);
    if (d > actualMax) {
      setError(`${monthNames[m - 1]} only has ${actualMax} days.`);
      return;
    }

    const today = new Date();
    const birthDate = new Date(y, m - 1, d);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < minAge) {
      setError('You must be at least 18 years old to qualify.');
      return;
    }
    if (age > maxAge) {
      setError('This program is available for patients up to 85 years old.');
      return;
    }

    setError('');
    const dob = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    setResponse('dob', dob);
    markStepCompleted('dob');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  }, [
    month,
    day,
    year,
    setResponse,
    markStepCompleted,
    setCurrentStep,
    nextStep,
    router,
    basePath,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleContinue]);

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: '#F7F7F9' }}>
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
      <div className="h-[3px] w-full" style={{ backgroundColor: '#e5e0d8' }}>
        <div
          className="h-full"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: '#c3b29e',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      {/* Logo row */}
      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div />
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      {/* Content */}
      <div
        className="mx-auto flex w-full max-w-[716px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(6px)',
          transition: 'all 0.3s ease-out',
        }}
      >
        <p
          className="mb-1 text-center text-base sm:text-[1.25rem]"
          style={{ color: '#101010', opacity: 0.5, letterSpacing: '-0.01em' }}
        >
          Medication can be tailored to{' '}
          <em style={{ fontStyle: 'italic', color: '#7b95a9', opacity: 1 }}>your unique needs,</em>
        </p>
        <p
          className="mb-6 text-center text-[1.25rem] font-medium sm:mb-8 sm:text-[2rem]"
          style={{ color: '#101010', letterSpacing: '-0.02em', lineHeight: '30px' }}
        >
          so let&rsquo;s get to know you a little better.
        </p>

        <h1
          className="mb-2 text-center text-[1.25rem] font-medium sm:text-[2rem]"
          style={{ color: '#101010', letterSpacing: '-0.02em', lineHeight: '30px' }}
        >
          What is your date of birth?
        </h1>
        <p
          className="mb-8 text-center text-base sm:mb-10 sm:text-[1.25rem]"
          style={{ color: '#101010', opacity: 0.5, letterSpacing: '-0.01em' }}
        >
          This helps us understand your body complexity and hormones so we can assess you better.
        </p>

        <div className="mx-auto w-full max-w-[716px]">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row">
            <Dropdown
              label="Day"
              placeholder="Day"
              value={day}
              displayValue={day}
              options={dayOptions}
              onSelect={handleDaySelect}
            />
            <Dropdown
              label="Month"
              placeholder="Month"
              value={month}
              displayValue={month ? monthNames[Number(month) - 1] : ''}
              options={monthOptions}
              onSelect={handleMonthSelect}
            />
          </div>
          <Dropdown
            label="Year"
            placeholder="Year"
            value={year}
            displayValue={year}
            options={yearOptions}
            onSelect={handleYearSelect}
          />
        </div>

        {/* Error message */}
        {error && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-center text-sm font-medium"
            style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
          >
            {error}
          </div>
        )}

        {/* Eligibility note */}
        <p className="mt-4 text-center text-xs" style={{ color: '#9ca3af' }}>
          Eligible ages: 18–85 years old
        </p>

        {/* Button */}
        <div className="mt-8 w-full pb-[env(safe-area-inset-bottom)] sm:mx-auto sm:mt-[3.25rem] sm:max-w-[31rem]">
          <button
            type="button"
            onClick={handleContinue}
            className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
          >
            Next <span aria-hidden="true">&#10132;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
