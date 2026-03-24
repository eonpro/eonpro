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
  const [inches, setInches] = useState(String(responses.height_inches ?? responses.heightInches ?? '0'));
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

  const inputCls = "w-full h-[56px] sm:h-[60px] px-5 text-[16px] font-medium bg-white rounded-[14px] outline-none";

  const onFocus = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = '#c3b29e';
    (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(195,178,158,0.12)';
  };
  const onBlur = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'rgba(0,0,0,0.08)';
    (e.target as HTMLElement).style.boxShadow = 'none';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-[3px]" style={{ backgroundColor: '#e8e4de' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      <div className="flex flex-col items-center w-full max-w-[520px] mx-auto px-6 sm:px-8">
        {/* Logo */}
        <div className="pt-12 sm:pt-16 pb-8 sm:pb-10"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-6px)', transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 sm:h-8" />
        </div>

        {/* Title */}
        <h1 className="text-[1.6rem] sm:text-[2.1rem] font-bold text-center leading-tight mb-3"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.08s' }}>
          Let&rsquo;s calculate your BMI.
        </h1>
        <p className="text-center text-[14px] sm:text-[16px] mb-8 sm:mb-10 leading-relaxed"
          style={{ color: '#777', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.15s' }}>
          Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.
        </p>

        {/* Form */}
        <div className="w-full space-y-5"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] sm:text-[15px] font-semibold mb-2" style={{ color: '#222' }}>Feet</label>
              <div className="relative">
                <select value={feet} onChange={(e) => setFeet(e.target.value)}
                  className={inputCls} style={{ border: '1px solid rgba(0,0,0,0.08)', appearance: 'none', paddingRight: '2.5rem', cursor: 'pointer', color: '#101010' }}
                  onFocus={onFocus} onBlur={onBlur}>
                  <option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[14px] sm:text-[15px] font-semibold mb-2" style={{ color: '#222' }}>Inches</label>
              <div className="relative">
                <select value={inches} onChange={(e) => setInches(e.target.value)}
                  className={inputCls} style={{ border: '1px solid rgba(0,0,0,0.08)', appearance: 'none', paddingRight: '2.5rem', cursor: 'pointer', color: '#101010' }}
                  onFocus={onFocus} onBlur={onBlur}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[14px] sm:text-[15px] font-semibold mb-2" style={{ color: '#222' }}>Weight (lbs)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="200"
              value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
              className={inputCls} style={{ border: '1px solid rgba(0,0,0,0.08)' }}
              onFocus={onFocus} onBlur={onBlur} />
          </div>
        </div>

        {/* Button */}
        <div className="w-full mt-8 sm:mt-10 pb-8"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
          <button onClick={handleContinue} disabled={!weight || !feet}
            className="w-full flex items-center justify-center gap-2.5 py-4 sm:py-[18px] text-white font-semibold text-[16px] rounded-full disabled:opacity-30 active:scale-[0.98]"
            style={{ backgroundColor: '#0C2631', transition: 'all 0.2s ease' }}>
            Next <span className="text-lg">&rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
