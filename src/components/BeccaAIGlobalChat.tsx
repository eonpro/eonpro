'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import BeccaAIChat from './BeccaAIChat';
import BeccaAIButton from './BeccaAIButton';

interface BeccaAIGlobalChatProps {
  userEmail?: string;
}

// Roles that have access to Becca AI
const ALLOWED_ROLES = ['super_admin', 'admin', 'provider', 'staff', 'support'];

// Public pages where Becca AI should never appear
const PUBLIC_PAGES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/pay/',
  '/patient-portal',
  '/influencer',
];

export default function BeccaAIGlobalChat({ userEmail }: BeccaAIGlobalChatProps) {
  const [showChat, setShowChat] = useState(false);
  const [patientInfo, setPatientInfo] = useState<{ id: number; name: string } | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [clinicId, setClinicId] = useState<number | null>(null);
  const pathname = usePathname();
  
  // Check authentication and user role from localStorage
  useEffect(() => {
    const checkAuth = () => {
      const authToken = localStorage.getItem('auth-token');
      const user = localStorage.getItem('user');
      
      // No auth token = not logged in
      if (!authToken) {
        setIsAuthenticated(false);
        setUserRole(null);
        setCurrentUserEmail('');
        setClinicId(null);
        return;
      }
      
      let role: string | null = null;
      let email = '';
      let clinic: number | null = null;
      
      // Try to get role from user object first
      if (user) {
        try {
          const userData = JSON.parse(user);
          role = userData.role?.toLowerCase();
          email = userData.email || '';
          clinic = userData.clinicId || null;
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      // If no role from user object, try to decode JWT
      if (!role) {
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          role = payload.role?.toLowerCase();
          email = payload.email || email;
          clinic = payload.clinicId || clinic;
        } catch (e) {
          // Can't decode token
        }
      }
      
      setIsAuthenticated(true);
      setUserRole(role);
      setCurrentUserEmail(email);
      setClinicId(clinic);
    };
    
    checkAuth();
    
    // Re-check on storage changes (for when user logs in/out in another tab)
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, [pathname]); // Re-check on route changes
  
  // Extract patient ID from URL if on a patient page
  useEffect(() => {
    const patientMatch = pathname?.match(/\/patients\/(\d+)/);
    if (patientMatch) {
      const patientId = parseInt(patientMatch[1]);
      // Try to fetch patient name
      fetchPatientName(patientId);
    } else {
      setPatientInfo(null);
    }
  }, [pathname]);
  
  // Fetch patient name for context
  const fetchPatientName = async (patientId: number) => {
    try {
      const token = localStorage.getItem('auth-token');
      if (!token) return;
      
      const response = await fetch(`/api/patients/${patientId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const patient = data.patient || data;
        setPatientInfo({
          id: patientId,
          name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim()
        });
      } else {
        setPatientInfo({ id: patientId, name: '' });
      }
    } catch (e) {
      setPatientInfo({ id: patientId, name: '' });
    }
  };

  // Check if current page is public
  const isPublicPage = PUBLIC_PAGES.some(page => pathname?.startsWith(page)) || pathname === '/';
  
  // Check if user has allowed role
  const hasAllowedRole = userRole && ALLOWED_ROLES.includes(userRole);
  
  // Only show Becca AI if:
  // 1. User is authenticated
  // 2. Not on a public page
  // 3. User has an allowed role
  if (!isAuthenticated || isPublicPage || !hasAllowedRole) {
    return null;
  }

  const effectiveEmail = userEmail || currentUserEmail;

  return (
    <>
      {!showChat && (
        <BeccaAIButton
          onClick={() => setShowChat(true)}
          size="medium"
          showPulse={true}
          className="fixed bottom-6 left-[88px] z-[9999] drop-shadow-xl"
        />
      )}
      
      {showChat && (
        <div className="fixed bottom-4 left-[88px] w-[400px] h-[560px] z-[9999] shadow-2xl rounded-[32px] overflow-hidden">
          <div className="relative w-full h-full bg-[#efece7] overflow-hidden">
            {/* Main Content Area */}
            <div className="relative h-full flex flex-col">
              {/* Header Section */}
              <div className="relative px-6 pt-4 pb-2 bg-[#efece7]">
                {/* Close button - visible X */}
                <button
                  onClick={() => setShowChat(false)}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                {/* Logo and Animation Row */}
                <div className="flex items-center justify-between">
                  {/* Eonpro logo mark - SVG for transparency */}
                  <svg className="h-8 w-8" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#17aa7b" d="M189.75 96.06c0 48.469-39.565 87.76-88.37 87.76s-88.37-39.291-88.37-87.76S52.575 8.3 101.38 8.3s88.37 39.291 88.37 87.76"/>
                    <path d="M188.99 111.68c-1.14 11.72-6.76 23.55-13.29 33.18-44 64.98-142.97 44.5-160.53-30.53 2.86-1.27 2.58 3.48 3.28 4.67 18.24 30.58 59.69 30.56 80.17 2.44 14.04-19.28 17.69-58.24 49.09-55.01 37.23 3.83 32.22 61.81-6.7 58.09-9.69-.93-21.13-15.97-28.67-5.23-3.94 5.61-1.03 9.23 3.34 13.18 18.66 16.88 53.79 10.92 67.13-9.97 2.17-3.39 3.14-8.13 6.17-10.82z" fill="#17aa7b"/>
                    <path d="M188.99 79.19c-3.98-5.01-5.71-11.01-10.19-15.88-19.35-21.04-54.75-19.06-71.74 3.85-15.05 20.29-21.04 68.64-57.86 55.47-31.03-11.1-21.09-58.47 12.48-56.31 1.29.08 9.83 1.9 10.17 2.3.48.55-.28 1.99-.72 2.68-4.61 7.17-17.94 15.08-23.79 23.82-6.11 9.11 4.68 18.42 12.8 12.8 4.27-2.96 14.53-13.78 18.91-18.12 3.33-3.3 15.22-14.3 16.07-17.93 2.47-10.51-14.36-19.35-22.68-21.6-18.92-5.11-40.51 1.84-51.54 18.42-1.42 2.13-2.22 5.14-3.59 6.99-.52.69-1.3 2.14-2.15.87C27.99 26.4 76.36-3.61 127.19 10.63c31.77 8.9 55.96 36.19 61.8 68.56" fill="#17aa7b"/>
                  </svg>
                  
                  <div className="w-14 h-14 -mr-2">
                    <DotLottieReact
                      src="https://lottie.host/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie"
                      loop
                      autoplay
                    />
                  </div>
                </div>
                
                {/* Context indicator */}
                {patientInfo?.name && (
                  <div className="mt-2 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full inline-block">
                    Viewing: {patientInfo.name}
                  </div>
                )}
              </div>
              
              {/* Chat Messages Area */}
              <div className="flex-1 mx-4 mb-4 rounded-[20px] overflow-hidden bg-white">
                <BeccaAIChat
                  userEmail={effectiveEmail}
                  embedded={true}
                  className="h-full"
                  patientId={patientInfo?.id}
                  patientName={patientInfo?.name || undefined}
                  clinicId={clinicId || undefined}
                  customTheme={{
                    backgroundColor: 'white',
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
