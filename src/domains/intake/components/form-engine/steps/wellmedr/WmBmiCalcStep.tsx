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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const [feet, setFeet] = useState(String(responses.height_feet || responses.heightFeet || ''));
  const [inches, setInches] = useState(String(responses.height_inches || responses.heightInches || ''));
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 64,
    padding: '0 2rem',
    fontSize: '1rem',
    fontWeight: 500,
    color: '#101010',
    backgroundColor: '#fff',
    border: '1px solid rgba(53, 28, 12, 0.12)',
    borderRadius: 20,
    outline: 'none',
    letterSpacing: '-0.01em',
    lineHeight: '1.5rem',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const onFocus = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = '#7b95a9';
    (e.target as HTMLElement).style.boxShadow = '0 0 0 2px #7b95a9';
  };
  const onBlur = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'rgba(53, 28, 12, 0.12)';
    (e.target as HTMLElement).style.boxShadow = 'none';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-input::placeholder {
          opacity: 0.3;
          color: #101010;
          font-weight: 400;
          font-size: 1rem;
          line-height: 26px;
          letter-spacing: -0.01em;
        }
        @media (min-width: 640px) {
          .wm-input { height: 72px !important; font-size: 1.25rem !important; }
          .wm-input::placeholder { font-size: 1.125rem; line-height: 24px; }
        }
      `}</style>

      {/* Progress bar */}
      <div className="w-full h-[3px]" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      {/* Logo — centered */}
      <div className="w-full max-w-[48rem] mx-auto px-6 pt-4"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-6px)', transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center w-full max-w-[640px] mx-auto px-6 sm:px-8 pb-6">
        {/* Title */}
        <h1 className="text-[1.25rem] sm:text-[2rem] font-medium text-center leading-[30px] sm:leading-[40px] mb-2"
          style={{ color: '#101010', letterSpacing: '-0.02em', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.08s' }}>
          Let&rsquo;s calculate your BMI.
        </h1>
        <p className="text-center text-base sm:text-[1.25rem] mb-8 sm:mb-10 leading-relaxed"
          style={{ color: '#101010', opacity: mounted ? 0.6 : 0, letterSpacing: '-0.01em', transition: 'opacity 0.5s ease 0.15s' }}>
          Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.
        </p>

        {/* Fields */}
        <div className="w-full"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>

          {/* Feet + Inches — side by side */}
          <div className="flex gap-4 mb-5">
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-base sm:text-[1.125rem] font-medium leading-[26px] sm:leading-6" style={{ color: '#101010', letterSpacing: '-0.01em' }}>Feet</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="5"
                className="wm-input"
                value={feet} onChange={(e) => setFeet(e.target.value.replace(/[^0-9]/g, ''))}
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur} />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-base sm:text-[1.125rem] font-medium leading-[26px] sm:leading-6" style={{ color: '#101010', letterSpacing: '-0.01em' }}>Inches</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="4"
                className="wm-input"
                value={inches} onChange={(e) => setInches(e.target.value.replace(/[^0-9]/g, ''))}
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur} />
            </div>
          </div>

          {/* Weight */}
          <div className="flex flex-col gap-2">
            <label className="text-base sm:text-[1.125rem] font-medium leading-[26px] sm:leading-6" style={{ color: '#101010', letterSpacing: '-0.01em' }}>Weight (lbs)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="200"
              className="wm-input"
              value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
              style={inputStyle}
              onFocus={onFocus} onBlur={onBlur} />
          </div>
        </div>

        {/* Button */}
        <div className="w-full mt-8 sm:mt-[3.25rem] sm:max-w-[31rem] sm:mx-auto"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
          <button onClick={handleContinue}
            className="wm-next-btn w-full flex items-center justify-center gap-4 text-white text-base sm:text-[1.125rem] font-normal rounded-full active:scale-[0.98]"
            style={{
              height: 56,
              backgroundColor: '#0C2631',
              transition: 'opacity 0.3s ease',
              cursor: 'pointer',
            }}>
            Next <span style={{ fontSize: '1em' }}>&#10132;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
