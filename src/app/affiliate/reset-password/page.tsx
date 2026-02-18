'use client';

/**
 * Affiliate Reset Password Page
 *
 * Token-gated password reset form with clinic branding.
 * Reached via email link: /affiliate/reset-password?token=xxx
 *
 * Flow:
 * 1. On mount, verify token via GET /api/affiliate/auth/reset-password?token=xxx
 * 2. Show password form if valid
 * 3. On submit, POST /api/affiliate/auth/reset-password with token + new password
 * 4. Redirect to login on success
 *
 * Enterprise password requirements:
 * - 12+ characters
 * - Uppercase, lowercase, numbers, special characters
 * - Real-time strength meter
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, CheckCircle, XCircle, ArrowLeft, Shield } from 'lucide-react';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

type PageStep = 'loading' | 'invalid' | 'form' | 'success';

interface ClinicBranding {
  clinicId: number;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark';
}

interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: 'At least 12 characters', test: (pw) => pw.length >= 12 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /\d/.test(pw) },
  { label: 'One special character', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

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

function getStrengthLevel(password: string): { label: string; color: string; width: string } {
  const passed = PASSWORD_CHECKS.filter((c) => c.test(password)).length;
  if (password.length === 0) return { label: '', color: '#d1d5db', width: '0%' };
  if (passed <= 2) return { label: 'Weak', color: '#ef4444', width: '25%' };
  if (passed <= 3) return { label: 'Fair', color: '#f59e0b', width: '50%' };
  if (passed <= 4) return { label: 'Good', color: '#3b82f6', width: '75%' };
  return { label: 'Strong', color: '#10b981', width: '100%' };
}

export default function AffiliateResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [step, setStep] = useState<PageStep>('loading');
  const [firstName, setFirstName] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [invalidMessage, setInvalidMessage] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<string[]>([]);

  // Branding
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [isMainApp, setIsMainApp] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Load branding
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
          document.title = `Set Password | ${data.name}`;
        }
      } catch {
        // Default branding
      } finally {
        setBrandingLoaded(true);
      }
    };
    resolveClinic();
  }, []);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setInvalidMessage('No reset token provided. Please request a new password reset link.');
      setStep('invalid');
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/affiliate/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.valid) {
          setFirstName(data.firstName || '');
          setMaskedEmail(data.email || '');
          setStep('form');
        } else {
          setInvalidMessage(data.error || 'This reset link is invalid or has expired.');
          setStep('invalid');
        }
      } catch {
        setInvalidMessage('Failed to verify reset link. Please try again.');
        setStep('invalid');
      }
    };

    verifyToken();
  }, [token]);

  // Auto-focus password field
  useEffect(() => {
    if (step === 'form') {
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    }
  }, [step]);

  const primaryColor = branding?.primaryColor || '#10B981';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);
  const strength = getStrengthLevel(password);

  const allChecksPassed = PASSWORD_CHECKS.every((c) => c.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allChecksPassed && passwordsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit || !token) return;

    setIsSubmitting(true);
    setError(null);
    setRequirements([]);

    try {
      const res = await fetch('/api/affiliate/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requirements) {
          setRequirements(data.requirements);
        }
        throw new Error(data.error || 'Failed to set password');
      }

      setStep('success');

      // Redirect to login after brief success
      setTimeout(() => {
        router.push('/affiliate/login');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (!brandingLoaded || step === 'loading') {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: '#EFECE7' }}
      >
        <div className="text-center">
          <div
            className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
          />
          <p className="mt-4 text-sm text-gray-500">Verifying your reset link...</p>
        </div>
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
            {/* Invalid Token */}
            {step === 'invalid' && (
              <motion.div
                key="invalid"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md text-center"
              >
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Link expired or invalid</h2>
                <p className="mt-3 text-sm text-gray-500">{invalidMessage}</p>
                <div className="mt-8 space-y-3">
                  <a
                    href="/affiliate/forgot-password"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all hover:opacity-90"
                    style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                  >
                    Request new reset link
                  </a>
                  <a
                    href="/affiliate/login"
                    className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to login
                  </a>
                </div>
              </motion.div>
            )}

            {/* Password Form */}
            {step === 'form' && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                {/* Greeting */}
                <div className="mb-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-gray-400" />
                    <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Secure password setup
                    </span>
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    {firstName ? `Welcome, ${firstName}` : 'Set your password'}
                  </h1>
                  {maskedEmail && (
                    <p className="mt-2 text-sm text-gray-500">
                      Setting password for <strong className="text-gray-700">{maskedEmail}</strong>
                    </p>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New Password */}
                  <div>
                    <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                      New password
                    </label>
                    <div className="relative">
                      <input
                        ref={passwordInputRef}
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-12 text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>

                    {/* Strength Meter */}
                    {password.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between">
                          <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                            <motion.div
                              className="h-full rounded-full transition-all"
                              style={{ backgroundColor: strength.color, width: strength.width }}
                              initial={{ width: '0%' }}
                              animate={{ width: strength.width }}
                            />
                          </div>
                          <span
                            className="ml-3 text-xs font-medium"
                            style={{ color: strength.color }}
                          >
                            {strength.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Confirm password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError(null);
                        }}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-12 text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="mt-1.5 text-xs text-red-500">Passwords do not match</p>
                    )}
                  </div>

                  {/* Requirements Checklist */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                      Requirements
                    </p>
                    <div className="space-y-1.5">
                      {PASSWORD_CHECKS.map((check) => {
                        const passed = check.test(password);
                        return (
                          <div key={check.label} className="flex items-center gap-2">
                            {password.length === 0 ? (
                              <div className="h-4 w-4 rounded-full border border-gray-300" />
                            ) : passed ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-300" />
                            )}
                            <span
                              className={`text-xs ${
                                password.length === 0
                                  ? 'text-gray-500'
                                  : passed
                                    ? 'text-green-700'
                                    : 'text-gray-400'
                              }`}
                            >
                              {check.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Error */}
                  {(error || requirements.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="rounded-2xl border border-red-200 bg-red-50 p-4"
                    >
                      {error && <p className="text-center text-sm text-red-600">{error}</p>}
                      {requirements.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {requirements.map((req) => (
                            <li key={req} className="text-center text-xs text-red-500">
                              {req}
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                      !canSubmit ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: !canSubmit ? '#9CA3AF' : primaryColor,
                      color: buttonTextColor,
                    }}
                  >
                    {isSubmitting ? (
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      'Set password & continue'
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* Success */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
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
                <h2 className="text-2xl font-semibold text-gray-900">Password set successfully!</h2>
                <p className="mt-3 text-sm text-gray-500">
                  Your password has been saved. Redirecting you to login...
                </p>
                <div className="mt-6">
                  <div
                    className="mx-auto h-1.5 w-32 overflow-hidden rounded-full bg-gray-100"
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: primaryColor }}
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 3 }}
                    />
                  </div>
                </div>
                <a
                  href="/affiliate/login"
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: primaryColor }}
                >
                  Go to login now
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
