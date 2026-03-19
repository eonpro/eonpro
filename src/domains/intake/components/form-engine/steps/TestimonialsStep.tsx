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

  const testimonialImages = isSpanish ? [
    'https://static.wixstatic.com/media/c49a9b_b4dbc66741324c1f9124e3bff2094d84~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_b020b2170766409e850210d418615da1~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_e54335aad0164b22aa8a2b123bb34b7c~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_98e7e84f7213491a97bd9f27542c96af~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_84d69338ec814bcca3c4bacc9f1d0044~mv2.webp'
  ] : [
    'https://static.wixstatic.com/media/c49a9b_9aef40faf6684d73829744872b83dcce~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_366d79f5e59040a899c267d3675494c6~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_6bb33332ffa7459ba48bea94f24b5c5c~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_1c31b2006e6544a29aebb0e95342aecd~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_86cfd5b97dfe4d8787463f312fd03712~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_9799e7cab45f4491a2169c23be5ec63c~mv2.webp'
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-100">
        <div 
          className="h-full bg-[#f0feab] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 lg:pt-4">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Main content */}
      <div className="flex-1 flex flex-col px-6 lg:px-8 pb-4 max-w-md lg:max-w-lg mx-auto w-full">
        {/* Header */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-start">
            <img 
              src="https://static.wixstatic.com/shapes/c49a9b_d96c5f8c37844a39bfa47b0503e6167a.svg"
              alt="Verified"
              className="w-12 h-12"
            />
          </div>
          <h1 className="text-[26px] lg:text-[30px] font-semibold leading-tight text-[#413d3d]">
            {isSpanish 
              ? 'Únete a los miles de transformaciones que hemos ayudado a lograr.'
              : 'Join the thousands of transformations we\'ve helped achieve.'}
          </h1>
          <p className="text-[15px] text-[#413d3d]/60 leading-relaxed">
            {isSpanish
              ? 'Cada uno de estos casos presenta pacientes reales que transformaron sus vidas.'
              : 'Each of these cases features real patients who transformed their lives.'}
          </p>
        </div>

        {/* Simple Fade Carousel */}
        <div 
          className="relative flex-1 flex flex-col items-center justify-center"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="relative w-full max-w-[260px] aspect-[3/4]">
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
                  className="object-contain rounded-2xl"
                  priority={index === 0}
                  sizes="260px"
                />
              </div>
            ))}
          </div>

          {/* Dots */}
          <div className="flex justify-center space-x-2 mt-4">
            {testimonialImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  currentSlide === index 
                    ? 'bg-[#4fa87f] w-4' 
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom */}
      <div className="px-6 lg:px-8 pb-6 max-w-md lg:max-w-lg mx-auto w-full">
        <p className="text-[10px] text-[#413d3d]/40 text-center leading-relaxed">
          {isSpanish
            ? 'Resultados individuales pueden variar.'
            : 'Individual results may vary.'}
        </p>
        <p className="copyright-text text-center mt-2">
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
