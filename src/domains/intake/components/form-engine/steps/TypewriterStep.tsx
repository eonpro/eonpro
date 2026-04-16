'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface TypewriterStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  title: { en: string; es: string };
  subtitle?: { en: string; es: string };
  typewriterDelay?: number;
  autoAdvanceDelay?: number;
}

export default function TypewriterStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  title,
  subtitle,
  typewriterDelay = 25,
  autoAdvanceDelay = 1000,
}: TypewriterStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const hasNavigated = useRef(false);

  const isSpanish = language === 'es';

  const titleText = isSpanish ? title.es : title.en;
  const subtitleText = subtitle ? (isSpanish ? subtitle.es : subtitle.en) : '';
  const fullText = subtitleText ? `${titleText} ${subtitleText}` : titleText;

  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timer = setTimeout(() => {
        setDisplayedText((prev) => prev + fullText[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, typewriterDelay);
      return () => clearTimeout(timer);
    } else {
      setIsTypingComplete(true);
    }
    return undefined;
  }, [currentIndex, fullText, typewriterDelay]);

  useEffect(() => {
    if (isTypingComplete && !hasNavigated.current) {
      const timer = setTimeout(() => {
        hasNavigated.current = true;
        router.push(`${basePath}/${nextStep}`);
      }, autoAdvanceDelay);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isTypingComplete, router, basePath, nextStep, autoAdvanceDelay]);

  const handleBack = () => {
    if (prevStep) {
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const handleClick = () => {
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      router.push(`${basePath}/${nextStep}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white" onClick={handleClick}>
      {/* Progress bar */}
      <div className="h-1 w-full bg-white/20">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Back button */}
      {prevStep && (
        <div className="px-6 pt-8 lg:px-8 lg:pt-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleBack();
            }}
            className="-ml-2 inline-block rounded-lg p-2 hover:bg-white/10"
          >
            <svg
              className="h-6 w-6 text-[#413d3d]"
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
        </div>
      )}

      {/* Main content */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-8 lg:max-w-2xl lg:px-8 lg:pt-12">
        <p className="text-[26px] font-semibold leading-tight text-[#413d3d] md:text-[32px]">
          {displayedText}
          {!isTypingComplete && (
            <span className={`animate-pulse ${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}`}>|</span>
          )}
        </p>
      </div>

      {/* Copyright */}
      <div className="mx-auto w-full max-w-md px-6 pb-8 lg:max-w-2xl lg:px-8">
        <p className="copyright-text text-center">
          {isSpanish ? (
            <>
              © 2026 EONPro, LLC. Todos los derechos reservados.
              <br />
              Proceso exclusivo y protegido.
            </>
          ) : (
            <>
              © 2026 EONPro, LLC. All rights reserved.
              <br />
              Exclusive and protected process.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
