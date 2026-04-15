'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmCongratsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const GOLD = '#c5a55a';
const NAVY = '#0C2631';

const avatarPhotos = [
  '/assets/images/products/photo-1494790108377-be9c29b29330.jpg',
  '/assets/images/products/photo-1507003211169-0a1dd7228f2d.jpg',
  '/assets/images/products/photo-1506794778202-cad84cf45f1d.jpg',
  '/assets/images/products/photo-1534528741775-53994a69daeb.jpg',
  '/assets/images/products/photo-1500648767791-00dcc994a43e.jpg',
  '/assets/images/products/photo-1438761681033-6461ffad8d80.jpg',
  '/assets/images/products/photo-1472099645785-5658abf4ff4e.jpg',
  '/assets/images/products/photo-1539571696357-5a69c17a67c6.jpg',
  '/assets/images/products/photo-1517841905240-472988babdf9.jpg',
  '/assets/images/products/photo-1524504388940-b1c1722653e1.jpg',
];

const testimonials = [
  {
    src: '/assets/images/testimonials/d5f89c91-b2e1-4941-bec9-81a6145c71bc.jpg',
    stat: '-31 lbs',
    time: 'in 5 months',
  },
  {
    src: '/assets/images/testimonials/1e7c5ed9-6cb8-4db4-ad8f-0c23c4cbcd54.jpg',
    stat: '-38 lbs',
    time: 'in 5 months',
  },
  {
    src: '/assets/images/testimonials/b417b574-d2ed-4ace-873b-53d5ae7c2f16.jpg',
    stat: '-18 lbs',
    time: 'in 3 months',
  },
  {
    src: '/assets/images/testimonials/0b85f8fc-3001-4059-aa86-a4b23a0d59ab.jpg',
    stat: '-33 lbs',
    time: 'in 6 months',
  },
  {
    src: '/assets/images/testimonials/a037d37f-c820-46c8-a47f-ed94c0aa34aa.jpg',
    stat: '-45 lbs',
    time: 'in 8 months',
  },
  {
    src: '/assets/images/testimonials/f24bbde1-fa6c-4e91-8901-1be97083cc7c.jpg',
    stat: '-35 lbs',
    time: 'in 7 months',
  },
  {
    src: '/assets/images/testimonials/20c72c1d-da6f-4a85-80d2-1b90fa8bb499.jpg',
    stat: '-27 lbs',
    time: 'in 5 months',
  },
  {
    src: '/assets/images/testimonials/a4759ff2-50f4-4b40-bded-64ada3083e61.jpg',
    stat: '-58 lbs',
    time: 'in 12 months',
  },
  {
    src: '/assets/images/testimonials/7d5e1d57-464e-4db2-b187-603d2e992e79.jpg',
    stat: '-35 lbs',
    time: 'in 6 months',
  },
];

