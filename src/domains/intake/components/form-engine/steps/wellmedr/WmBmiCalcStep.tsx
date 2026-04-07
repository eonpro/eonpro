'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmBmiCalcStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmBmiCalcStep({ basePath, nextStep, progressPercent }: WmBmiCalcStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const [feet, setFeet] = useState(String(responses.height_feet || responses.heightFeet || '5'));
  const [inches, setInches] = useState(String(responses.height_inches ?? responses.heightInches ?? '4'));
  const [weight, setWeight] = useState(String(responses.current_weight || responses.currentWeight || ''));

  const handleContinue = () => {
    if (!weight || !feet) return;
    setResponse('current_weight', weight);
    setResponse('currentWeight', weight);
    setResponse('height_feet', feet);
    setResponse('heightFeet', feet);
    setResponse('height_inches', inches || '0');
    setResponse('heightInches', inches || '0');
    markStepCompleted('bmi-calc');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const isDisabled = !weight || !feet;

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 60, padding: '0 20px',
    fontSize: 16, fontWeight: 400, color: '#101010',
    backgroundColor: '#fff', border: '1px solid #e8e8e8',
    borderRadius: 24, outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const onFocus = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = '#c3b29e';
    (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(195,178,158,0.12)';
  };
  const onBlur = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = '#e8e8e8';
    (e.target as HTMLElement).style.boxShadow = 'none';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      {/* Progress bar */}
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      {/* Logo — left-aligned */}
      <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 pt-6"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-6px)', transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 sm:h-8" />
      </div>

      {/* Content — centered vertically in remaining space */}
      <div className="flex-1 flex flex-col justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6">
        {/* Title */}
        <h1 className="text-[1.55rem] sm:text-[1.75rem] font-bold text-center leading-tight mb-3"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.08s' }}>
          Let&rsquo;s calculate your BMI.
        </h1>
        <p className="text-center text-[15px] sm:text-base mb-8 leading-relaxed"
          style={{ color: '#666', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.15s' }}>
          Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.
        </p>

        {/* Fields — stacked vertically, full-width */}
        <div className="w-full space-y-5"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>
          <div>
            <label className="block text-[15px] font-semibold mb-2" style={{ color: '#101010' }}>Feet</label>
            <div className="relative">
              <select value={feet} onChange={(e) => setFeet(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', paddingRight: 44, cursor: 'pointer' }}
                onFocus={onFocus} onBlur={onBlur}>
                <option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4" style={{ color: '#aaa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[15px] font-semibold mb-2" style={{ color: '#101010' }}>Inches</label>
            <div className="relative">
              <select value={inches} onChange={(e) => setInches(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', paddingRight: 44, cursor: 'pointer' }}
                onFocus={onFocus} onBlur={onBlur}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4" style={{ color: '#aaa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[15px] font-semibold mb-2" style={{ color: '#101010' }}>Weight (lbs)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="200"
              value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
              style={inputStyle}
              onFocus={onFocus} onBlur={onBlur} />
          </div>
        </div>

        {/* Button */}
        <div className="w-full mt-8"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
          <button onClick={handleContinue} disabled={isDisabled}
            className="w-full flex items-center justify-center gap-2 py-[18px] text-white font-semibold text-base rounded-full active:scale-[0.98]"
            style={{ backgroundColor: isDisabled ? '#b0b8be' : '#0C2631', transition: 'background-color 0.3s ease', cursor: isDisabled ? 'not-allowed' : 'pointer' }}>
            Next <span className="text-base">&#10132;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
