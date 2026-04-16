'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CardOption {
  id: string;
  label: string;
  subtitle?: string;
  iconId?: string;
}

const iconFilter =
  'brightness(0) saturate(100%) invert(64%) sepia(21%) saturate(403%) hue-rotate(164deg) brightness(87%) contrast(89%)';

function CardIcon({ iconId }: { iconId: string }) {
  const imgStyle = { width: 64, height: 64, objectFit: 'contain' as const, filter: iconFilter };
  const silStyle = { width: 100, height: 180, objectFit: 'contain' as const, filter: iconFilter };
  switch (iconId) {
    case 'male':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/male-silhouette.svg" alt="Male" style={silStyle} />;
    case 'female':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/female-silhouette.svg" alt="Female" style={silStyle} />
      );
    case 'low_libido':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/low-libido.svg" alt="Low libido" style={imgStyle} />;
    case 'hair_loss':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/hair-loss.svg" alt="Hair loss" style={imgStyle} />;
    case 'skin_issues':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/skin-issues.svg" alt="Skin issues" style={imgStyle} />
      );
    case 'cognition':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/cognition.svg" alt="Cognition" style={imgStyle} />;
    case 'ok_hand':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/ok-hand.svg" alt="OK" style={imgStyle} />;
    case 'lose_weight':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/lose-weight.svg" alt="Lose weight" style={imgStyle} />
      );
    case 'gain_muscle':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/gain-muscle.svg" alt="Gain muscle" style={imgStyle} />
      );
    case 'faster':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/faster.svg" alt="Faster" style={imgStyle} />;
    case 'steady':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/steady.svg" alt="Steady" style={imgStyle} />;
    case 'good_sleep':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/good-sleep.svg" alt="Pretty good" style={imgStyle} />;
    case 'bit_restless':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img
          src="/assets/icons/wellmedr/bit-restless-sleep.svg"
          alt="A bit restless"
          style={imgStyle}
        />
      );
    case 'bad_sleep':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/bad-sleep.svg" alt="I don't sleep well" style={imgStyle} />
      );
    case 'affordability':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/affordability.svg" alt="Affordability" style={imgStyle} />
      );
    case 'potency':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/potency.svg" alt="Potency" style={imgStyle} />;
    case 'ready':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/ready.svg" alt="I'm ready!" style={imgStyle} />;
    case 'hopeful':
      /* eslint-disable-next-line @next/next/no-img-element */
      return (
        <img src="/assets/icons/wellmedr/hopeful.svg" alt="I'm feeling hopeful" style={imgStyle} />
      );
    case 'cautious':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/cautious.svg" alt="I'm cautious" style={imgStyle} />;
    default:
      return null;
  }
}

interface WmImageCardStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerText?: string;
  headerItalic?: string;
  question: string;
  subtitle?: string;
  storageKey: string;
  cards: CardOption[];
  columns?: 2 | 3;
  mode?: 'single' | 'multi';
}

