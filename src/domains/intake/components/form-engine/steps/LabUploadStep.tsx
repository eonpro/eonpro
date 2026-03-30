'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface LabUploadStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function LabUploadStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: LabUploadStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const accentColor = isOt ? '#cab172' : '#4fa87f';
  const accentBg = isOt ? '#f5ecd8' : '#f0feab';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError(isSpanish ? 'El archivo debe ser menor de 15MB' : 'File must be under 15MB');
      return;
    }

    setError('');
    setFileName(file.name);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = () => {
      setResponse('lab_file', reader.result as string);
      setResponse('lab_file_name', file.name);
      setResponse('lab_file_type', file.type);
      setUploading(false);
      setUploaded(true);
    };
    reader.onerror = () => {
      setError(isSpanish ? 'Error al leer el archivo' : 'Error reading file');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleContinue = () => {
    markStepCompleted('lab-upload');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleSkip = () => {
    setResponse('lab_file_skipped', true);
    markStepCompleted('lab-upload');
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
      <div className="w-full h-[5px] bg-gray-100 rounded-full">
        <div
          className="h-full rounded-full"
          style={{ width: `${progressPercent}%`, backgroundColor: accentColor, transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </div>

      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 px-6 lg:px-8 py-6 pb-10 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-6">
          <div>
            <h1 className="page-title mb-2">
              {isSpanish ? 'Sube tus resultados de laboratorio' : 'Upload your lab results'}
            </h1>
            <p className="page-subtitle">
              {isSpanish
                ? 'Si tienes tus resultados de laboratorio disponibles, súbelos aquí. Si no, no te preocupes — puedes enviarlos después.'
                : "If you have your lab results available, upload them here. If not, don't worry — you can submit them later."}
            </p>
          </div>

          {/* Upload area */}
          <div
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
              uploaded ? 'border-green-300 bg-green-50/30' : error ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => !uploading && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleFileChange}
              className="sr-only"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: `${accentColor}30`, borderTopColor: accentColor }} />
                <p className="text-sm text-gray-500">{isSpanish ? 'Procesando...' : 'Processing...'}</p>
              </div>
            ) : uploaded ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
                  <svg className="w-6 h-6" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#413d3d]">{fileName}</p>
                  <p className="text-xs text-gray-400 mt-1">{isSpanish ? 'Archivo cargado exitosamente' : 'File uploaded successfully'}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploaded(false);
                    setFileName('');
                    setResponse('lab_file', '');
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  className="text-xs text-gray-400 underline hover:text-gray-600"
                >
                  {isSpanish ? 'Cambiar archivo' : 'Change file'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#413d3d]">
                    {isSpanish ? 'Toca para subir tus laboratorios' : 'Tap to upload your labs'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isSpanish ? 'PDF, imagen o documento (máx 15MB)' : 'PDF, image, or document (max 15MB)'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Accepted formats */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="px-2 py-1 bg-gray-100 rounded">PDF</span>
            <span className="px-2 py-1 bg-gray-100 rounded">JPG</span>
            <span className="px-2 py-1 bg-gray-100 rounded">PNG</span>
            <span className="px-2 py-1 bg-gray-100 rounded">DOC</span>
          </div>

          {/* Continue / Skip buttons */}
          <div className="space-y-3 mt-5">
            <button
              onClick={handleContinue}
              className="continue-button"
            >
              <span>{uploaded ? (isSpanish ? 'Continuar' : 'Continue') : (isSpanish ? 'Continuar sin subir' : 'Continue without uploading')}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {!uploaded && (
              <button
                onClick={handleSkip}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
              >
                {isSpanish ? 'Los enviaré después' : "I'll submit them later"}
              </button>
            )}
          </div>

          <p className="copyright-text text-center mt-4">
            {isSpanish ? (
              <>© 2026 EONPro, LLC. Todos los derechos reservados.<br />Proceso exclusivo y protegido.</>
            ) : (
              <>© 2026 EONPro, LLC. All rights reserved.<br />Exclusive and protected process.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
