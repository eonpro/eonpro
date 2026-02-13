'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, X, Mail, Phone, ArrowRight, RefreshCw, Building2, Check } from 'lucide-react';
import { isBrowser } from '@/lib/utils/ssr-safe';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

type LoginStep = 'identifier' | 'password' | 'otp' | 'clinic' | 'forgot' | 'reset';
type LoginMethod = 'email' | 'phone';

interface Clinic {
  id: number;
  name: string;
  subdomain: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  role: string;
  isPrimary: boolean;
}

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

/** Shape of /api/auth/login response (success or error). */
type LoginResponseData = {
  error?: string;
  code?: string;
  correctLoginUrl?: string | null;
  clinicName?: string | null;
  requiresClinicSelection?: boolean;
  clinics?: Clinic[];
  token?: string;
  user?: unknown;
  /** When status is 503, server may send seconds after which to retry */
  retryAfter?: number;
  [key: string]: unknown;
};

/** Parse JSON from fetch response safely to avoid "Unexpected end of JSON input" when server returns non-JSON (e.g. 405/500 HTML or empty). */
async function parseJsonResponse(response: Response): Promise<LoginResponseData> {
  const text = await response.text();
  if (!text.trim())
    return {
      error:
        response.status === 405 ? 'Login method not allowed' : response.statusText || 'Empty response',
    };
  try {
    return JSON.parse(text) as LoginResponseData;
  } catch {
    return {
      error:
        response.status === 500 ? 'Server error. Please try again.' : response.statusText || 'Invalid response',
    };
  }
}

