'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';
import { logger } from '@/lib/logger';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

interface AddressStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function AddressStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: AddressStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  
  const responses = useIntakeStore((state) => state.responses);
  const clinicSlug = useIntakeStore((state) => state.clinicSlug);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  
  const [address, setAddressLocal] = useState(String(responses.street ?? ''));
  const [apartment, setApartment] = useState(String(responses.apartment ?? ''));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [addressComponents, setAddressComponents] = useState<any>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    if (window.google?.maps) {
      initializeAutocomplete();
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(checkInterval);
          initializeAutocomplete();
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => initializeAutocomplete();
    document.head.appendChild(script);
  }, []);

  const initializeAutocomplete = () => {
    if (!inputRef.current || !window.google?.maps?.places) return;
    
    try {
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address', 'geometry']
      });

      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        
        if (place.formatted_address) {
          setAddressLocal(place.formatted_address);
          
          if (place.address_components) {
            const components: Record<string, string> = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            place.address_components.forEach((component: any) => {
              const types = component.types;
              if (types.includes('locality')) components.city = component.long_name;
              if (types.includes('administrative_area_level_1')) components.state = component.short_name;
              if (types.includes('postal_code')) components.zipCode = component.long_name;
            });
            if (!components.zipCode && place.formatted_address) {
              const zipMatch = place.formatted_address.match(/\b(\d{5})(?:-\d{4})?\b/);
              if (zipMatch) components.zipCode = zipMatch[1];
            }
            setAddressComponents(components);
          }

          if (place.geometry?.location) {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
            if (key) {
              setMapUrl(
                `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x200&scale=2&markers=color:green%7C${lat},${lng}&key=${key}`
              );
            }
          }
        }
      });
    } catch (error) {
      logger.error('Error initializing autocomplete:', error);
    }
  };

  const handleContinue = () => {
    if (address) {
      const fullAddress = apartment ? `${address}, ${apartment}` : address;
      
      setResponse('street', address);
      setResponse('apartment', apartment);
      setResponse('fullAddress', fullAddress);
      setResponse('addressCity', addressComponents?.city || '');
      setResponse('addressState', addressComponents?.state || '');
      setResponse('addressZipCode', addressComponents?.zipCode || '');
      
      markStepCompleted('address');
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-100">
        <div 
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
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

      {/* Cold Shipping Banner - EONMeds only */}
      {!isOt && (
        <div className="px-6 mt-3 max-w-md lg:max-w-lg mx-auto w-full">
          <div className="bg-[#f0feab] rounded-3xl overflow-hidden flex items-stretch">
            <div className="flex-1 px-5 py-3 flex flex-col justify-center">
              <h3 className="font-semibold text-base text-black">
                {isSpanish ? 'Envío en frío' : 'Cold shipping'}
              </h3>
              <p className="text-xs text-gray-600 font-normal mt-0.5">
                {isSpanish ? 'Entrega directa a tu puerta' : 'Delivered directly to your door'}
              </p>
            </div>
            <div className="flex-shrink-0 bg-gray-200 rounded-r-3xl">
              <img
                src="https://static.wixstatic.com/media/c49a9b_4d682057194f4e1fa67cf62dd50a1d27~mv2.webp"
                alt="Cold Shipping"
                className="h-20 w-20 object-cover rounded-r-3xl"
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 px-6 lg:px-8 py-4 pb-48 max-w-md lg:max-w-lg mx-auto w-full">
        <div className="space-y-4">
          <div>
            <h1 className="page-title mb-2">
              {isOt
                ? (isSpanish ? '¿Cuál es tu dirección?' : 'What is your home address?')
                : (isSpanish ? '¿A dónde enviamos tu tratamiento?' : 'Where should we ship your treatment?')}
            </h1>
            <p className="page-subtitle text-sm mb-1">
              {isOt
                ? (isSpanish
                    ? 'Usamos tu dirección para confirmar que nuestros servicios están disponibles en tu estado y para cumplir con los requisitos médicos locales.'
                    : 'We use your address to confirm that our services are available in your state and to meet local medical requirements.')
                : (isSpanish
                    ? 'Enviamos a los 50 estados de EE. UU.'
                    : 'We ship to all 50 US states.')}
            </p>
          </div>

          <div className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              placeholder={isSpanish ? 'Dirección' : 'Address'}
              value={address}
              onChange={(e) => setAddressLocal(e.target.value)}
              className="input-field w-full"
            />
            
            <input
              type="text"
              placeholder={isSpanish ? 'Apartamento, suite, etc. (opcional)' : 'Apartment, suite, etc. (optional)'}
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
              className="input-field w-full"
            />
            
            <p className="text-xs text-[#413d3d]/50">
              {isSpanish 
                ? 'Si tu dirección incluye un número de apartamento o suite, agrégalo arriba.'
                : 'If your address includes an apartment or suite number, please add it above.'}
            </p>
          </div>

          {mapUrl && (
            <div className="rounded-2xl overflow-hidden border border-gray-200 mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mapUrl}
                alt="Address location"
                className="w-full h-[160px] object-cover"
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Sticky bottom button */}
      <div className="sticky-bottom-button max-w-md lg:max-w-lg mx-auto w-full">
        <button 
          onClick={handleContinue}
          disabled={!address}
          className="continue-button"
        >
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        <div className="mt-6 text-center">
          <p className="copyright-text">
            {isSpanish ? (
              <>© 2026 EONPro, LLC. Todos los derechos reservados.<br/>Proceso exclusivo y protegido.</>
            ) : (
              <>© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
