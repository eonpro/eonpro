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
                  {/* Favicon only */}
                  <img
                    src="https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png"
                    alt="EONPRO"
                    className="h-10 w-10 object-contain"
                  />
                  
                  <div className="w-16 h-16 -mr-2">
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
