'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface TestimonialsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function TestimonialsStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: TestimonialsStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const hasNavigated = useRef(false);

  const testimonialImages = isSpanish
    ? [
        'https://static.wixstatic.com/media/c49a9b_b4dbc66741324c1f9124e3bff2094d84~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_b020b2170766409e850210d418615da1~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_e54335aad0164b22aa8a2b123bb34b7c~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_98e7e84f7213491a97bd9f27542c96af~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_84d69338ec814bcca3c4bacc9f1d0044~mv2.webp',
      ]
    : [
        'https://static.wixstatic.com/media/c49a9b_9aef40faf6684d73829744872b83dcce~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_366d79f5e59040a899c267d3675494c6~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_6bb33332ffa7459ba48bea94f24b5c5c~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_1c31b2006e6544a29aebb0e95342aecd~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_86cfd5b97dfe4d8787463f312fd03712~mv2.webp',
        'https://static.wixstatic.com/media/c49a9b_9799e7cab45f4491a2169c23be5ec63c~mv2.webp',
      ];

  useEffect(() => {
    setCurrentSlide(0);
  }, [isSpanish]);

  useEffect(() => {
    if (!isPaused) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % testimonialImages.length);
      }, 1500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isPaused, testimonialImages.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markStepCompleted('testimonials');
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [basePath, nextStep, markStepCompleted, setCurrentStep, router]);

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Progress bar */}
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 pt-6 lg:px-8 lg:pt-4">
          <button
            onClick={handleBack}
            className="-ml-2 inline-block rounded-lg p-2 hover:bg-gray-100"
          >
            <svg
              className="h-5 w-5 text-[#413d3d]"
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
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-4 lg:max-w-lg lg:px-8">
        {/* Header */}
        <div className="mb-6 space-y-3">
          <div className="flex justify-start">
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_d96c5f8c37844a39bfa47b0503e6167a.svg"
              alt="Verified"
              className="h-12 w-12"
            />
          </div>
          <h1 className="text-[26px] font-semibold leading-tight text-[#413d3d] lg:text-[30px]">
            {isSpanish
              ? 'Únete a los miles de transformaciones que hemos ayudado a lograr.'
              : "Join the thousands of transformations we've helped achieve."}
          </h1>
          <p className="text-[15px] leading-relaxed text-[#413d3d]/60">
            {isSpanish
              ? 'Cada uno de estos casos presenta pacientes reales que transformaron sus vidas.'
              : 'Each of these cases features real patients who transformed their lives.'}
          </p>
        </div>

        {/* Simple Fade Carousel */}
        <div
          className="relative flex flex-1 flex-col items-center justify-center"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="relative aspect-[3/4] w-full max-w-[260px]">
            {testimonialImages.map((img, index) => (
              <div
                key={index}
                className="absolute inset-0 transition-opacity duration-500 ease-in-out"
                style={{ opacity: currentSlide === index ? 1 : 0 }}
              >
                <Image
                  src={img}
                  alt={`Transformation ${index + 1}`}
                  fill
                  className="rounded-2xl object-contain"
                  priority={index === 0}
                  sizes="260px"
                />
              </div>
            ))}
          </div>

          {/* Dots */}
          <div className="mt-4 flex justify-center space-x-2">
            {testimonialImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  currentSlide === index ? 'w-4 bg-[#4fa87f]' : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="mx-auto w-full max-w-md px-6 pb-6 lg:max-w-lg lg:px-8">
        <p className="text-center text-[10px] leading-relaxed text-[#413d3d]/40">
          {isSpanish ? 'Resultados individuales pueden variar.' : 'Individual results may vary.'}
        </p>
        <p className="copyright-text mt-2 text-center">
          {isSpanish ? (
            <>© 2026 EONPro, LLC. Todos los derechos reservados.</>
          ) : (
            <>© 2026 EONPro, LLC. All rights reserved.</>
          )}
        </p>
      </div>
    </div>
  );
}
