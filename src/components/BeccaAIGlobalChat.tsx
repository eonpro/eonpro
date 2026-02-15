'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import BeccaAIChat from './BeccaAIChat';
import { isBrowser, getLocalStorageItem } from '@/lib/utils/ssr-safe';
import { getStoredUser } from '@/lib/auth/stored-role';
import { apiFetch } from '@/lib/api/fetch';

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
  '/affiliate',
];

// Animated Becca AI Logo Button
function BeccaButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-gray-100 bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
      aria-label="Open Becca AI"
    >
      {/* Pulse ring */}
      <span className="absolute inset-0 animate-ping rounded-full bg-[#17aa7b]/20" />

      {/* Logo */}
      <svg
        className="relative z-10 h-8 w-8"
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="#17aa7b"
          d="M189.75 96.06c0 48.469-39.565 87.76-88.37 87.76s-88.37-39.291-88.37-87.76S52.575 8.3 101.38 8.3s88.37 39.291 88.37 87.76"
        />
        <path
          d="M188.99 111.68c-1.14 11.72-6.76 23.55-13.29 33.18-44 64.98-142.97 44.5-160.53-30.53 2.86-1.27 2.58 3.48 3.28 4.67 18.24 30.58 59.69 30.56 80.17 2.44 14.04-19.28 17.69-58.24 49.09-55.01 37.23 3.83 32.22 61.81-6.7 58.09-9.69-.93-21.13-15.97-28.67-5.23-3.94 5.61-1.03 9.23 3.34 13.18 18.66 16.88 53.79 10.92 67.13-9.97 2.17-3.39 3.14-8.13 6.17-10.82z"
          fill="#17aa7b"
        />
        <path
          d="M188.99 79.19c-3.98-5.01-5.71-11.01-10.19-15.88-19.35-21.04-54.75-19.06-71.74 3.85-15.05 20.29-21.04 68.64-57.86 55.47-31.03-11.1-21.09-58.47 12.48-56.31 1.29.08 9.83 1.9 10.17 2.3.48.55-.28 1.99-.72 2.68-4.61 7.17-17.94 15.08-23.79 23.82-6.11 9.11 4.68 18.42 12.8 12.8 4.27-2.96 14.53-13.78 18.91-18.12 3.33-3.3 15.22-14.3 16.07-17.93 2.47-10.51-14.36-19.35-22.68-21.6-18.92-5.11-40.51 1.84-51.54 18.42-1.42 2.13-2.22 5.14-3.59 6.99-.52.69-1.3 2.14-2.15.87C27.99 26.4 76.36-3.61 127.19 10.63c31.77 8.9 55.96 36.19 61.8 68.56"
          fill="#17aa7b"
        />
      </svg>

      {/* Hover tooltip */}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        Ask Becca AI
      </span>
    </button>
  );
}

