'use client';

import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmCongratsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmCongratsStep({
  basePath,
  nextStep,
  progressPercent,
}: WmCongratsStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const weight = Number(responses.current_weight) || 200;
  const goalWeight = Number(responses.ideal_weight) || 150;
  const lbsToLose = weight - goalWeight;
  const heightFt = responses.height_feet || '5';
  const heightIn = responses.height_inches || '4';
  const totalInches = Number(heightFt) * 12 + Number(heightIn);
  const bmi = totalInches > 0 ? ((weight / (totalInches * totalInches)) * 703).toFixed(1) : '0';
  const projectedBmi = totalInches > 0 ? ((goalWeight / (totalInches * totalInches)) * 703).toFixed(1) : '0';
  const weeksToGoal = Math.max(1, Math.ceil(lbsToLose / 4));

  const handleContinue = () => {
    markStepCompleted('congrats');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        <h1 className="text-[2rem] sm:text-[2.5rem] font-bold text-left w-full mb-2">
          <span style={{ color: '#c5a55a' }}>Congrats,</span>{' '}
          <span style={{ color: '#101010' }}>you&apos;re in!</span>
        </h1>

        <p className="text-lg sm:text-xl font-bold text-left w-full mb-1" style={{ color: '#7B95A9' }}>
          America&apos;s #1 GLP-1 Weight Loss Program is ready for you.
        </p>
        <p className="text-base text-left w-full mb-6" style={{ color: '#101010' }}>
          Claim your prescription and plan below to start achieving your goals.
        </p>

        {/* Today vs 1 Month comparison */}
        <div className="grid grid-cols-2 gap-3 w-full mb-8">
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#f0dfa8' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#8a7d6e' }}>Today</p>
            <div className="flex items-start gap-2 mb-3">
              <svg className="w-8 h-16 opacity-30" viewBox="0 0 30 60" fill="currentColor"><ellipse cx="15" cy="8" rx="6" ry="7"/><path d="M5,22 Q15,18 25,22 L23,50 Q15,52 7,50 Z"/></svg>
              <div className="space-y-1.5 flex-1">
                <div className="rounded-lg px-3 py-1.5 bg-white/60"><p className="text-[10px] opacity-60">Weight</p><p className="text-sm font-bold">{weight} Lbs</p></div>
                <div className="rounded-lg px-3 py-1.5 bg-white/60"><p className="text-[10px] opacity-60">BMI</p><p className="text-sm font-bold">{bmi}</p></div>
                <div className="rounded-lg px-3 py-1.5 bg-white/60"><p className="text-[10px] opacity-60">Cravings</p><p className="text-sm font-bold">Uncontrolled</p></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ backgroundColor: '#faf5e8' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#8a7d6e' }}>You, in 1 month</p>
            <div className="flex items-start gap-2 mb-3">
              <svg className="w-8 h-16 opacity-30" viewBox="0 0 30 60" fill="currentColor"><ellipse cx="15" cy="8" rx="5" ry="6.5"/><path d="M7,22 Q15,19 23,22 L21,50 Q15,51 9,50 Z"/></svg>
              <div className="space-y-1.5 flex-1">
                <div className="rounded-lg px-3 py-1.5 bg-white/60"><p className="text-[10px] opacity-60">Weight</p><p className="text-sm font-bold" style={{ color: '#c5a55a' }}>{Math.round(weight * 0.95)} Lbs</p></div>
                <div className="rounded-lg px-3 py-1.5 bg-white/60"><p className="text-[10px] opacity-60">BMI</p><p className="text-sm font-bold" style={{ color: '#c3b29e' }}>{projectedBmi}</p></div>
                <div className="rounded-lg px-3 py-1.5 bg-white/60"><p className="text-[10px] opacity-60">Cravings</p><p className="text-sm font-bold" style={{ color: '#c3b29e' }}>Reduced</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-4" style={{ color: '#101010' }}>
          Your <span style={{ color: '#c5a55a' }}>Next Steps.</span>
        </h2>
        <div className="w-full space-y-3 mb-8">
          {[
            { num: 1, text: 'Pick your medication' },
            { num: 2, text: 'Get it delivered' },
            { num: 3, text: 'Reach your goals' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-4 rounded-2xl px-5 py-4" style={{ backgroundColor: '#d4c49e' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: '#a0906e' }}>{s.num}</div>
              <span className="font-medium text-base" style={{ color: '#101010' }}>{s.text}</span>
            </div>
          ))}
        </div>

        {/* Support badges */}
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-3" style={{ color: '#101010' }}>
          Your <span style={{ color: '#7B95A9' }}>Wellmedr +</span><br />Complete Support
        </h2>
        <div className="flex gap-4 justify-center mb-8 text-sm">
          <span className="flex items-center gap-1"><span className="text-[#c3b29e]">&#10004;</span> All-in-one</span>
          <span className="flex items-center gap-1"><span className="text-[#c3b29e]">&#10004;</span> 48-hour delivery</span>
          <span className="flex items-center gap-1"><span className="text-[#c3b29e]">&#10004;</span> Always Free</span>
        </div>

        {/* Why switching */}
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-2" style={{ color: '#101010' }}>
          Why is everyone switching to<br /><span style={{ color: '#7B95A9' }}>Wellmedr</span>?
        </h2>
        <p className="text-center font-bold mb-1">Our members hit their goals <span className="italic" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>faster.</span></p>
        <p className="text-center mb-4">And <span className="italic" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>you will too.</span></p>

        <div className="w-full rounded-2xl p-5 mb-6" style={{ backgroundColor: '#fdf8ec' }}>
          <div className="space-y-2">
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Starting Weight: <span style={{ color: '#c5a55a' }} className="font-bold">{weight} lbs</span></p>
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Goal Weight: <span style={{ color: '#c5a55a' }} className="font-bold">{goalWeight} lbs</span></p>
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Lose <span style={{ color: '#c5a55a' }} className="font-bold">{lbsToLose} lbs</span> in {weeksToGoal} weeks</p>
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Minimize side effects</p>
          </div>
        </div>

        {/* Guarantee */}
        <h2 className="text-xl font-bold text-left w-full mb-1">Start Today With<br />Everything You Need.</h2>
        <p className="text-left w-full mb-4" style={{ color: '#555' }}>We&apos;re committed. Our guarantee proves it.</p>

        <div className="w-full rounded-2xl p-5 mb-6" style={{ backgroundColor: '#fdf8ec' }}>
          <div className="space-y-2">
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> GLP-1 Prescription</p>
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Clinical Support</p>
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Delivered to your door</p>
            <p className="flex items-center gap-2"><span className="text-[#c3b29e] text-lg">&#10004;</span> Results guaranteed</p>
          </div>
        </div>

        <p className="text-xl font-bold text-center mb-4">Here&apos;s the best part...</p>
        <div className="w-20 h-20 mb-4">
          <svg viewBox="0 0 80 80" fill="none"><path d="M40 5L50 25H70L54 38L60 58L40 45L20 58L26 38L10 25H30Z" fill="#c5a55a" stroke="#a08830" strokeWidth="1"/><text x="40" y="38" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">6-MONTH</text><text x="40" y="46" textAnchor="middle" fill="white" fontSize="5">Wellmedr</text><text x="40" y="53" textAnchor="middle" fill="white" fontSize="4">Care Guarantee</text></svg>
        </div>

        <p className="text-center text-base mb-6" style={{ color: '#101010' }}>
          If you don&apos;t lose <span style={{ color: '#c5a55a' }} className="font-bold">weight</span> in <span style={{ color: '#c5a55a' }} className="font-bold">6 months</span>, you get 100% of your money back.<br />
          Join patients pursuing medically-guided weight loss with Wellmedr
        </p>

        <p className="text-center text-sm mb-2 font-bold">Program structure and care process verified. Individual results may vary.</p>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-3 py-4 text-white font-medium text-base rounded-full active:scale-[0.98] text-lg"
          style={{ backgroundColor: '#0C2631' }}
        >
          Continue to Checkout
        </button>
      </div>
    </div>
  );
}
