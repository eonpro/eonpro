'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isBrowser, getLocalStorageItem } from '@/lib/utils/ssr-safe';
import { getStoredUser } from '@/lib/auth/stored-role';

interface BeccaAIGlobalChatProps {
  userEmail?: string;
}

const BeccaAIChat = dynamic(() => import('./BeccaAIChat'), {
  ssr: false,
  loading: () => null,
});

const ALLOWED_ROLES = ['super_admin', 'admin', 'provider', 'staff', 'support'];

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

function BeccaButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-gray-100 bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
      aria-label="Open Becca AI (⌘K)"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-[#17aa7b]/20" />
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
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        Becca AI <kbd className="ml-1 rounded bg-gray-700 px-1 font-mono text-[10px]">⌘K</kbd>
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

  // Auth check
  useEffect(() => {
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

      const stored = getStoredUser();
      const role = stored?.role ? (stored.role as string).toLowerCase() : null;
      const email = (stored?.email as string) ?? '';
      let clinic: number | null = (stored?.clinicId as number) ?? null;

      if (!clinic && document?.cookie) {
        const match = document.cookie.match(/(?:^|;\s*)selected-clinic=(\d+)/);
        if (match) clinic = parseInt(match[1], 10) || null;
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

  // Extract patient from URL
  useEffect(() => {
    const match = pathname?.match(/\/patients\/(\d+)/);
    if (match) {
      const pid = parseInt(match[1]);
      fetchPatientName(pid);
    } else {
      setPatientInfo(null);
    }
  }, [pathname]);

  const fetchPatientName = async (patientId: number) => {
    try {
      const res = await fetch(`/api/patients/${patientId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const p = data.patient || data;
        setPatientInfo({ id: patientId, name: `${p.firstName || ''} ${p.lastName || ''}`.trim() });
      } else {
        setPatientInfo({ id: patientId, name: '' });
      }
    } catch {
      setPatientInfo({ id: patientId, name: '' });
    }
  };

  // Keyboard shortcut: Cmd+K / Ctrl+K
  const toggleChat = useCallback(() => setShowChat((prev) => !prev), []);

  useEffect(() => {
    if (!isBrowser) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleChat();
      }
      if (e.key === 'Escape' && showChat) {
        setShowChat(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showChat, toggleChat]);

  // Visibility
  const isPublicPage =
    PUBLIC_PAGES.some((p) => pathname?.startsWith(p)) ||
    pathname === '/' ||
    pathname === '/dashboard';
  const hasAllowedRole = userRole && ALLOWED_ROLES.includes(userRole);

  if (!isAuthenticated || isPublicPage || !hasAllowedRole) return null;

  const effectiveEmail = userEmail || currentUserEmail;
  const hideOnMobile = pathname?.startsWith('/provider/prescription-queue');

  return (
    <>
      {/* Floating button */}
      {!showChat && (
        <div
          className={`fixed bottom-6 left-[88px] z-[9999]${hideOnMobile ? 'hidden sm:block' : ''}`}
        >
          <BeccaButton onClick={() => setShowChat(true)} />
        </div>
      )}

      {/* Chat panel */}
      {showChat && (
        <div className="animate-slideUp fixed bottom-4 left-[88px] z-[9999]">
          <div className="flex h-[600px] w-[420px] flex-col overflow-hidden rounded-2xl border border-gray-200/50 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
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
                  <p className="text-xs text-gray-500">Clinical Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="hidden rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 sm:inline">
                  ⌘K
                </kbd>
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
            </div>

            {/* Patient context bar with quick-action chips */}
            {patientInfo?.name && (
              <div className="border-b border-[#17aa7b]/10 bg-[#17aa7b]/5 px-4 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <svg
                    className="h-4 w-4 shrink-0 text-[#17aa7b]"
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
                <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
                  {[
                    { label: 'Orders', query: `Show ${patientInfo.name}'s recent orders` },
                    { label: 'Rx', query: `What prescriptions does ${patientInfo.name} have?` },
                    { label: 'SOAP', query: `Show ${patientInfo.name}'s latest SOAP notes` },
                    {
                      label: 'Tracking',
                      query: `What's the tracking status for ${patientInfo.name}?`,
                    },
                    { label: 'Weight', query: `Show ${patientInfo.name}'s weight history` },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => {
                        const chatEl =
                          document.querySelector<HTMLTextAreaElement>('[data-becca-input]');
                        if (chatEl) {
                          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLTextAreaElement.prototype,
                            'value'
                          )?.set;
                          nativeInputValueSetter?.call(chatEl, chip.query);
                          chatEl.dispatchEvent(new Event('input', { bubbles: true }));
                          chatEl.form?.requestSubmit?.();
                        }
                        window.dispatchEvent(new CustomEvent('becca-send', { detail: chip.query }));
                      }}
                      className="shrink-0 rounded-full border border-[#17aa7b]/20 bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#17aa7b] transition-colors hover:bg-[#17aa7b]/10"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat */}
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
