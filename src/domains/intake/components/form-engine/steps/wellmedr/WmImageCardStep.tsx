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

function CardIcon({ iconId }: { iconId: string }) {
  const imgStyle = { width: 52, height: 52, objectFit: 'contain' as const };
  const silStyle = { width: 56, height: 100, objectFit: 'contain' as const, opacity: 0.55 };
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

  const [selected, setSelected] = useState<string | string[]>(
    mode === 'multi'
      ? (Array.isArray(responses[storageKey]) ? responses[storageKey] as string[] : [])
      : (String(responses[storageKey] || ''))
  );

  const handleSelect = (id: string) => {
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

  const isSelected = (id: string) =>
    mode === 'multi' ? Array.isArray(selected) && selected.includes(id) : selected === id;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-5 sm:px-8 pt-6 sm:pt-8 pb-4 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/wellmedr-logo.svg" alt="wellmedr."
          className="h-6 sm:h-7 mb-6 sm:mb-8"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-8px)', transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)' }}
        />

        {(headerText || headerItalic) && (
          <h1
            className="text-xl sm:text-[2rem] font-bold text-center leading-snug mb-3 sm:mb-4 px-2"
            style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}
          >
            {headerItalic && <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{headerItalic} </span>}
            {headerText}
          </h1>
        )}

        <h2
          className="text-lg sm:text-[1.5rem] font-bold text-center mb-1 sm:mb-2"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.15s' }}
        >
          {question}
          <span className="ml-1" style={{ color: '#c3b29e' }}>*</span>
        </h2>

        {subtitle && (
          <p
            className="text-center text-[13px] sm:text-base mb-4 sm:mb-6 px-4"
            style={{ color: '#666', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.2s' }}
          >
            {subtitle}
          </p>
        )}

        <div className={`grid ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-3 sm:gap-4 w-full mt-2 sm:mt-4`}>
          {cards.map((card, i) => {
            const sel = isSelected(card.id);
            return (
              <button
                key={card.id}
                onClick={() => handleSelect(card.id)}
                className="relative flex flex-col items-center justify-center rounded-[20px] overflow-hidden"
                style={{
                  minHeight: card.iconId === 'male' || card.iconId === 'female' ? '160px' : '110px',
                  padding: '16px 12px',
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
                  className="absolute top-3 right-3 w-[22px] h-[22px] rounded-full flex items-center justify-center"
                  style={{
                    border: `2px solid ${sel ? '#c3b29e' : '#d1d5db'}`,
                    backgroundColor: sel ? '#c3b29e' : 'transparent',
                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: sel ? '0 0 0 3px rgba(195,178,158,0.15)' : 'none',
                  }}
                >
                  {sel && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
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
                  className="font-semibold text-[13px] sm:text-[15px] text-center leading-tight"
                  style={{ color: sel ? '#101010' : '#333' }}
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
        <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
          <button
            onClick={handleContinue}
            disabled={!Array.isArray(selected) || selected.length === 0}
            className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full disabled:opacity-30"
            style={{
              backgroundColor: '#0C2631',
              transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              transform: (!Array.isArray(selected) || selected.length === 0) ? 'scale(1)' : 'scale(1)',
            }}
          >
            Next <span className="text-lg">&rarr;</span>
          </button>
        </div>
      )}
    </div>
  );
}
