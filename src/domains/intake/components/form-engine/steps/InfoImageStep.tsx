'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useLanguage } from '../../../contexts/LanguageContext';

interface InfoImageStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  imageEn?: string;
  imageEs?: string;
  sourceEn?: string;
  sourceEs?: string;
  sourceLinkEn?: string;
  sourceLinkEs?: string;
  autoAdvanceDelay?: number;
}

export default function InfoImageStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  imageEn = 'https://static.wixstatic.com/media/c49a9b_a9abfe04c0984333bd15070af7de2a72~mv2.webp',
  imageEs = 'https://static.wixstatic.com/media/c49a9b_97794b4b6d264743b5eb4ccd8dc1e7a2~mv2.webp',
  sourceEn,
  sourceEs,
  sourceLinkEn,
  sourceLinkEs,
  autoAdvanceDelay = 2500,
}: InfoImageStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const [showContainer, setShowContainer] = useState(false);
  const hasNavigated = useRef(false);

  const isSpanish = language === 'es';

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContainer(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        router.push(`${basePath}/${nextStep}`);
      }
    }, autoAdvanceDelay);
    return () => clearTimeout(timer);
  }, [router, basePath, nextStep, autoAdvanceDelay]);

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

  const imageSrc = isSpanish ? imageEs : imageEn;
  const sourceText = isSpanish ? sourceEs : sourceEn;
  const sourceLink = isSpanish ? sourceLinkEs : sourceLinkEn;

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
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 lg:max-w-lg lg:px-8">
        <div
          className={`relative w-full transform transition-all duration-1000 ease-out ${
            showContainer
              ? 'translate-y-0 scale-100 opacity-100'
              : 'translate-y-12 scale-95 opacity-0'
          }`}
        >
          <Image
            src={imageSrc}
            alt="Information"
            width={500}
            height={600}
            className="h-auto w-full rounded-2xl"
            priority
          />

          {/* Source Link */}
          {sourceText && (
            <div className="mt-4 text-left">
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-[#413d3d]/60 underline transition-colors hover:text-[#413d3d]/80"
              >
                {sourceText}
              </a>
            </div>
          )}

          {/* Copyright */}
          <div className="mt-6 text-center">
            <p className="copyright-text">
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
      </div>
    </div>
  );
}
