'use client';

/**
 * Affiliate Login Page
 * 
 * Email + password authentication with clinic branding.
 * Mobile-first, minimal design.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Mail, ArrowRight } from 'lucide-react';

type LoginStep = 'email' | 'password' | 'success';

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
  
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Branding state
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [isMainApp, setIsMainApp] = useState(false);
  
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Resolve clinic from domain and load branding
  useEffect(() => {
    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);

        if (response.ok) {
          const data = await response.json();
          
          // Check if this is the main app (not a white-labeled clinic)
          if (data.isMainApp) {
            setIsMainApp(true);
            setBrandingLoaded(true);
            return;
          }
          
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

  // Auto-focus email input
  useEffect(() => {
    if (brandingLoaded && step === 'email') {
      emailInputRef.current?.focus();
    }
  }, [brandingLoaded, step]);

  // Auto-focus password input
  useEffect(() => {
    if (step === 'password') {
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    }
  }, [step]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedEmail = email.trim().toLowerCase();
    
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setError(null);
    setStep('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password');
      }

      // Clear any old session data to prevent role confusion
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('super_admin-token');
      localStorage.removeItem('admin-token');
      localStorage.removeItem('provider-token');
      localStorage.removeItem('staff-token');
      
      // Store affiliate-specific tokens and user data
      if (data.token) {
        localStorage.setItem('affiliate-token', data.token);
        localStorage.setItem('auth-token', data.token);
        localStorage.setItem('influencer-token', data.token); // For compatibility
        
        // Store user data for role-based redirects
        localStorage.setItem('user', JSON.stringify({
          id: data.affiliate?.id,
          email: data.affiliate?.email,
          name: data.affiliate?.displayName,
          role: 'affiliate',
        }));
      }

      setStep('success');
      
      // Brief success state before redirect
      setTimeout(() => {
        router.push(redirectTo);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setError(null);
  };

  // Get colors from branding or use defaults
  const primaryColor = branding?.primaryColor || '#10B981';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  // Show loading while branding is being fetched
  if (!brandingLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EFECE7' }}>
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
      style={{ backgroundColor: '#EFECE7' }}
    >
      {/* Content */}
      <div className="min-h-screen flex flex-col">
        {/* Logo centered at top - uses clinic logo if available */}
        <div className="flex flex-col items-center pt-12 pb-8">
          {branding && !isMainApp ? (
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
            {step === 'email' && (
              <motion.div
                key="email"
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

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="sr-only">
                      Email address
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <Mail className="h-5 w-5" />
                      </div>
                      <input
                        ref={emailInputRef}
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
                        placeholder="Email address"
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
                    disabled={isLoading || !email.trim()}
                    className={`w-full px-6 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      isLoading || !email.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: isLoading || !email.trim() ? '#9CA3AF' : primaryColor,
                      color: buttonTextColor,
                    }}
                  >
                    Continue
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-gray-500">
                  Not a partner yet?{' '}
                  <a href="/affiliate/apply" className="font-medium hover:opacity-80" style={{ color: primaryColor }}>Apply now</a>
                </p>

                <p className="mt-4 text-center text-xs text-gray-400">
                  By continuing, you agree to our{' '}
                  <a href="/terms" className="font-medium hover:opacity-80" style={{ color: primaryColor }}>Terms</a>
                  {' '}and{' '}
                  <a href="/privacy" className="font-medium hover:opacity-80" style={{ color: primaryColor }}>Privacy Policy</a>
                </p>
              </motion.div>
            )}

            {step === 'password' && (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                <button
                  onClick={handleBack}
                  className="mb-6 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                {/* Email Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl mb-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Email</p>
                    <p className="text-gray-900 font-medium">{email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="relative">
                    <input
                      ref={passwordInputRef}
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      className="w-full px-4 py-4 pr-12 bg-white border border-gray-200 rounded-2xl 
                               focus:outline-none focus:ring-2 focus:border-transparent transition-all 
                               text-gray-900 placeholder-gray-400"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      placeholder="Password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
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
                    disabled={isLoading}
                    className={`w-full px-6 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: isLoading ? '#9CA3AF' : primaryColor,
                      color: buttonTextColor,
                    }}
                  >
                    {isLoading ? (
                      <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Log in'
                    )}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <a 
                    href="/affiliate/forgot-password" 
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors"
                  >
                    Forgot password?
                  </a>
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
