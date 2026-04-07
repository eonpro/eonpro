'use client';

import { Suspense, useState, useEffect, useRef, startTransition, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, X, Mail, ArrowRight, RefreshCw, CheckCircle2, Smartphone } from 'lucide-react';
import { isBrowser } from '@/lib/utils/ssr-safe';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { EONPRO_LOGO, EONPRO_LOGO_DARK } from '@/lib/constants/brand-assets';

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

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [16, 185, 129];
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${[lighten(r), lighten(g), lighten(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const darken = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `#${[darken(r), darken(g), darken(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
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

export default function PatientLoginPageWrapper() {
  return (
    <Suspense fallback={<div className="dark-login-bg flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" /></div>}>
      <PatientLoginPage />
    </Suspense>
  );
}

function PatientLoginPage() {
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
  const [sessionMessage, setSessionMessage] = useState(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') return 'Your session has expired. Please log in again.';
    if (reason === 'no_session') return 'Please log in to continue.';
    return '';
  });
  const [registeredMessage, setRegisteredMessage] = useState(() =>
    searchParams.get('registered') === 'true' ? 'Account created successfully! You can now log in.' : ''
  );

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

  // White-label branding — always start with server-safe defaults to avoid
  // hydration mismatch (#418). Cache is restored in a post-mount effect below.
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [resolvedClinicId, setResolvedClinicId] = useState<number | null>(null);
  const [isMainApp, setIsMainApp] = useState(true);
  const [logoLoadError, setLogoLoadError] = useState(false);

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

  // Restore cached branding from localStorage after mount to reduce CLS on return visits.
  // Runs once after hydration so the initial server/client render stays in sync.
  useEffect(() => {
    try {
      const cached = localStorage.getItem('clinic-branding-cache');
      if (!cached) return;
      const parsed = JSON.parse(cached) as ClinicBranding & { clinicId?: number; _cachedAt?: number };
      if (parsed._cachedAt && Date.now() - parsed._cachedAt > 24 * 60 * 60 * 1000) return;
      setIsMainApp(false);
      setBranding(parsed);
      if (parsed.clinicId) setResolvedClinicId(parsed.clinicId);
    } catch { /* corrupt cache — ignore, fresh fetch below will resolve */ }
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
            localStorage.removeItem('clinic-branding-cache');
            localStorage.removeItem('clinic-branding-is-whitelabel');
            return;
          }
          const brandingData: ClinicBranding = {
            clinicId: data.clinicId,
            name: data.name,
            logoUrl: data.branding.logoUrl,
            iconUrl: data.branding.iconUrl,
            faviconUrl: data.branding.faviconUrl,
            primaryColor: data.branding.primaryColor,
            secondaryColor: data.branding.secondaryColor,
            accentColor: data.branding.accentColor,
            buttonTextColor: data.branding.buttonTextColor || 'auto',
          };
          setResolvedClinicId(data.clinicId);
          setBranding(brandingData);
          try {
            localStorage.setItem('clinic-branding-cache', JSON.stringify({ ...brandingData, _cachedAt: Date.now() }));
            localStorage.setItem('clinic-branding-is-whitelabel', '1');
          } catch { /* quota exceeded — non-critical */ }
          if (data.branding.faviconUrl) {
            const injectFavicon = () => {
              let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
              if (link) {
                link.href = data.branding.faviconUrl;
              } else {
                link = document.createElement('link');
                link.rel = 'icon';
                link.href = data.branding.faviconUrl;
                document.head.appendChild(link);
              }
            };
            typeof requestIdleCallback !== 'undefined'
              ? requestIdleCallback(() => injectFavicon())
              : setTimeout(() => injectFavicon(), 0);
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

  // Invite link: patient-login?invite=TOKEN → send to register to set password
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite && invite.length >= 32) {
      router.replace(`/register?invite=${encodeURIComponent(invite)}`);
    }
  }, [searchParams, router]);

  // Session/registration messages are derived from searchParams in useState initializer
  // to avoid a second render that causes CLS

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

        if (response.status === 429 || data.code === 'RATE_LIMIT_EXCEEDED') {
          const minutes = data.retryAfter ? Math.ceil(data.retryAfter / 60) : 30;
          setError(
            `Account temporarily locked. Please try again in ${minutes} minutes or use email verification to unlock.`
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
    } catch (err: unknown) {
      const isTimeout = (err as { name?: string })?.name === 'AbortError';
      if (!isRetry && isTimeout) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return handlePasswordLogin(e, true);
      }
      setError(
        isTimeout
          ? 'Login is taking too long. Check your connection and try again.'
          : (err as any).message || 'An error occurred during login'
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

    window.location.href = PATIENT_PORTAL_PATH;
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
    } catch (err: unknown) {
      setError((err as any).message || 'Failed to send login code. Please try again.');
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
      startTransition(() => { verifyEmailOtp(newOtp.join('')); });
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
    } catch (err: unknown) {
      setError((err as any).message || 'Invalid login code. Please try again.');
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
    } catch (err: unknown) {
      setError((err as any).message || 'Failed to send reset code');
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
    } catch (err: unknown) {
      setError((err as any).message || 'Failed to reset password');
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
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  const [pcR, pcG, pcB] = hexToRgb(primaryColor);
  const darkAccent = lightenHex(primaryColor, 0.4);
  const darkButtonGradient = `linear-gradient(135deg, ${darkenHex(primaryColor, 0.25)} 0%, ${primaryColor} 50%, ${lightenHex(primaryColor, 0.3)} 100%)`;
  const darkFocusRing = `rgba(${pcR},${pcG},${pcB},0.5)`;

  const loginGlowVars: Record<string, string> = {
    '--login-glow': `rgba(${pcR},${pcG},${pcB},0.10)`,
    '--login-glow-alt': `rgba(${pcR},${pcG},${pcB},0.06)`,
    '--login-focus': `rgba(${pcR},${pcG},${pcB},0.5)`,
    '--login-focus-ring': `rgba(${pcR},${pcG},${pcB},0.25)`,
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isBrowser) return;
    const darkBg = '#020617';
    const prevBodyBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = darkBg;

    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const prevThemeColor = meta?.content;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = darkBg;

    return () => {
      document.body.style.backgroundColor = prevBodyBg;
      if (meta && prevThemeColor !== undefined) meta.content = prevThemeColor;
    };
  }, []);

  return (
    <div
      className="dark-login-bg min-h-screen"
      style={loginGlowVars as React.CSSProperties}
    >
      <div className="flex min-h-screen flex-col">
        <div className="p-4 sm:p-6">
          <button
            onClick={() => router.push('/')}
            className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-white/90" />
          </button>
        </div>

        {/* Logo — fixed h-12 container prevents CLS when branding swaps */}
        <div className="flex flex-col items-center pb-8 pt-4">
          <div className="flex h-12 items-center justify-center">
            {branding && !isMainApp ? (
              branding.logoUrl && !logoLoadError ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="h-12 max-w-[200px] object-contain brightness-0 invert"
                  width={200}
                  height={48}
                  onError={() => setLogoLoadError(true)}
                />
              ) : (
                <h1 className="text-3xl font-bold text-white">
                  {branding.name}
                </h1>
              )
            ) : (
              <img src={EONPRO_LOGO_DARK} alt="EONPRO" className="h-10 w-auto" width={160} height={40} style={{ maxHeight: 40, width: 'auto' }} />
            )}
          </div>
          {branding && !isMainApp && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/50 whitespace-nowrap">
              Powered by{' '}
              <img src={EONPRO_LOGO_DARK} alt="EONPRO" className="h-[21px] w-auto" width={84} height={21} style={{ maxHeight: 21, width: 'auto' }} />
            </p>
          )}
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col items-center px-6 pt-8">
          <h1 className="mb-3 text-center text-4xl font-light tracking-tight text-white sm:mb-4 sm:text-5xl">
            Patient Portal
          </h1>
          <p className="mb-8 text-center text-base text-white/85 sm:text-lg">
            Sign in to access your health portal
          </p>

          {/* Registration success message */}
          <div
            className={`w-full max-w-md rounded-2xl border transition-all duration-150 ${
              registeredMessage ? 'mb-6 opacity-100 border-emerald-500/30 bg-emerald-900/30 backdrop-blur-sm p-4' : 'mb-0 h-0 overflow-hidden border-transparent p-0 opacity-0'
            }`}
            aria-live="polite"
          >
            {registeredMessage && (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <p className="text-center text-sm font-medium text-emerald-300">
                  {registeredMessage}
                </p>
              </div>
            )}
          </div>

          {/* Login Form */}
          <div className="w-full max-w-md">
            {/* STEP 1: Email Input */}
            {step === 'identifier' && (
              <form onSubmit={handleIdentifierSubmit} className="space-y-4">
                <label htmlFor="patient-email" className="block text-xs font-medium uppercase tracking-wider text-white/50">
                  Email address
                </label>
                <div className="relative">
                  <div className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30 transition-opacity duration-200 ${identifier ? 'opacity-0' : 'opacity-100'}`}>
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="patient-email"
                    type="email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.06] py-4 pl-12 pr-4 text-white placeholder-white/35 backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': darkFocusRing } as React.CSSProperties}
                    placeholder="Your email address"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div
                  className={`rounded-2xl border transition-all duration-150 ${
                    sessionMessage ? 'opacity-100 border-amber-500/30 bg-amber-900/30 backdrop-blur-sm p-4' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {sessionMessage && (
                    <p className="text-center text-sm text-amber-300">{sessionMessage}</p>
                  )}
                </div>

                <div
                  className={`rounded-2xl border transition-all duration-150 ${
                    error ? 'opacity-100 border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <p className="text-center text-sm text-red-400">{error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold transition-all ${
                    loading ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90 active:scale-[0.99]'
                  }`}
                  style={{
                    backgroundColor: loading ? '#9CA3AF' : primaryColor,
                    ...(!loading ? { background: darkButtonGradient } : {}),
                    color: '#ffffff',
                  }}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </button>

                <div className="pt-4">
                  <p className="text-center text-sm text-white/60">
                    New patient?{' '}
                    <a
                      href="/register"
                      className="font-medium hover:opacity-80"
                      style={{ color: darkAccent }}
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
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4">
                  <div>
                    <p className="mb-1 text-xs text-white/50">Email</p>
                    <p className="font-medium text-white">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="font-medium text-white/60 transition-colors hover:text-white"
                  >
                    Edit
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="patient-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-4 pr-12 text-white placeholder-white/35 backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': darkFocusRing } as React.CSSProperties}
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                <div
                  className={`rounded-2xl border transition-all duration-150 space-y-3 ${
                    error ? 'opacity-100 border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <>
                      <p className="text-center text-sm text-red-400">{error}</p>
                      {error.includes('temporarily locked') && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={sendEmailOtp}
                          disabled={loading}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Mail className="h-4 w-4" />
                          Unlock via email code
                        </button>
                      </div>
                    )}
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
                          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/80 backdrop-blur-sm transition-all hover:bg-white/[0.1]"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Go to Provider / Staff Login
                        </a>
                      </div>
                    )}
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold transition-all ${
                    loading ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90 active:scale-[0.99]'
                  }`}
                  style={{
                    backgroundColor: loading ? '#9CA3AF' : primaryColor,
                    ...(!loading ? { background: darkButtonGradient } : {}),
                    color: '#ffffff',
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
                  <div className="h-px flex-1 bg-white/15" />
                  <span className="text-sm text-white/40">Or</span>
                  <div className="h-px flex-1 bg-white/15" />
                </div>

                <button
                  type="button"
                  disabled={loading}
                  className="min-h-[48px] w-full touch-manipulation rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-white/[0.1] active:bg-white/[0.14] backdrop-blur-sm disabled:opacity-50"
                  onClick={sendEmailOtp}
                >
                  Email me a login code
                </button>

                <div className="flex flex-col items-center gap-3 pt-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleForgotPassword(false)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Reset via email
                    </button>
                    <span className="text-white/20">|</span>
                    <button
                      type="button"
                      onClick={() => handleForgotPassword(true)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white disabled:opacity-50"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      Reset via text
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Not you? Log in here
                  </button>
                </div>
              </form>
            )}

            {/* STEP: Email OTP (passwordless login) */}
            {step === 'email-otp' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4">
                  <div>
                    <p className="mb-1 text-xs text-white/50">Login code sent to</p>
                    <p className="font-medium text-white">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="font-medium text-white/60 transition-colors hover:text-white"
                  >
                    Edit
                  </button>
                </div>

                <div className="text-center">
                  <Mail className="mx-auto mb-4 h-12 w-12" style={{ color: darkAccent }} />
                  <h2 className="mb-2 text-xl font-semibold text-white">Check your email</h2>
                  <p className="text-white/70">
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
                      className="h-14 w-12 rounded-xl border border-white/15 bg-white/[0.06] text-white text-center text-2xl font-semibold backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': darkFocusRing } as React.CSSProperties}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                <div
                  className={`rounded-2xl border transition-all duration-150 ${
                    error ? 'opacity-100 border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <p className="text-center text-sm text-red-400">{error}</p>
                  )}
                </div>

                {loading && (
                  <div className="flex justify-center">
                    <div
                      className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                      style={{
                        borderColor: `${darkAccent} transparent ${darkAccent} ${darkAccent}`,
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
                      style={{ color: darkAccent }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : emailOtpCountdown > 0 ? (
                    <p className="text-sm text-white/40">Resend code in {emailOtpCountdown}s</p>
                  ) : null}
                </div>

                {/* Help text */}
                <p className="text-center text-xs text-white/40">
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
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Use password instead
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Forgot Password */}
            {step === 'forgot' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4">
                  <div>
                    <p className="mb-1 text-xs text-white/50">
                      Reset code sent {resetMethod === 'sms' ? 'via text to phone on file' : 'to'}
                    </p>
                    {resetMethod === 'email' && (
                      <p className="font-medium text-white">{identifier}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('password');
                      setResetCode(['', '', '', '', '', '']);
                      setResetCodeSent(false);
                    }}
                    className="font-medium text-white/60 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                <div className="text-center">
                  {resetMethod === 'sms' ? (
                    <Smartphone className="mx-auto mb-4 h-12 w-12" style={{ color: darkAccent }} />
                  ) : (
                    <Mail className="mx-auto mb-4 h-12 w-12" style={{ color: darkAccent }} />
                  )}
                  <h2 className="mb-2 text-xl font-semibold text-white">
                    {resetMethod === 'sms' ? 'Check your phone' : 'Check your email'}
                  </h2>
                  <p className="text-white/70">
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
                      className="h-14 w-12 rounded-xl border border-white/15 bg-white/[0.06] text-white text-center text-2xl font-semibold backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': darkFocusRing } as React.CSSProperties}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                <div
                  className={`rounded-2xl border transition-all duration-150 ${
                    error ? 'opacity-100 border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <p className="text-center text-sm text-red-400">{error}</p>
                  )}
                </div>

                <div className="text-center">
                  {canResendReset ? (
                    <button
                      type="button"
                      onClick={() => {
                        setResetCode(['', '', '', '', '', '']);
                        handleForgotPassword(resetMethod === 'sms');
                      }}
                      className="inline-flex items-center gap-2 font-medium transition-colors hover:opacity-80"
                      style={{ color: darkAccent }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : resetCountdown > 0 ? (
                    <p className="text-sm text-white/40">Resend code in {resetCountdown}s</p>
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
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
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
                    style={{ backgroundColor: `rgba(${pcR},${pcG},${pcB},0.15)` }}
                  >
                    <CheckCircle2 className="h-8 w-8" style={{ color: darkAccent }} />
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-white">
                    {patientFirstName
                      ? `Welcome, ${patientFirstName}!`
                      : 'Welcome!'}
                  </h2>
                  <p className="text-white/70">
                    We found your patient record. To access your portal, you need to create a login.
                    It only takes a minute.
                  </p>
                </div>

                <a
                  href={`/register${resolvedClinicId ? '' : ''}`}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all hover:opacity-90"
                  style={{ background: darkButtonGradient, color: '#ffffff' }}
                >
                  <ArrowRight className="h-5 w-5" />
                  Set up your account
                </a>

                <div className="flex flex-col items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('password')}
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    I already have a login
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Reset Password */}
            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4">
                  <div>
                    <p className="mb-1 text-xs text-white/50">Resetting password for</p>
                    <p className="font-medium text-white">{identifier}</p>
                  </div>
                </div>

                <div className="text-center">
                  <h2 className="mb-2 text-xl font-semibold text-white">Create new password</h2>
                  <p className="text-white/70">Enter your new password below</p>
                </div>

                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-4 pr-12 text-white placeholder-white/35 backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': darkFocusRing } as React.CSSProperties}
                    placeholder="New password"
                    required
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
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
                    className={`w-full rounded-2xl border bg-white/[0.06] px-4 py-4 text-white placeholder-white/35 backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 ${
                      confirmNewPassword && newPassword !== confirmNewPassword
                        ? 'border-red-400/60'
                        : 'border-white/12'
                    }`}
                    style={{ '--tw-ring-color': darkFocusRing } as React.CSSProperties}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                </div>

                <p className="text-center text-xs text-white/40">
                  Password must be at least 8 characters
                </p>

                <div
                  className={`rounded-2xl border transition-all duration-150 ${
                    error ? 'opacity-100 border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <p className="text-center text-sm text-red-400">{error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmNewPassword}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                    loading || !newPassword || !confirmNewPassword
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:opacity-90'
                  }`}
                  style={{ backgroundColor: primaryColor, background: darkButtonGradient, color: '#ffffff' }}
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
                    className="text-sm text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Re-enter code
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="mt-auto p-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-6 text-white/35">
            <span className="flex items-center gap-1.5 text-xs">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Encrypted
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              HIPAA Compliant
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              SOC 2
            </span>
          </div>
          <p className="text-xs text-white/30">
            eonpro.io &nbsp;•&nbsp; © All Rights Reserved 2026 EONPro
          </p>
        </div>
      </div>
    </div>
  );
}
