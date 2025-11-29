'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import BeccaAIChat from './BeccaAIChat';
import BeccaAIButton from './BeccaAIButton';

interface BeccaAIGlobalChatProps {
  userEmail: string;
}

export default function BeccaAIGlobalChat({ userEmail }: BeccaAIGlobalChatProps) {
  const [showChat, setShowChat] = useState(false);
  const [patientInfo, setPatientInfo] = useState<{ id: number; name: string } | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const pathname = usePathname();
  
  // Check user role from localStorage or auth token
  useEffect(() => {
    // Check for various auth tokens to determine user role
    const authToken = localStorage.getItem('auth-token');
    const adminToken = localStorage.getItem('admin-token');
    const providerToken = localStorage.getItem('provider-token');
    const staffToken = localStorage.getItem('staff-token');
    const supportToken = localStorage.getItem('support-token');
    const influencerToken = localStorage.getItem('influencer-token');
    const patientToken = localStorage.getItem('patient-token');
    const user = localStorage.getItem('user');
    
    let role = null;
    
    // Try to get role from user object first
    if (user) {
      try {
        const userData = JSON.parse(user);
        role = userData.role?.toLowerCase();
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // If no role from user object, check tokens
    if (!role) {
      if (patientToken) role = 'patient';
      else if (adminToken) role = 'admin';
      else if (providerToken) role = 'provider';
      else if (staffToken) role = 'staff';
      else if (supportToken) role = 'support';
      else if (influencerToken) role = 'influencer';
      else if (authToken) {
        // Try to decode JWT to get role
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          role = payload.role?.toLowerCase();
        } catch (e) {
          // Default to non-patient role if we can't decode
          role = 'staff';
        }
      }
    }
    
    setUserRole(role);
  }, [pathname]); // Re-check on route changes
  
  // Don't show Becca AI for patients or on patient portal
  const isPatientPortal = pathname?.startsWith('/patient-portal');
  const isPatient = userRole === 'patient';
  
  // Extract patient ID from URL if on a patient page
  useEffect(() => {
    const patientMatch = pathname.match(/\/patients\/(\d+)/);
    if (patientMatch) {
      const patientId = parseInt(patientMatch[1]);
      // Try to extract patient name from the page title or other elements
      // For now, we'll just pass the ID and let BeccaAI fetch the details
      setPatientInfo({ id: patientId, name: '' });
    } else {
      setPatientInfo(null);
    }
  }, [pathname]);

  // Don't render for patients or on patient portal pages
  if (isPatientPortal || isPatient) {
    return null;
  }

  return (
    <>
      {!showChat && (
        <BeccaAIButton
          onClick={() => setShowChat(true)}
          size="medium"
          showPulse={true}
          className="fixed bottom-32 left-6 z-40 drop-shadow-xl"
        />
      )}
      
      {showChat && (
        <div className="fixed bottom-0 left-6 w-[400px] h-[560px] z-50">
          <div className="relative w-full h-full bg-[#f9f8f6] rounded-[40px] overflow-hidden">
            {/* Main Content Area */}
            <div className="relative h-full flex flex-col">
              {/* Header Section */}
              <div className="relative px-6 pt-3 pb-2">
                {/* Close button */}
                <button
                  onClick={() => setShowChat(false)}
                  className="absolute top-3 right-4 text-white/60 hover:text-white/80 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                {/* Logo and Animation Row */}
                <div className="flex items-center justify-between">
                  <svg className="h-7 w-auto" viewBox="0 0 576 187.67" xmlns="http://www.w3.org/2000/svg">
                    <g>
                      <path fill="#ffffff" d="M189.75 96.06c0 48.469-39.565 87.76-88.37 87.76s-88.37-39.291-88.37-87.76S52.575 8.3 101.38 8.3s88.37 39.291 88.37 87.76"/>
                      <path d="M561.23 95.85c0 25.88-20.98 46.86-46.86 46.86s-46.86-20.98-46.86-46.86 20.98-46.86 46.86-46.86 46.86 20.98 46.86 46.86m-17.88.03c0-16.01-12.98-28.99-28.99-28.99s-28.99 12.98-28.99 28.99 12.98 28.99 28.99 28.99 28.99-12.98 28.99-28.99" fill="#ffffff"/>
                      <path d="M430.66 48.41c6.38-.72 12.04 0 18.12 1.86 8.2 2.49 29.56 14.61 17.95 24.39-8.02 6.76-14.24-2.01-21.03-4.69-23.62-9.3-36.41 10.42-37.58 31.47-.53 9.55 2.86 26.77.29 35.05-2.94 9.45-17.31 8.66-18.42-4-.99-11.17-1.01-36.68 1.13-47.3 3.77-18.8 20.27-34.61 39.55-36.78Z" fill="#ffffff"/>
                      <path d="M312.94 134.36v35.9c0 .25-2.27 3.62-2.72 4.08-5.92 6.15-16.69 2.89-17.71-5.58-1.57-13.09.1-32.3.05-46.15-.04-10.52-1.2-21.02-.02-31.7 4.98-45.02 65.1-57.96 87.78-18.28 24.35 42.6-27.06 89.39-67.39 61.72h.01Zm55.52-38.77c0-16.02-12.99-29.01-29.01-29.01s-29.01 12.99-29.01 29.01 12.99 29.01 29.01 29.01 29.01-12.99 29.01-29.01" fill="#ffffff"/>
                      <path d="M188.99 111.68c-1.14 11.72-6.76 23.55-13.29 33.18-44 64.98-142.97 44.5-160.53-30.53 2.86-1.27 2.58 3.48 3.28 4.67 18.24 30.58 59.69 30.56 80.17 2.44 14.04-19.28 17.69-58.24 49.09-55.01 37.23 3.83 32.22 61.81-6.7 58.09-9.69-.93-21.13-15.97-28.67-5.23-3.94 5.61-1.03 9.23 3.34 13.18 18.66 16.88 53.79 10.92 67.13-9.97 2.17-3.39 3.14-8.13 6.17-10.82z" fill="#17aa7b"/>
                      <path d="M188.99 79.19c-3.98-5.01-5.71-11.01-10.19-15.88-19.35-21.04-54.75-19.06-71.74 3.85-15.05 20.29-21.04 68.64-57.86 55.47-31.03-11.1-21.09-58.47 12.48-56.31 1.29.08 9.83 1.9 10.17 2.3.48.55-.28 1.99-.72 2.68-4.61 7.17-17.94 15.08-23.79 23.82-6.11 9.11 4.68 18.42 12.8 12.8 4.27-2.96 14.53-13.78 18.91-18.12 3.33-3.3 15.22-14.3 16.07-17.93 2.47-10.51-14.36-19.35-22.68-21.6-18.92-5.11-40.51 1.84-51.54 18.42-1.42 2.13-2.22 5.14-3.59 6.99-.52.69-1.3 2.14-2.15.87C27.99 26.4 76.36-3.61 127.19 10.63c31.77 8.9 55.96 36.19 61.8 68.56" fill="#17aa7b"/>
                      <path d="M235.69 48.41C258 45.88 280 59.4 286.45 81.12c3.28 11.05 3.45 37.99 2.34 49.87-1.21 12.98-16.79 15.21-21.59 3.39-2.66-16.5 5.08-44.4-7.89-57.1-12.36-12.1-34.04-8.35-40.44 7.97-5.64 14.37-.74 29.72-1.87 44.23-.19 2.42-.69 5.8-1.95 7.88-4 6.58-16.24 6.06-19.16-1.18-1.97-4.87-.81-22.91-.8-29.43.02-8-.95-14.85.95-23.17 4.01-17.57 21.74-33.13 39.66-35.16Z" fill="#ffffff"/>
                    </g>
                  </svg>
                  
                  <div className="w-16 h-16 -mr-2">
                    <DotLottieReact
                      src="https://lottie.host/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie"
                      loop
                      autoplay
                    />
                  </div>
                </div>
              </div>
              
              {/* Chat Messages Area - Transparent with blur */}
              <div className="flex-1 mx-4 mb-4 rounded-[20px] overflow-hidden bg-transparent">
                <BeccaAIChat
                  userEmail={userEmail}
                  embedded={true}
                  className="h-full"
                  patientId={patientInfo?.id}
                  patientName={patientInfo?.name || undefined}
                  customTheme={{
                    backgroundColor: 'transparent',
                    textColor: 'gray-800',
                    borderColor: 'transparent'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
