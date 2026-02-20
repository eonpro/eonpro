'use client';

/**
 * Affiliate Forgot Password Page
 *
 * Email-based password reset request with clinic branding.
 * Matches the login page design language (warm beige, rounded inputs, animated transitions).
 *
 * Flow:
 * 1. Enter email → sends reset link via API
 * 2. Shows success message (always, to prevent enumeration)
 * 3. User checks email → clicks link → lands on /affiliate/reset-password
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

type PageStep = 'email' | 'sent';

interface ClinicBranding {
  clinicId: number;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark';
}

function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

export default function AffiliateForgotPasswordPage() {
  const searchParams = useSearchParams();

  // Support pre-filled state from login page redirect
  const sentFromLogin = searchParams.get('sent') === 'true';
  const prefillEmail = searchParams.get('email') || '';

  const [step, setStep] = useState<PageStep>(sentFromLogin ? 'sent' : 'email');
  const [email, setEmail] = useState(prefillEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Branding
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [isMainApp, setIsMainApp] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // Load clinic branding (same pattern as login page)
  useEffect(() => {
    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.isMainApp) {
            setIsMainApp(true);
            setBrandingLoaded(true);
            return;
          }
          setBranding({
            clinicId: data.clinicId,
            name: data.name,
            logoUrl: data.branding.logoUrl,
            primaryColor: data.branding.primaryColor,
            buttonTextColor: data.branding.buttonTextColor || 'auto',
          });
          if (data.branding.faviconUrl) {
            const link =
              (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
              document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = data.branding.faviconUrl;
            document.head.appendChild(link);
          }
          document.title = `Reset Password | ${data.name}`;
        }
      } catch {
        // Use default branding
      } finally {
        setBrandingLoaded(true);
      }
    };
    resolveClinic();
  }, []);

  // Auto-focus
  useEffect(() => {
    if (brandingLoaded && step === 'email') {
      emailInputRef.current?.focus();
    }
  }, [brandingLoaded, step]);

  const primaryColor = branding?.primaryColor || '#10B981';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reset link');
      }

      // Always show success (API returns success regardless for security)
      setStep('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (!brandingLoaded) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: '#EFECE7' }}
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EFECE7' }}>
      <div className="flex min-h-screen flex-col">
        {/* Logo */}
        <div className="flex flex-col items-center pb-8 pt-12">
          {branding && !isMainApp ? (
            <>
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="h-12 max-w-[200px] object-contain"
                />
              ) : (
                <h1 className="text-3xl font-bold" style={{ color: primaryColor }}>
                  {branding.name}
                </h1>
              )}
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-gray-500">
                Powered by{' '}
                <img
                  src={EONPRO_LOGO}
                  alt="EONPRO"
                  className="h-[21px] w-auto"
                />
              </p>
            </>
          ) : (
            <img
              src={EONPRO_LOGO}
              alt="EONPRO"
              className="h-10 w-auto"
            />
          )}
        </div>

        {/* Main Content */}
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          <AnimatePresence mode="wait">
            {step === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                {/* Back link */}
                <a
                  href="/affiliate/login"
                  className="mb-6 flex items-center gap-1 text-gray-500 transition-colors hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="text-sm">Back to login</span>
                </a>

                {/* Heading */}
                <div className="mb-6">
                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    Reset your password
                  </h1>
                  <p className="mt-2 text-sm text-gray-500">
                    Enter the email address associated with your partner account and we&apos;ll send
                    you a link to set a new password.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="sr-only">
                      Email address
                    </label>
                    <div className="relative">
                      <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${email ? 'opacity-0' : 'opacity-100'}`}>
                        <Mail className="h-5 w-5" />
                      </div>
                      <input
                        ref={emailInputRef}
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
                        placeholder="Email address"
                        className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-lg transition-all placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="rounded-2xl border border-red-200 bg-red-50 p-4"
                    >
                      <p className="text-center text-sm text-red-600">{error}</p>
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                      isLoading || !email.trim()
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: isLoading || !email.trim() ? '#9CA3AF' : primaryColor,
                      color: buttonTextColor,
                    }}
                  >
                    {isLoading ? (
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'sent' && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <CheckCircle className="h-8 w-8" style={{ color: primaryColor }} />
                </motion.div>

                <h2 className="text-2xl font-semibold text-gray-900">Check your email</h2>
                <p className="mt-3 text-sm text-gray-500">
                  If an account exists for <strong className="text-gray-700">{email}</strong>,
                  we&apos;ve sent a link to set your password. The link expires in 1 hour.
                </p>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-500">
                    Didn&apos;t receive the email? Check your spam folder, or{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setStep('email');
                        setError(null);
                      }}
                      className="font-medium underline underline-offset-2 hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      try again
                    </button>
                    .
                  </p>
                </div>

                <a
                  href="/affiliate/login"
                  className="mt-6 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </a>
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
          <p className="mt-2 text-xs text-gray-400">
            &copy; 2026 EONPro &bull; Partner Portal
          </p>
        </footer>
      </div>
    </div>
  );
}
