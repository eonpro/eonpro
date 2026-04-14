'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';
import BMIWidget from '../../BMIWidget';
import Image from 'next/image';

// Before/after transformation carousel images (EN and ES)
const CAROUSEL_IMAGES = {
  en: [
    'https://static.wixstatic.com/media/c49a9b_9aef40faf6684d73829744872b83dcce~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_366d79f5e59040a899c267d3675494c6~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_6bb33332ffa7459ba48bea94f24b5c5c~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_1c31b2006e6544a29aebb0e95342aecd~mv2.webp',
  ],
  es: [
    'https://static.wixstatic.com/media/c49a9b_b4dbc66741324c1f9124e3bff2094d84~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_b020b2170766409e850210d418615da1~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_e54335aad0164b22aa8a2b123bb34b7c~mv2.webp',
    'https://static.wixstatic.com/media/c49a9b_98e7e84f7213491a97bd9f27542c96af~mv2.webp',
  ],
};

interface BMIResultStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function BMIResultStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: BMIResultStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';

  const responses = useIntakeStore((state) => state.responses);
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const { markStepCompleted, setCurrentStep, setResponse } = useIntakeActions();

  const [bmi, setBmi] = useState(0);
  const [goalBMI, setGoalBMI] = useState(0);
  const [showBmiInfo, setShowBmiInfo] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselImages = CAROUSEL_IMAGES[isSpanish ? 'es' : 'en'];
  const carouselPaused = useRef(false);

  const firstName = String(responses.firstName || '');
  const currentWeight = parseInt(String(responses.currentWeight || '')) || 0;
  const idealWeight = parseInt(String(responses.idealWeight || '')) || 0;
  const heightFeet = parseInt(String(responses.heightFeet || '')) || 0;
  const heightInches = parseInt(String(responses.heightInches || '')) || 0;
  const totalInches = heightFeet * 12 + heightInches;
  const heightStr = `${heightFeet}'${heightInches}"`;
  const weightToLose = currentWeight - idealWeight;

  useEffect(() => {
    if (!carouselPaused.current) {
      const interval = setInterval(() => {
        setCarouselIndex((prev) => (prev + 1) % carouselImages.length);
      }, 2500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [carouselImages.length]);

  useEffect(() => {
    if (currentWeight && totalInches) {
      const calculatedBMI = (currentWeight / (totalInches * totalInches)) * 703;
      const rounded = Math.round(calculatedBMI * 100) / 100;
      setBmi(rounded);
      setResponse('bmi', rounded.toFixed(2));

      if (idealWeight && totalInches) {
        const calculatedGoalBMI = (idealWeight / (totalInches * totalInches)) * 703;
        setGoalBMI(Math.round(calculatedGoalBMI * 100) / 100);
      }

      setTimeout(() => {
        window.scrollTo({ top: 300, behavior: 'smooth' });
      }, 1500);
    }
  }, [currentWeight, idealWeight, totalInches, setResponse]);

  const handleContinue = () => {
    markStepCompleted('bmi-result');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

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
          className={`h-full transition-all duration-300 ${isOt ? 'bg-[#f5ecd8]' : 'bg-[var(--intake-accent,#f0feab)]'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 pt-8 lg:px-8 lg:pt-6">
          <button
            onClick={handleBack}
            className="-ml-2 inline-block rounded-lg p-2 hover:bg-gray-100"
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

      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-6 py-6 pb-8 lg:max-w-lg lg:px-8">
        <div className="space-y-5">
          <div className="mb-5 text-left">
            <h2 className="text-[22px] font-semibold leading-snug text-[#413d3d] md:text-[26px]">
              {isSpanish
                ? 'Ahora que sabemos más sobre ti, podemos encontrar el mejor tratamiento.'
                : 'Now that we know more about you, we can find the best treatment.'}
            </h2>
          </div>

          {/* BMI Result Card */}
          <div
            className={`${isOt ? 'bg-[#f5ecd8]' : 'bg-[#f0feab]'} space-y-3 overflow-visible rounded-3xl p-5`}
          >
            <h1 className="text-[22px] font-semibold text-black">
              <span className={isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}>
                {firstName || 'firstname'}
              </span>
              , {isSpanish ? 'tu IMC' : 'your BMI'} {isSpanish ? 'es' : 'is'}
            </h1>

            <div className={`text-5xl font-bold ${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}`}>
              {bmi ? bmi.toFixed(2) : 'NaN'}
            </div>

            <div className="space-y-0.5 text-sm text-black">
              <p className="font-normal">
                {isSpanish ? 'Peso actual' : 'Current weight'}:{' '}
                <span className={isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}>
                  {currentWeight ? `${currentWeight} lbs` : 'starting_weight lbs'}
                </span>
              </p>
              <p className="font-normal">
                {isSpanish ? 'Altura' : 'Height'}:{' '}
                <span className={isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}>
                  {heightStr || 'feet\'inches"'}
                </span>
              </p>
            </div>

            <p className="pt-2 text-[12px] font-normal leading-snug text-gray-500">
              {isSpanish
                ? 'El IMC es solo una métrica y no tiene en cuenta la masa muscular u otros factores de salud.'
                : 'BMI is just one metric and does not account for muscle mass or other health factors.'}
            </p>

            <BMIWidget
              bmi={bmi}
              language={language as 'en' | 'es'}
              accentColor={isOt ? '#cab172' : undefined}
            />

            <div
              className={`${isOt ? 'bg-[#e8dcc4]' : 'bg-[#e4fb74]'} flex items-start space-x-3 rounded-2xl p-4`}
            >
              <div
                className={`h-8 w-8 ${isOt ? 'bg-[#cab172]' : 'bg-[#4fa87f]'} flex flex-shrink-0 items-center justify-center rounded-full`}
              >
                <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="pt-1 text-sm font-normal leading-snug text-black">
                {isSpanish
                  ? 'Tu IMC cae dentro del rango para medicamentos de pérdida de peso.'
                  : 'Your BMI falls within the range for weight loss medications.'}
              </p>
            </div>
          </div>

          {/* Goal Card */}
          <div className={`${isOt ? 'bg-[#e8d5a0]' : 'bg-[#d4f084]'} space-y-3 rounded-3xl p-5`}>
            <h2 className="text-lg font-semibold text-black">
              {isSpanish ? 'Tu objetivo' : 'Your goal'}
            </h2>
            <div className={`text-5xl font-bold ${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'}`}>
              {weightToLose ? `${Math.abs(weightToLose).toFixed(2)}` : '0.00'} lbs
            </div>
            <p className="text-sm font-normal text-black">
              {isSpanish
                ? 'Pérdida promedio con GLP-1: 15-20% del peso corporal'
                : 'Average GLP-1 loss: 15-20% body weight'}
            </p>

            <div className="space-y-2 pt-2">
              <p className="text-base font-normal text-black">
                {isSpanish ? 'IMC objetivo' : 'Goal BMI'}:{' '}
                <span className={`${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'} font-semibold`}>
                  {goalBMI ? goalBMI.toFixed(2) : 'NaN'}
                </span>
              </p>

              <button
                onClick={() => setShowBmiInfo(!showBmiInfo)}
                className={`flex items-center gap-1 ${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'} text-sm font-medium`}
              >
                <span className="underline">
                  {isSpanish ? '¿Por qué importa el IMC?' : 'Why does BMI matter?'}
                </span>
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${showBmiInfo ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${showBmiInfo ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div
                  className={`${isOt ? 'bg-[#f5ecd8]/50' : 'bg-[#f5ffd6]'} mt-1 rounded-xl border p-3 ${isOt ? 'border-[#cab172]/20' : 'border-[#4fa87f]/20'}`}
                >
                  <p className="text-sm leading-relaxed text-gray-700">
                    {isSpanish
                      ? 'El IMC es una medida de la grasa corporal basada en la altura y el peso. Los médicos lo usan para evaluar riesgos de salud relacionados con el peso y determinar tratamientos apropiados.'
                      : 'BMI is a measure of body fat based on height and weight. Doctors use it to assess weight-related health risks and determine appropriate treatments for conditions like heart disease and diabetes.'}
                  </p>
                </div>
              </div>

              <p className="text-sm font-normal leading-relaxed text-black">
                {isSpanish
                  ? 'Los médicos usan el IMC para evaluar riesgos de salud y determinar tratamientos apropiados.'
                  : 'Doctors use BMI to assess health risks and determine appropriate treatments.'}
              </p>
            </div>

            <div
              className={`flex items-center space-x-4 ${isOt ? 'bg-[#c9a85c]' : 'bg-[#f0feab]'} mt-3 rounded-2xl p-4`}
            >
              <div
                className={`relative flex-shrink-0 overflow-hidden rounded-full ${isOt ? 'ring-2 ring-[#b89845]' : ''}`}
                style={{ width: '100px', height: '100px' }}
              >
                <Image
                  src={
                    isOt
                      ? 'https://static.wixstatic.com/media/c49a9b_0b980de32c824bbe9b55082cc8c90476~mv2.webp'
                      : 'https://static.wixstatic.com/media/c49a9b_60e51d36e98e4128a6edb7987a3d6b8b~mv2.webp'
                  }
                  alt="Doctor"
                  fill
                  sizes="100px"
                  className="object-cover"
                />
              </div>
              <p className="text-[13px] font-normal leading-snug text-black">
                {isSpanish
                  ? 'Ten la tranquilidad de que tu plan de tratamiento será revisado cuidadosamente por un médico autorizado en tu estado.'
                  : 'Rest assured that your treatment plan will be carefully reviewed by a licensed physician in your state.'}
              </p>
            </div>
          </div>

          {/* Before/After Transformation Carousel -- hidden for OT peptide intake */}
          {!isOt && (
            <div className="space-y-3 rounded-3xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <img
                  src="https://static.wixstatic.com/shapes/c49a9b_d96c5f8c37844a39bfa47b0503e6167a.svg"
                  alt="Verified"
                  className="h-8 w-8"
                />
                <h3 className="text-base font-semibold text-[#413d3d]">
                  {isSpanish ? 'Transformaciones reales' : 'Real transformations'}
                </h3>
              </div>
              <div
                className="relative mx-auto aspect-[3/4] w-full max-w-[220px]"
                onMouseEnter={() => {
                  carouselPaused.current = true;
                }}
                onMouseLeave={() => {
                  carouselPaused.current = false;
                }}
              >
                {carouselImages.map((img, index) => (
                  <div
                    key={index}
                    className="absolute inset-0 transition-opacity duration-500 ease-in-out"
                    style={{ opacity: carouselIndex === index ? 1 : 0 }}
                  >
                    <Image
                      src={img}
                      alt={`Transformation ${index + 1}`}
                      fill
                      className="rounded-xl object-contain"
                      sizes="220px"
                      priority={index === 0}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-1.5">
                {carouselImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCarouselIndex(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      carouselIndex === index ? 'w-4 bg-[#4fa87f]' : 'w-1.5 bg-gray-300'
                    }`}
                  />
                ))}
              </div>
              <p className="text-center text-[10px] text-gray-400">
                {isSpanish
                  ? 'Resultados individuales pueden variar.'
                  : 'Individual results may vary.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-6 pb-8 pt-4 lg:max-w-lg lg:px-8">
        <button onClick={handleContinue} className="continue-button">
          <span className="text-white">{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <p className="copyright-text mt-4 text-center">
          © 2025 EONPro, LLC. All rights reserved. Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
