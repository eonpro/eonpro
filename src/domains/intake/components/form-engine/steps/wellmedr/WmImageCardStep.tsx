'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CardOption {
  id: string;
  label: string;
  subtitle?: string;
  iconId?: string;
}

const iconFilter = 'brightness(0) saturate(100%) invert(64%) sepia(21%) saturate(403%) hue-rotate(164deg) brightness(87%) contrast(89%)';

function CardIcon({ iconId }: { iconId: string }) {
  const imgStyle = { width: 56, height: 56, objectFit: 'contain' as const, filter: iconFilter };
  const silStyle = { width: 80, height: 140, objectFit: 'contain' as const, filter: iconFilter };
  switch (iconId) {
    case 'male':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/male-silhouette.svg" alt="Male" style={silStyle} />;
    case 'female':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/female-silhouette.svg" alt="Female" style={silStyle} />;
    case 'low_libido':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/low-libido.svg" alt="Low libido" style={imgStyle} />;
    case 'hair_loss':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/hair-loss.svg" alt="Hair loss" style={imgStyle} />;
    case 'skin_issues':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/skin-issues.svg" alt="Skin issues" style={imgStyle} />;
    case 'cognition':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/cognition.svg" alt="Cognition" style={imgStyle} />;
    case 'ok_hand':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/ok-hand.svg" alt="OK" style={imgStyle} />;
    case 'lose_weight':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/lose-weight.svg" alt="Lose weight" style={imgStyle} />;
    case 'gain_muscle':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/gain-muscle.svg" alt="Gain muscle" style={imgStyle} />;
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

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const resolvedHeaderItalic = headerItalic === 'gender-text'
    ? (responses.sex === 'female' ? 'Women' : 'Men')
    : headerItalic;

  const [selected, setSelected] = useState<string | string[]>(
    mode === 'multi'
      ? (Array.isArray(responses[storageKey]) ? responses[storageKey] as string[] : [])
      : (String(responses[storageKey] || ''))
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

  useEffect(() => {
    if (mode !== 'multi') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const isSelected = (id: string) =>
    mode === 'multi' ? Array.isArray(selected) && selected.includes(id) : selected === id;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-card-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
        }
        @media (min-width: 640px) {
          .wm-card-grid {
            grid-template-columns: repeat(auto-fit, minmax(0, 200px));
            justify-content: center;
          }
        }
      `}</style>
      <div className="w-full h-[3px]" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      <div className="w-full max-w-[48rem] mx-auto px-6 pt-4 grid grid-cols-3 items-center">
        <div>
          {prevStep && (
            <button onClick={handleBack} className="p-2.5 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
              <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6">
        {(headerText || resolvedHeaderItalic) && (
          <h1
            className="text-xl sm:text-[2rem] font-bold text-center leading-snug mb-3 sm:mb-4 px-2"
            style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}
          >
            {resolvedHeaderItalic && <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{resolvedHeaderItalic} </span>}
            {headerText}
          </h1>
        )}

        <h2
          className="text-lg sm:text-[1.5rem] font-bold text-center mb-1 sm:mb-2"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.15s' }}
        >
          {question}
        </h2>

        {subtitle && (
          <p
            className="text-center text-[13px] sm:text-base mb-4 sm:mb-6 px-4"
            style={{ color: '#666', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.2s' }}
          >
            {subtitle}
          </p>
        )}

        <div className="wm-card-grid gap-4 w-full mt-2 sm:mt-4">
          {cards.map((card, i) => {
            const isSilhouette = card.iconId === 'male' || card.iconId === 'female';
            const sel = isSelected(card.id);
            return (
              <button
                key={card.id}
                onClick={() => handleSelect(card.id)}
                className="relative flex flex-col items-center justify-center rounded-[20px] overflow-hidden"
                style={{
                  minHeight: isSilhouette ? '200px' : '120px',
                  padding: isSilhouette ? '24px 16px' : '16px 12px',
                  backgroundColor: sel ? '#f5f0e8' : '#ffffff',
                  border: `2px solid ${sel ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                  boxShadow: sel ? '0 0 0 2px #c3b29e, 0 4px 12px rgba(195,178,158,0.2)' : '0 1px 4px rgba(0,0,0,0.04)',
                  transform: mounted ? (sel ? 'scale(1.02)' : 'scale(1)') : 'scale(0.95)',
                  opacity: mounted ? 1 : 0,
                  transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.05 * i}s`,
                }}
              >
                {/* Radio indicator */}
                <div
                  className="absolute top-3 right-3 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center"
                  style={{
                    border: `2px solid ${sel ? '#7B95A9' : '#d1d5db'}`,
                    backgroundColor: 'transparent',
                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {sel && (
                    <div className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full" style={{ backgroundColor: '#7B95A9' }} />
                  )}
                </div>

                {/* Icon */}
                {card.iconId && (
                  <div
                    className="mb-2 flex items-center justify-center"
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
                  className="font-medium text-[15px] sm:text-base text-center leading-tight"
                  style={{ color: '#101010' }}
                >
                  {card.label}
                </span>
                {card.subtitle && (
                  <span className="text-[11px] sm:text-xs text-center mt-0.5" style={{ color: '#999' }}>{card.subtitle}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'multi' && (
        <div className="w-full max-w-[600px] sm:max-w-[31rem] mx-auto sm:mx-auto px-6 sm:px-8 mt-8 pb-8" style={{ backgroundColor: '#F7F7F9' }}>
          <button
            onClick={handleContinue}
            className="w-full wm-next-btn flex items-center justify-center gap-4 py-4 text-white font-normal text-base sm:text-[1.125rem] rounded-full active:scale-[0.98]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
          >
            Next <span className="text-lg">&rarr;</span>
          </button>
        </div>
      )}
    </div>
  );
}
