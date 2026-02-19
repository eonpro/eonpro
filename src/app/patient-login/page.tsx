'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, X, Mail, ArrowRight, RefreshCw, CheckCircle2, Smartphone } from 'lucide-react';
import { isBrowser } from '@/lib/utils/ssr-safe';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

type LoginStep = 'identifier' | 'password' | 'email-otp' | 'forgot' | 'reset' | 'needs-setup';

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

type LoginResponseData = {
  error?: string;
  code?: string;
  token?: string;
  user?: unknown;
  retryAfter?: number;
  [key: string]: unknown;
};

async function parseJsonResponse(response: Response): Promise<LoginResponseData> {
  const text = await response.text();
  if (!text.trim())
    return {
      error:
        response.status === 405
          ? 'Login method not allowed'
          : response.statusText || 'Empty response',
    };
  try {
    return JSON.parse(text) as LoginResponseData;
  } catch {
    return {
      error:
        response.status === 500
          ? 'Server error. Please try again.'
          : response.statusText || 'Invalid response',
    };
  }
}

export default function PatientLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [step, setStep] = useState<LoginStep>('identifier');
  const [sessionMessage, setSessionMessage] = useState('');
  const [registeredMessage, setRegisteredMessage] = useState('');

  // Non-patient rejection state
  const [showStaffLoginLink, setShowStaffLoginLink] = useState(false);

  // Email OTP state
  const [emailOtp, setEmailOtp] = useState(['', '', '', '', '', '']);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCountdown, setEmailOtpCountdown] = useState(0);
  const [canResendEmailOtp, setCanResendEmailOtp] = useState(false);
  const emailOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot password state
  const [resetCode, setResetCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [canResendReset, setCanResendReset] = useState(false);
  const [resetMethod, setResetMethod] = useState<'email' | 'sms'>('email');
  const [patientFirstName, setPatientFirstName] = useState('');

  // White-label branding
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [resolvedClinicId, setResolvedClinicId] = useState<number | null>(null);
  const [isMainApp, setIsMainApp] = useState(false);

  // Proactively clear stale auth cookies
  useEffect(() => {
    if (!isBrowser) return;
    const staleCookieNames = [
      'auth-token',
      'admin-token',
      'super_admin-token',
      'provider-token',
      'patient-token',
      'staff-token',
      'support-token',
      'affiliate-token',
    ];
    staleCookieNames.forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.eonpro.io;`;
    });
  }, []);

  // Resolve clinic branding
  useEffect(() => {
    if (!isBrowser) return;
    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.isMainApp) {
            setIsMainApp(true);
            return;
          }
          setResolvedClinicId(data.clinicId);
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
          if (data.branding.faviconUrl) {
            const link =
              (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
              document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = data.branding.faviconUrl;
            document.head.appendChild(link);
          }
          document.title = `Patient Login | ${data.name}`;
        } else {
          setIsMainApp(true);
        }
      } catch {
        setIsMainApp(true);
      }
    };
    resolveClinic();
  }, []);

  // Check for session/registration messages
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'no_session') {
      setSessionMessage('Please log in to continue.');
    }

    if (searchParams.get('registered') === 'true') {
      setRegisteredMessage('Account created successfully! You can now log in.');
    }
  }, [searchParams]);

  // Email OTP countdown timer
  useEffect(() => {
    if (emailOtpCountdown > 0) {
      const timer = setTimeout(() => setEmailOtpCountdown(emailOtpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (emailOtpSent && emailOtpCountdown === 0) {
      setCanResendEmailOtp(true);
    }
    return undefined;
  }, [emailOtpCountdown, emailOtpSent]);

  // Reset code countdown
  useEffect(() => {
    if (resetCountdown > 0) {
      const timer = setTimeout(() => setResetCountdown(resetCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resetCodeSent && resetCountdown === 0) {
      setCanResendReset(true);
    }
    return undefined;
  }, [resetCountdown, resetCodeSent]);

  // Safety net for stuck loading state
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
      setError((prev) =>
        prev
          ? prev
          : 'Login is taking too long. Please try again.'
      );
    }, 90_000);
    return () => clearTimeout(t);
  }, [loading]);

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegisteredMessage('');

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError('Please enter your email address');
      return;
    }
    if (!trimmedIdentifier.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const [statusRes, identifierRes] = await Promise.allSettled([
        fetch('/api/auth/check-patient-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedIdentifier, clinicId: resolvedClinicId }),
        }).then((r) => r.json()),
        fetch('/api/auth/check-identifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedIdentifier }),
        }).then((r) => r.json()),
      ]);

      if (identifierRes.status === 'fulfilled' && identifierRes.value.isProvider) {
        setError('This email belongs to a provider account.');
        setShowStaffLoginLink(true);
        setLoading(false);
        return;
      }

      if (statusRes.status === 'fulfilled' && statusRes.value.status === 'needs_setup') {
        setPatientFirstName(statusRes.value.firstName || '');
        setStep('needs-setup');
        setLoading(false);
        return;
      }
    } catch {
      // If checks fail, fall through to normal password flow
    } finally {
      setLoading(false);
    }

    setStep('password');
  };

  const LOGIN_TIMEOUT_MS = 40_000;
  const RETRY_DELAY_MS = 2500;

  const handlePasswordLogin = async (e: React.FormEvent, isRetry = false) => {
    e?.preventDefault?.();
    if (!isRetry) {
      setError('');
      setRedirecting(false);
    }
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: identifier,
          password,
          clinicId: resolvedClinicId,
          role: 'patient',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setError(
            `${data.error} Check your email for the verification link, or use the button below to resend it.`
          );
          setLoading(false);
          return;
        }

        if (response.status === 503) {
          setError(data.error || 'Service is busy. Please try again in a moment.');
          setLoading(false);
          return;
        }

        if (!isRetry && response.status >= 500) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          return handlePasswordLogin(e, true);
        }

        throw new Error(data.error || 'Login failed');
      }

      setRedirecting(true);
      handleLoginSuccess(data as Parameters<typeof handleLoginSuccess>[0]);
      return;
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      if (!isRetry && isTimeout) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return handlePasswordLogin(e, true);
      }
      setError(
        isTimeout
          ? 'Login is taking too long. Check your connection and try again.'
          : err.message || 'An error occurred during login'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (data: {
    token?: string;
    refreshToken?: string;
    user?: { email?: string; role?: string };
    clinics?: Array<{ id: number }>;
    activeClinicId?: number;
  }) => {
    if (!data.token) {
      setError('Login failed: No authentication token received');
      return;
    }

    // Enforce patient-only access on this login page
    const userRole = data.user?.role?.toLowerCase();
    if (userRole && userRole !== 'patient') {
      // Clear any tokens that were set by the login response cookies
      document.cookie = 'auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.eonpro.io;';
      document.cookie = `${userRole}-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `${userRole}-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.eonpro.io;`;

      setRedirecting(false);
      setError(
        'This login is for patients only. Please use the provider/staff login page instead.'
      );
      setShowStaffLoginLink(true);
      return;
    }

    localStorage.setItem('auth-token', data.token);
    localStorage.setItem('token', data.token);
    if (data.refreshToken) {
      localStorage.setItem('refresh-token', data.refreshToken);
      localStorage.setItem('refresh_token', data.refreshToken);
    }
    localStorage.setItem('user', JSON.stringify(data.user));

    if (data.clinics) {
      localStorage.setItem('clinics', JSON.stringify(data.clinics));
      localStorage.setItem('activeClinicId', String(data.activeClinicId || data.clinics[0]?.id));
    }

    router.push(PATIENT_PORTAL_PATH);
  };

  // Send email OTP for passwordless login
  const sendEmailOtp = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, clinicId: resolvedClinicId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send login code');
      }

      setEmailOtpSent(true);
      setEmailOtpCountdown(60);
      setCanResendEmailOtp(false);
      setStep('email-otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send login code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!canResendEmailOtp) return;
    setEmailOtp(['', '', '', '', '', '']);
    await sendEmailOtp();
  };

  const handleEmailOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...emailOtp];
    newOtp[index] = digit;
    setEmailOtp(newOtp);

    if (digit && index < 5) {
      emailOtpRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5 && newOtp.every((d) => d)) {
      verifyEmailOtp(newOtp.join(''));
    }
  };

  const handleEmailOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setEmailOtp(newOtp);
      emailOtpRefs.current[5]?.focus();
      verifyEmailOtp(pastedData);
    }
  };

  const handleEmailOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !emailOtp[index] && index > 0) {
      emailOtpRefs.current[index - 1]?.focus();
    }
  };

  const verifyEmailOtp = async (code: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: identifier,
          code,
          clinicId: resolvedClinicId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid login code');
      }

      handleLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Invalid login code. Please try again.');
      setEmailOtp(['', '', '', '', '', '']);
      emailOtpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (viaSms = false) => {
    setError('');
    setLoading(true);
    const method = viaSms ? 'sms' : 'email';
    setResetMethod(method);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, role: 'patient', clinicId: resolvedClinicId, method }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset code');
      }
      setResetCodeSent(true);
      setResetCountdown(60);
      setCanResendReset(false);
      setStep('forgot');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...resetCode];
    newCode[index] = digit;
    setResetCode(newCode);
    if (digit && index < 5) {
      (document.getElementById(`reset-code-${index + 1}`) as HTMLInputElement)?.focus();
    }
    if (digit && index === 5 && newCode.every((d) => d)) {
      setStep('reset');
    }
  };

  const handleResetCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      setResetCode(pastedData.split(''));
      setStep('reset');
    }
  };

  const handleResetCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !resetCode[index] && index > 0) {
      (document.getElementById(`reset-code-${index - 1}`) as HTMLInputElement)?.focus();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: identifier,
          code: resetCode.join(''),
          newPassword,
          role: 'patient',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetCode(['', '', '', '', '', '']);
      setResetCodeSent(false);
      setStep('password');
      setError('');
      setSessionMessage('Password reset successful! Please log in with your new password.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('identifier');
    setPassword('');
    setEmailOtp(['', '', '', '', '', '']);
    setError('');
    setShowStaffLoginLink(false);
    setEmailOtpSent(false);
  };

  // Branding colors
  const primaryColor = branding?.primaryColor || '#10B981';
  const secondaryColor = branding?.secondaryColor || '#3B82F6';
  const accentColor = branding?.accentColor || '#d3f931';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  const bgColor = branding ? `${primaryColor}0D` : '#f0fdf4';

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      {/* Content */}
      <div className="flex min-h-screen flex-col">
        {/* Header */}
        <div className="p-6">
          <button
            onClick={() => router.push('/')}
            className="rounded-full p-2 transition-colors hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-gray-700" />
          </button>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center pb-8 pt-4">
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
                <img src="/api/assets/eonpro-logo" alt="EONPRO" className="h-[21px] w-auto" />
              </p>
            </>
          ) : (
            <img src="/api/assets/eonpro-logo" alt="EONPRO" className="h-10 w-auto" />
          )}
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col items-center px-6 pt-8">
          {/* Welcome */}
          <h1 className="mb-2 text-4xl font-light tracking-tight text-gray-900 md:text-5xl">
            Patient Portal
          </h1>
          <p className="mb-10 text-lg text-gray-600">
            {branding && !isMainApp
              ? `Sign in to access your health portal`
              : 'Sign in to access your health portal'}
          </p>

          {/* Registration success message */}
          {registeredMessage && (
            <div className="mb-6 w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-center text-sm font-medium text-emerald-700">
                  {registeredMessage}
                </p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <div className="w-full max-w-md">
            {/* STEP 1: Email Input */}
            {step === 'identifier' && (
              <form onSubmit={handleIdentifierSubmit} className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="patient-email"
                    type="email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white/70 py-4 pl-12 pr-4 text-gray-900 placeholder-gray-400 backdrop-blur-sm transition-all focus:border-transparent focus:bg-white focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="Your email address"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {sessionMessage && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-center text-sm text-amber-700">{sessionMessage}</p>
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-center text-sm text-red-600">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                    loading ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: loading ? '#9CA3AF' : primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </button>

                {/* Register link */}
                <div className="pt-4">
                  <p className="text-center text-sm text-gray-600">
                    New patient?{' '}
                    <a
                      href="/register"
                      className="font-medium hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      Create an account
                    </a>
                  </p>
                </div>
              </form>
            )}

            {/* STEP 2: Password */}
            {step === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                {/* Email display */}
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Edit
                  </button>
                </div>

                {/* Password field */}
                <div className="relative">
                  <input
                    id="patient-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-12 text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {error && (
                  <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-center text-sm text-red-600">{error}</p>
                    {/* Resend verification email */}
                    {error.includes('verify your email') && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setLoading(true);
                              const res = await fetch('/api/auth/register', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  email: identifier,
                                  action: 'resend',
                                }),
                              });
                              if (res.ok) {
                                setError(
                                  'Verification email sent! Check your inbox and spam folder.'
                                );
                              } else {
                                setError('Failed to resend. Please try again.');
                              }
                            } catch {
                              setError('Failed to resend. Please try again.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                        >
                          <Mail className="h-4 w-4" />
                          Resend verification email
                        </button>
                      </div>
                    )}
                    {/* Non-patient user tried to log in - show link to staff/provider login */}
                    {showStaffLoginLink && (
                      <div className="flex justify-center">
                        <a
                          href="/login"
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Go to Provider / Staff Login
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                    loading ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: loading ? '#9CA3AF' : primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  {loading ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {redirecting ? 'Redirecting...' : 'Logging in...'}
                    </>
                  ) : (
                    'Log in and continue'
                  )}
                </button>

                <div className="flex items-center gap-4 py-2">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-sm text-gray-500">Or</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                <button
                  type="button"
                  disabled={loading}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-6 py-4 font-semibold text-gray-900 transition-all hover:bg-gray-50 disabled:opacity-50"
                  onClick={sendEmailOtp}
                >
                  Email me a login code
                </button>

                {/* Forgot password & back */}
                <div className="flex flex-col items-center gap-3 pt-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleForgotPassword(false)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900 disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Reset via email
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleForgotPassword(true)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900 disabled:opacity-50"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      Reset via text
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Not you? Log in here
                  </button>
                </div>
              </form>
            )}

            {/* STEP: Email OTP (passwordless login) */}
            {step === 'email-otp' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Login code sent to</p>
                    <p className="font-medium text-gray-900">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Edit
                  </button>
                </div>

                <div className="text-center">
                  <Mail className="mx-auto mb-4 h-12 w-12" style={{ color: primaryColor }} />
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">Check your email</h2>
                  <p className="text-gray-600">
                    Enter the 6-digit code we sent to log in
                  </p>
                </div>

                <div className="flex justify-center gap-3">
                  {emailOtp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        emailOtpRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleEmailOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleEmailOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleEmailOtpPaste : undefined}
                      className="h-14 w-12 rounded-xl border border-gray-200 bg-white text-center text-2xl font-semibold transition-all focus:border-transparent focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-center text-sm text-red-600">{error}</p>
                  </div>
                )}

                {loading && (
                  <div className="flex justify-center">
                    <div
                      className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                      style={{
                        borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}`,
                      }}
                    />
                  </div>
                )}

                <div className="text-center">
                  {canResendEmailOtp ? (
                    <button
                      type="button"
                      onClick={handleResendEmailOtp}
                      className="inline-flex items-center gap-2 font-medium transition-colors hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : emailOtpCountdown > 0 ? (
                    <p className="text-sm text-gray-500">Resend code in {emailOtpCountdown}s</p>
                  ) : null}
                </div>

                {/* Help text */}
                <p className="text-center text-xs text-gray-500">
                  Didn&apos;t receive it? Check your spam/junk folder. Make sure you have an account with this email.
                </p>

                <div className="flex flex-col items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('password');
                      setEmailOtp(['', '', '', '', '', '']);
                      setError('');
                    }}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Use password instead
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Forgot Password */}
            {step === 'forgot' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">
                      Reset code sent {resetMethod === 'sms' ? 'via text to phone on file' : 'to'}
                    </p>
                    {resetMethod === 'email' && (
                      <p className="font-medium text-gray-900">{identifier}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('password');
                      setResetCode(['', '', '', '', '', '']);
                      setResetCodeSent(false);
                    }}
                    className="font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Cancel
                  </button>
                </div>

                <div className="text-center">
                  {resetMethod === 'sms' ? (
                    <Smartphone className="mx-auto mb-4 h-12 w-12" style={{ color: primaryColor }} />
                  ) : (
                    <Mail className="mx-auto mb-4 h-12 w-12" style={{ color: primaryColor }} />
                  )}
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">
                    {resetMethod === 'sms' ? 'Check your phone' : 'Check your email'}
                  </h2>
                  <p className="text-gray-600">
                    Enter the 6-digit code we sent to reset your password
                  </p>
                </div>

                <div className="flex justify-center gap-3">
                  {resetCode.map((digit, index) => (
                    <input
                      key={index}
                      id={`reset-code-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleResetCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleResetCodeKeyDown(index, e)}
                      onPaste={index === 0 ? handleResetCodePaste : undefined}
                      className="h-14 w-12 rounded-xl border border-gray-200 bg-white text-center text-2xl font-semibold transition-all focus:border-transparent focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-center text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div className="text-center">
                  {canResendReset ? (
                    <button
                      type="button"
                      onClick={() => {
                        setResetCode(['', '', '', '', '', '']);
                        handleForgotPassword(resetMethod === 'sms');
                      }}
                      className="inline-flex items-center gap-2 font-medium transition-colors hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : resetCountdown > 0 ? (
                    <p className="text-sm text-gray-500">Resend code in {resetCountdown}s</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('password');
                      setResetCode(['', '', '', '', '', '']);
                      setResetCodeSent(false);
                      setError('');
                    }}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Back to login
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Needs Setup (intake patient without portal account) */}
            {step === 'needs-setup' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <CheckCircle2 className="h-8 w-8" style={{ color: primaryColor }} />
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">
                    {patientFirstName
                      ? `Welcome, ${patientFirstName}!`
                      : 'Welcome!'}
                  </h2>
                  <p className="text-gray-600">
                    We found your patient record. To access your portal, you need to create a login.
                    It only takes a minute.
                  </p>
                </div>

                <a
                  href={`/register${resolvedClinicId ? '' : ''}`}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  <ArrowRight className="h-5 w-5" />
                  Set up your account
                </a>

                <div className="flex flex-col items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('password')}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    I already have a login
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Reset Password */}
            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Resetting password for</p>
                    <p className="font-medium text-gray-900">{identifier}</p>
                  </div>
                </div>

                <div className="text-center">
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">Create new password</h2>
                  <p className="text-gray-600">Enter your new password below</p>
                </div>

                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="New password"
                    required
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className={`w-full rounded-2xl border bg-white px-4 py-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 ${
                      confirmNewPassword && newPassword !== confirmNewPassword
                        ? 'border-red-300'
                        : 'border-gray-200'
                    }`}
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                </div>

                <p className="text-center text-xs text-gray-500">
                  Password must be at least 8 characters
                </p>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-center text-sm text-red-600">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmNewPassword}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                    loading || !newPassword || !confirmNewPassword
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:opacity-90'
                  }`}
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  {loading ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>

                <div className="flex items-center justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('forgot');
                      setError('');
                    }}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Re-enter code
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">
            HIPAA Compliant Healthcare Platform &bull; &copy; 2026 EONPro
          </p>
        </div>
      </div>
    </div>
  );
}
