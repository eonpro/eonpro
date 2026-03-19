'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CardOption {
  id: string;
  label: string;
  subtitle?: string;
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
      const next = arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id];
      setSelected(next);
    } else {
      setSelected(id);
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
    mode === 'multi'
      ? Array.isArray(selected) && selected.includes(id)
      : selected === id;

  const gridCols = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 mb-8" />

        {(headerText || headerItalic) && (
          <h1 className="text-[1.5rem] sm:text-[2rem] font-bold text-center leading-tight mb-4" style={{ color: '#101010' }}>
            {headerItalic && <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>{headerItalic} </span>}
            {headerText}
          </h1>
        )}

        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-2" style={{ color: '#101010' }}>
          {question}
          <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
        </h2>

        {subtitle && (
          <p className="text-center text-sm sm:text-base mb-6" style={{ color: '#555' }}>{subtitle}</p>
        )}

        <div className={`grid ${gridCols} gap-3 sm:gap-4 w-full mt-4`}>
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => handleSelect(card.id)}
              className="relative flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 bg-white hover:shadow-md"
              style={{
                borderColor: isSelected(card.id) ? '#c3b29e' : '#e5e7eb',
                boxShadow: isSelected(card.id) ? '0 0 0 1px #c3b29e' : undefined,
              }}
            >
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: isSelected(card.id) ? '#c3b29e' : '#d1d5db' }}>
                {isSelected(card.id) && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#c3b29e' }} />}
              </div>
              <span className="font-medium text-sm sm:text-base text-center" style={{ color: '#101010' }}>{card.label}</span>
              {card.subtitle && <span className="text-xs sm:text-sm text-center mt-0.5" style={{ color: '#888' }}>{card.subtitle}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-8 max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={mode === 'single' ? !selected : (!Array.isArray(selected) || selected.length === 0)}
          className="w-full flex items-center justify-center gap-3 py-4 px-8 text-white font-medium rounded-full transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
