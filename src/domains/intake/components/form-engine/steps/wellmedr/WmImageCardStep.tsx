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
      return (
        <svg width="56" height="100" viewBox="0 0 50 120" fill={c}><ellipse cx="25" cy="10" rx="7.5" ry="8.5"/><path d="M25 20c-8 0-13 5-14 12l-2 22h7l1-14 3-8v22l-2 32h6V58h2v28h6l-2-32V34l3 8 1 14h7l-2-22c-1-7-6-12-14-12z"/><rect x="18" y="86" width="5" height="24" rx="2"/><rect x="27" y="86" width="5" height="24" rx="2"/><ellipse cx="20" cy="112" rx="5" ry="2.5"/><ellipse cx="30" cy="112" rx="5" ry="2.5"/></svg>
      );
    case 'female':
      return (
        <svg width="56" height="100" viewBox="0 0 50 120" fill={c}><ellipse cx="25" cy="10" rx="7" ry="8"/><path d="M25 20c-7 0-12 4-13 10l-1 4c-.5 2 1 3 2.5 2l2.5-2-.5 6-3 18h6l-1-10 3-8c0 0-.5 6-.5 10l-1 12h6l1-10h4l1 10h6l-1-12c0-4-.5-10-.5-10l3 8-1 10h6l-3-18-.5-6 2.5 2c1.5 1 3 0 2.5-2l-1-4c-1-6-6-10-13-10z"/><path d="M19 62l-2 28h7l1-24h4l1 24h7l-2-28H19z"/><rect x="17" y="90" width="6" height="22" rx="2"/><rect x="27" y="90" width="6" height="22" rx="2"/><ellipse cx="20" cy="114" rx="5" ry="2.5"/><ellipse cx="30" cy="114" rx="5" ry="2.5"/></svg>
      );
    case 'low_libido':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 44c11 0 20-9 20-20S35 4 24 4 4 13 4 24s9 20 20 20z" {...s} strokeWidth={1.5}/>
          <path d="M14 30c0 0 4-6 10-6s10 6 10 6" {...s} strokeWidth={1.5}/>
          <path d="M12 24l8-8M20 24l-8-8" {...s} strokeWidth={1.5}/>
          <circle cx="34" cy="20" r="2" fill={c}/>
        </svg>
      );
    case 'hair_loss':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="12" y1="4" x2="12" y2="32" {...s}/><line x1="20" y1="4" x2="20" y2="32" {...s}/><line x1="28" y1="4" x2="28" y2="32" {...s}/><line x1="36" y1="4" x2="36" y2="32" {...s}/>
          <circle cx="12" cy="34" r="2.5" fill={c}/><circle cx="20" cy="36" r="2.5" fill={c}/><circle cx="28" cy="34" r="2.5" fill={c}/><circle cx="36" cy="36" r="2.5" fill={c}/>
          <path d="M8 40c0 0 2 6 8 6s6-4 8-4 2 4 8 4 8-6 8-6" {...s}/>
        </svg>
      );
    case 'skin_issues':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 36c4-2 8-8 12-8s4 4 8 4 4-6 8-6 4 4 8 4 4-2 4-2" {...s}/>
          <circle cx="16" cy="18" r="2" fill={c}/><circle cx="24" cy="14" r="1.5" fill={c}/><circle cx="32" cy="20" r="2.5" fill={c}/><circle cx="20" cy="24" r="1" fill={c}/><circle cx="28" cy="28" r="1.5" fill={c}/>
          <path d="M12 8l-2 6M16 6l-1 5M24 4l-1 6M32 6l-1 5M36 8l-2 6" {...s} strokeWidth={1.2}/>
        </svg>
      );
    case 'cognition':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 4C14 4 8 12 8 20c0 6 3 10 6 12v8c0 2 2 4 4 4h12c2 0 4-2 4-4v-8c3-2 6-6 6-12 0-8-6-16-16-16z" {...s}/>
          <path d="M18 44v-4h12v4" {...s}/>
          <path d="M24 12v16M16 20h16" {...s} strokeWidth={1.5}/>
          <path d="M18 28c2 2 4 3 6 3s4-1 6-3" {...s}/>
        </svg>
      );
    case 'ok_hand':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 18c0-3 2-6 4-6s4 2 4 6v8" {...s}/>
          <path d="M28 26v-12c0-3 2-5 4-5s3 2 3 5v10" {...s}/>
          <path d="M35 24v-8c0-3 1.5-5 3.5-5s3 2 3 5v12c0 8-6 16-14 16H24c-6 0-12-4-14-10l-2-6c-1-3 0-5 2-6s4 0 5 3l2 4" {...s}/>
          <path d="M20 26v-8c0-3-2-5-3.5-5" {...s}/>
        </svg>
      );
    case 'lose_weight':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 8h16v4c0 6-3 10-8 12-5-2-8-6-8-12V8z" {...s}/>
          <path d="M12 8h24" {...s}/>
          <path d="M24 24v4" {...s}/>
          <path d="M16 40h16v-4c0-6-3-10-8-12-5 2-8 6-8 12v4z" {...s}/>
          <path d="M12 40h24" {...s}/>
          <circle cx="36" cy="14" r="2" fill={c}/><path d="M36 14l4-6" {...s} strokeWidth={1.2}/>
        </svg>
      );
    case 'gain_muscle':
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 32c0 0 2-12 6-16s6-4 10-4" {...s}/>
          <path d="M24 12c4 0 6 0 10 4s6 16 6 16" {...s}/>
          <path d="M14 16c2-4 6-6 10-6s8 2 10 6" {...s} strokeWidth={2}/>
          <path d="M10 32h28" {...s}/>
          <path d="M24 12v-6M20 8l4-4 4 4" {...s} strokeWidth={1.5}/>
          <circle cx="18" cy="24" r="3" {...s}/><circle cx="30" cy="24" r="3" {...s}/>
        </svg>
      );
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

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          onClick={handleContinue}
          disabled={mode === 'single' ? !selected : (!Array.isArray(selected) || selected.length === 0)}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full transition-all duration-200 disabled:opacity-30 active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