/** Infer role to send to login API when user arrives from a role-specific redirect (e.g. /login?redirect=/provider). */
function getLoginRoleFromRedirect(
  redirect: string | null
): 'provider' | 'admin' | 'staff' | 'support' | undefined {
  if (!redirect) return undefined;
  const path = redirect.toLowerCase().split('?')[0];
  if (path === '/provider' || path.startsWith('/provider/')) return 'provider';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (path === '/staff' || path.startsWith('/staff/')) return 'staff';
  if (path === '/support' || path.startsWith('/support/')) return 'support';
  return undefined;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [identifier, setIdentifier] = useState(''); // email or phone
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // Optimistic: "Redirecting..." as soon as login succeeds
  const [step, setStep] = useState<LoginStep>('identifier');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [sessionMessage, setSessionMessage] = useState('');

  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [canResend, setCanResend] = useState(false);

  // Multi-clinic state
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [pendingLoginData, setPendingLoginData] = useState<any>(null);

  // Forgot password state
  const [resetCode, setResetCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [canResendReset, setCanResendReset] = useState(false);
  const resetCodeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // White-label branding state
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [resolvedClinicId, setResolvedClinicId] = useState<number | null>(null);
  const [isMainApp, setIsMainApp] = useState(false);

  // Wrong clinic domain: show message + link to correct clinic login
  const [wrongClinicRedirectUrl, setWrongClinicRedirectUrl] = useState<string | null>(null);
  const [wrongClinicName, setWrongClinicName] = useState<string | null>(null);

  // 503 Service Unavailable: show retry countdown (from Retry-After / retryAfter)
  const [retryAfterCountdown, setRetryAfterCountdown] = useState(0);
  const [showRetryButton, setShowRetryButton] = useState(false); // true when we got 503; show Retry when countdown hits 0

  // Pre-login health: true only when /api/ready explicitly returns 503 (fail-open: timeout/error → allow login)
  const [systemUnavailable, setSystemUnavailable] = useState(false);

  // OTP input refs
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Pre-login health check (fail-open: only block when /api/ready explicitly returns 503)
  useEffect(() => {
    if (!isBrowser) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout → fail open

    fetch('/api/ready', { signal: controller.signal })
      .then((res) => {
        if (res.status === 503) setSystemUnavailable(true);
        // 200 or other → allow login
      })
      .catch(() => {
        // Timeout, network error, abort → fail open, do not block login
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  // Resolve clinic from domain and load branding (non-blocking: on failure use default/main app)
  useEffect(() => {
    // SSR guard
    if (!isBrowser) return;

    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);

        if (response.ok) {
          const data = await response.json();

          // Check if this is the main app (not a white-labeled clinic)
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

          // Update favicon if clinic has one
          if (data.branding.faviconUrl) {
            const link =
              (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
              document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = data.branding.faviconUrl;
            document.head.appendChild(link);
          }

          document.title = `Login | ${data.name}`;
        } else {
          // 500, 404, etc. → use default branding so login is never blocked
          setIsMainApp(true);
        }
      } catch {
        // Network error, parse error → use default branding so login is never blocked
        setIsMainApp(true);
      }
    };

    resolveClinic();
  }, []);

  // Check for session expired message
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'no_session') {
      setSessionMessage('Please log in to continue.');
    }
  }, [searchParams]);

  // Prefill identifier when redirected to provider login after provider email detection
  useEffect(() => {
    if (!isBrowser) return;
    const redirectParam = searchParams.get('redirect');
    const isProviderRedirect =
      !!redirectParam && redirectParam.toLowerCase().split('?')[0].startsWith('/provider');
    if (isProviderRedirect) {
      const prefill = sessionStorage.getItem('login_provider_prefill');
      if (prefill) {
        setIdentifier(prefill);
        sessionStorage.removeItem('login_provider_prefill');
      }
    }
  }, [searchParams]);

  // OTP countdown timer
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (otpSent && otpCountdown === 0) {
      setCanResend(true);
    }
    return undefined;
  }, [otpCountdown, otpSent]);

  // Reset code countdown timer
  useEffect(() => {
    if (resetCountdown > 0) {
      const timer = setTimeout(() => setResetCountdown(resetCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resetCodeSent && resetCountdown === 0) {
      setCanResendReset(true);
    }
    return undefined;
  }, [resetCountdown, resetCodeSent]);

  // 503 retry countdown (Service is busy)
  useEffect(() => {
    if (retryAfterCountdown > 0) {
      const timer = setTimeout(() => setRetryAfterCountdown(retryAfterCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [retryAfterCountdown]);

  // Safety net: if login loading stays true too long (e.g. request never settles due to extension/network), clear it
  useEffect(() => {
    if (!loading) return;
    const safetyMs = 90_000; // 40s × 2 attempts + retry delay + buffer
    const t = setTimeout(() => {
      setLoading(false);
      setError((prev) =>
        prev
          ? prev
          : 'Login is taking too long. Try again or use an incognito window if you use password managers or extensions.'
      );
    }, safetyMs);
    return () => clearTimeout(t);
  }, [loading]);

  // Detect if input is phone number or email
  const isPhoneNumber = (value: string): boolean => {
    // Remove all non-digit characters for checking
    const digitsOnly = value.replace(/\D/g, '');
    // If it's 10+ digits and doesn't contain @, it's likely a phone number
    return digitsOnly.length >= 10 && !value.includes('@');
  };

  // Format phone for display
  const formatPhoneDisplay = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  };

  // Handle identifier submission (step 1)
  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      setError('Please enter your email or phone number');
      return;
    }

    // Detect login method
    if (isPhoneNumber(trimmedIdentifier)) {
      setLoginMethod('phone');
      // Send OTP
      await sendOtp(trimmedIdentifier);
    } else if (trimmedIdentifier.includes('@')) {
      setLoginMethod('email');

      // If not already on provider login path, check if email is a provider → auto-redirect
      const redirectParam = searchParams.get('redirect');
      const isProviderLogin =
        !!redirectParam && redirectParam.toLowerCase().split('?')[0].startsWith('/provider');
      if (!isProviderLogin) {
        try {
          const res = await fetch('/api/auth/check-identifier', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: trimmedIdentifier }),
          });
          const data = (await res.json()) as { isProvider?: boolean };
          if (data.isProvider) {
            sessionStorage.setItem('login_provider_prefill', trimmedIdentifier);
            router.replace(`/login?redirect=${encodeURIComponent('/provider')}`);
            return;
          }
        } catch {
          // On error, continue to password step (don't block login)
        }
      }

      setStep('password');
    } else {
      setError('Please enter a valid email address or phone number');
    }
  };

  // Send OTP to phone
  const sendOtp = async (phone: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setOtpSent(true);
      setOtpCountdown(60); // 60 second cooldown
      setCanResend(false);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (!canResend) return;
    setOtp(['', '', '', '', '', '']);
    await sendOtp(identifier);
  };

  // Handle forgot password - send reset code
  const handleForgotPassword = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, role: 'patient' }),
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

  // Resend reset code
  const handleResendResetCode = async () => {
    if (!canResendReset) return;
    setResetCode(['', '', '', '', '', '']);
    await handleForgotPassword();
  };

  // Handle reset code input
  const handleResetCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...resetCode];
    newCode[index] = digit;
    setResetCode(newCode);

    if (digit && index < 5) {
      resetCodeRefs.current[index + 1]?.focus();
    }

    // Move to password step when all digits entered
    if (digit && index === 5 && newCode.every((d) => d)) {
      setStep('reset');
    }
  };

  // Handle reset code paste
  const handleResetCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData.length === 6) {
      setResetCode(pastedData.split(''));
      resetCodeRefs.current[5]?.focus();
      setStep('reset');
    }
  };

  // Handle reset code backspace
  const handleResetCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !resetCode[index] && index > 0) {
      resetCodeRefs.current[index - 1]?.focus();
    }
  };

  // Submit new password
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

      // Success - go back to password step with success message
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetCode(['', '', '', '', '', '']);
      setResetCodeSent(false);
      setStep('password');
      setError(''); // Clear any errors
      setSessionMessage('Password reset successful! Please log in with your new password.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-focus next input
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === 5 && newOtp.every((d) => d)) {
      verifyOtp(newOtp.join(''));
    }
  };

  // Handle OTP paste
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      otpRefs.current[5]?.focus();
      verifyOtp(pastedData);
    }
  };

  // Handle OTP backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Verify OTP
  const verifyOtp = async (code: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: identifier, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      // Success - store tokens and redirect
      handleLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // 40s: cold start + DB connect can exceed 25s on serverless; incognito timeout = backend bottleneck
  const LOGIN_TIMEOUT_MS = 40_000;
  const RETRY_DELAY_MS = 2500;

  // Handle email/password login (with timeout so spinner doesn't hang; auto-retry once on 5xx/AbortError)
  const handlePasswordLogin = async (e: React.FormEvent, clinicId?: number, isRetry = false) => {
    e?.preventDefault?.();
    if (!isRetry) {
      setError('');
      setWrongClinicRedirectUrl(null);
      setWrongClinicName(null);
      setRetryAfterCountdown(0);
      setShowRetryButton(false);
      setRedirecting(false);
    }
    setLoading(true);

    try {
      const redirectParam = searchParams.get('redirect');
      const inferredRole = getLoginRoleFromRedirect(redirectParam);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: identifier,
          password,
          clinicId: clinicId || selectedClinicId || resolvedClinicId,
          ...(inferredRole && { role: inferredRole }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        // Handle unverified email specially
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setError(`${data.error} Check your email or request a new verification link.`);
          setLoading(false);
          return;
        }
        // User logged in on wrong clinic domain — show message and link to correct URL
        if (data.code === 'WRONG_CLINIC_DOMAIN') {
          setError(data.error || "This login page is for a different clinic.");
          setWrongClinicRedirectUrl(data.correctLoginUrl ?? null);
          setWrongClinicName(data.clinicName ?? null);
          setLoading(false);
          return;
        }
        // 503 Service Unavailable (e.g. DB pool exhausted): show message and retry countdown
        if (response.status === 503) {
          setError(data.error || 'Service is busy. Please try again in a moment.');
          if (typeof data.retryAfter === 'number' && data.retryAfter > 0) {
            setRetryAfterCountdown(data.retryAfter);
            setShowRetryButton(true);
          }
          setLoading(false);
          return;
        }
        // 5xx (other than 503): retry once if we haven't already
        if (!isRetry && response.status >= 500) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          return handlePasswordLogin(e, clinicId, true);
        }
        throw new Error(data.error || 'Login failed');
      }

      setWrongClinicRedirectUrl(null);
      setWrongClinicName(null);

      // Check if user needs to select a clinic
      if (data.requiresClinicSelection && (data.clinics?.length ?? 0) > 1) {
        setClinics(data.clinics ?? []);
        setPendingLoginData(data);
        setStep('clinic');
        setLoading(false);
        return;
      }

      // Optimistic UI: show "Redirecting..." immediately so login feels snappy
      setRedirecting(true);
      handleLoginSuccess(data as Parameters<typeof handleLoginSuccess>[0]);
      return; // Don't run finally setLoading(false) — keep "Redirecting..." until nav
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      // AbortError (timeout): retry once if we haven't already
      if (!isRetry && isTimeout) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return handlePasswordLogin(e, clinicId, true);
      }
      setError(
        isTimeout
          ? 'Login is taking too long. Check your connection and try again, or use the Provider login link below.'
          : err.message || 'An error occurred during login'
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle clinic selection and complete login (auto-retry once on 5xx/AbortError)
  const handleClinicSelect = async (clinicId: number, isRetry = false) => {
    setSelectedClinicId(clinicId);
    if (!isRetry) {
      setError('');
      setRetryAfterCountdown(0);
      setShowRetryButton(false);
      setRedirecting(false);
    }
    setLoading(true);

    try {
      const redirectParam = searchParams.get('redirect');
      const inferredRole = getLoginRoleFromRedirect(redirectParam);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

      // Re-authenticate with selected clinic
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: identifier,
          password,
          clinicId,
          ...(inferredRole && { role: inferredRole }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        if (data.code === 'WRONG_CLINIC_DOMAIN') {
          setError(data.error || "This login page is for a different clinic.");
          setWrongClinicRedirectUrl(data.correctLoginUrl ?? null);
          setWrongClinicName(data.clinicName ?? null);
          setLoading(false);
          return;
        }
        if (response.status === 503) {
          setError(data.error || 'Service is busy. Please try again in a moment.');
          if (typeof data.retryAfter === 'number' && data.retryAfter > 0) {
            setRetryAfterCountdown(data.retryAfter);
            setShowRetryButton(true);
          }
          setLoading(false);
          return;
        }
        // 5xx (other than 503): retry once if we haven't already
        if (!isRetry && response.status >= 500) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          return handleClinicSelect(clinicId, true);
        }
        throw new Error(data.error || 'Login failed');
      }

      setWrongClinicRedirectUrl(null);
      setWrongClinicName(null);
      setRedirecting(true);
      handleLoginSuccess(data as Parameters<typeof handleLoginSuccess>[0]);
      return; // Keep "Redirecting..." until nav; don't run finally setLoading(false)
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      // AbortError (timeout): retry once if we haven't already
      if (!isRetry && isTimeout) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return handleClinicSelect(clinicId, true);
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

  // Handle successful login
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

    // Store tokens and user data (both keys for compatibility)
    localStorage.setItem('auth-token', data.token);
    localStorage.setItem('token', data.token); // Legacy key for compatibility
    if (data.refreshToken) {
      localStorage.setItem('refresh-token', data.refreshToken);
      localStorage.setItem('refresh_token', data.refreshToken);
    }
    localStorage.setItem('user', JSON.stringify(data.user));

    // Store clinic information for multi-clinic support
    if (data.clinics) {
      localStorage.setItem('clinics', JSON.stringify(data.clinics));
      localStorage.setItem('activeClinicId', String(data.activeClinicId || data.clinics[0]?.id));
    }

    // Store role-specific tokens
    const userRole = data.user?.role?.toLowerCase();
    if (userRole === 'super_admin') {
      localStorage.setItem('super_admin-token', data.token);
    } else if (userRole === 'admin') {
      localStorage.setItem('admin-token', data.token);
    } else if (userRole === 'provider') {
      localStorage.setItem('provider-token', data.token);
    } else if (userRole === 'staff') {
      localStorage.setItem('staff-token', data.token);
    }

    // When the system logged the user out (session expired, invalid session, etc.),
    // always send them to role-based home—never back to the previous URL.
    const reason = searchParams.get('reason') ?? '';
    const systemLogoutReasons = [
      'session_expired',
      'no_session',
      'invalid_session',
      'invalid_role',
      'error',
      'session_mismatch',
    ];
    const wasSystemLogout = systemLogoutReasons.includes(reason);

    const redirectTo = wasSystemLogout ? null : searchParams.get('redirect');
    if (redirectTo) {
      router.push(redirectTo);
      return;
    }

    // Otherwise redirect based on role (home for that role)
    switch (userRole) {
      case 'super_admin':
        router.push('/super-admin/clinics');
        break;
      case 'admin':
        router.push('/admin');
        break;
      case 'provider':
        router.push('/provider');
        break;
      case 'staff':
        router.push('/staff');
        break;
      case 'support':
        router.push('/support');
        break;
      case 'patient':
        router.push(PATIENT_PORTAL_PATH);
        break;
      case 'influencer':
        router.push('/influencer/dashboard');
        break;
      default:
        router.push('/');
    }
  };

  // Go back to identifier step
  const handleBack = () => {
    setStep('identifier');
    setPassword('');
    setOtp(['', '', '', '', '', '']);
    setError('');
    setWrongClinicRedirectUrl(null);
    setWrongClinicName(null);
    setOtpSent(false);
  };

  // Get colors from branding or use defaults
  const primaryColor = branding?.primaryColor || '#10B981';
  const secondaryColor = branding?.secondaryColor || '#3B82F6';
  const accentColor = branding?.accentColor || '#d3f931';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  // Provider login screen: hide redundant link, use distinct background
  const redirectParam = searchParams.get('redirect');
  const isProviderLogin =
    !!redirectParam && redirectParam.toLowerCase().split('?')[0].startsWith('/provider');

  // Gradient backgrounds - never solid; always multi-color gradients
  const mainGradient = isProviderLogin
    ? 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 25%, #e0e7ff 50%, #ddd6fe 75%, #dbeafe 100%)'
    : branding
      ? `linear-gradient(135deg, ${primaryColor}15 0%, ${secondaryColor}12 33%, ${accentColor}18 66%, ${primaryColor}20 100%)`
      : 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 25%, #d1fae5 50%, #fef9c3 75%, #fef3c7 100%)';

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Gradient Background - provider: purple→blue; branded: clinic colors; default: green→yellow */}
      <div
        className="absolute inset-0"
        style={{ background: mainGradient }}
      />

      {/* Subtle mesh overlay - adds depth, never solid */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: isProviderLogin
            ? `radial-gradient(circle at 20% 50%, rgba(167, 139, 250, 0.12) 0%, transparent 50%),
               radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
               radial-gradient(circle at 40% 80%, rgba(96, 165, 250, 0.12) 0%, transparent 50%)`
            : branding
              ? `radial-gradient(circle at 20% 50%, ${primaryColor}20 0%, transparent 50%),
                 radial-gradient(circle at 80% 20%, ${accentColor}25 0%, transparent 50%),
                 radial-gradient(circle at 40% 80%, ${secondaryColor}18 0%, transparent 50%)`
              : `radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
                 radial-gradient(circle at 80% 20%, rgba(250, 204, 21, 0.2) 0%, transparent 50%),
                 radial-gradient(circle at 40% 80%, rgba(52, 211, 153, 0.15) 0%, transparent 50%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header with X button */}
        <div className="p-6">
          <button
            onClick={() => router.push('/')}
            className="rounded-full p-2 transition-colors hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-gray-700" />
          </button>
        </div>

        {/* Logo centered at top - uses clinic logo if available */}
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
                <img
                  src="/api/assets/eonpro-logo"
                  alt="EONPRO"
                  className="h-[21px] w-auto"
                />
              </p>
            </>
          ) : (
            /* Main app (app.eonpro.io) - show EONPRO logo only, no "Powered by" */
            <img
              src="/api/assets/eonpro-logo"
              alt="EONPRO"
              className="h-10 w-auto"
            />
          )}
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col items-center px-6 pt-8">
          {/* System unavailable banner (only when /api/ready explicitly returns 503) */}
          {systemUnavailable && (
            <div className="mb-6 w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm font-medium text-amber-800">
                System temporarily unavailable. We&apos;ll be back shortly.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Please try again in a few minutes.
              </p>
            </div>
          )}

          {/* Welcome Text */}
          <h1 className="mb-4 text-5xl font-light tracking-tight text-gray-900 md:text-6xl">
            Welcome
          </h1>
          <p className="mb-12 text-lg text-gray-600">
            {branding && !isMainApp ? `Sign in to ${branding.name}` : 'Sign in to EONPRO'}
          </p>

          {/* Login Form */}
          <div className="w-full max-w-md">
            {/* STEP 1: Email or Phone Input */}
            {step === 'identifier' && (
              <form onSubmit={handleIdentifierSubmit} className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    {isPhoneNumber(identifier) ? (
                      <Phone className="h-5 w-5" />
                    ) : (
                      <Mail className="h-5 w-5" />
                    )}
                  </div>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="Email or phone number"
                    required
                    autoComplete="username"
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
                  disabled={loading || systemUnavailable}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                    loading || systemUnavailable ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: loading || systemUnavailable ? '#9CA3AF' : primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  {loading ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {isPhoneNumber(identifier) ? 'Sending code...' : 'Continue'}
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>

                {/* New Patient Registration Link */}
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

            {/* STEP 2a: Password (for email login) */}
            {step === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                {/* Email Display */}
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

                {/* Password Field */}
                <div className="relative">
                  <input
                    id="password"
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
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <p className="text-center text-sm text-red-600">{error}</p>
                    {retryAfterCountdown > 0 && (
                      <p className="text-center text-sm text-red-600">
                        You can try again in {retryAfterCountdown} second{retryAfterCountdown !== 1 ? 's' : ''}.
                      </p>
                    )}
                    {showRetryButton && retryAfterCountdown === 0 && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            setError('');
                            setShowRetryButton(false);
                            handlePasswordLogin(e, selectedClinicId ?? undefined);
                          }}
                          disabled={loading}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </button>
                      </div>
                    )}
                    {wrongClinicRedirectUrl && (
                      <div className="text-center">
                        <a
                          href={wrongClinicRedirectUrl}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                          style={{
                            backgroundColor: primaryColor,
                            color: buttonTextColor,
                          }}
                        >
                          Go to {wrongClinicName ? `${wrongClinicName} login` : "your clinic's login"}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || retryAfterCountdown > 0 || systemUnavailable}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                    loading || retryAfterCountdown > 0 || systemUnavailable
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor:
                      loading || retryAfterCountdown > 0 || systemUnavailable ? '#9CA3AF' : primaryColor,
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
                  <span className="text-sm text-gray-500">Or other log-in options</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                <button
                  type="button"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-6 py-4 font-semibold text-gray-900 transition-all hover:bg-gray-50"
                  onClick={() => {
                    /* TODO: Implement magic link */
                  }}
                >
                  Email login code
                </button>

                <div className="flex flex-col items-center gap-3 pt-4">
                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading}
                      className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900 disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                    <span className="text-gray-300">•</span>
                    <button
                      type="button"
                      onClick={handleBack}
                      className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                    >
                      Not you? Log in here
                    </button>
                  </div>
                  {!isProviderLogin && (
                    <a
                      href="/login?redirect=/provider"
                      className="text-sm text-gray-600 underline underline-offset-2 transition-colors hover:text-gray-900"
                    >
                      Provider? Log in as provider
                    </a>
                  )}
                </div>
              </form>
            )}

            {/* STEP 2b: OTP (for phone login) */}
            {step === 'otp' && (
              <div className="space-y-6">
                {/* Phone Display */}
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Phone number</p>
                    <p className="font-medium text-gray-900">{formatPhoneDisplay(identifier)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Edit
                  </button>
                </div>

                {/* OTP Instructions */}
                <div className="text-center">
                  <p className="text-gray-600">Enter the 6-digit code sent to your phone</p>
                </div>

                {/* OTP Input */}
                <div className="flex justify-center gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
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

                {/* Resend OTP */}
                <div className="text-center">
                  {canResend ? (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      className="inline-flex items-center gap-2 font-medium transition-colors hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : otpCountdown > 0 ? (
                    <p className="text-sm text-gray-500">Resend code in {otpCountdown}s</p>
                  ) : null}
                </div>

                {/* Bottom Links */}
                <div className="flex items-center justify-center gap-4 pt-4">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-700 underline underline-offset-2 transition-colors hover:text-gray-900"
                  >
                    Use a different number
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Forgot Password - Enter Code */}
            {step === 'forgot' && (
              <div className="space-y-6">
                {/* Email Display */}
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Reset code sent to</p>
                    <p className="font-medium text-gray-900">{identifier}</p>
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

                {/* Instructions */}
                <div className="text-center">
                  <Mail className="mx-auto mb-4 h-12 w-12" style={{ color: primaryColor }} />
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">Check your email</h2>
                  <p className="text-gray-600">
                    Enter the 6-digit code we sent to reset your password
                  </p>
                </div>

                {/* Reset Code Input */}
                <div className="flex justify-center gap-3">
                  {resetCode.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        resetCodeRefs.current[index] = el;
                      }}
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

                {/* Resend Code */}
                <div className="text-center">
                  {canResendReset ? (
                    <button
                      type="button"
                      onClick={handleResendResetCode}
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

                {/* Back to login */}
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

            {/* STEP: Reset Password - Enter New Password */}
            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                {/* Email Display */}
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Resetting password for</p>
                    <p className="font-medium text-gray-900">{identifier}</p>
                  </div>
                </div>

                {/* Instructions */}
                <div className="text-center">
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">Create new password</h2>
                  <p className="text-gray-600">Enter your new password below</p>
                </div>

                {/* New Password Input */}
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
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Confirm Password Input */}
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

                {/* Password requirements hint */}
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
                  style={{
                    backgroundColor: primaryColor,
                    color: buttonTextColor,
                  }}
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

                {/* Back to code entry */}
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

            {/* STEP 3: Clinic Selection (for multi-clinic users) */}
            {step === 'clinic' && (
              <div className="space-y-6">
                {/* User Display */}
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Logged in as</p>
                    <p className="font-medium text-gray-900">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Change
                  </button>
                </div>

                {/* Clinic Selection Instructions */}
                <div className="text-center">
                  <Building2 className="mx-auto mb-4 h-12 w-12" style={{ color: primaryColor }} />
                  <h2 className="mb-2 text-xl font-semibold text-gray-900">Select a Clinic</h2>
                  <p className="text-gray-600">
                    You have access to multiple clinics. Choose which one to access now.
                  </p>
                </div>

                {/* Clinic List */}
                <div className="space-y-3">
                  {clinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => handleClinicSelect(clinic.id)}
                      disabled={loading || retryAfterCountdown > 0 || systemUnavailable}
                      className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        loading || retryAfterCountdown > 0 || systemUnavailable
                          ? 'cursor-not-allowed opacity-50'
                          : ''
                      }`}
                      style={{
                        borderColor: selectedClinicId === clinic.id ? primaryColor : '#e5e7eb',
                        backgroundColor:
                          selectedClinicId === clinic.id ? `${primaryColor}10` : 'white',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
                          {clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl ? (
                            <img
                              src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
                              alt={clinic.name}
                              className="h-10 w-10 rounded-lg object-contain"
                            />
                          ) : (
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-lg"
                              style={{ backgroundColor: `${primaryColor}20` }}
                            >
                              <Building2 className="h-5 w-5" style={{ color: primaryColor }} />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{clinic.name}</p>
                            <p className="text-sm capitalize text-gray-500">{clinic.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {clinic.isPrimary && (
                            <span
                              className="rounded-full px-2 py-1 text-xs"
                              style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                            >
                              Primary
                            </span>
                          )}
                          {selectedClinicId === clinic.id && (
                            <Check className="h-5 w-5" style={{ color: primaryColor }} />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <p className="text-center text-sm text-red-600">{error}</p>
                    {retryAfterCountdown > 0 && (
                      <p className="text-center text-sm text-red-600">
                        You can try again in {retryAfterCountdown} second{retryAfterCountdown !== 1 ? 's' : ''}.
                      </p>
                    )}
                    {showRetryButton && retryAfterCountdown === 0 && selectedClinicId && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setError('');
                            setShowRetryButton(false);
                            handleClinicSelect(selectedClinicId);
                          }}
                          disabled={loading}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </button>
                      </div>
                    )}
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

                <p className="text-center text-xs text-gray-500">
                  You can switch clinics anytime from your dashboard
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">
            HIPAA Compliant Healthcare Platform • © 2026 EONPro
          </p>
        </div>
      </div>
    </div>
  );
}