export default function BeccaAIGlobalChat({ userEmail }: BeccaAIGlobalChatProps) {
  const [showChat, setShowChat] = useState(false);
  const [patientInfo, setPatientInfo] = useState<{ id: number; name: string } | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [clinicId, setClinicId] = useState<number | null>(null);
  const pathname = usePathname();

  // Check authentication and user role
  useEffect(() => {
    // SSR guard - only run on client
    if (!isBrowser) return;

    const checkAuth = () => {
      const authToken = getLocalStorageItem('auth-token');

      if (!authToken) {
        setIsAuthenticated(false);
        setUserRole(null);
        setCurrentUserEmail('');
        setClinicId(null);
        return;
      }

      // Use stored user (set at login); do not decode JWT for auth
      const stored = getStoredUser();
      const role = stored?.role ? (stored.role as string).toLowerCase() : null;
      const email = (stored?.email as string) ?? '';
      let clinic: number | null = (stored?.clinicId as number) ?? null;

      // Fallback: Check for selected-clinic cookie (with SSR guard)
      if (!clinic && isBrowser && document?.cookie) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'selected-clinic' && value) {
            const parsedClinic = parseInt(value, 10);
            if (!isNaN(parsedClinic) && parsedClinic > 0) {
              clinic = parsedClinic;
              break;
            }
          }
        }
      }

      // Fallback: Try to get clinic from subdomain
      if (!clinic && isBrowser) {
        const hostname = window.location.hostname;
        // If it's a subdomain like wellmedr.eonpro.io, we might need to resolve it
        // For now, we'll try to fetch the clinic ID from the server
        const parts = hostname.split('.');
        if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'app') {
          // This is likely a clinic subdomain - the middleware should have set the clinic
          // As a last resort, we'll just proceed and let the server handle it
          console.debug('[BeccaAI] On subdomain, clinic should be resolved by middleware');
        }
      }

      setIsAuthenticated(true);
      setUserRole(role);
      setCurrentUserEmail(email);
      setClinicId(clinic);
    };

    checkAuth();
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, [pathname]);

  // Extract patient ID from URL
  useEffect(() => {
    const patientMatch = pathname?.match(/\/patients\/(\d+)/);
    if (patientMatch) {
      const patientId = parseInt(patientMatch[1]);
      fetchPatientName(patientId);
    } else {
      setPatientInfo(null);
    }
  }, [pathname]);

  // Fetch patient name
  const fetchPatientName = async (patientId: number) => {
    try {
      const token = getLocalStorageItem('auth-token');
      if (!token) return;

      const response = await apiFetch(`/api/patients/${patientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const patient = data.patient || data;
        setPatientInfo({
          id: patientId,
          name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
        });
      } else {
        setPatientInfo({ id: patientId, name: '' });
      }
    } catch (e) {
      setPatientInfo({ id: patientId, name: '' });
    }
  };

  // Visibility checks
  const isPublicPage = PUBLIC_PAGES.some((page) => pathname?.startsWith(page)) || pathname === '/';
  const hasAllowedRole = userRole && ALLOWED_ROLES.includes(userRole);

  if (!isAuthenticated || isPublicPage || !hasAllowedRole) {
    return null;
  }

  const effectiveEmail = userEmail || currentUserEmail;

  return (
    <>
      {/* Floating button */}
      {!showChat && (
        <div className="fixed bottom-6 left-[88px] z-[9999]">
          <BeccaButton onClick={() => setShowChat(true)} />
        </div>
      )}

      {/* Chat panel - clean, modern design */}
      {showChat && (
        <div className="animate-slideUp fixed bottom-4 left-[88px] z-[9999]">
          <div className="flex h-[540px] w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200/50 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17aa7b]/10">
                  <svg className="h-6 w-6" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill="#17aa7b"
                      d="M189.75 96.06c0 48.469-39.565 87.76-88.37 87.76s-88.37-39.291-88.37-87.76S52.575 8.3 101.38 8.3s88.37 39.291 88.37 87.76"
                    />
                    <path
                      d="M188.99 111.68c-1.14 11.72-6.76 23.55-13.29 33.18-44 64.98-142.97 44.5-160.53-30.53 2.86-1.27 2.58 3.48 3.28 4.67 18.24 30.58 59.69 30.56 80.17 2.44 14.04-19.28 17.69-58.24 49.09-55.01 37.23 3.83 32.22 61.81-6.7 58.09-9.69-.93-21.13-15.97-28.67-5.23-3.94 5.61-1.03 9.23 3.34 13.18 18.66 16.88 53.79 10.92 67.13-9.97 2.17-3.39 3.14-8.13 6.17-10.82z"
                      fill="#17aa7b"
                    />
                    <path
                      d="M188.99 79.19c-3.98-5.01-5.71-11.01-10.19-15.88-19.35-21.04-54.75-19.06-71.74 3.85-15.05 20.29-21.04 68.64-57.86 55.47-31.03-11.1-21.09-58.47 12.48-56.31 1.29.08 9.83 1.9 10.17 2.3.48.55-.28 1.99-.72 2.68-4.61 7.17-17.94 15.08-23.79 23.82-6.11 9.11 4.68 18.42 12.8 12.8 4.27-2.96 14.53-13.78 18.91-18.12 3.33-3.3 15.22-14.3 16.07-17.93 2.47-10.51-14.36-19.35-22.68-21.6-18.92-5.11-40.51 1.84-51.54 18.42-1.42 2.13-2.22 5.14-3.59 6.99-.52.69-1.3 2.14-2.15.87C27.99 26.4 76.36-3.61 127.19 10.63c31.77 8.9 55.96 36.19 61.8 68.56"
                      fill="#17aa7b"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Becca AI</h2>
                  <p className="text-xs text-gray-500">Medical Assistant</p>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowChat(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
              >
                <svg
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Patient context badge */}
            {patientInfo?.name && (
              <div className="border-b border-[#17aa7b]/10 bg-[#17aa7b]/5 px-4 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <svg
                    className="h-4 w-4 text-[#17aa7b]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span className="font-medium text-[#17aa7b]">{patientInfo.name}</span>
                </div>
              </div>
            )}

            {/* Chat content */}
            <div className="flex-1 overflow-hidden">
              <BeccaAIChat
                userEmail={effectiveEmail}
                embedded={true}
                className="h-full"
                patientId={patientInfo?.id}
                patientName={patientInfo?.name || undefined}
                clinicId={clinicId || undefined}
                onClose={() => setShowChat(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
