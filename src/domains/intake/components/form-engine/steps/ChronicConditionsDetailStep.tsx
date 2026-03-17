'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';
import { useLanguage } from '../../../contexts/LanguageContext';

interface ChronicConditionsDetailStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const chronicConditionOptions = {
  en: [
    { id: 'hypertension', label: 'Hypertension (High blood pressure)' },
    { id: 'diabetes', label: 'Diabetes (Type 2)' },
    { id: 'prediabetes', label: 'Pre-diabetes' },
    { id: 'type1_diabetes', label: 'Diabetes Type 1' },
    { id: 'heart_disease', label: 'Heart disease' },
    { id: 'high_cholesterol', label: 'High cholesterol/High triglycerides' },
    { id: 'hypothyroid', label: 'Hypothyroidism (Underactive thyroid)' },
    { id: 'hyperthyroid', label: 'Hyperthyroidism (Overactive thyroid)' },
    { id: 'thyroid_cancer', label: 'Thyroid cancer or MEN-2' },
    { id: 'pancreatitis', label: 'Pancreatitis (Current or history of)' },
    { id: 'gallbladder', label: 'Gallbladder disease' },
    { id: 'liver_disease', label: 'Liver disease' },
    { id: 'cancer', label: 'Cancer (current or history of)' },
    { id: 'eating_disorder', label: 'Eating disorder (anorexia or bulimia)' },
    { id: 'sleep_apnea', label: 'Sleep apnea' },
    { id: 'pcos', label: 'Polycystic ovarian syndrome (PCOS)' },
    { id: 'other', label: 'Other' },
    { id: 'none', label: 'No, none of these' },
  ],
  es: [
    { id: 'hypertension', label: 'Hipertensión (Presión arterial alta)' },
    { id: 'diabetes', label: 'Diabetes (Tipo 2)' },
    { id: 'prediabetes', label: 'Pre-diabetes' },
    { id: 'type1_diabetes', label: 'Diabetes Tipo 1' },
    { id: 'heart_disease', label: 'Enfermedad cardíaca' },
    { id: 'high_cholesterol', label: 'Colesterol alto/Triglicéridos altos' },
    { id: 'hypothyroid', label: 'Hipotiroidismo (Tiroides hipoactiva)' },
    { id: 'hyperthyroid', label: 'Hipertiroidismo (Tiroides hiperactiva)' },
    { id: 'thyroid_cancer', label: 'Cáncer de tiroides o MEN-2' },
    { id: 'pancreatitis', label: 'Pancreatitis (Actual o historial)' },
    { id: 'gallbladder', label: 'Enfermedad de la vesícula biliar' },
    { id: 'liver_disease', label: 'Enfermedad hepática' },
    { id: 'cancer', label: 'Cáncer (actual o historial)' },
    { id: 'eating_disorder', label: 'Trastorno alimentario (anorexia o bulimia)' },
    { id: 'sleep_apnea', label: 'Apnea del sueño' },
    { id: 'pcos', label: 'Síndrome de ovario poliquístico (SOP)' },
    { id: 'other', label: 'Otro' },
    { id: 'none', label: 'No, ninguno de estos' },
  ],
};

export function ChronicConditionsDetailStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ChronicConditionsDetailStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const responses = useIntakeStore((state) => state.responses);
  const { setResponse } = useIntakeActions();
  const isSpanish = language === 'es';
  const [mounted, setMounted] = useState(false);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');

  const options = isSpanish ? chronicConditionOptions.es : chronicConditionOptions.en;

  useEffect(() => {
    setMounted(true);
    const saved = responses?.chronic_conditions_detail;
    if (Array.isArray(saved)) {
      setSelectedConditions(saved);
    }
    const savedOther = responses?.chronic_conditions_other;
    if (typeof savedOther === 'string') {
      setOtherText(savedOther);
    }
  }, [responses]);

  const toggleCondition = useCallback((conditionId: string) => {
    setSelectedConditions(prev => {
      let newSelection: string[];
      
      if (conditionId === 'none') {
        newSelection = prev.includes('none') ? [] : ['none'];
      } else {
        const withoutNone = prev.filter(c => c !== 'none');
        if (prev.includes(conditionId)) {
          newSelection = withoutNone.filter(c => c !== conditionId);
        } else {
          newSelection = [...withoutNone, conditionId];
        }
      }
      
      return newSelection;
    });
  }, []);

  const handleContinue = useCallback(() => {
    setResponse('chronic_conditions_detail', selectedConditions);
    if (selectedConditions.includes('other')) {
      setResponse('chronic_conditions_other', otherText);
    }
    
    router.push(`${basePath}/${nextStep}`);
  }, [selectedConditions, otherText, setResponse, basePath, nextStep, router]);

  const handleBack = () => {
    if (prevStep) {
      router.push(`${basePath}/${prevStep}`);
    }
  };

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-[#413d3d]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-6 lg:px-8 pt-8 lg:pt-12 max-w-md lg:max-w-2xl mx-auto w-full pb-32">
      <div className="space-y-6">
        <h1 className="text-[22px] lg:text-[28px] font-semibold leading-tight text-[#413d3d]">
          {isSpanish
            ? '¿Qué tipo de condición o enfermedad crónica padeces?'
            : 'What type of chronic condition or disease do you have?'}
        </h1>

        <p className="text-[14px] text-[#666]">
          {isSpanish
            ? 'Selecciona todas las que apliquen.'
            : 'Select all that apply.'}
        </p>

        <div className="space-y-3">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggleCondition(option.id)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                selectedConditions.includes(option.id)
                  ? 'border-[#4fa87f] bg-[#f0feab]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 ${
                    selectedConditions.includes(option.id)
                      ? 'border-[#413d3d] bg-[#413d3d]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedConditions.includes(option.id) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-[15px] text-[#413d3d]">{option.label}</span>
              </div>
            </button>
          ))}
        </div>

        {selectedConditions.includes('other') && (
          <div className="mt-4">
            <input
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder={isSpanish ? 'Por favor especifica...' : 'Please specify...'}
              className="w-full p-4 border-2 border-gray-200 rounded-xl text-[15px] focus:border-[#4fa87f] focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleContinue}
            disabled={selectedConditions.length === 0}
            className={`w-full py-4 rounded-full text-[16px] font-semibold transition-all ${
              selectedConditions.length > 0
                ? 'bg-[#413d3d] text-white hover:bg-[#2d2a2a]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSpanish ? 'Continuar' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChronicConditionsDetailStep;