function GoldCheck() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: GOLD }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6L5 8.5L9.5 3.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function GreenCheck() {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: '#10b981' }}
    >
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6L5 8.5L9.5 3.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function WmCongratsStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmCongratsStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const weight = Number(responses.current_weight) || 200;
  const goalWeight = Number(responses.ideal_weight) || 150;
  const lbsToLose = weight - goalWeight;
  const heightFt = responses.height_feet || '5';
  const heightIn = responses.height_inches || '4';
  const totalInches = Number(heightFt) * 12 + Number(heightIn);
  const bmi = totalInches > 0 ? ((weight / (totalInches * totalInches)) * 703).toFixed(1) : '0';
  const projectedBmi =
    totalInches > 0 ? ((goalWeight / (totalInches * totalInches)) * 703).toFixed(1) : '0';
  const weeksToGoal = Math.max(1, Math.ceil(lbsToLose / 4));
  const monthsToGoal = Math.max(1, Math.round(weeksToGoal / 4));

  const handleContinue = () => {
    markStepCompleted('congrats');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleContinueRef = useRef(handleContinue);
  handleContinueRef.current = handleContinue;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinueRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const doubledTestimonials = [...testimonials, ...testimonials];

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      {/* Marquee + keyframes CSS */}
      <style>{`
        @keyframes wmMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes wmMarqueeReverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .wm-marquee { overflow: hidden; }
        .wm-marquee-track {
          display: flex;
          gap: 1rem;
          width: max-content;
          animation: wmMarquee 40s linear infinite;
        }
        .wm-marquee-track-reverse {
          display: flex;
          gap: 1rem;
          width: max-content;
          animation: wmMarqueeReverse 45s linear infinite;
        }
        .wm-marquee:hover .wm-marquee-track,
        .wm-marquee:hover .wm-marquee-track-reverse { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .wm-marquee-track,
          .wm-marquee-track-reverse { animation: none; overflow-x: auto; }
        }
      `}</style>

      {/* Progress bar */}
      <div className="h-[3px] w-full" style={{ backgroundColor: '#e5e7eb' }}>
        <div
          className="h-full"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: '#c3b29e',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      {/* Header */}
      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div>
          {prevStep && (
            <button
              onClick={handleBack}
              className="rounded-lg p-2.5 transition-all hover:bg-black/5 active:scale-95"
              aria-label="Go back"
            >
              <svg
                className="h-5 w-5"
                style={{ color: '#101010' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
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

      {/* Main content */}
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-6 pb-6 pt-6 sm:px-8">
        {/* Hero heading */}
        <h1 className="mb-2 w-full text-left text-[2rem] font-bold leading-tight sm:text-[2.5rem]">
          <span style={{ color: GOLD }}>Congrats,</span>{' '}
          <span style={{ color: '#101010' }}>you&apos;re in!</span>
        </h1>

        <p className="mb-1 w-full text-left text-lg font-bold sm:text-xl" style={{ color: GOLD }}>
          America&apos;s #1 GLP-1 Weight Loss Program is ready for you.
        </p>
        <p className="mb-8 w-full text-left text-base" style={{ color: '#101010' }}>
          Claim your prescription and plan below to start achieving your goals.
        </p>

        {/* Comparison cards — larger */}
        <div className="mb-10 grid w-full grid-cols-2 gap-3">
          {/* Today card */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#fad69d' }}>
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#6b7280' }}
            >
              Today
            </p>
            <div className="mb-4 flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/images/products/f94b3019-214c-4704-9fb5-e220fe7386dc.png"
                alt=""
                className="h-32 w-16 object-contain sm:h-40 sm:w-20"
                style={{ filter: 'brightness(0) invert(1)', opacity: 0.5 }}
              />
            </div>
            <div className="space-y-2">
              <div className="rounded-xl bg-white/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  Weight
                </p>
                <p className="text-base font-bold sm:text-lg" style={{ color: '#101010' }}>
                  {weight} Lbs
                </p>
              </div>
              <div className="rounded-xl bg-white/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  BMI
                </p>
                <p className="text-base font-bold sm:text-lg" style={{ color: '#101010' }}>
                  {bmi} normal
                </p>
              </div>
              <div className="rounded-xl bg-white/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  Cravings
                </p>
                <p className="text-base font-bold sm:text-lg" style={{ color: '#101010' }}>
                  Uncontrolled
                </p>
              </div>
            </div>
          </div>

          {/* Future card */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#ffe9c2' }}>
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: GOLD }}
            >
              You, in {monthsToGoal} month{monthsToGoal !== 1 ? 's' : ''}
            </p>
            <div className="mb-4 flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/images/products/1770d792-f769-42cf-b041-4cf11d975b7d.png"
                alt=""
                className="h-32 w-16 object-contain sm:h-40 sm:w-20"
                style={{ filter: 'sepia(0.4) saturate(0.6) brightness(1.1)', opacity: 0.45 }}
              />
            </div>
            <div className="space-y-2">
              <div className="rounded-xl px-3 py-2" style={{ backgroundColor: '#e8d5a8' }}>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  Weight
                </p>
                <p className="text-base font-bold sm:text-lg" style={{ color: '#101010' }}>
                  {goalWeight} Lbs
                </p>
              </div>
              <div className="rounded-xl px-3 py-2" style={{ backgroundColor: '#e8d5a8' }}>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  BMI
                </p>
                <p className="text-base font-bold sm:text-lg" style={{ color: '#101010' }}>
                  {projectedBmi}
                </p>
              </div>
              <div className="rounded-xl px-3 py-2" style={{ backgroundColor: '#e8d5a8' }}>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  Cravings
                </p>
                <p className="text-base font-bold sm:text-lg" style={{ color: '#101010' }}>
                  Reduced
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Continue to Checkout button — above Next Steps */}
        <div className="mb-10 w-full sm:mx-auto sm:max-w-[31rem]">
          <button
            onClick={handleContinue}
            className="wm-next-btn shine-button flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-semibold text-white transition-transform active:scale-[0.98] sm:text-[1.125rem]"
            style={{ height: 56, backgroundColor: NAVY, cursor: 'pointer' }}
          >
            Continue to Checkout
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="ml-1">
              <path
                d="M7.5 4L13.5 10L7.5 16"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Next Steps */}
        <h2 className="mb-4 text-center text-xl font-bold sm:text-2xl" style={{ color: '#101010' }}>
          Your <span style={{ color: '#dac09d' }}>Next Steps.</span>
        </h2>
        <div className="mb-10 w-full space-y-3">
          {[
            { num: 1, text: 'Pick your medication', image: '/assets/images/products/image-6.png' },
            { num: 2, text: 'Get it delivered', image: '/assets/images/products/image-310.png' },
            {
              num: 3,
              text: 'Reach your goals',
              image: '/assets/images/products/Gemini-Generated-Image-qrkq7iqrkq7iqrkq-2.png',
            },
          ].map((s) => (
            <div
              key={s.num}
              className="flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-5"
              style={{ background: 'linear-gradient(135deg, #d4c49e 0%, #c3b29e 100%)' }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: '#a0906e' }}
              >
                {s.num}
              </div>
              <span className="flex-1 text-base font-medium" style={{ color: '#101010' }}>
                {s.text}
              </span>
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" className="h-20 w-20 shrink-0 object-contain" />
              )}
            </div>
          ))}
        </div>

        {/* Support */}
        <h2 className="mb-3 text-center text-xl font-bold sm:text-2xl" style={{ color: '#101010' }}>
          Your <span style={{ color: '#b0a08a' }}>Wellmedr +</span>
          <br />
          Complete Support
        </h2>
        <div className="mb-4 flex w-full justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/images/products/image-310.png"
            alt="Wellmedr delivery"
            className="h-auto w-48 object-contain sm:w-56"
          />
        </div>
        <div
          className="mb-10 flex justify-center gap-4 text-sm font-medium"
          style={{ color: '#101010' }}
        >
          <span className="flex items-center gap-1.5">
            <GreenCheck /> All-in-one
          </span>
          <span className="flex items-center gap-1.5">
            <GreenCheck /> 48-hour delivery
          </span>
          <span className="flex items-center gap-1.5">
            <GreenCheck /> Always Free
          </span>
        </div>

        {/* Why switching */}
        <h2 className="mb-2 text-center text-xl font-bold sm:text-2xl" style={{ color: '#101010' }}>
          Why is everyone switching to
          <br />
          <span style={{ color: GOLD }}>Wellmedr</span>?
        </h2>
        <p className="mb-1 text-center font-bold" style={{ color: '#101010' }}>
          Our members hit their goals{' '}
          <span className="italic" style={{ color: GOLD, fontFamily: "'BodoniSvtyTwo', serif" }}>
            faster.
          </span>
        </p>
        <p className="mb-5 text-center" style={{ color: '#101010' }}>
          And{' '}
          <span className="italic" style={{ color: GOLD, fontFamily: "'BodoniSvtyTwo', serif" }}>
            you will too.
          </span>
        </p>

        <div className="mb-8 w-full rounded-2xl p-5" style={{ backgroundColor: '#faf5e8' }}>
          <div className="space-y-3">
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Starting Weight:{' '}
              <span style={{ color: GOLD }} className="font-bold">
                {weight} lbs
              </span>
            </p>
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Goal Weight:{' '}
              <span style={{ color: GOLD }} className="font-bold">
                {goalWeight} lbs
              </span>
            </p>
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Lose{' '}
              <span style={{ color: GOLD }} className="font-bold">
                {lbsToLose} lbs
              </span>{' '}
              in {weeksToGoal} weeks
            </p>
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Minimize side effects
            </p>
          </div>
        </div>

        {/* Guarantee */}
        <h2 className="mb-1 w-full text-left text-xl font-bold">
          Start Today With
          <br />
          Everything You Need.
        </h2>
        <p className="mb-4 w-full text-left" style={{ color: '#555' }}>
          We&apos;re committed. Our guarantee proves it.
        </p>

        <div className="mb-8 w-full rounded-2xl p-5" style={{ backgroundColor: '#faf5e8' }}>
          <div className="space-y-3">
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> GLP-1 Prescription
            </p>
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Clinical Support
            </p>
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Delivered to your door
            </p>
            <p className="flex items-center gap-3 text-[15px]">
              <GoldCheck /> Results guaranteed
            </p>
          </div>
        </div>

        {/* Marquee Row 1 — slides left */}
        <div className="wm-marquee mb-3 w-full">
          <div className="wm-marquee-track">
            {doubledTestimonials.map((t, i) => (
              <div key={`r1-${i}`} className="w-[200px] flex-shrink-0 sm:w-[240px]">
                <div className="overflow-hidden rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.src}
                    alt={`${t.stat} ${t.time}`}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Marquee Row 2 — slides right */}
        <div className="wm-marquee mb-4 w-full">
          <div className="wm-marquee-track-reverse">
            {[...doubledTestimonials].reverse().map((t, i) => (
              <div key={`r2-${i}`} className="w-[200px] flex-shrink-0 sm:w-[240px]">
                <div className="overflow-hidden rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.src}
                    alt={`${t.stat} ${t.time}`}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
          Inspired by real patient success stories in similar Telehealth programs. Average weight
          loss in clinical programs: <strong>25–40 lbs.</strong> Individual results vary.
        </p>

        <p className="mb-4 text-center text-xl font-bold">Here&apos;s the best part...</p>
        <div className="mx-auto mb-4 w-32 sm:w-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/images/products/c9eaaa59-008d-4430-816e-7501a58aec6b.png"
            alt="6-Month Wellmedr Care Guarantee"
            className="h-auto w-full"
          />
        </div>

        <p className="mb-6 text-center text-base" style={{ color: '#101010' }}>
          If you don&apos;t lose{' '}
          <span style={{ color: GOLD }} className="font-bold">
            weight
          </span>{' '}
          in{' '}
          <span style={{ color: GOLD }} className="font-bold">
            6 months
          </span>
          , you get 100% of your money back.
          <br />
          Join patients pursuing medically-guided weight loss with Wellmedr
        </p>

        {/* Avatar row */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-2 flex items-center justify-center">
            {avatarPhotos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                className="h-10 w-10 rounded-full border-2 border-white object-cover"
                style={{ marginLeft: i === 0 ? 0 : -8 }}
              />
            ))}
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: GOLD }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Verified Program
          </span>
        </div>

        <p className="mb-8 text-center text-sm font-bold">
          Program structure and care process verified. Individual results may vary.
        </p>
      </div>

      {/* Bottom CTA (repeat) */}
      <div className="mx-auto w-full max-w-[600px] px-6 pb-8 sm:mx-auto sm:max-w-[31rem] sm:px-8">
        <button
          onClick={handleContinue}
          className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-semibold text-white transition-transform active:scale-[0.98] sm:text-[1.125rem]"
          style={{ height: 56, backgroundColor: NAVY, cursor: 'pointer' }}
        >
          Continue to Checkout
        </button>
      </div>
    </div>
  );
}
