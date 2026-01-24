'use client';

/**
 * Affiliate Login Page
 * 
 * Premium phone-based authentication experience.
 * Mobile-first, minimal design inspired by Hims/Ro.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

type LoginStep = 'phone' | 'code' | 'success';

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
  
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRef = useRef<HTMLInputElement>(null);

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
    phoneInputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-center border-b border-gray-100">
        <div className="text-xl font-semibold tracking-tight text-gray-900">
          Partner Portal
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          {step === 'phone' && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-sm"
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Welcome back
                </h1>
                <p className="text-gray-500">
                  Enter your phone number to continue
                </p>
              </div>

              <form onSubmit={handlePhoneSubmit} className="space-y-6">
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
                      className="w-full pl-12 pr-4 py-4 text-lg rounded-xl border border-gray-200 
                               focus:border-gray-900 focus:ring-0 transition-colors
                               placeholder:text-gray-300"
                    />
                  </div>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-red-500 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={isLoading || phone.replace(/\D/g, '').length !== 10}
                  className="w-full py-4 bg-gray-900 text-white text-lg font-medium rounded-xl
                           hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400
                           transition-all duration-200 flex items-center justify-center"
                >
                  {isLoading ? (
                    <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Continue'
                  )}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-gray-400">
                By continuing, you agree to our{' '}
                <a href="/terms" className="text-gray-600 hover:underline">Terms</a>
                {' '}and{' '}
                <a href="/privacy" className="text-gray-600 hover:underline">Privacy Policy</a>
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
              className="w-full max-w-sm"
            >
              <button
                onClick={() => {
                  setStep('phone');
                  setCode(['', '', '', '', '', '']);
                  setError(null);
                }}
                className="mb-6 text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Enter code
                </h1>
                <p className="text-gray-500">
                  We sent a code to {phone}
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
                      className="w-12 h-14 text-center text-2xl font-semibold rounded-xl
                               border border-gray-200 focus:border-gray-900 focus:ring-0
                               transition-colors"
                    />
                  ))}
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-red-500 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                {isLoading && (
                  <div className="flex justify-center">
                    <span className="inline-block w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                  </div>
                )}

                <div className="text-center">
                  {countdown > 0 ? (
                    <p className="text-gray-400 text-sm">
                      Resend code in {countdown}s
                    </p>
                  ) : (
                    <button
                      onClick={handleResendCode}
                      disabled={isLoading}
                      className="text-gray-900 font-medium text-sm hover:underline"
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
                className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <footer className="px-6 py-4 text-center text-xs text-gray-400">
        Need help?{' '}
        <a href="mailto:partners@lifefile.com" className="text-gray-600 hover:underline">
          Contact support
        </a>
      </footer>
    </div>
  );
}
