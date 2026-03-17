'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface ProgramsIncludeStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function ProgramsIncludeStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ProgramsIncludeStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const hasNavigated = useRef(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const programs = isSpanish ? [
    {
      title: 'Chequeos Semanales',
      description: 'Un representate asignado estará contigo durante todo tu tratamiento*',
      bgColor: '#4ea77e',
      image: 'https://static.wixstatic.com/media/c49a9b_2c49b136f5ec49c787b37346cca7f47b~mv2.webp'
    },
    {
      title: 'Consultas Médicas',
      description: 'Tu proveedor en las palmas de tus manos. Consultas por telemedicina incluidas',
      bgColor: '#e4fb74',
      image: 'https://static.wixstatic.com/media/c49a9b_5683be4d8e5a425a8cae0f35d26eb98b~mv2.webp'
    },
    {
      title: 'Ajuste de Dosis',
      description: 'Ajustamos tu dosis con el tiempo para un tratamiento 100% personalizado.',
      bgColor: '#edffa8',
      image: 'https://static.wixstatic.com/media/c49a9b_9b3696821bfc4d84beb17a4266110488~mv2.webp'
    }
  ] : [
    {
      title: 'Weekly Check-ins',
      description: 'An assigned representative will be with you throughout your treatment*',
      bgColor: '#4ea77e',
      image: 'https://static.wixstatic.com/media/c49a9b_2c49b136f5ec49c787b37346cca7f47b~mv2.webp'
    },
    {
      title: 'Medical Consultations',
      description: 'Your provider in the palm of your hands. Telemedicine consultations included',
      bgColor: '#e4fb74',
      image: 'https://static.wixstatic.com/media/c49a9b_5683be4d8e5a425a8cae0f35d26eb98b~mv2.webp'
    },
    {
      title: 'Dose Adjustment',
      description: 'We adjust your dose over time for 100% personalized treatment.',
      bgColor: '#edffa8',
      image: 'https://static.wixstatic.com/media/c49a9b_9b3696821bfc4d84beb17a4266110488~mv2.webp'
    }
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markStepCompleted('programs-include');
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [basePath, nextStep, markStepCompleted, setCurrentStep, router]);

  const handleClick = () => {
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      markStepCompleted('programs-include');
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col" onClick={handleClick}>
      {prevStep && (
        <div className="px-6 lg:px-8 pt-8 lg:pt-6">
          <button 
            onClick={(e) => { e.stopPropagation(); handleBack(); }} 
            className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-40 max-w-md lg:max-w-lg mx-auto w-full">
        <div 
          className={`mb-8 transition-all duration-700 ease-out ${
            animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <h1 className="page-title">
            {isSpanish ? (
              <>
                Todos nuestros <span className="text-[#4fa87f]">programas</span> incluyen
              </>
            ) : (
              <>
                All our <span className="text-[#4fa87f]">programs</span> include
              </>
            )}
          </h1>
        </div>

        <div className="space-y-4 md:space-y-6 flex-1">
          {programs.map((program, index) => (
            <div
              key={index}
              className={`rounded-3xl overflow-hidden relative min-h-[110px] md:min-h-[140px] flex items-center
                transition-all duration-700 ease-out cursor-pointer
                hover:scale-[1.02] hover:shadow-lg
                ${animate ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
              style={{ 
                backgroundColor: program.bgColor,
                transitionDelay: `${200 + index * 150}ms`
              }}
            >
              <img
                src={program.image}
                alt={program.title}
                className={`absolute bottom-0 left-0 w-24 h-24 md:w-32 md:h-32 object-cover
                  transition-transform duration-500 ease-out
                  ${animate ? 'scale-100' : 'scale-90'}`}
                style={{ transitionDelay: `${400 + index * 150}ms` }}
              />
              <div className="flex-1 p-3 md:p-4 pl-28 md:pl-36">
                <h3 className="text-[18px] md:text-[20px] font-semibold text-black leading-tight">
                  {program.title}
                </h3>
                <p className="text-[14px] md:text-[16px] text-gray-800 leading-tight mt-1">
                  {program.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div 
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-lg mx-auto w-full transition-all duration-700 ease-out ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.<br/>
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
