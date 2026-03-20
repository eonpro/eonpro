'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CardOption {
  id: string;
  label: string;
  subtitle?: string;
  iconId?: string;
}

function CardIcon({ iconId }: { iconId: string }) {
  const c = '#7B95A9';
  const s = { stroke: c, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (iconId) {
    case 'male':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/male-silhouette.svg" alt="Male" style={{ width: 56, height: 100, objectFit: 'contain', opacity: 0.55 }} />;
    case 'female':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/female-silhouette.svg" alt="Female" style={{ width: 56, height: 100, objectFit: 'contain', opacity: 0.55 }} />;
    case 'low_libido':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/low-libido.svg" alt="Low libido" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
    case 'hair_loss':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/hair-loss.svg" alt="Hair loss" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
    case 'skin_issues':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/skin-issues.svg" alt="Skin issues" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
    case 'cognition':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/cognition.svg" alt="Cognition" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
    case 'ok_hand':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/ok-hand.svg" alt="OK" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
    case 'lose_weight':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/lose-weight.svg" alt="Lose weight" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
    case 'gain_muscle':
      /* eslint-disable-next-line @next/next/no-img-element */
      return <img src="/assets/icons/wellmedr/gain-muscle.svg" alt="Gain muscle" style={{ width: 48, height: 48, objectFit: 'contain' }} />;
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
      }, 250);
    }
  };

  const handleContinue = () => {
    if (mode === 'single' && !selected) return;
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
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-5 sm:px-8 pt-6 sm:pt-8 pb-4 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        {(headerText || headerItalic) && (
          <h1 className="text-xl sm:text-[2rem] font-bold text-center leading-snug mb-3 sm:mb-4 px-2" style={{ color: '#101010' }}>
            {headerItalic && <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{headerItalic} </span>}
            {headerText}
          </h1>
        )}

        <h2 className="text-lg sm:text-[1.5rem] font-bold text-center mb-1 sm:mb-2" style={{ color: '#101010' }}>
          {question}
          <span className="ml-1" style={{ color: '#c3b29e' }}>*</span>
        </h2>

        {subtitle && (
          <p className="text-center text-[13px] sm:text-base mb-4 sm:mb-6 px-4" style={{ color: '#666' }}>{subtitle}</p>
        )}

        <div className={`grid ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-3 w-full mt-2 sm:mt-4`}>
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => handleSelect(card.id)}
              className="relative flex flex-col items-center justify-center min-h-[80px] sm:min-h-[100px] p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 bg-white active:scale-[0.97]"
              style={{
                borderColor: isSelected(card.id) ? '#c3b29e' : '#e8e8e8',
                boxShadow: isSelected(card.id) ? '0 0 0 1px #c3b29e' : '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors" style={{ borderColor: isSelected(card.id) ? '#c3b29e' : '#d1d5db' }}>
                {isSelected(card.id) && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#c3b29e' }} />}
              </div>
              {card.iconId && <div className="mb-2"><CardIcon iconId={card.iconId} /></div>}
              <span className="font-medium text-[13px] sm:text-base text-center leading-tight" style={{ color: '#101010' }}>{card.label}</span>
              {card.subtitle && <span className="text-[11px] sm:text-sm text-center mt-0.5" style={{ color: '#999' }}>{card.subtitle}</span>}
            </button>
          ))}
        </div>
      </div>

      {mode === 'multi' && (
        <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
          <button
            onClick={handleContinue}
            disabled={!Array.isArray(selected) || selected.length === 0}
            className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full transition-all duration-200 disabled:opacity-30 active:scale-[0.98]"
            style={{ backgroundColor: '#0C2631' }}
          >
            Next <span className="text-lg">&rarr;</span>
          </button>
        </div>
      )}
    </div>
  );
}
