'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';
import BMIWidget from '../../BMIWidget';
import Image from 'next/image';

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
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  
  const [bmi, setBmi] = useState(0);
  const [goalBMI, setGoalBMI] = useState(0);
  const [showBmiInfo, setShowBmiInfo] = useState(false);

  const firstName = responses.firstName || '';
  const currentWeight = parseInt(responses.currentWeight) || 0;
  const idealWeight = parseInt(responses.idealWeight) || 0;
  const heightFeet = parseInt(responses.heightFeet) || 0;
  const heightInches = parseInt(responses.heightInches) || 0;
  const totalInches = heightFeet * 12 + heightInches;
  const heightStr = `${heightFeet}'${heightInches}"`;
  const weightToLose = currentWeight - idealWeight;

  useEffect(() => {
    if (currentWeight && totalInches) {
      const calculatedBMI = (currentWeight / (totalInches * totalInches)) * 703;
      setBmi(Math.round(calculatedBMI * 100) / 100);
      
      if (idealWeight && totalInches) {
        const calculatedGoalBMI = (idealWeight / (totalInches * totalInches)) * 703;
        setGoalBMI(Math.round(calculatedGoalBMI * 100) / 100);
      }
    }
  }, [currentWeight, idealWeight, totalInches]);

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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-100">
        <div 
          className="h-full bg-[#f0feab] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {prevStep && (
        <div className="px-6 lg:px-8 pt-8 lg:pt-6">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 pb-8 max-w-md lg:max-w-lg mx-auto w-full">
        <div className="space-y-5">
          <div className="text-left mb-5">
            <h2 className="text-[22px] md:text-[26px] font-semibold text-[#413d3d] leading-snug">
              {isSpanish 
                ? 'Ahora que sabemos más sobre ti, podemos encontrar el mejor tratamiento.'
                : 'Now that we know more about you, we can find the best treatment.'}
            </h2>
          </div>
          
          {/* BMI Result Card */}
          <div className="bg-[#f0feab] rounded-3xl p-5 space-y-3 overflow-visible">
            <h1 className="text-[22px] font-semibold text-black">
              <span className="text-[#4fa87f]">{firstName || 'firstname'}</span>, {isSpanish ? 'tu IMC' : 'your BMI'} {isSpanish ? 'es' : 'is'}
            </h1>
            
            <div className="text-5xl font-bold text-[#4fa87f]">{bmi ? bmi.toFixed(2) : 'NaN'}</div>
            
            <div className="space-y-0.5 text-sm text-black">
              <p className="font-normal">
                {isSpanish ? 'Peso actual' : 'Current weight'}: <span className="text-[#4fa87f]">{currentWeight ? `${currentWeight} lbs` : 'starting_weight lbs'}</span>
              </p>
              <p className="font-normal">
                {isSpanish ? 'Altura' : 'Height'}: <span className="text-[#4fa87f]">{heightStr || "feet'inches\""}</span>
              </p>
            </div>
            
            <p className="text-[12px] text-gray-500 font-normal leading-snug pt-2">
              {isSpanish 
                ? 'El IMC es solo una métrica y no tiene en cuenta la masa muscular u otros factores de salud.'
                : 'BMI is just one metric and does not account for muscle mass or other health factors.'}
            </p>
            
            <BMIWidget bmi={bmi} language={language as 'en' | 'es'} />
            
            <div className="bg-[#e4fb74] rounded-2xl p-4 flex items-start space-x-3">
              <div className="w-8 h-8 bg-[#4fa87f] rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm text-black font-normal leading-snug pt-1">
                {isSpanish 
                  ? 'Tu IMC cae dentro del rango para medicamentos de pérdida de peso.'
                  : 'Your BMI falls within the range for weight loss medications.'}
              </p>
            </div>
          </div>

          {/* Goal Card */}
          <div className="bg-[#d4f084] rounded-3xl p-5 space-y-3">
            <h2 className="text-lg font-semibold text-black">{isSpanish ? 'Tu objetivo' : 'Your goal'}</h2>
            <div className="text-5xl font-bold text-[#4fa87f]">{weightToLose ? `${Math.abs(weightToLose).toFixed(2)}` : '0.00'} lbs</div>
            <p className="text-sm text-black font-normal">
              {isSpanish 
                ? 'Pérdida promedio con GLP-1: 15-20% del peso corporal'
                : 'Average GLP-1 loss: 15-20% body weight'}
            </p>
            
            <div className="space-y-2 pt-2">
              <p className="text-base font-normal text-black">
                {isSpanish ? 'IMC objetivo' : 'Goal BMI'}: <span className="text-[#4fa87f] font-semibold">{goalBMI ? goalBMI.toFixed(2) : 'NaN'}</span>
              </p>
              
              <button 
                onClick={() => setShowBmiInfo(!showBmiInfo)}
                className="flex items-center gap-1 text-[#4fa87f] text-sm font-medium"
              >
                <span className="underline">{isSpanish ? '¿Por qué importa el IMC?' : 'Why does BMI matter?'}</span>
                <svg 
                  className={`w-4 h-4 transition-transform duration-200 ${showBmiInfo ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showBmiInfo ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="bg-[#f5ffd6] rounded-xl p-3 mt-1 border border-[#4fa87f]/20">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {isSpanish 
                      ? 'El IMC es una medida de la grasa corporal basada en la altura y el peso. Los médicos lo usan para evaluar riesgos de salud relacionados con el peso y determinar tratamientos apropiados.'
                      : 'BMI is a measure of body fat based on height and weight. Doctors use it to assess weight-related health risks and determine appropriate treatments for conditions like heart disease and diabetes.'}
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-black font-normal leading-relaxed">
                {isSpanish 
                  ? 'Los médicos usan el IMC para evaluar riesgos de salud y determinar tratamientos apropiados.'
                  : 'Doctors use BMI to assess health risks and determine appropriate treatments.'}
              </p>
            </div>

            <div className="flex items-center space-x-4 bg-[#f0feab] rounded-2xl p-4 mt-3">
              <div className="relative rounded-full overflow-hidden flex-shrink-0" style={{ width: '100px', height: '100px' }}>
                <Image 
                  src="https://static.wixstatic.com/media/c49a9b_60e51d36e98e4128a6edb7987a3d6b8b~mv2.webp"
                  alt="Doctor"
                  fill
                  sizes="100px"
                  className="object-cover"
                />
              </div>
              <p className="text-[13px] text-black font-normal leading-snug">
                {isSpanish 
                  ? 'Ten la tranquilidad de que tu plan de tratamiento será revisado cuidadosamente por un médico autorizado en tu estado.'
                  : 'Rest assured that your treatment plan will be carefully reviewed by a licensed physician in your state.'}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="px-6 lg:px-8 pb-8 pt-4 max-w-md lg:max-w-lg mx-auto w-full">
        <button 
          onClick={handleContinue}
          className="continue-button"
        >
          <span className="text-white">{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        <p className="copyright-text text-center mt-4">
          © 2025 EONPro, LLC. All rights reserved.
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
