'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

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
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const hasNavigated = useRef(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const programs = isSpanish
    ? [
        {
          title: 'Chequeos Semanales',
          description: 'Un representate asignado estará contigo durante todo tu tratamiento*',
          bgColor: isOt ? '#cab172' : '#4ea77e',
          image: isOt
            ? 'https://static.wixstatic.com/media/c49a9b_0b980de32c824bbe9b55082cc8c90476~mv2.webp'
            : 'https://static.wixstatic.com/media/c49a9b_2c49b136f5ec49c787b37346cca7f47b~mv2.webp',
        },
        {
          title: 'Consultas Médicas',
          description:
            'Tu proveedor en las palmas de tus manos. Consultas por telemedicina incluidas',
          bgColor: isOt ? '#f5ecd8' : '#e4fb74',
          image:
            'https://static.wixstatic.com/media/c49a9b_5683be4d8e5a425a8cae0f35d26eb98b~mv2.webp',
        },
        {
          title: 'Ajuste de Dosis',
          description: 'Ajustamos tu dosis con el tiempo para un tratamiento 100% personalizado.',
          bgColor: isOt ? '#e8dcc4' : '#edffa8',
          image:
            'https://static.wixstatic.com/media/c49a9b_9b3696821bfc4d84beb17a4266110488~mv2.webp',
        },
      ]
    : [
        {
          title: 'Weekly Check-ins',
          description: 'An assigned representative will be with you throughout your treatment*',
          bgColor: isOt ? '#cab172' : '#4ea77e',
          image: isOt
            ? 'https://static.wixstatic.com/media/c49a9b_0b980de32c824bbe9b55082cc8c90476~mv2.webp'
            : 'https://static.wixstatic.com/media/c49a9b_2c49b136f5ec49c787b37346cca7f47b~mv2.webp',
        },
        {
          title: 'Medical Consultations',
          description:
            'Your provider in the palm of your hands. Telemedicine consultations included',
          bgColor: isOt ? '#f5ecd8' : '#e4fb74',
          image:
            'https://static.wixstatic.com/media/c49a9b_5683be4d8e5a425a8cae0f35d26eb98b~mv2.webp',
        },
        {
          title: 'Dose Adjustment',
          description: 'We adjust your dose over time for 100% personalized treatment.',
          bgColor: isOt ? '#e8dcc4' : '#edffa8',
          image:
            'https://static.wixstatic.com/media/c49a9b_9b3696821bfc4d84beb17a4266110488~mv2.webp',
        },
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
    <div className="flex min-h-screen flex-col bg-white" onClick={handleClick}>
      {prevStep && (
        <div className="px-6 pt-8 lg:px-8 lg:pt-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleBack();
            }}
            className="-ml-2 inline-block rounded-lg p-2 transition-colors hover:bg-gray-100"
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 pb-40 lg:max-w-lg lg:px-8">
        <div
          className={`mb-8 transition-all duration-700 ease-out ${
            animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <h1 className="page-title">
            {isSpanish ? (
              <>
                Todos nuestros{' '}
                <span className={isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}>programas</span>{' '}
                incluyen
              </>
            ) : (
              <>
                All our <span className={isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}>programs</span>{' '}
                include
              </>
            )}
          </h1>
        </div>

        <div className="flex-1 space-y-4 md:space-y-6">
          {programs.map((program, index) => (
            <div
              key={index}
              className={`relative flex min-h-[110px] cursor-pointer items-center overflow-hidden rounded-3xl transition-all duration-700 ease-out hover:scale-[1.02] hover:shadow-lg md:min-h-[140px] ${animate ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}
              style={{
                backgroundColor: program.bgColor,
                transitionDelay: `${200 + index * 150}ms`,
              }}
            >
              <img
                src={program.image}
                alt={program.title}
                className={`absolute bottom-0 left-0 h-24 w-24 object-cover transition-transform duration-500 ease-out md:h-32 md:w-32 ${animate ? 'scale-100' : 'scale-90'}`}
                style={{ transitionDelay: `${400 + index * 150}ms` }}
              />
              <div className="flex-1 p-3 pl-28 md:p-4 md:pl-36">
                <h3 className="text-[18px] font-semibold leading-tight text-black md:text-[20px]">
                  {program.title}
                </h3>
                <p className="mt-1 text-[14px] leading-tight text-gray-800 md:text-[16px]">
                  {program.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-md px-6 pb-8 transition-all duration-700 ease-out lg:max-w-lg lg:px-8 ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
