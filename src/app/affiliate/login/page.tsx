'use client';

/**
 * Affiliate Login Page
 * 
 * Premium phone-based authentication with clinic branding.
 * Mobile-first, minimal design.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

type LoginStep = 'phone' | 'code' | 'success';

interface ClinicBranding {
  clinicId: number;
  name: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark';
}

// Helper function to calculate text color based on background luminance
function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';

  // Auto mode: calculate based on luminance
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

export default function AffiliateLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/affiliate';
  
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  
  // Branding state
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Resolve clinic from domain and load branding
  useEffect(() => {
    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);

        if (response.ok) {
          const data = await response.json();
          setBranding({
            clinicId: data.clinicId,
            name: data.name,
            logoUrl: data.branding.logoUrl,
            iconUrl: data.branding.iconUrl,
            faviconUrl: data.branding.faviconUrl,
            primaryColor: data.branding.primaryColor,
            secondaryColor: data.branding.secondaryColor,
            accentColor: data.branding.accentColor,
            buttonTextColor: data.branding.buttonTextColor || 'auto',
          });

          // Update favicon if clinic has one
          if (data.branding.faviconUrl) {
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = data.branding.faviconUrl;
            document.head.appendChild(link);
          }

          // Update page title
          document.title = `Partner Portal | ${data.name}`;
        }
      } catch (err) {
        // Silently fail - use default branding
        console.log('Using default branding');
      } finally {
        setBrandingLoaded(true);
      }
    };

    resolveClinic();
  }, []);

  // Format phone number as user types
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    setError(null);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+1${digits}` }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send code');
      }

      setStep('code');
      setCountdown(60);
      setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError(null);

    // Auto-advance to next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (value && index === 5 && newCode.every(d => d)) {
      handleCodeSubmit(newCode.join(''));
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      handleCodeSubmit(pasted);
    }
  };

  const handleCodeSubmit = async (codeString?: string) => {
    const finalCode = codeString || code.join('');
    if (finalCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const digits = phone.replace(/\D/g, '');
      const res = await fetch('/api/affiliate/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: `+1${digits}`,
          code: finalCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      setStep('success');
      
      // Brief success state before redirect
      setTimeout(() => {
        router.push(redirectTo);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setCode(['', '', '', '', '', '']);
      codeInputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    
    setIsLoading(true);
    try {
      const digits = phone.replace(/\D/g, '');
      await fetch('/api/affiliate/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+1${digits}` }),
      });
      setCountdown(60);
      setError(null);
    } catch {
      setError('Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [countdown]);

  // Auto-focus phone input
  useEffect(() => {
    if (brandingLoaded) {
      phoneInputRef.current?.focus();
    }
  }, [brandingLoaded]);

  // Get colors from branding or use defaults
  const primaryColor = branding?.primaryColor || '#10B981';
  const secondaryColor = branding?.secondaryColor || '#3B82F6';
  const accentColor = branding?.accentColor || '#d3f931';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  // Show loading while branding is being fetched
  if (!brandingLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div 
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen"
      style={{ backgroundColor: '#f5f5f0' }}
    >

      {/* Content */}
      <div className="min-h-screen flex flex-col">
        {/* Logo centered at top - uses clinic logo if available */}
        <div className="flex flex-col items-center pt-12 pb-8">
          {branding ? (
            <>
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="h-12 max-w-[200px] object-contain"
                />
              ) : (
                <h1
                  className="text-3xl font-bold"
                  style={{ color: primaryColor }}
                >
                  {branding.name}
                </h1>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Powered by <span className="font-medium">EONPRO</span>
              </p>
            </>
          ) : (
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
              alt="EONPRO"
              className="h-10 w-auto"
            />
          )}
        </div>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                {/* Welcome Text */}
                <div className="text-center mb-8">
                  <h1 className="text-5xl md:text-6xl font-light text-gray-900 tracking-tight">
                    Partner Portal
                  </h1>
                </div>

                <form onSubmit={handlePhoneSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="phone" className="sr-only">
                      Phone number
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                        +1
                      </span>
                      <input
                        ref={phoneInputRef}
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={phone}
                        onChange={handlePhoneChange}
                        placeholder="(555) 555-5555"
                        className="w-full pl-12 pr-4 py-4 text-lg bg-white border border-gray-200 rounded-2xl 
                                 focus:outline-none focus:ring-2 focus:border-transparent transition-all
                                 placeholder:text-gray-400"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 bg-red-50 border border-red-200 rounded-2xl"
                    >
                      <p className="text-sm text-red-600 text-center">{error}</p>
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || phone.replace(/\D/g, '').length !== 10}
                    className={`w-full px-6 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: isLoading || phone.replace(/\D/g, '').length !== 10 ? '#9CA3AF' : primaryColor,
                      color: buttonTextColor,
                    }}
                  >
                    {isLoading ? (
                      <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Continue'
                    )}
                  </button>
                </form>

                <p className="mt-8 text-center text-sm text-gray-500">
                  By continuing, you agree to our{' '}
                  <a href="/terms" className="font-medium hover:opacity-80" style={{ color: primaryColor }}>Terms</a>
                  {' '}and{' '}
                  <a href="/privacy" className="font-medium hover:opacity-80" style={{ color: primaryColor }}>Privacy Policy</a>
                </p>
              </motion.div>
            )}

            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                <button
                  onClick={() => {
                    setStep('phone');
                    setCode(['', '', '', '', '', '']);
                    setError(null);
                  }}
                  className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <div className="text-center mb-8">
                  <h1 className="text-4xl font-light text-gray-900 mb-4">
                    Enter code
                  </h1>
                  <p className="text-gray-600">
                    We sent a verification code to <span className="font-medium">{phone}</span>
                  </p>
                </div>

                <div className="space-y-6">
                  <div 
                    className="flex justify-center gap-3"
                    onPaste={handleCodePaste}
                  >
                    {code.map((digit, index) => (
                      <input
                        key={index}
                        ref={el => { codeInputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleCodeChange(index, e.target.value)}
                        onKeyDown={e => handleCodeKeyDown(index, e)}
                        className="w-12 h-14 text-center text-2xl font-semibold bg-white rounded-xl
                                 border border-gray-200 focus:outline-none focus:ring-2 focus:border-transparent
                                 transition-colors"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    ))}
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 bg-red-50 border border-red-200 rounded-2xl"
                    >
                      <p className="text-sm text-red-600 text-center">{error}</p>
                    </motion.div>
                  )}

                  {isLoading && (
                    <div className="flex justify-center">
                      <span 
                        className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
                      />
                    </div>
                  )}

                  <div className="text-center">
                    {countdown > 0 ? (
                      <p className="text-gray-500 text-sm">
                        Resend code in {countdown}s
                      </p>
                    ) : (
                      <button
                        onClick={handleResendCode}
                        disabled={isLoading}
                        className="font-medium text-sm hover:opacity-80"
                        style={{ color: primaryColor }}
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <svg 
                    className="w-8 h-8" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    style={{ color: primaryColor }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Welcome back!
                </h2>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center">
          <p className="text-xs text-gray-500">
            Need help?{' '}
            <a 
              href={`mailto:support@${branding?.name?.toLowerCase().replace(/\s+/g, '') || 'eonpro'}.com`} 
              className="font-medium hover:opacity-80"
              style={{ color: primaryColor }}
            >
              Contact support
            </a>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            © 2026 {branding?.name || 'EONPRO'} • Partner Portal
          </p>
        </footer>
      </div>
    </div>
  );
}