export default function WmImageCardStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerText,
  headerItalic,
  question,
  subtitle,
  storageKey,
  cards,
  columns = 2,
  mode = 'single',
}: WmImageCardStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const resolvedHeaderItalic =
    headerItalic === 'gender-text' ? (responses.sex === 'female' ? 'Women' : 'Men') : headerItalic;

  const [selected, setSelected] = useState<string | string[]>(
    mode === 'multi'
      ? Array.isArray(responses[storageKey])
        ? (responses[storageKey] as string[])
        : []
      : String(responses[storageKey] || '')
  );

  const handleSelect = (id: string) => {
    navigator.vibrate?.(10);
    if (mode === 'multi') {
      const arr = Array.isArray(selected) ? selected : [];
      setSelected(arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id]);
    } else {
      setSelected(id);
      setResponse(storageKey, id);
      markStepCompleted(storageKey);
      setTimeout(() => {
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }, 300);
    }
  };

  const handleContinue = () => {
    if (mode === 'multi' && (!Array.isArray(selected) || selected.length === 0)) return;
    setResponse(storageKey, selected);
    markStepCompleted(storageKey);
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleContinueRef = useRef(handleContinue);
  handleContinueRef.current = handleContinue;

  useEffect(() => {
    if (mode !== 'multi') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinueRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const isSelected = (id: string) =>
    mode === 'multi' ? Array.isArray(selected) && selected.includes(id) : selected === id;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-card-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 1rem;
        }
        @media (min-width: 640px) {
          .wm-card-grid {
            grid-template-columns: repeat(${cards.length}, 1fr);
          }
          .wm-card-grid > button {
            min-height: 280px;
            padding: 3rem 1rem 2rem;
          }
          .wm-card-grid .wm-card-icon img {
            width: 80px !important;
            height: 80px !important;
          }
        }
      `}</style>
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

      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div />
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col items-center justify-center px-6 pb-6 sm:max-w-[1100px] sm:px-8">
        {(headerText || resolvedHeaderItalic) && (
          <h1
            className="mb-3 px-2 text-center text-xl font-bold leading-snug sm:mb-4 sm:text-[2rem]"
            style={{
              color: '#101010',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(12px)',
              transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s',
            }}
          >
            {resolvedHeaderItalic && (
              <span
                className="font-normal italic"
                style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
              >
                {resolvedHeaderItalic}{' '}
              </span>
            )}
            {headerText}
          </h1>
        )}

        <h2
          className="mb-1 text-center text-lg font-bold sm:mb-2 sm:text-[1.5rem]"
          style={{
            color: '#101010',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.15s',
          }}
        >
          {question}
        </h2>

        {subtitle && (
          <p
            className="mb-4 px-4 text-center text-[13px] sm:mb-6 sm:text-base"
            style={{
              color: '#666',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.2s',
            }}
          >
            {subtitle}
          </p>
        )}

        <div className="wm-card-grid mt-2 w-full gap-4 sm:mt-4">
          {cards.map((card, i) => {
            const isSilhouette = card.iconId === 'male' || card.iconId === 'female';
            const sel = isSelected(card.id);
            return (
              <button
                key={card.id}
                onClick={() => handleSelect(card.id)}
                className="relative flex flex-col items-center justify-center overflow-hidden rounded-[20px]"
                style={{
                  minHeight: isSilhouette ? '160px' : '110px',
                  padding: isSilhouette ? '16px 12px' : '14px 12px',
                  backgroundColor: sel ? '#f5f0e8' : '#ffffff',
                  border: `2px solid ${sel ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                  boxShadow: sel
                    ? '0 0 0 2px #c3b29e, 0 4px 12px rgba(195,178,158,0.2)'
                    : '0 1px 4px rgba(0,0,0,0.04)',
                  transform: mounted ? (sel ? 'scale(1.02)' : 'scale(1)') : 'scale(0.95)',
                  opacity: mounted ? 1 : 0,
                  transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.05 * i}s`,
                }}
              >
                {/* Radio indicator */}
                <div
                  className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8"
                  style={{
                    border: `2px solid ${sel ? '#7B95A9' : '#d1d5db'}`,
                    backgroundColor: 'transparent',
                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {sel && (
                    <div
                      className="h-2.5 w-2.5 rounded-full sm:h-3.5 sm:w-3.5"
                      style={{ backgroundColor: '#7B95A9' }}
                    />
                  )}
                </div>

                {/* Icon */}
                {card.iconId && (
                  <div
                    className="wm-card-icon mb-3 flex items-center justify-center"
                    style={{
                      transform: sel ? 'scale(1.05)' : 'scale(1)',
                      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
                    }}
                  >
                    <CardIcon iconId={card.iconId} />
                  </div>
                )}

                {/* Label */}
                <span
                  className="text-center text-[15px] font-medium leading-tight sm:text-base"
                  style={{ color: '#101010' }}
                >
                  {card.label}
                </span>
                {card.subtitle && (
                  <span
                    className="mt-0.5 text-center text-[11px] sm:text-xs"
                    style={{ color: '#999' }}
                  >
                    {card.subtitle}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'multi' && (
        <div
          className="mx-auto mt-8 w-full max-w-[600px] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-[31rem] sm:px-8"
          style={{ backgroundColor: '#F7F7F9' }}
        >
          <button
            onClick={handleContinue}
            className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-4 text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
          >
            Next <span className="text-lg">&rarr;</span>
          </button>
        </div>
      )}
    </div>
  );
}
